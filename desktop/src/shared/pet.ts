import type { AppSnapshot, PetBusinessState, PetState } from './types';

export const PET_BUSINESS_STATES: readonly PetBusinessState[] = ['idle', 'focus', 'worried', 'happy', 'sleeping', 'asking'];
export const PET_INTERACTION_STATES = ['tap', 'drag'] as const;
export const PET_STATES: readonly PetState[] = [...PET_BUSINESS_STATES, ...PET_INTERACTION_STATES];

export function isPetState(value: unknown): value is PetState {
  return typeof value === 'string' && PET_STATES.includes(value as PetState);
}

export function derivePetState(snapshot: AppSnapshot, now = new Date()): PetBusinessState {
  if (snapshot.settings.reminders.lateSleep && (now.getHours() >= 23 || now.getHours() < 6)) return 'sleeping';
  const current = snapshot.currentActivity;
  if (!current) return 'idle';
  if (current.status === 'resting') return 'sleeping';
  if (current.status === 'paused' || current.status === 'interrupted') return 'worried';
  if (current.category === 'entertainment') {
    const explicitlyStalled = current.status === 'stalled' && current.updatedAt !== current.createdAt;
    if (explicitlyStalled) return 'worried';
    const startedAt = Date.parse(current.startAt);
    const reminderMinutes = snapshot.settings.reminders.fishAfterMinutes;
    const elapsedMinutes = Number.isFinite(startedAt) ? (now.getTime() - startedAt) / 60_000 : 0;
    if (reminderMinutes > 0 && elapsedMinutes >= reminderMinutes) return 'worried';
    return 'asking';
  }
  if (current.status === 'stalled') return 'worried';
  return 'focus';
}
