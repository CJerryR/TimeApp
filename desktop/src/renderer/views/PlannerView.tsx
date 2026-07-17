import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Inbox, Plus, Trash2, X } from 'lucide-react';
import type { AppSnapshot, ScheduleItem, Task, TaskKind } from '../../shared/types';
import { Button, Chip, CheckDot, EmptyState, Field, IconButton, Segmented, Sheet, cls } from '../ui/kit';
import { TASK_KINDS, clockLabel, dateTimeLocal, dayHeading, fromDateTimeLocal, isSameDay, isToday, taskKindLabel } from '../lib/format';
import '../styles/views/planner.css';

const HOUR_PX = 48;
const MIN_PX = HOUR_PX / 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const LEGACY_HOUR_PX = 56;
type CalendarView = 'day' | 'week' | 'month' | 'year';
type TimedLayoutItem = { item: ScheduleItem; start: number; end: number; col: number; total: number };
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const WEEKDAY_FULL = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const WEEKDAY_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const LEGACY_COLOR_HEX = {
  red: '#FF6243',
  orange: '#FFA94D',
  yellow: '#E8D44D',
  green: '#9CCB3B',
  teal: '#5BC8C4',
  blue: '#7FB0FF',
  indigo: '#9D97F0',
  purple: '#C08BE8',
  pink: '#FF7AA8',
  brown: '#C9A47E',
  gray: '#8A8F78',
  cyan: '#6FD3F2'
};
const SOURCE_COLOR: Record<string, keyof typeof LEGACY_COLOR_HEX> = {
  manual: 'blue',
  icloud: 'teal',
  ai: 'pink',
  import: 'purple',
  feishu: 'orange',
  email: 'cyan',
  wechat: 'green'
};

