import { contextBridge, ipcRenderer } from 'electron';
import type {
  ActivityStatus,
  AppInfo,
  AppSnapshot,
  AssistantReply,
  MemoryInput,
  PetPlacementState,
  PetPosition,
  PetSeatAnchorBounds,
  PetSettings,
  PetState,
  ScheduleInput,
  Settings,
  TaskInput,
  TaskStatus,
  VisualMode
} from '../shared/types';

const api = {
  appInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
  openUserData: (): Promise<void> => ipcRenderer.invoke('app:openUserData'),
  showMainWindow: (): Promise<void> => ipcRenderer.invoke('window:showMain'),
  dockWindow: (): Promise<void> => ipcRenderer.invoke('window:dock'),
  showPet: (): Promise<PetSettings> => ipcRenderer.invoke('pet:show'),
  hidePet: (): Promise<PetSettings> => ipcRenderer.invoke('pet:hide'),
  dockPet: (): Promise<PetPosition & { width: number; height: number }> => ipcRenderer.invoke('pet:dock'),
  openPetMenu: (show = true): Promise<{ labels: string[]; clickThrough: boolean; visible: boolean; lockedToTaskbar: boolean }> =>
    ipcRenderer.invoke('pet:contextMenu', show),
  setPetState: (state: PetState): Promise<PetState> => ipcRenderer.invoke('pet:setState', state),
  setPetScale: (scale: number): Promise<PetSettings> => ipcRenderer.invoke('pet:setScale', scale),
  setPetClickThrough: (clickThrough: boolean): Promise<PetSettings> => ipcRenderer.invoke('pet:setClickThrough', clickThrough),
  setPetInteractiveRegion: (interactive: boolean): Promise<void> => ipcRenderer.invoke('pet:setInteractiveRegion', interactive),
  setPetBubbleVisible: (visible: boolean): Promise<void> => ipcRenderer.invoke('pet:setBubbleVisible', visible),
  getPetBounds: (): Promise<(PetPosition & { width: number; height: number }) | undefined> => ipcRenderer.invoke('pet:getBounds'),
  getPetPlacement: (): Promise<PetPlacementState> => ipcRenderer.invoke('pet:getPlacement'),
  movePetTo: (position: PetPosition): Promise<PetPosition & { width: number; height: number }> => ipcRenderer.invoke('pet:moveTo', position),
  savePetPosition: (): Promise<PetSettings> => ipcRenderer.invoke('pet:savePosition'),
  reportPetSeatAnchor: (bounds?: PetSeatAnchorBounds): Promise<PetPlacementState> => ipcRenderer.invoke('pet:reportSeatAnchor', bounds ?? null),
  onPetState: (callback: (state: PetState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: PetState) => callback(state);
    ipcRenderer.on('pet:stateChanged', listener);
    return () => ipcRenderer.removeListener('pet:stateChanged', listener);
  },
  onPetPlacement: (callback: (state: PetPlacementState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: PetPlacementState) => callback(state);
    ipcRenderer.on('pet:placementChanged', listener);
    return () => ipcRenderer.removeListener('pet:placementChanged', listener);
  },
  onPetSeatAnchorRequest: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on('pet:requestSeatAnchor', listener);
    return () => ipcRenderer.removeListener('pet:requestSeatAnchor', listener);
  },
  onPetSettings: (callback: (settings: Settings) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: Settings) => callback(settings);
    ipcRenderer.on('pet:settingsChanged', listener);
    return () => ipcRenderer.removeListener('pet:settingsChanged', listener);
  },
  getSnapshot: (): Promise<AppSnapshot> => ipcRenderer.invoke('data:snapshot'),
  exportText: (): Promise<string> => ipcRenderer.invoke('data:exportText'),
  exportFile: (): Promise<string | undefined> => ipcRenderer.invoke('data:exportFile'),
  importText: (text: string): Promise<AppSnapshot> => ipcRenderer.invoke('data:importText', text),
  startActivity: (input: { title: string; mood?: string }): Promise<AppSnapshot> => ipcRenderer.invoke('activity:start', input),
  endActivity: (status: ActivityStatus): Promise<AppSnapshot> => ipcRenderer.invoke('activity:end', status),
  setActivityStatus: (id: string, status: ActivityStatus): Promise<AppSnapshot> => ipcRenderer.invoke('activity:status', id, status),
  createTask: (input: TaskInput): Promise<AppSnapshot> => ipcRenderer.invoke('task:create', input),
  setTaskStatus: (id: string, status: TaskStatus): Promise<AppSnapshot> => ipcRenderer.invoke('task:status', id, status),
  deleteTask: (id: string): Promise<AppSnapshot> => ipcRenderer.invoke('task:delete', id),
  createSchedule: (input: ScheduleInput): Promise<AppSnapshot> => ipcRenderer.invoke('schedule:create', input),
  deleteSchedule: (id: string): Promise<AppSnapshot> => ipcRenderer.invoke('schedule:delete', id),
  createMemory: (input: MemoryInput): Promise<AppSnapshot> => ipcRenderer.invoke('memory:create', input),
  updateMemory: (id: string, input: Partial<MemoryInput>): Promise<AppSnapshot> => ipcRenderer.invoke('memory:update', id, input),
  deleteMemory: (id: string): Promise<AppSnapshot> => ipcRenderer.invoke('memory:delete', id),
  setClueStatus: (id: string, status: 'draft' | 'confirmed' | 'ignored'): Promise<AppSnapshot> => ipcRenderer.invoke('clue:status', id, status),
  updateSettings: (patch: Partial<Settings>): Promise<AppSnapshot> => ipcRenderer.invoke('settings:update', patch),
  setVisualMode: (visualMode: VisualMode): Promise<AppSnapshot> => ipcRenderer.invoke('settings:visualMode', visualMode),
  setApiKey: (apiKey: string): Promise<AppSnapshot> => ipcRenderer.invoke('secure:setApiKey', apiKey),
  clearApiKey: (): Promise<AppSnapshot> => ipcRenderer.invoke('secure:clearApiKey'),
  sendAssistantMessage: (text: string): Promise<AssistantReply> => ipcRenderer.invoke('assistant:send', text)
};

contextBridge.exposeInMainWorld('timeMate', api);

export type TimeMateApi = typeof api;
