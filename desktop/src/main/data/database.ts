import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { type Database as SqlJsDatabase, type SqlJsStatic } from 'sql.js';
import type {
  Activity,
  ActivityCategory,
  ActivityStatus,
  AiAuditEntry,
  AppSnapshot,
  ChatMessage,
  ExternalClue,
  FreedomSummary,
  ID,
  Memory,
  MemoryInput,
  ScheduleInput,
  ScheduleItem,
  Settings,
  SourceKind,
  Task,
  TaskInput,
  TaskStatus,
  VisualMode
} from '../../shared/types';

type SqlValue = string | number | null;
type Row = Record<string, SqlValue>;

type PreparedStatement = {
  all: (...params: unknown[]) => Row[];
  get: (...params: unknown[]) => Row | undefined;
  run: (...params: unknown[]) => void;
};

class SqliteFileStore {
  private readonly db: SqlJsDatabase;
  private persistDepth = 0;

  constructor(
    private readonly dbPath: string,
    SQL: SqlJsStatic
  ) {
    if (fs.existsSync(dbPath)) {
      this.db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
    } else {
      this.db = new SQL.Database();
      this.persist();
    }
  }

  prepare(sql: string): PreparedStatement {
    return {
      all: (...params: unknown[]) => this.query(sql, params),
      get: (...params: unknown[]) => this.query(sql, params)[0],
      run: (...params: unknown[]) => {
        this.db.run(sql, params);
        this.persist();
      }
    };
  }

  exec(sql: string): void {
    this.db.exec(sql);
    this.persist();
  }

  pragma(_sql: string): void {
    // sql.js does not expose PRAGMA helpers separately; schema exec handles required setup.
  }

  transaction<T extends unknown[], R>(fn: (...args: T) => R): (...args: T) => R {
    return (...args: T) => {
      this.persistDepth += 1;
      this.db.run('begin transaction');
      try {
        const result = fn(...args);
        this.db.run('commit');
        return result;
      } catch (error) {
        this.db.run('rollback');
        throw error;
      } finally {
        this.persistDepth -= 1;
        this.persist();
      }
    };
  }

  close(): void {
    this.persist();
    this.db.close();
  }

  private query(sql: string, params: unknown[]): Row[] {
    const stmt = this.db.prepare(sql);
    const rows: Row[] = [];
    try {
      stmt.bind(params);
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as Row);
      }
    } finally {
      stmt.free();
    }
    return rows;
  }

  private persist(): void {
    if (this.persistDepth > 0) return;
    fs.writeFileSync(this.dbPath, Buffer.from(this.db.export()));
  }
}

const DEFAULT_COMPANION_ID = 'ruohan-pixel-v1';
const LEGACY_COMPANION_IDS = new Set([
  'ruohan-default',
  'ruohan-layered-outfit',
  'ruohan-layered-outfit-v2',
  'ruohan-home-soft',
  'ruohan-focus-clean'
]);