// Copied from the legacy single-file HTML calendar so the month panel matches its lunar labels.
const LUNAR_BASE_YEAR = 2020;
const LUNAR_BASE_DATE = startOfDay(new Date(2020, 0, 25)).getTime();
const lunarInfo = [
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0
];
const LUNAR_MONTHS = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '腊'];
const LUNAR_DAYS = [
  '',
  '初一',
  '初二',
  '初三',
  '初四',
  '初五',
  '初六',
  '初七',
  '初八',
  '初九',
  '初十',
  '十一',
  '十二',
  '十三',
  '十四',
  '十五',
  '十六',
  '十七',
  '十八',
  '十九',
  '二十',
  '廿一',
  '廿二',
  '廿三',
  '廿四',
  '廿五',
  '廿六',
  '廿七',
  '廿八',
  '廿九',
  '三十'
];
const TERM_NAMES = [
  '小寒',
  '大寒',
  '立春',
  '雨水',
  '惊蛰',
  '春分',
  '清明',
  '谷雨',
  '立夏',
  '小满',
  '芒种',
  '夏至',
  '小暑',
  '大暑',
  '立秋',
  '处暑',
  '白露',
  '秋分',
  '寒露',
  '霜降',
  '立冬',
  '小雪',
  '大雪',
  '冬至'
];
const TERM_C = [
  5.4055, 20.12, 3.87, 18.73, 5.63, 20.646, 4.81, 20.1, 5.52, 21.04, 5.678, 21.37,
  7.108, 22.83, 7.5, 23.13, 7.646, 23.042, 8.318, 23.438, 7.438, 22.36, 7.18, 21.94
];
const HOLIDAYS_2026 = {
  rest: [
    '2026-01-01',
    '2026-02-15',
    '2026-02-16',
    '2026-02-17',
    '2026-02-18',
    '2026-02-19',
    '2026-02-20',
    '2026-02-21',
    '2026-02-22',
    '2026-02-23',
    '2026-04-04',
    '2026-04-05',
    '2026-04-06',
    '2026-05-01',
    '2026-05-02',
    '2026-05-03',
    '2026-05-04',
    '2026-05-05',
    '2026-06-19',
    '2026-06-20',
    '2026-06-21',
    '2026-09-25',
    '2026-09-26',
    '2026-09-27',
    '2026-10-01',
    '2026-10-02',
    '2026-10-03',
    '2026-10-04',
    '2026-10-05',
    '2026-10-06',
    '2026-10-07'
  ],
  work: ['2026-02-14', '2026-02-28', '2026-05-09', '2026-09-19', '2026-10-10'],
  fest: {
    '2026-01-01': '元旦',
    '2026-02-17': '春节',
    '2026-04-05': '清明节',
    '2026-05-01': '劳动节',
    '2026-05-04': '青年节',
    '2026-06-19': '端午节',
    '2026-09-25': '中秋节',
    '2026-10-01': '国庆节'
  } as Record<string, string>
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function ymd(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function weekStart(date: Date) {
  return addDays(startOfDay(date), -((date.getDay() + 6) % 7));
}

function firstMonday(year: number) {
  const date = new Date(year, 0, 1);
  const offset = (8 - date.getDay()) % 7;
  return startOfDay(addDays(date, offset === 0 ? 0 : offset));
}

function legacyWeekNumber(date: Date) {
  const monday = weekStart(date);
  let first = firstMonday(monday.getFullYear());
  if (monday < first) first = firstMonday(monday.getFullYear() - 1);
  return Math.floor((monday.getTime() - first.getTime()) / (7 * DAY_MS)) + 1;
}

function isWeekendCol(index: number) {
  return index === 5 || index === 6;
}

function weekColumn(date: Date) {
  return (date.getDay() + 6) % 7;
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function hexA(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function legacyColor(source?: string) {
  return SOURCE_COLOR[source || 'manual'] || 'blue';
}

function lLeapMonth(year: number) {
  return lunarInfo[year - LUNAR_BASE_YEAR] & 0xf;
}

function lLeapDays(year: number) {
  if (!lLeapMonth(year)) return 0;
  return lunarInfo[year - LUNAR_BASE_YEAR] & 0x10000 ? 30 : 29;
}

function lMonthDays(year: number, month: number) {
  return lunarInfo[year - LUNAR_BASE_YEAR] & (0x10000 >> month) ? 30 : 29;
}

function lYearDays(year: number) {
  let total = 0;
  for (let month = 1; month <= 12; month += 1) total += lMonthDays(year, month);
  return total + lLeapDays(year);
}

function solarToLunar(date: Date) {
  let offset = Math.round((startOfDay(date).getTime() - LUNAR_BASE_DATE) / DAY_MS);
  if (offset < 0 || LUNAR_BASE_YEAR + lunarInfo.length - 1 < date.getFullYear()) return null;
  let year = LUNAR_BASE_YEAR;
  for (; year < LUNAR_BASE_YEAR + lunarInfo.length; year += 1) {
    const days = lYearDays(year);
    if (offset < days) break;
    offset -= days;
  }
  const leap = lLeapMonth(year);
  let isLeap = false;
  let month = 1;
  let monthDays = 0;
  for (; month <= 12; month += 1) {
    if (leap > 0 && month === leap + 1 && !isLeap) {
      month -= 1;
      isLeap = true;
      monthDays = lLeapDays(year);
    } else {
      monthDays = lMonthDays(year, month);
    }
    if (isLeap && month === leap + 1) isLeap = false;
    if (offset < monthDays) break;
    offset -= monthDays;
  }
  const day = offset + 1;
  return { day, isLeap, monthName: LUNAR_MONTHS[month - 1], dayName: LUNAR_DAYS[day] };
}

function lunarLabel(date: Date) {
  const lunar = solarToLunar(date);
  if (!lunar) return '';
  if (lunar.day === 1) return `${lunar.isLeap ? '闰' : ''}${lunar.monthName}月`;
  return lunar.dayName;
}

function termDay(year: number, index: number) {
  const y = year % 100;
  return Math.floor(y * 0.2422 + TERM_C[index]) - Math.floor((y - 1) / 4);
}

function termOnDate(date: Date) {
  const month = date.getMonth();
  for (const index of [month * 2, month * 2 + 1]) {
    if (termDay(date.getFullYear(), index) === date.getDate()) return TERM_NAMES[index];
  }
  return null;
}

function dayBadge(date: Date) {
  const key = ymd(date);
  if (HOLIDAYS_2026.rest.includes(key)) return { cls: 'rest', txt: '休' };
  if (HOLIDAYS_2026.work.includes(key)) return { cls: 'work', txt: '班' };
  return null;
}

function virtualAllDay(date: Date) {
  const key = ymd(date);
  const out: string[] = [];
  if (key === '2026-05-01') out.push('劳动节（休）', '劳动节');
  else if (key === '2026-05-04') out.push('劳动节（休）', '青年节');
  else if (key === '2026-05-09') out.push('劳动节（班）');
  else if (HOLIDAYS_2026.fest[key]) out.push(HOLIDAYS_2026.fest[key]);
  const term = termOnDate(date);
  if (term) out.push(term);
  return out;
}

export function PlannerView({
  snapshot,
  busy,
  run
}: {
  snapshot: AppSnapshot;
  busy: boolean;
  run: (action: () => Promise<AppSnapshot | void>) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<TaskKind>('work');
  const [urgent, setUrgent] = useState(false);
  const [dueToday, setDueToday] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [cluesOpen, setCluesOpen] = useState(false);

  const [dayOffset, setDayOffset] = useState(0);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleStart, setScheduleStart] = useState(dateTimeLocal(new Date().toISOString()));
  const [scheduleEnd, setScheduleEnd] = useState(dateTimeLocal(new Date(Date.now() + 30 * 60000).toISOString()));
  const [monthCursor, setMonthCursor] = useState(startOfDay(new Date()));

  const scrollRef = useRef<HTMLDivElement>(null);

  const day = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    return date;
  }, [dayOffset]);

  const openTasks = snapshot.tasks.filter((task) => task.status === 'open');
  const urgentTasks = openTasks.filter((task) => task.priority === 'urgent');
  const todayTasks = openTasks.filter((task) => task.priority !== 'urgent' && isToday(task.dueAt));
  const lifeTasks = openTasks.filter((task) => task.priority !== 'urgent' && !isToday(task.dueAt) && task.kind === 'life');
  const laterTasks = openTasks.filter((task) => task.priority !== 'urgent' && !isToday(task.dueAt) && task.kind !== 'life');
  const doneTasks = snapshot.tasks.filter((task) => task.status === 'done');
  const draftClues = snapshot.externalClues.filter((clue) => clue.status === 'draft');

  const daySchedules = snapshot.schedules
    .filter((item) => isSameDay(new Date(item.startAt), day))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const target = dayOffset === 0 ? Math.max(0, nowMinutes * MIN_PX - 160) : 8 * HOUR_PX;
    node.scrollTop = target;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayOffset]);

  function selectCalendarDay(value: Date) {
    const selected = startOfDay(value);
    const today = startOfDay(new Date());
    setDayOffset(Math.round((selected.getTime() - today.getTime()) / DAY_MS));
    setMonthCursor(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }

  function openScheduleForDay(value: Date) {
    const base = new Date(value);
    const now = new Date();
    const hasSpecificTime = base.getHours() !== 0 || base.getMinutes() !== 0 || base.getSeconds() !== 0 || base.getMilliseconds() !== 0;
    if (!hasSpecificTime) base.setHours(isSameDay(base, now) ? now.getHours() : 9, 0, 0, 0);
    setScheduleStart(dateTimeLocal(base.toISOString()));
    setScheduleEnd(dateTimeLocal(new Date(base.getTime() + 60 * 60000).toISOString()));
    setScheduleOpen(true);
  }

  async function addTask() {
    const value = title.trim();
    if (!value) return;
    const dueAt = dueToday ? new Date(new Date().setHours(23, 59, 0, 0)).toISOString() : undefined;
    await run(() => window.timeMate.createTask({ title: value, priority: urgent ? 'urgent' : 'normal', kind, dueAt }));
    setTitle('');
    setUrgent(false);
    setDueToday(false);
  }

  async function addSchedule() {
    const startAt = fromDateTimeLocal(scheduleStart);
    const endAt = fromDateTimeLocal(scheduleEnd);
    if (!scheduleTitle.trim() || !startAt || !endAt) return;
    await run(() => window.timeMate.createSchedule({ title: scheduleTitle.trim(), startAt, endAt }));
    setScheduleTitle('');
    setScheduleOpen(false);
  }

  return (
    <div className="page" data-view="planner">
      <div className="page-head">
        <h1 tabIndex={-1}>规划</h1>
        <span className="page-date">{dayHeading(new Date())}</span>
      </div>

      <LegacyCalendarPanel
        schedules={snapshot.schedules}
        selectedDay={day}
        monthCursor={monthCursor}
        onMonthCursorChange={setMonthCursor}
        onSelectDay={selectCalendarDay}
        onCreateSchedule={openScheduleForDay}
        onDeleteSchedule={(id) => void run(() => window.timeMate.deleteSchedule(id))}
      />

      <div className="planner-grid" aria-label="规划详情">
        <PlannerDisclosure
          title="任务"
          meta={`${openTasks.length} 件未完成`}
          open={tasksOpen}
          onToggle={() => setTasksOpen((open) => !open)}
          className="planner-tasks"
        >
            <div className="task-add">
              <div className="task-add-row">
                <Field value={title} onChange={setTitle} onEnter={() => void addTask()} placeholder="周五前交报告 / 买牙膏" ariaLabel="新任务" />
                <Button variant="primary" icon={<Plus />} loading={busy} disabled={!title.trim()} onClick={() => void addTask()}>
                  添加
                </Button>
              </div>
              <div className="task-add-meta">
                <Segmented value={kind} options={TASK_KINDS} onChange={setKind} ariaLabel="任务类型" />
                <Chip tone={urgent ? 'critical' : 'neutral'} onClick={() => setUrgent(!urgent)} title="标记为紧急">
                  紧急
                </Chip>
                <Chip tone={dueToday ? 'accent' : 'neutral'} onClick={() => setDueToday(!dueToday)} title="今天要完成">
                  今天到期
                </Chip>
              </div>
            </div>

            {openTasks.length === 0 && doneTasks.length === 0 ? (
              <EmptyState title="还没有任务" text="先记一件要紧的事,她会帮你看着今天的自由度。" />
            ) : (
              <>
                <TaskGroup label="紧急" tasks={urgentTasks} run={run} />
                <TaskGroup label="今天到期" tasks={todayTasks} run={run} />
                <TaskGroup label="生活" tasks={lifeTasks} run={run} />
                <TaskGroup label="以后" tasks={laterTasks} run={run} />
                {doneTasks.length > 0 && (
                  <div className="task-group">
                    <button
                      type="button"
                      className="task-group-head"
                      aria-expanded={showDone}
                      aria-controls="completed-task-list"
                      onClick={() => setShowDone(!showDone)}
                      style={{ width: '100%' }}
                    >
                      {showDone ? <ChevronUp /> : <ChevronDown />}
                      已完成 <span className="count">{doneTasks.length}</span>
                    </button>
                    <div
                      id="completed-task-list"
                      className={cls('task-done-shell', showDone && 'is-open')}
                      aria-hidden={!showDone}
                      inert={!showDone ? '' : undefined}
                    >
                      <div className="list task-done-list">
                        {doneTasks.map((task) => (
                          <TaskRow key={task.id} task={task} run={run} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
        </PlannerDisclosure>

        <PlannerDisclosure
          title="当日时间线"
          meta={dayOffset === 0 ? '今天' : dayHeading(day)}
          open={timelineOpen}
          onToggle={() => setTimelineOpen((open) => !open)}
          className="timeline-card"
        >
          <div data-timeline="true">
          <div className="timeline-head">
            <div className="section-aside">
              <IconButton icon={<ChevronLeft />} label="前一天" onClick={() => selectCalendarDay(addDays(day, -1))} />
              {dayOffset !== 0 && (
                <Button size="sm" variant="plain" onClick={() => selectCalendarDay(new Date())}>
                  回今天
                </Button>
              )}
              <IconButton icon={<ChevronRight />} label="后一天" onClick={() => selectCalendarDay(addDays(day, 1))} />
              <Button size="sm" variant="tinted" icon={<Plus />} onClick={() => openScheduleForDay(day)}>
                安排一段
              </Button>
            </div>
          </div>
          <div className="timeline-scroll" ref={scrollRef}>
            <div className="timeline-grid">
              {Array.from({ length: 25 }, (_, hour) => (
                <div className="hour-line" key={hour} style={{ top: hour * HOUR_PX }}>
                  <span className="hour-label" style={{ top: 0 }}>
                    {String(hour % 24).padStart(2, '0')}:00
                  </span>
                </div>
              ))}
              {dayOffset === 0 && <div className="now-line" style={{ top: nowMinutes * MIN_PX }} aria-label="现在" />}
              {daySchedules.map((item) => (
                <TimelineEvent
                  item={item}
                  linkedTask={item.taskId ? snapshot.tasks.find((task) => task.id === item.taskId) : undefined}
                  key={item.id}
                  run={run}
                />
              ))}
              {daySchedules.length === 0 && (
                <div style={{ position: 'absolute', top: 9 * HOUR_PX, left: 0, right: 0 }}>
                  <EmptyState icon={<Inbox />} title="这一天还是空的" text="点右上「安排一段」,给自己留出确定的时间。" />
                </div>
              )}
            </div>
          </div>
          </div>
        </PlannerDisclosure>

        <PlannerDisclosure
          title="待确认线索"
          meta={draftClues.length > 0 ? `${draftClues.length} 条` : '暂无'}
          open={cluesOpen}
          onToggle={() => setCluesOpen((open) => !open)}
          className="planner-clues"
        >
          {draftClues.length === 0 ? (
            <p className="setting-sub planner-clue-empty">
              外部来源(飞书 / 邮箱 / 微信 / iCloud)的线索会先到这里,确认后才会进入任务。
            </p>
          ) : (
            <div className="list">
              {draftClues.map((clue) => (
                <ClueRow clue={clue} key={clue.id} run={run} />
              ))}
            </div>
          )}
        </PlannerDisclosure>
      </div>

      {/* ---- 安排一段 Sheet ---- */}
      <Sheet
        open={scheduleOpen}
        title="安排一段"
        subtitle="给一件事留出确定的时间,时间线上会看到它。"
        onClose={() => setScheduleOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setScheduleOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={busy} disabled={!scheduleTitle.trim()} onClick={() => void addSchedule()}>
              放进时间线
            </Button>
          </>
        }
      >
        <Field value={scheduleTitle} onChange={setScheduleTitle} placeholder="开会 / 复习 / 休息" ariaLabel="日程标题" autoFocus />
        <div className="task-add-meta">
          <label className="setting-sub">
            开始{' '}
            <input type="datetime-local" className="dt" value={scheduleStart} onChange={(event) => setScheduleStart(event.target.value)} />
          </label>
          <label className="setting-sub">
            结束{' '}
            <input type="datetime-local" className="dt" value={scheduleEnd} onChange={(event) => setScheduleEnd(event.target.value)} />
          </label>
        </div>
      </Sheet>
    </div>
  );
}

function LegacyCalendarPanel({
  schedules,
  selectedDay,
  monthCursor,
  onMonthCursorChange,
  onSelectDay,
  onCreateSchedule,
  onDeleteSchedule
}: {
  schedules: ScheduleItem[];
  selectedDay: Date;
  monthCursor: Date;
  onMonthCursorChange: (date: Date) => void;
  onSelectDay: (date: Date) => void;
  onCreateSchedule: (date: Date) => void;
  onDeleteSchedule: (id: string) => void;
}) {
  const [calendarView, setCalendarView] = useState<CalendarView>('month');
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [motionDirection, setMotionDirection] = useState<-1 | 1>(1);
  const monthStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const gridStart = weekStart(monthStart);
  const cells = useMemo(() => Array.from({ length: 42 }, (_, index) => addDays(gridStart, index)), [gridStart.getTime()]);
  const sortedSchedules = useMemo(
    () => [...schedules].sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [schedules]
  );
  const today = new Date();
  const titleDate = calendarView === 'month' || calendarView === 'year' ? monthCursor : selectedDay;
  const title = legacyCalendarTitle(calendarView, titleDate);
  const viewOptions: Array<{ view: CalendarView; label: string }> = [
    { view: 'day', label: '日' },
    { view: 'week', label: '周' },
    { view: 'month', label: '月' },
    { view: 'year', label: '年' }
  ];
  const activeIndex = viewOptions.findIndex((item) => item.view === calendarView);
  const inspectedSchedule = sortedSchedules.find((item) => item.id === inspectedId);
  const viewMotionKey = `${calendarView}-${ymd(titleDate)}`;

  useEffect(() => {
    if (calendarView !== 'day') setInspectedId(null);
  }, [calendarView]);

  function schedulesForDay(date: Date) {
    const from = startOfDay(date).getTime();
    const to = from + DAY_MS;
    return sortedSchedules.filter((item) => {
      const start = new Date(item.startAt).getTime();
      const end = new Date(item.endAt).getTime();
      return start < to && end > from;
    });
  }

  function changeView(view: CalendarView) {
    const nextIndex = viewOptions.findIndex((item) => item.view === view);
    setMotionDirection(nextIndex >= activeIndex ? 1 : -1);
    setCalendarView(view);
    if (view === 'month' || view === 'year') {
      onMonthCursorChange(new Date(selectedDay.getFullYear(), selectedDay.getMonth(), 1));
    }
  }

  function navigate(dir: -1 | 1) {
    setMotionDirection(dir);
    if (calendarView === 'day') onSelectDay(addDays(selectedDay, dir));
    else if (calendarView === 'week') onSelectDay(addDays(selectedDay, dir * 7));
    else if (calendarView === 'month') onMonthCursorChange(addMonths(monthCursor, dir));
    else onMonthCursorChange(new Date(monthCursor.getFullYear() + dir, monthCursor.getMonth(), 1));
  }

  function goToday() {
    setMotionDirection(today.getTime() >= titleDate.getTime() ? 1 : -1);
    onSelectDay(today);
    onMonthCursorChange(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  function openDay(date: Date) {
    setMotionDirection(date.getTime() >= selectedDay.getTime() ? 1 : -1);
    onSelectDay(date);
    setCalendarView('day');
  }

  return (
    <section className="legacy-calendar-panel" aria-label="日历">
      <div className="legacy-calendar-toolbar">
        <div className="title">
          <h1 aria-live="polite">
            <span className={cls('calendar-title-swap', motionDirection > 0 ? 'is-forward' : 'is-backward')} key={viewMotionKey}>
              <span className="yr">{title.lead}</span>
              {title.rest}
            </span>
          </h1>
          <span className="sub">日程总览</span>
        </div>
        <div className="legacy-calendar-actions">
          <div className="seg" aria-label="日历视图">
            {viewOptions.map((item) => (
              <button
                type="button"
                data-view={item.view}
                className={calendarView === item.view ? 'on' : undefined}
                key={item.view}
                onClick={() => changeView(item.view)}
              >
                {item.label}
              </button>
            ))}
            <span className="pill" aria-hidden="true" style={{ transform: `translateX(${Math.max(0, activeIndex) * 100}%)` }} />
          </div>
          <button type="button" className="today-btn" onClick={goToday}>
            今天
          </button>
          <div className="seg-mini" aria-label="日历导航">
            <button type="button" title="上一页" onClick={() => navigate(-1)}>
              <ChevronLeft />
            </button>
            <button type="button" title="下一页" onClick={() => navigate(1)}>
              <ChevronRight />
            </button>
          </div>
          <button type="button" className="tb-icon pg-on" title="新建日程" onClick={() => onCreateSchedule(selectedDay)}>
            <Plus />
            <span className="pg-lab">新增</span>
          </button>
        </div>
      </div>

      <div
        className={cls('calendar-view-stage', motionDirection > 0 ? 'is-forward' : 'is-backward')}
        key={viewMotionKey}
      >
        {calendarView === 'day' && (
          <LegacyDayView
            selectedDay={selectedDay}
            today={today}
            schedulesForDay={schedulesForDay}
            inspectedSchedule={inspectedSchedule}
            onSelectDay={onSelectDay}
            onCreateSchedule={onCreateSchedule}
            onInspectSchedule={(item) => setInspectedId(item.id)}
            onDeleteSchedule={(id) => {
              setInspectedId(null);
              onDeleteSchedule(id);
            }}
          />
        )}
        {calendarView === 'week' && (
          <LegacyWeekView
            selectedDay={selectedDay}
            today={today}
            schedulesForDay={schedulesForDay}
            onSelectDay={onSelectDay}
            onOpenDay={openDay}
            onCreateSchedule={onCreateSchedule}
            onInspectSchedule={(item) => {
              setInspectedId(item.id);
              openDay(new Date(item.startAt));
            }}
          />
        )}
        {calendarView === 'month' && (
          <div className="view show" id="view-month">
            <LegacyMonthView
              cells={cells}
              monthCursor={monthCursor}
              selectedDay={selectedDay}
              today={today}
              schedulesForDay={schedulesForDay}
              onOpenDay={openDay}
              onCreateSchedule={onCreateSchedule}
            />
          </div>
        )}
        {calendarView === 'year' && (
          <LegacyYearView
            cursor={monthCursor}
            today={today}
            onMonthClick={(date) => {
              setMotionDirection(date.getTime() >= monthCursor.getTime() ? 1 : -1);
              onMonthCursorChange(date);
              setCalendarView('month');
            }}
          />
        )}
      </div>
    </section>
  );
}

function legacyCalendarTitle(view: CalendarView, date: Date) {
  if (view === 'year') return { lead: String(date.getFullYear()), rest: '年' };
  return { lead: String(date.getFullYear()), rest: `年${date.getMonth() + 1}月` };
}

function LegacyMonthView({
  cells,
  monthCursor,
  selectedDay,
  today,
  schedulesForDay,
  onOpenDay,
  onCreateSchedule
}: {
  cells: Date[];
  monthCursor: Date;
  selectedDay: Date;
  today: Date;
  schedulesForDay: (date: Date) => ScheduleItem[];
  onOpenDay: (date: Date) => void;
  onCreateSchedule: (date: Date) => void;
}) {
  return (
    <>
        <div className="m-weekhead">
          {WEEKDAYS.map((weekday, index) => (
            <div className={isWeekendCol(index) ? 'we' : undefined} key={weekday}>
              {weekday}
            </div>
          ))}
        </div>
        <div className="m-grid scroll">
          {cells.map((cellDay, index) => {
            const badge = dayBadge(cellDay);
            const lunar = lunarLabel(cellDay);
            const virtuals = virtualAllDay(cellDay).map((title) => ({ kind: 'virtual' as const, title }));
            const dayItems = schedulesForDay(cellDay).map((item) => ({ kind: 'schedule' as const, item }));
            const chips = [...virtuals, ...dayItems];
            const visible = chips.slice(0, 4);
            const more = chips.length - visible.length;
            const cellClass = cls(
              'mc',
              !sameMonth(cellDay, monthCursor) && 'dim',
              !sameMonth(cellDay, monthCursor) && 'out',
              isSameDay(cellDay, today) && 'today',
              isSameDay(cellDay, selectedDay) && 'sel'
            );

            return (
              <button
                type="button"
                className={cellClass}
                key={ymd(cellDay)}
                onClick={() => onOpenDay(cellDay)}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onCreateSchedule(cellDay);
                }}
              >
                <div className="mc-top">
                  {index % 7 === 0 && <span className="mc-wk">第{legacyWeekNumber(cellDay)}周</span>}
                  {lunar && <span className={cls('mc-lun', lunar.endsWith('月') && 'fest')}>{lunar}</span>}
                  <span className="mc-date-meta">
                    {badge && <span className={`mc-badge ${badge.cls}`}>{badge.txt}</span>}
                    <span className="mc-num">{cellDay.getDate()}</span>
                  </span>
                </div>
                <div className="mc-events">
                  {visible.map((chip) => {
                    if (chip.kind === 'virtual') {
                      return (
                        <span
                          className="chip pill"
                          key={`${ymd(cellDay)}-${chip.title}`}
                          style={{ background: hexA(LEGACY_COLOR_HEX.blue, 0.1) }}
                        >
                          <span className="star" style={{ color: LEGACY_COLOR_HEX.blue }}>
                            ★
                          </span>
                          <span className="ct">{chip.title}</span>
                        </span>
                      );
                    }
                    const colorName = legacyColor(chip.item.source);
                    const color = LEGACY_COLOR_HEX[colorName];
                    return (
                      <span
                        className="chip"
                        key={chip.item.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenDay(new Date(chip.item.startAt));
                        }}
                      >
                        <span className="bar" style={{ background: color }} />
                        <span className="ct">{chip.item.title}</span>
                        <span className="ctime">{clockLabel(chip.item.startAt)}</span>
                      </span>
                    );
                  })}
                  {more > 0 && <span className="mc-more">+还有 {more} 个</span>}
                </div>
              </button>
            );
          })}
        </div>
    </>
  );
}

function LegacyWeekView({
  selectedDay,
  today,
  schedulesForDay,
  onSelectDay,
  onOpenDay,
  onCreateSchedule,
  onInspectSchedule
}: {
  selectedDay: Date;
  today: Date;
  schedulesForDay: (date: Date) => ScheduleItem[];
  onSelectDay: (date: Date) => void;
  onOpenDay: (date: Date) => void;
  onCreateSchedule: (date: Date) => void;
  onInspectSchedule: (item: ScheduleItem) => void;
}) {
  const start = weekStart(selectedDay);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));

  return (
    <div className="view show" id="view-week">
      <LegacyTimeGrid
        headerDays={days}
        bodyDays={days}
        axisLabel={`第${legacyWeekNumber(start)}周`}
        selectedDay={selectedDay}
        today={today}
        schedulesForDay={schedulesForDay}
        onSelectDay={onSelectDay}
        onOpenDay={onOpenDay}
        onCreateSchedule={onCreateSchedule}
        onInspectSchedule={onInspectSchedule}
      />
    </div>
  );
}

function LegacyDayView({
  selectedDay,
  today,
  schedulesForDay,
  inspectedSchedule,
  onSelectDay,
  onCreateSchedule,
  onInspectSchedule,
  onDeleteSchedule
}: {
  selectedDay: Date;
  today: Date;
  schedulesForDay: (date: Date) => ScheduleItem[];
  inspectedSchedule?: ScheduleItem;
  onSelectDay: (date: Date) => void;
  onCreateSchedule: (date: Date) => void;
  onInspectSchedule: (item: ScheduleItem) => void;
  onDeleteSchedule: (id: string) => void;
}) {
  const start = weekStart(selectedDay);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(start, index));

  return (
    <div className="view show" id="view-day">
      <div className="day-body">
        <div className="day-main">
          <LegacyTimeGrid
            headerDays={weekDays}
            bodyDays={[selectedDay]}
            axisLabel={`第${legacyWeekNumber(start)}周`}
            selectedDay={selectedDay}
            today={today}
            schedulesForDay={schedulesForDay}
            onSelectDay={onSelectDay}
            onOpenDay={onSelectDay}
            onCreateSchedule={onCreateSchedule}
            onInspectSchedule={onInspectSchedule}
          />
        </div>
        <LegacyDayInspector item={inspectedSchedule} onCreateSchedule={onCreateSchedule} onDeleteSchedule={onDeleteSchedule} />
      </div>
    </div>
  );
}

function LegacyTimeGrid({
  headerDays,
  bodyDays,
  axisLabel,
  selectedDay,
  today,
  schedulesForDay,
  onSelectDay,
  onOpenDay,
  onCreateSchedule,
  onInspectSchedule
}: {
  headerDays: Date[];
  bodyDays: Date[];
  axisLabel: string;
  selectedDay: Date;
  today: Date;
  schedulesForDay: (date: Date) => ScheduleItem[];
  onSelectDay: (date: Date) => void;
  onOpenDay: (date: Date) => void;
  onCreateSchedule: (date: Date) => void;
  onInspectSchedule: (item: ScheduleItem) => void;
}) {
  const headerColumns = `70px repeat(${headerDays.length}, 1fr)`;
  const bodyColumns = `70px repeat(${bodyDays.length}, 1fr)`;
  const height = 24 * LEGACY_HOUR_PX;
  const hasAllDay = headerDays.some((date) => virtualAllDay(date).length > 0 || schedulesForDay(date).some((item) => isAllDaySchedule(item, date)));
  const hours = Array.from({ length: 25 }, (_, hour) => hour);

  return (
    <>
      <div className="daystrip" style={{ gridTemplateColumns: headerColumns }}>
        <div className="axis-corner">{axisLabel}</div>
        {headerDays.map((date) => (
          <LegacyDayHead
            date={date}
            key={ymd(date)}
            selectedDay={selectedDay}
            today={today}
            onClick={() => {
              onSelectDay(date);
              onOpenDay(date);
            }}
          />
        ))}
      </div>

      {hasAllDay && (
        <div className="allday-row" style={{ gridTemplateColumns: headerColumns }}>
          <div className="ad-label">全天</div>
          {headerDays.map((date) => (
            <LegacyAllDayCell date={date} schedules={schedulesForDay(date)} key={ymd(date)} onOpenDay={onOpenDay} />
          ))}
        </div>
      )}

      <div className="timewrap scroll">
        <div className="timegrid" style={{ gridTemplateColumns: bodyColumns, minHeight: height }}>
          <div className="t-axis" style={{ height }}>
            {hours.slice(0, 24).map((hour) => (
              <div key={hour} style={{ top: hour * LEGACY_HOUR_PX }}>
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
          </div>
          {bodyDays.map((date) => {
            const timedItems = layoutTimedItems(
              schedulesForDay(date).filter((item) => !isAllDaySchedule(item, date)),
              date
            );
            return (
              <div className="t-col" key={ymd(date)} style={{ height }}>
                {hours.map((hour) => {
                  const slot = new Date(date);
                  slot.setHours(hour % 24, 0, 0, 0);
                  return (
                    <button
                      type="button"
                      className={cls('t-hr', hour % 6 === 0 && 'major')}
                      key={hour}
                      style={{ top: hour * LEGACY_HOUR_PX }}
                      title={`${ymd(slot)} ${String(hour % 24).padStart(2, '0')}:00`}
                      onDoubleClick={() => onCreateSchedule(slot)}
                    />
                  );
                })}
                {timedItems.map((layout) => (
                  <LegacyTimedEventBlock item={layout} key={`${layout.item.id}-${ymd(date)}`} date={date} onInspectSchedule={onInspectSchedule} />
                ))}
                {isSameDay(date, today) && (
                  <div
                    className="nowline"
                    style={{ top: (today.getHours() + today.getMinutes() / 60) * LEGACY_HOUR_PX }}
                    aria-label="现在"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function LegacyDayHead({
  date,
  selectedDay,
  today,
  onClick
}: {
  date: Date;
  selectedDay: Date;
  today: Date;
  onClick: () => void;
}) {
  const lunar = lunarLabel(date);
  const badge = dayBadge(date);
  return (
    <button
      type="button"
      className={cls('dcol-head', isWeekend(date) && 'we', isSameDay(date, today) && 'today', isSameDay(date, selectedDay) && 'sel')}
      onClick={onClick}
    >
      {badge && <div className={`ds-badge ${badge.cls}`}>{badge.txt}</div>}
      <div className="dwd">{WEEKDAY_SHORT[date.getDay()]}</div>
      <div className="dnum">{date.getDate()}</div>
      {lunar && <div className={cls('dlun', lunar.endsWith('月') && 'fest')}>{lunar}</div>}
    </button>
  );
}

function LegacyAllDayCell({
  date,
  schedules,
  onOpenDay
}: {
  date: Date;
  schedules: ScheduleItem[];
  onOpenDay: (date: Date) => void;
}) {
  const virtuals = virtualAllDay(date).map((title) => ({ kind: 'virtual' as const, title }));
  const allDaySchedules = schedules.filter((item) => isAllDaySchedule(item, date)).map((item) => ({ kind: 'schedule' as const, item }));
  return (
    <div className="allday-cell">
      {[...virtuals, ...allDaySchedules].map((entry) => {
        if (entry.kind === 'virtual') {
          return (
            <button
              type="button"
              className="ad-pill"
              key={`${ymd(date)}-${entry.title}`}
              style={{ background: hexA(LEGACY_COLOR_HEX.blue, 0.1) }}
              onClick={() => onOpenDay(date)}
            >
              <span className="star" style={{ color: LEGACY_COLOR_HEX.blue }}>
                ★
              </span>
              <span>{entry.title}</span>
            </button>
          );
        }
        const color = LEGACY_COLOR_HEX[legacyColor(entry.item.source)];
        return (
          <button
            type="button"
            className="ad-pill"
            key={entry.item.id}
            style={{ background: hexA(color, 0.1), borderLeftColor: color }}
            onClick={() => onOpenDay(new Date(entry.item.startAt))}
          >
            {entry.item.title}
          </button>
        );
      })}
    </div>
  );
}

function LegacyTimedEventBlock({
  item,
  date,
  onInspectSchedule
}: {
  item: TimedLayoutItem;
  date: Date;
  onInspectSchedule: (item: ScheduleItem) => void;
}) {
  const dayStart = startOfDay(date).getTime();
  const color = LEGACY_COLOR_HEX[legacyColor(item.item.source)];
  const top = ((item.start - dayStart) / 60000 / 60) * LEGACY_HOUR_PX;
  const height = Math.max(18, ((item.end - item.start) / 60000 / 60) * LEGACY_HOUR_PX - 2);
  const width = 100 / item.total;
  const left = item.col * width;

  return (
    <button
      type="button"
      className="tev"
      style={{
        top,
        height,
        left: `calc(${left}% + 2px)`,
        width: `calc(${width}% - 5px)`,
        background: hexA(color, 0.1)
      }}
      onClick={(event) => {
        event.stopPropagation();
        onInspectSchedule(item.item);
      }}
    >
      <span className="accent" style={{ background: color }} />
      <span className="te-title">{item.item.title}</span>
      {height > 34 && item.item.location && <span className="te-meta">{item.item.location}</span>}
      {height > 50 && <span className="te-meta">{clockLabel(item.item.startAt)} - {clockLabel(item.item.endAt)}</span>}
    </button>
  );
}

function LegacyDayInspector({
  item,
  onCreateSchedule,
  onDeleteSchedule
}: {
  item?: ScheduleItem;
  onCreateSchedule: (date: Date) => void;
  onDeleteSchedule: (id: string) => void;
}) {
  const [removing, setRemoving] = useState(false);

  useEffect(() => setRemoving(false), [item?.id]);

  function removeItem() {
    if (!item || removing) return;
    setRemoving(true);
    window.setTimeout(() => onDeleteSchedule(item.id), motionExitDelay());
  }

  return (
    <aside className={cls('day-inspector', item && 'open')} id="day-inspector">
      {item ? (
        <div className={cls('di-inner', removing && 'is-removing')} key={item.id}>
          <div className="di-top">
            <div className="di-title">{item.title}</div>
            <button type="button" className="di-edit" onClick={() => onCreateSchedule(new Date(item.startAt))}>
              安排
            </button>
          </div>
          <div className="di-time">
            <span className="d">{formatFullDay(new Date(item.startAt))}</span>
            <span className="h">{clockLabel(item.startAt)} - {clockLabel(item.endAt)}</span>
          </div>
          <div className="di-row">
            <span className="k">日历</span>
            <span className="v">
              <span className="dot" style={{ background: LEGACY_COLOR_HEX[legacyColor(item.source)] }} />
              {item.source}
            </span>
          </div>
          <div className="di-row">
            <span className="k">提醒</span>
            <span className="v">开始前 15 分钟</span>
          </div>
          {item.location && <div className="di-loc">{item.location}</div>}
          {item.notes && (
            <div className="di-note">
              <div className="k">备注</div>
              <div className="v">{item.notes}</div>
            </div>
          )}
          <div className="di-map">
            <div className="pin">{item.location || '未设置地点'}</div>
            <div className="mlabel">地点</div>
          </div>
          <button type="button" className="di-delete" disabled={removing} onClick={removeItem}>
            删除日程
          </button>
        </div>
      ) : (
        <div className="empty-side">选择一个日程</div>
      )}
    </aside>
  );
}

function LegacyYearView({
  cursor,
  today,
  onMonthClick
}: {
  cursor: Date;
  today: Date;
  onMonthClick: (date: Date) => void;
}) {
  const baseYear = cursor.getFullYear();
  return (
    <div className="view show" id="view-year">
      <div className="year-scroll scroll">
        {[baseYear - 1, baseYear, baseYear + 1].map((year) => (
          <div className="year-block" key={year}>
            <div className="year-head">
              <div className={cls('yh', year === today.getFullYear() && 'cur')}>{year}年</div>
              <div className="ylun">农历</div>
            </div>
            <div className="year-months">
              {Array.from({ length: 12 }, (_, month) => (
                <LegacyMiniMonth year={year} month={month} today={today} key={`${year}-${month}`} onMonthClick={onMonthClick} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LegacyMiniMonth({
  year,
  month,
  today,
  onMonthClick
}: {
  year: number;
  month: number;
  today: Date;
  onMonthClick: (date: Date) => void;
}) {
  const first = new Date(year, month, 1);
  const lead = weekColumn(first);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return (
    <button type="button" className="ym" onClick={() => onMonthClick(first)}>
      <div className={cls('ym-name', year === today.getFullYear() && month === today.getMonth() && 'cur')}>
        <b>{month + 1}</b>月
      </div>
      <div className="ym-wd">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday.replace('周', '')}</span>
        ))}
      </div>
      <div className="ym-grid">
        {Array.from({ length: lead }, (_, index) => (
          <span className="ym-d dim" key={`lead-${index}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const date = new Date(year, month, index + 1);
          const badge = dayBadge(date);
          return (
            <span
              className={cls(
                'ym-d',
                isWeekend(date) && 'we',
                badge?.cls === 'rest' && 'hol',
                HOLIDAYS_2026.fest[ymd(date)] && 'hol',
                isSameDay(date, today) && 'today'
              )}
              key={ymd(date)}
            >
              {index + 1}
            </span>
          );
        })}
      </div>
    </button>
  );
}

function isAllDaySchedule(item: ScheduleItem, date: Date) {
  const dayStart = startOfDay(date).getTime();
  const dayEnd = dayStart + DAY_MS;
  const start = new Date(item.startAt).getTime();
  const end = new Date(item.endAt).getTime();
  return start <= dayStart && end >= dayEnd;
}

function layoutTimedItems(items: ScheduleItem[], date: Date): TimedLayoutItem[] {
  const dayStart = startOfDay(date).getTime();
  const dayEnd = dayStart + DAY_MS;
  const laidOut = items
    .map((item) => ({
      item,
      start: Math.max(new Date(item.startAt).getTime(), dayStart),
      end: Math.min(new Date(item.endAt).getTime(), dayEnd),
      col: 0,
      total: 1
    }))
    .filter((item) => item.end > item.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const colEnds: number[] = [];
  laidOut.forEach((item) => {
    const col = colEnds.findIndex((end) => end <= item.start);
    item.col = col === -1 ? colEnds.length : col;
    colEnds[item.col] = item.end;
  });
  laidOut.forEach((item) => {
    const overlaps = laidOut.filter((other) => other.start < item.end && other.end > item.start);
    item.total = Math.max(1, ...overlaps.map((other) => other.col + 1));
  });
  return laidOut;
}

function formatFullDay(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAY_FULL[date.getDay()]}`;
}

function motionExitDelay() {
  if (document.documentElement.hasAttribute('data-reduce-motion')) return 0;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
  return 200;
}

function PlannerDisclosure({
  title,
  meta,
  open,
  onToggle,
  className,
  children
}: {
  title: string;
  meta: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
}) {
  const contentId = useId();
  return (
    <section className={cls('card', 'planner-disclosure', className, open && 'is-open')}>
      <button
        type="button"
        className="planner-disclosure-head"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={onToggle}
      >
        <span className="planner-disclosure-title">{title}</span>
        <span className="planner-disclosure-meta">{meta}</span>
        <ChevronDown className="planner-disclosure-chevron" aria-hidden="true" />
      </button>
      <div id={contentId} className="planner-disclosure-shell" aria-hidden={!open} inert={!open ? '' : undefined}>
        <div className="planner-disclosure-content">{children}</div>
      </div>
    </section>
  );
}

function TimelineEvent({
  item,
  linkedTask,
  run
}: {
  item: ScheduleItem;
  linkedTask?: Task;
  run: (action: () => Promise<AppSnapshot | void>) => Promise<void>;
}) {
  const [removing, setRemoving] = useState(false);
  const start = new Date(item.startAt);
  const end = new Date(item.endAt);
  const top = (start.getHours() * 60 + start.getMinutes()) * MIN_PX;
  const rawHeight = Math.max(22, ((end.getTime() - start.getTime()) / 60000) * MIN_PX);
  const height = Math.min(rawHeight, 24 * HOUR_PX - top);
  const isPast = end.getTime() < Date.now();

  function removeSchedule() {
    if (removing) return;
    setRemoving(true);
    window.setTimeout(() => void run(() => window.timeMate.deleteSchedule(item.id)), motionExitDelay());
  }

  return (
    <div
      className={cls('event-block', linkedTask?.status === 'done' ? 'done-linked' : isPast && 'past', removing && 'is-removing')}
      style={{ top, height }}
    >
      <div className="event-title">{item.title}</div>
      <div className="event-time">
        {clockLabel(item.startAt)} – {clockLabel(item.endAt)}
      </div>
      <span className="event-remove">
        <IconButton icon={<Trash2 />} label="删除这段安排" danger disabled={removing} onClick={removeSchedule} />
      </span>
    </div>
  );
}

function ClueRow({
  clue,
  run
}: {
  clue: AppSnapshot['externalClues'][number];
  run: (action: () => Promise<AppSnapshot | void>) => Promise<void>;
}) {
  const [removing, setRemoving] = useState(false);

  function updateStatus(status: 'confirmed' | 'ignored') {
    if (removing) return;
    setRemoving(true);
    window.setTimeout(() => void run(() => window.timeMate.setClueStatus(clue.id, status)), motionExitDelay());
  }

  return (
    <div className={cls('list-row', 'clue-row', removing && 'is-removing')}>
      <div className="row-main">
        <span className="row-title">{clue.suggestedTitle}</span>
        <span className="row-sub">
          {clue.source} · {clue.risk} · {clue.rawSummary}
        </span>
      </div>
      <div className="row-actions">
        <Button size="sm" variant="tinted" icon={<Check />} disabled={removing} onClick={() => updateStatus('confirmed')}>
          确认
        </Button>
        <Button size="sm" variant="secondary" icon={<X />} disabled={removing} onClick={() => updateStatus('ignored')}>
          忽略
        </Button>
      </div>
    </div>
  );
}

function TaskGroup({
  label,
  tasks,
  run
}: {
  label: string;
  tasks: Task[];
  run: (action: () => Promise<AppSnapshot | void>) => Promise<void>;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="task-group">
      <div className="task-group-head">
        {label} <span className="count">{tasks.length}</span>
      </div>
      <div className="list">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} run={run} />
        ))}
      </div>
    </div>
  );
}

function TaskRow({ task, run }: { task: Task; run: (action: () => Promise<AppSnapshot | void>) => Promise<void> }) {
  const done = task.status === 'done';
  const [removing, setRemoving] = useState(false);

  function removeTask() {
    if (removing) return;
    setRemoving(true);
    window.setTimeout(() => void run(() => window.timeMate.deleteTask(task.id)), motionExitDelay());
  }

  return (
    <div className={cls('list-row', 'planner-list-row', removing && 'is-removing')}>
      <CheckDot
        checked={done}
        label={done ? `恢复 ${task.title}` : `完成 ${task.title}`}
        onToggle={() => void run(() => window.timeMate.setTaskStatus(task.id, done ? 'open' : 'done'))}
      />
      <div className="row-main">
        <span className={cls('row-title', done && 'done')}>{task.title}</span>
        <span className="row-sub">
          <span>{taskKindLabel(task.kind)}</span>
          {task.dueAt && <span>· {isToday(task.dueAt) ? '今天到期' : `${new Date(task.dueAt).getMonth() + 1}月${new Date(task.dueAt).getDate()}日到期`}</span>}
          {task.source !== 'manual' && <span>· 来自 {task.source}</span>}
        </span>
      </div>
      {task.priority === 'urgent' && !done && (
        <Chip size="sm" tone="critical">
          紧急
        </Chip>
      )}
      <div className="row-actions">
        <IconButton icon={<Trash2 />} label={`删除 ${task.title}`} danger disabled={removing} onClick={removeTask} />
      </div>
    </div>
  );
}
