export type ID = string;

export type ActivityCategory =
  | 'study'
  | 'work'
  | 'entertainment'
  | 'life'
  | 'rest'
  | 'social'
  | 'other';

export type ActivityStatus = 'focus' | 'paused' | 'stalled' | 'resting' | 'unconfirmed' | 'done' | 'interrupted';
export type SourceKind = 'manual' | 'feishu' | 'email' | 'wechat' | 'icloud' | 'ai' | 'import';
export type MemoryType = 'fact' | 'goal' | 'emotion' | 'pattern' | 'preference' | 'boundary';
export type MemoryConfidence = 'confirmed' | 'inferred' | 'temporary';
export type TaskStatus = 'open' | 'done' | 'deferred' | 'cancelled';
export type Priority = 'urgent' | 'normal' | 'low';
export type ClueStatus = 'draft' | 'confirmed' | 'ignored';
export type CompanionTone = 'friend' | 'practical' | 'emotional';
export type VisualMode = 'dock' | 'studio' | 'compact';
export type AppearanceTone = 'morning' | 'mint' | 'coral' | 'night';
export type AppearanceDensity = 'soft' | 'balanced' | 'dense';
export type AppearanceMotion = 'still' | 'soft' | 'alive';
export type PetBusinessState = 'idle' | 'focus' | 'worried' | 'happy' | 'sleeping' | 'asking';
export type PetInteractionState = 'tap' | 'drag';
export type PetState = PetBusinessState | PetInteractionState;
export type PetPlacement = 'taskbar' | 'window-seat' | 'free';
export type CompanionKind = 'pixel-sprite';

export interface PetPosition {
  x: number;
  y: number;
}

export interface PetSettings {
  enabled: boolean;
  alwaysOnTop: boolean;
  lockedToTaskbar: boolean;
  clickThrough: boolean;
  scale: number;
  position?: PetPosition;
}

export interface PetSeatAnchorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

export interface PetPlacementState {
  placement: PetPlacement;
  visible: boolean;
  lockedToTaskbar: boolean;
  freeDragLocked: boolean;
  hasWindowSeatAnchor: boolean;
}

export interface CompanionSettings {
  activeCompanionId: string;
}

export type ColorScheme = 'auto' | 'light' | 'dark';

export interface AppearanceSettings {
  /** 外观模式:跟随系统 / 浅色 / 深色(v2 唯一外观开关) */
  colorScheme: ColorScheme;
  /** 关闭背景采样与半透明叠层，使用高对比实色材质。 */
  reducedTransparency: boolean;
  /** 以下为 v1 旧外观字段:仅保留读取兼容,UI 不再展示 */
  tone?: AppearanceTone;
  density?: AppearanceDensity;
  motion?: AppearanceMotion;
  ambientGlow?: boolean;
  surfaceOpacity?: number;
}

export interface Activity {
  id: ID;
  title: string;
  category: ActivityCategory;
  status: ActivityStatus;
  source: SourceKind;
  tags: string[];
  mood?: string;
  energy?: number;
  startAt: string;
  endAt?: string;
  taskId?: ID;
  scheduleId?: ID;
  createdAt: string;
  updatedAt: string;
}

export type TaskKind = 'work' | 'study' | 'life' | 'other';

export interface Task {
  id: ID;
  title: string;
  status: TaskStatus;
  priority: Priority;
  /** 任务类型(工作/学习/生活/其他);旧数据缺省按 other 读取 */
  kind?: TaskKind;
  dueAt?: string;
  source: SourceKind;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleItem {
  id: ID;
  title: string;
  startAt: string;
  endAt: string;
  source: SourceKind;
  taskId?: ID;
  location?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Memory {
  id: ID;
  type: MemoryType;
  confidence: MemoryConfidence;
  content: string;
  tags: string[];
  neverMention: boolean;
  source: SourceKind;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: ID;
  role: 'user' | 'companion' | 'system';
  content: string;
  tone: CompanionTone;
  createdAt: string;
}

export interface ExternalClue {
  id: ID;
  source: SourceKind;
  status: ClueStatus;
  rawSummary: string;
  suggestedTitle: string;
  suggestedDueAt?: string;
  risk: 'low' | 'medium' | 'high';
  createdAt: string;
  updatedAt: string;
}

export interface AiAuditEntry {
  id: ID;
  providerId: string;
  purpose: 'chat' | 'parse' | 'memory';
  contextSummary: string;
  redactions: string[];
  createdAt: string;
}

export interface Settings {
  language: 'zh' | 'en';
  visualMode: VisualMode;
  appearance: AppearanceSettings;
  privateMode: boolean;
  intimateNamesEnabled: boolean;
  reducedMotion: boolean;
  characterMotionEnabled: boolean;
  companion: CompanionSettings;
  pet: PetSettings;
  reminders: {
    fishAfterMinutes: number;
    eveningReview: boolean;
    scheduleBeforeMinutes: number;
    lateSleep: boolean;
  };
  startup: {
    openAtLogin: boolean;
  };
  ai: {
    providerId: string;
    endpoint: string;
    model: string;
    hasApiKey: boolean;
    auditEnabled: boolean;
  };
}

export interface FreedomSummary {
  tone: 'free' | 'caution' | 'blocked' | 'late';
  text: string;
  urgentOpenCount: number;
  pendingClueCount: number;
}

export interface AppSnapshot {
  activities: Activity[];
  currentActivity?: Activity;
  tasks: Task[];
  schedules: ScheduleItem[];
  memories: Memory[];
  messages: ChatMessage[];
  externalClues: ExternalClue[];
  aiAudit: AiAuditEntry[];
  settings: Settings;
  freedom: FreedomSummary;
}

export interface StartActivityInput {
  title: string;
  mood?: string;
}

export interface TaskInput {
  title: string;
  priority?: Priority;
  kind?: TaskKind;
  dueAt?: string;
  notes?: string;
}

export interface ScheduleInput {
  title: string;
  startAt: string;
  endAt: string;
  taskId?: ID;
  location?: string;
  notes?: string;
}

export interface MemoryInput {
  type: MemoryType;
  confidence: MemoryConfidence;
  content: string;
  tags?: string[];
  neverMention?: boolean;
}

export interface AssistantReply {
  message: ChatMessage;
  audit?: AiAuditEntry;
  snapshot: AppSnapshot;
}

export interface AppInfo {
  appName: string;
  version: string;
  userDataPath: string;
  databasePath: string;
  secureStoreAvailable: boolean;
}