const DEFAULT_SETTINGS: Settings = {
  language: 'zh',
  visualMode: 'dock',
  appearance: {
    colorScheme: 'auto',
    reducedTransparency: false
  },
  privateMode: true,
  intimateNamesEnabled: false,
  reducedMotion: false,
  characterMotionEnabled: true,
  companion: {
    activeCompanionId: DEFAULT_COMPANION_ID
  },
  pet: {
    enabled: true,
    alwaysOnTop: true,
    lockedToTaskbar: true,
    clickThrough: false,
    scale: 0.9
  },
  reminders: {
    fishAfterMinutes: 30,
    eveningReview: true,
    scheduleBeforeMinutes: 10,
    lateSleep: true
  },
  startup: {
    openAtLogin: false
  },
  ai: {
    providerId: 'deepseek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
    hasApiKey: false,
    auditEnabled: true
  }
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function uid(prefix: string): ID {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function fromJson<T>(value: SqlValue, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function deepMerge<T>(base: T, patch: Partial<T>): T {
  const next: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const current = next[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current &&
      typeof current === 'object' &&
      !Array.isArray(current)
    ) {
      next[key] = deepMerge(current as Record<string, unknown>, value as Record<string, unknown>);
    } else if (value !== undefined) {
      next[key] = value;
    }
  }
  return next as T;
}

function normalizeCompanionSettings(settings: Settings): Settings {
  const requestedId = settings.companion?.activeCompanionId;
  const activeCompanionId = typeof requestedId === 'string' && requestedId.trim()
    ? requestedId
    : DEFAULT_COMPANION_ID;
  settings.companion = {
    activeCompanionId: LEGACY_COMPANION_IDS.has(activeCompanionId)
      ? DEFAULT_COMPANION_ID
      : activeCompanionId
  };
  return settings;
}

function inferActivity(title: string): { category: ActivityCategory; tags: string[]; status: ActivityStatus } {
  const t = title.toLowerCase();
  const rules: Array<[ActivityCategory, string[], RegExp]> = [
    ['study', ['学习'], /作业|复习|刷题|论文|考试|学习|课|背|阅读|study|homework|review/],
    ['work', ['工作'], /飞书|会议|报告|项目|代码|开发|工作|开会|汇报|work|meeting|report/],
    ['entertainment', ['娱乐'], /b站|哔哩|视频|游戏|摸鱼|刷|番|娱乐|game|youtube|bili/],
    ['rest', ['休息'], /睡|休息|躺|困|午觉|放空|sleep|rest/],
    ['life', ['生活'], /吃饭|洗澡|做饭|打扫|买|生活|meal|cook/],
    ['social', ['社交'], /聊天|朋友|约|电话|社交|chat|call/]
  ];
  const found = rules.find(([, , regex]) => regex.test(t));
  const category = found?.[0] ?? 'other';
  const tags = found?.[1] ?? ['其他'];
  const status: ActivityStatus = category === 'entertainment' && /摸鱼|刷|b站|游戏/.test(t) ? 'stalled' : 'focus';
  return { category, tags, status };
}

function activityFromRow(row: Row): Activity {
  return {
    id: String(row.id),
    title: String(row.title),
    category: row.category as ActivityCategory,
    status: row.status as ActivityStatus,
    source: row.source as SourceKind,
    tags: fromJson<string[]>(row.tags, []),
    mood: row.mood ? String(row.mood) : undefined,
    energy: typeof row.energy === 'number' ? row.energy : undefined,
    startAt: String(row.start_at),
    endAt: row.end_at ? String(row.end_at) : undefined,
    taskId: row.task_id ? String(row.task_id) : undefined,
    scheduleId: row.schedule_id ? String(row.schedule_id) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function taskFromRow(row: Row): Task {
  return {
    id: String(row.id),
    title: String(row.title),
    status: row.status as TaskStatus,
    priority: row.priority as Task['priority'],
    kind: (row.kind ? String(row.kind) : 'other') as Task['kind'],
    dueAt: row.due_at ? String(row.due_at) : undefined,
    source: row.source as SourceKind,
    notes: row.notes ? String(row.notes) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function scheduleFromRow(row: Row): ScheduleItem {
  return {
    id: String(row.id),
    title: String(row.title),
    startAt: String(row.start_at),
    endAt: String(row.end_at),
    source: row.source as SourceKind,
    taskId: row.task_id ? String(row.task_id) : undefined,
    location: row.location ? String(row.location) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function memoryFromRow(row: Row): Memory {
  return {
    id: String(row.id),
    type: row.type as Memory['type'],
    confidence: row.confidence as Memory['confidence'],
    content: String(row.content),
    tags: fromJson<string[]>(row.tags, []),
    neverMention: Boolean(row.never_mention),
    source: row.source as SourceKind,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function messageFromRow(row: Row): ChatMessage {
  return {
    id: String(row.id),
    role: row.role as ChatMessage['role'],
    content: String(row.content),
    tone: row.tone as ChatMessage['tone'],
    createdAt: String(row.created_at)
  };
}

function clueFromRow(row: Row): ExternalClue {
  return {
    id: String(row.id),
    source: row.source as SourceKind,
    status: row.status as ExternalClue['status'],
    rawSummary: String(row.raw_summary),
    suggestedTitle: String(row.suggested_title),
    suggestedDueAt: row.suggested_due_at ? String(row.suggested_due_at) : undefined,
    risk: row.risk as ExternalClue['risk'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function auditFromRow(row: Row): AiAuditEntry {
  return {
    id: String(row.id),
    providerId: String(row.provider_id),
    purpose: row.purpose as AiAuditEntry['purpose'],
    contextSummary: String(row.context_summary),
    redactions: fromJson<string[]>(row.redactions, []),
    createdAt: String(row.created_at)
  };
}

export class TimeMateDatabase {
  readonly dbPath: string;
  private readonly db: SqliteFileStore;

  constructor(userDataPath: string, SQL: SqlJsStatic) {
    const dataDir = path.join(userDataPath, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    this.dbPath = path.join(dataDir, 'timemate.sqlite');
    this.db = new SqliteFileStore(this.dbPath, SQL);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.createSchema();
    this.ensureMigrations();
    this.ensureSettings();
  }

  close(): void {
    this.db.close();
  }

  getSnapshot(): AppSnapshot {
    const activities = this.db
      .prepare('select * from activities order by start_at desc limit 300')
      .all()
      .map((row) => activityFromRow(row as Row));
    const currentActivity = activities.find((item) => !item.endAt && !['done', 'interrupted'].includes(item.status));
    const tasks = this.db
      .prepare('select * from tasks order by case priority when "urgent" then 0 when "normal" then 1 else 2 end, created_at desc')
      .all()
      .map((row) => taskFromRow(row as Row));
    const schedules = this.db
      .prepare('select * from schedules order by start_at asc limit 300')
      .all()
      .map((row) => scheduleFromRow(row as Row));
    const memories = this.db
      .prepare('select * from memories order by updated_at desc limit 500')
      .all()
      .map((row) => memoryFromRow(row as Row));
    const messages = this.db
      .prepare('select * from messages order by created_at desc limit 120')
      .all()
      .reverse()
      .map((row) => messageFromRow(row as Row));
    const externalClues = this.db
      .prepare('select * from external_clues order by created_at desc limit 200')
      .all()
      .map((row) => clueFromRow(row as Row));
    const aiAudit = this.db
      .prepare('select * from ai_audit order by created_at desc limit 80')
      .all()
      .map((row) => auditFromRow(row as Row));
    const settings = this.getSettings();
    return {
      activities,
      currentActivity,
      tasks,
      schedules,
      memories,
      messages,
      externalClues,
      aiAudit,
      settings,
      freedom: this.calculateFreedom(tasks, externalClues)
    };
  }

  getSettings(): Settings {
    const row = this.db.prepare('select value from settings where key = ?').get('settings') as Row | undefined;
    const stored = fromJson<Partial<Settings>>(row?.value ?? null, {});
    const merged = deepMerge(DEFAULT_SETTINGS, stored);
    // v1 -> v2 外观迁移:旧数据没有 colorScheme 时,由旧 tone 推导(night -> dark,其余 -> auto)。
    if (!stored.appearance?.colorScheme) {
      merged.appearance.colorScheme = stored.appearance?.tone === 'night' ? 'dark' : 'auto';
    }
    return normalizeCompanionSettings(merged);
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const next = normalizeCompanionSettings(deepMerge(this.getSettings(), patch));
    this.db
      .prepare('insert into settings(key, value, updated_at) values(?, ?, ?) on conflict(key) do update set value=excluded.value, updated_at=excluded.updated_at')
      .run('settings', toJson(next), nowIso());
    return next;
  }

  setAiKeyPresence(hasApiKey: boolean): Settings {
    return this.updateSettings({ ai: { hasApiKey } } as Partial<Settings>);
  }

  startActivity(input: { title: string; mood?: string }): Activity {
    const title = input.title.trim();
    if (!title) throw new Error('Activity title is required.');
    const inferred = inferActivity(title);
    const now = nowIso();
    const id = uid('act');
    const tx = this.db.transaction(() => {
      this.db
        .prepare('update activities set status = ?, end_at = ?, updated_at = ? where end_at is null and status not in ("done", "interrupted")')
        .run('interrupted', now, now);
      this.db
        .prepare(
          `insert into activities
          (id, title, category, status, source, tags, mood, energy, start_at, end_at, task_id, schedule_id, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, title, inferred.category, inferred.status, 'manual', toJson(inferred.tags), input.mood ?? null, null, now, null, null, null, now, now);
    });
    tx();
    return this.getActivity(id);
  }

  endCurrentActivity(status: ActivityStatus): Activity | undefined {
    const current = this.getSnapshot().currentActivity;
    if (!current) return undefined;
    const now = nowIso();
    this.db.prepare('update activities set status = ?, end_at = ?, updated_at = ? where id = ?').run(status, now, now, current.id);
    return this.getActivity(current.id);
  }

  updateActivityStatus(id: ID, status: ActivityStatus): Activity {
    this.db.prepare('update activities set status = ?, updated_at = ? where id = ?').run(status, nowIso(), id);
    return this.getActivity(id);
  }

  createTask(input: TaskInput): Task {
    const now = nowIso();
    const id = uid('task');
    this.db
      .prepare(
        `insert into tasks (id, title, status, priority, kind, due_at, source, notes, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.title.trim(), 'open', input.priority ?? 'normal', input.kind ?? 'other', input.dueAt ?? null, 'manual', input.notes ?? null, now, now);
    return this.getTask(id);
  }

  updateTaskStatus(id: ID, status: TaskStatus): Task {
    this.db.prepare('update tasks set status = ?, updated_at = ? where id = ?').run(status, nowIso(), id);
    return this.getTask(id);
  }

  deleteTask(id: ID): void {
    this.db.prepare('delete from tasks where id = ?').run(id);
  }

  createSchedule(input: ScheduleInput): ScheduleItem {
    const now = nowIso();
    const id = uid('sch');
    this.db
      .prepare(
        `insert into schedules (id, title, start_at, end_at, source, task_id, location, notes, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.title.trim(), input.startAt, input.endAt, 'manual', input.taskId ?? null, input.location ?? null, input.notes ?? null, now, now);
    return this.getSchedule(id);
  }

  deleteSchedule(id: ID): void {
    this.db.prepare('delete from schedules where id = ?').run(id);
  }

  createMemory(input: MemoryInput): Memory {
    const now = nowIso();
    const id = uid('mem');
    this.db
      .prepare(
        `insert into memories (id, type, confidence, content, tags, never_mention, source, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.type,
        input.confidence,
        input.content.trim(),
        toJson(input.tags ?? []),
        input.neverMention ? 1 : 0,
        'manual',
        now,
        now
      );
    return this.getMemory(id);
  }

  updateMemory(id: ID, input: Partial<MemoryInput>): Memory {
    const current = this.getMemory(id);
    const next = {
      type: input.type ?? current.type,
      confidence: input.confidence ?? current.confidence,
      content: input.content ?? current.content,
      tags: input.tags ?? current.tags,
      neverMention: input.neverMention ?? current.neverMention
    };
    this.db
      .prepare('update memories set type = ?, confidence = ?, content = ?, tags = ?, never_mention = ?, updated_at = ? where id = ?')
      .run(next.type, next.confidence, next.content, toJson(next.tags), next.neverMention ? 1 : 0, nowIso(), id);
    return this.getMemory(id);
  }

  deleteMemory(id: ID): void {
    this.db.prepare('delete from memories where id = ?').run(id);
  }

  addMessage(message: Omit<ChatMessage, 'id' | 'createdAt'>): ChatMessage {
    const id = uid('msg');
    const createdAt = nowIso();
    this.db
      .prepare('insert into messages (id, role, content, tone, created_at) values (?, ?, ?, ?, ?)')
      .run(id, message.role, message.content, message.tone, createdAt);
    return { ...message, id, createdAt };
  }

  addAudit(entry: Omit<AiAuditEntry, 'id' | 'createdAt'>): AiAuditEntry {
    const id = uid('audit');
    const createdAt = nowIso();
    this.db
      .prepare('insert into ai_audit (id, provider_id, purpose, context_summary, redactions, created_at) values (?, ?, ?, ?, ?, ?)')
      .run(id, entry.providerId, entry.purpose, entry.contextSummary, toJson(entry.redactions), createdAt);
    return { ...entry, id, createdAt };
  }

  createExternalClue(input: Pick<ExternalClue, 'source' | 'rawSummary' | 'suggestedTitle' | 'suggestedDueAt' | 'risk'>): ExternalClue {
    const id = uid('clue');
    const now = nowIso();
    this.db
      .prepare(
        `insert into external_clues
        (id, source, status, raw_summary, suggested_title, suggested_due_at, risk, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.source, 'draft', input.rawSummary, input.suggestedTitle, input.suggestedDueAt ?? null, input.risk, now, now);
    return this.getClue(id);
  }

  updateExternalClueStatus(id: ID, status: ExternalClue['status']): ExternalClue {
    this.db.prepare('update external_clues set status = ?, updated_at = ? where id = ?').run(status, nowIso(), id);
    return this.getClue(id);
  }

  exportJson(): string {
    return JSON.stringify(
      {
        exportedAt: nowIso(),
        schema: 1,
        snapshot: this.getSnapshot()
      },
      null,
      2
    );
  }

  importSnapshot(snapshot: AppSnapshot): AppSnapshot {
    const tx = this.db.transaction(() => {
      this.db.prepare('delete from activities').run();
      this.db.prepare('delete from tasks').run();
      this.db.prepare('delete from schedules').run();
      this.db.prepare('delete from memories').run();
      this.db.prepare('delete from messages').run();
      this.db.prepare('delete from external_clues').run();
      this.db.prepare('delete from ai_audit').run();
      for (const item of snapshot.activities ?? []) this.insertActivity(item);
      for (const item of snapshot.tasks ?? []) this.insertTask(item);
      for (const item of snapshot.schedules ?? []) this.insertSchedule(item);
      for (const item of snapshot.memories ?? []) this.insertMemory(item);
      for (const item of snapshot.messages ?? []) this.insertMessage(item);
      for (const item of snapshot.externalClues ?? []) this.insertClue(item);
      for (const item of snapshot.aiAudit ?? []) this.insertAudit(item);
      this.updateSettings(snapshot.settings ?? DEFAULT_SETTINGS);
    });
    tx();
    return this.getSnapshot();
  }

  /** additive 迁移:旧库 tasks 表补 kind 列(Q18 唯一 schema 变更,失败静默降级为无 kind)。 */
  private ensureMigrations(): void {
    let hasKind = false;
    try {
      const columns = this.db.prepare("select name from pragma_table_info('tasks')").all() as Array<{ name?: unknown }>;
      hasKind = columns.some((column) => String(column.name) === 'kind');
    } catch {
      hasKind = false;
    }
    if (!hasKind) {
      try {
        this.db.exec('alter table tasks add column kind text');
      } catch {
        // 列已存在或旧引擎不支持:忽略,taskFromRow 会按 other 兜底。
      }
    }
  }

  private createSchema(): void {
    this.db.exec(`
      create table if not exists settings (
        key text primary key,
        value text not null,
        updated_at text not null
      );
      create table if not exists activities (
        id text primary key,
        title text not null,
        category text not null,
        status text not null,
        source text not null,
        tags text not null,
        mood text,
        energy integer,
        start_at text not null,
        end_at text,
        task_id text,
        schedule_id text,
        created_at text not null,
        updated_at text not null
      );
      create index if not exists idx_activities_start on activities(start_at);
      create table if not exists tasks (
        id text primary key,
        title text not null,
        status text not null,
        priority text not null,
        kind text,
        due_at text,
        source text not null,
        notes text,
        created_at text not null,
        updated_at text not null
      );
      create index if not exists idx_tasks_due on tasks(due_at);
      create table if not exists schedules (
        id text primary key,
        title text not null,
        start_at text not null,
        end_at text not null,
        source text not null,
        task_id text,
        location text,
        notes text,
        created_at text not null,
        updated_at text not null
      );
      create index if not exists idx_schedules_start on schedules(start_at);
      create table if not exists memories (
        id text primary key,
        type text not null,
        confidence text not null,
        content text not null,
        tags text not null,
        never_mention integer not null default 0,
        source text not null,
        created_at text not null,
        updated_at text not null
      );
      create table if not exists messages (
        id text primary key,
        role text not null,
        content text not null,
        tone text not null,
        created_at text not null
      );
      create table if not exists external_clues (
        id text primary key,
        source text not null,
        status text not null,
        raw_summary text not null,
        suggested_title text not null,
        suggested_due_at text,
        risk text not null,
        created_at text not null,
        updated_at text not null
      );
      create table if not exists ai_audit (
        id text primary key,
        provider_id text not null,
        purpose text not null,
        context_summary text not null,
        redactions text not null,
        created_at text not null
      );
    `);
  }

  private ensureSettings(): void {
    const existing = this.db.prepare('select key from settings where key = ?').get('settings');
    if (!existing) {
      this.db.prepare('insert into settings(key, value, updated_at) values(?, ?, ?)').run('settings', toJson(DEFAULT_SETTINGS), nowIso());
    }
  }

  private calculateFreedom(tasks: Task[], clues: ExternalClue[]): FreedomSummary {
    const now = new Date();
    const tomorrowEnd = new Date(now);
    tomorrowEnd.setDate(now.getDate() + 1);
    tomorrowEnd.setHours(23, 59, 59, 999);
    const urgentOpen = tasks.filter((task) => {
      if (task.status !== 'open') return false;
      if (task.priority === 'urgent') return true;
      return task.dueAt ? new Date(task.dueAt).getTime() <= tomorrowEnd.getTime() : false;
    });
    const pendingClues = clues.filter((clue) => clue.status === 'draft');
    if (now.getHours() >= 23) {
      return {
        tone: 'late',
        text: '现在已经很晚了，我不建议继续加任务。先把没收住的放进明天，会更划算。',
        urgentOpenCount: urgentOpen.length,
        pendingClueCount: pendingClues.length
      };
    }
    if (urgentOpen.length > 1 || pendingClues.length > 2) {
      return {
        tone: 'blocked',
        text: `今天还有 ${urgentOpen.length} 件要紧事和 ${pendingClues.length} 条外部线索没收住，暂时不建议放飞。`,
        urgentOpenCount: urgentOpen.length,
        pendingClueCount: pendingClues.length
      };
    }
    if (urgentOpen.length || pendingClues.length) {
      return {
        tone: 'caution',
        text: `还差 ${urgentOpen.length + pendingClues.length} 件要紧事，先收一下你今晚会轻松很多。`,
        urgentOpenCount: urgentOpen.length,
        pendingClueCount: pendingClues.length
      };
    }
    return {
      tone: 'free',
      text: '今天要紧的事基本收住了，可以自由安排一段。',
      urgentOpenCount: 0,
      pendingClueCount: 0
    };
  }

  private getActivity(id: ID): Activity {
    const row = this.db.prepare('select * from activities where id = ?').get(id) as Row | undefined;
    if (!row) throw new Error(`Activity not found: ${id}`);
    return activityFromRow(row);
  }

  private getTask(id: ID): Task {
    const row = this.db.prepare('select * from tasks where id = ?').get(id) as Row | undefined;
    if (!row) throw new Error(`Task not found: ${id}`);
    return taskFromRow(row);
  }

  private getSchedule(id: ID): ScheduleItem {
    const row = this.db.prepare('select * from schedules where id = ?').get(id) as Row | undefined;
    if (!row) throw new Error(`Schedule not found: ${id}`);
    return scheduleFromRow(row);
  }

  private getMemory(id: ID): Memory {
    const row = this.db.prepare('select * from memories where id = ?').get(id) as Row | undefined;
    if (!row) throw new Error(`Memory not found: ${id}`);
    return memoryFromRow(row);
  }

  private getClue(id: ID): ExternalClue {
    const row = this.db.prepare('select * from external_clues where id = ?').get(id) as Row | undefined;
    if (!row) throw new Error(`Clue not found: ${id}`);
    return clueFromRow(row);
  }

  private insertActivity(item: Activity): void {
    this.db
      .prepare(
        `insert into activities
        (id, title, category, status, source, tags, mood, energy, start_at, end_at, task_id, schedule_id, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        item.id,
        item.title,
        item.category,
        item.status,
        item.source,
        toJson(item.tags),
        item.mood ?? null,
        item.energy ?? null,
        item.startAt,
        item.endAt ?? null,
        item.taskId ?? null,
        item.scheduleId ?? null,
        item.createdAt,
        item.updatedAt
      );
  }

  private insertTask(item: Task): void {
    this.db
      .prepare('insert into tasks (id, title, status, priority, kind, due_at, source, notes, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(item.id, item.title, item.status, item.priority, item.kind ?? 'other', item.dueAt ?? null, item.source, item.notes ?? null, item.createdAt, item.updatedAt);
  }

  private insertSchedule(item: ScheduleItem): void {
    this.db
      .prepare('insert into schedules (id, title, start_at, end_at, source, task_id, location, notes, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(item.id, item.title, item.startAt, item.endAt, item.source, item.taskId ?? null, item.location ?? null, item.notes ?? null, item.createdAt, item.updatedAt);
  }

  private insertMemory(item: Memory): void {
    this.db
      .prepare('insert into memories (id, type, confidence, content, tags, never_mention, source, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(item.id, item.type, item.confidence, item.content, toJson(item.tags), item.neverMention ? 1 : 0, item.source, item.createdAt, item.updatedAt);
  }

  private insertMessage(item: ChatMessage): void {
    this.db.prepare('insert into messages (id, role, content, tone, created_at) values (?, ?, ?, ?, ?)').run(item.id, item.role, item.content, item.tone, item.createdAt);
  }

  private insertClue(item: ExternalClue): void {
    this.db
      .prepare('insert into external_clues (id, source, status, raw_summary, suggested_title, suggested_due_at, risk, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(item.id, item.source, item.status, item.rawSummary, item.suggestedTitle, item.suggestedDueAt ?? null, item.risk, item.createdAt, item.updatedAt);
  }

  private insertAudit(item: AiAuditEntry): void {
    this.db
      .prepare('insert into ai_audit (id, provider_id, purpose, context_summary, redactions, created_at) values (?, ?, ?, ?, ?, ?)')
      .run(item.id, item.providerId, item.purpose, item.contextSummary, toJson(item.redactions), item.createdAt);
  }
}

export async function openTimeMateDatabase(userDataPath: string): Promise<TimeMateDatabase> {
  const SQL = await initSqlJs({
    locateFile: (file) => require.resolve(`sql.js/dist/${file}`)
  });
  return new TimeMateDatabase(userDataPath, SQL);
}
