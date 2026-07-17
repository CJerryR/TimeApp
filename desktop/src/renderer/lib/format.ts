import type { Activity, Memory, MemoryConfidence, MemoryType, Task, TaskKind } from '../../shared/types';

export const MOODS = ['平静', '低落', '烦', '开心', '累', '卡住'];

export const MEMORY_TYPES: MemoryType[] = ['fact', 'goal', 'emotion', 'pattern', 'preference', 'boundary'];
export const CONFIDENCES: MemoryConfidence[] = ['confirmed', 'inferred', 'temporary'];
export const TASK_KINDS: Array<{ value: TaskKind; label: string }> = [
  { value: 'work', label: '工作' },
  { value: 'study', label: '学习' },
  { value: 'life', label: '生活' },
  { value: 'other', label: '其他' }
];

export function taskKindLabel(kind?: TaskKind) {
  return TASK_KINDS.find((item) => item.value === kind)?.label ?? '其他';
}

export function memoryTypeLabel(type: MemoryType) {
  return {
    fact: '事实',
    goal: '目标',
    emotion: '情绪',
    pattern: '模式',
    preference: '偏好',
    boundary: '边界'
  }[type];
}

export function confidenceLabel(confidence: MemoryConfidence) {
  return {
    confirmed: '事实',
    inferred: '推测',
    temporary: '临时'
  }[confidence];
}

export function minutesBetween(start: string, end?: string) {
  const delta = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  return Math.max(0, Math.floor(delta / 60000));
}

export function durationLabel(start?: string, end?: string) {
  if (!start) return '0 分钟';
  const minutes = minutesBetween(start, end);
  if (minutes < 60) return `${minutes} 分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} 小时 ${m} 分钟`;
}

export function timerDigits(startAt: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startAt).getTime()) / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function activityStatusText(activity?: Activity) {
  if (!activity) return '空闲';
  return activity.status === 'stalled' || activity.status === 'interrupted'
    ? '需要轻轻拉回'
    : activity.status === 'paused' || activity.status === 'resting'
      ? '暂停中'
      : '专注中';
}

export function dateTimeLocal(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

export function clockLabel(iso: string) {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isToday(iso?: string) {
  if (!iso) return false;
  return isSameDay(new Date(iso), new Date());
}

export function dayHeading(date: Date) {
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${week}`;
}

export function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 5) return '夜深了。';
  if (hour < 11) return '早上好。';
  if (hour < 14) return '中午好。';
  if (hour < 18) return '下午好。';
  if (hour < 23) return '晚上好。';
  return '夜深了。';
}

/** 面板「要紧的事」:未完成的紧急任务 + 今天到期的任务 */
export function keyTasks(tasks: Task[]) {
  return tasks.filter((task) => task.status === 'open' && (task.priority === 'urgent' || isToday(task.dueAt)));
}

export function doneTodayCount(tasks: Task[]) {
  return tasks.filter((task) => task.status === 'done' && isToday(task.updatedAt)).length;
}

export function memoryTypeAll(): Array<MemoryType | 'all'> {
  return ['all', ...MEMORY_TYPES];
}

export function filterMemories(memories: Memory[], query: string, type: MemoryType | 'all') {
  return memories.filter((memory) => {
    if (type !== 'all' && memory.type !== type) return false;
    if (!query) return true;
    return memory.content.includes(query) || memory.tags.some((tag) => tag.includes(query));
  });
}
