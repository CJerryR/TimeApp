import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, screen, shell, Tray } from 'electron';
import type {
  ActivityStatus,
  AppInfo,
  AppSnapshot,
  MemoryInput,
  PetPlacement,
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
import { derivePetState, isPetState } from '../shared/pet';
import { openTimeMateDatabase, TimeMateDatabase } from './data/database';
import { replyWithCompanion, toCompanionMessage } from './services/assistant';
import { SecureStore } from './services/secure-store';

let mainWindow: BrowserWindow | undefined;
let petWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let database: TimeMateDatabase;
let secureStore: SecureStore;
let quitting = false;
let currentPetState: PetState = 'idle';
let petStateHoldUntil = 0;
let petStateSyncTimer: ReturnType<typeof setInterval> | undefined;
let petLayoutRefreshTimer: ReturnType<typeof setTimeout> | undefined;
let petWindowSeatRetryTimer: ReturnType<typeof setTimeout> | undefined;
let petPlacement: PetPlacement = 'taskbar';
let petSeatAnchor: PetSeatAnchorBounds | undefined;
let freeDragLocked = false;
let windowSeatAutoReturnSuppressed = false;
let petInteractiveRegion = false;
let petBubbleVisible = false;
let petBubbleBaseBounds: PetBounds | undefined;

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const isSmoke = process.env.TIMEMATE_SMOKE === '1';
const smokeResultPath = process.env.TIMEMATE_SMOKE_RESULT;
const smokeScreenshotDir = process.env.TIMEMATE_SMOKE_SCREENSHOT_DIR;
const smokePhase = process.env.TIMEMATE_SMOKE_PHASE === 'persist' ? 'persist' : 'full';
const SMOKE_TASK_TITLE = 'Smoke 本地任务';
const SMOKE_LIFE_TASK_TITLE = 'Smoke 生活任务';
const SMOKE_SCHEDULE_TITLE = 'Smoke 本地日程';
const SMOKE_SCHEDULE_START_AT = '2026-07-05T02:00:00.000Z';
const SMOKE_SCHEDULE_END_AT = '2026-07-05T02:30:00.000Z';
const SMOKE_MEMORY_CONTENT = 'Smoke 本地记忆';
const SMOKE_CHAT_TEXT = '我刚才摸鱼了，帮我收一下';
const PET_MIN_SCALE = 0.7;
const PET_MAX_SCALE = 1.35;
const PET_WINDOW_SIZES = {
  small: { width: 116, height: 144 },
  standard: { width: 168, height: 208 },
  large: { width: 220, height: 276 }
} as const;
const PET_CELEBRATION_HOLD_MS = 2400;
const PET_STATE_SYNC_INTERVAL_MS = 60_000;
const PET_WINDOW_SEAT_BOTTOM_OFFSET = 32;
const PET_EDGE_SAFE_MARGIN = 16;
const PET_EDGE_SNAP_THRESHOLD = 24;
const PET_BUBBLE_EXTRA_HEIGHT = 52;

type PetBounds = PetPosition & { width: number; height: number };

if (isSmoke) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
}

if (process.env.TIMEMATE_USER_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.TIMEMATE_USER_DATA_DIR));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

app.on('second-instance', () => {
  showPrimaryExperience();
});

function trayImage() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="8" fill="#1f2937"/>
    <circle cx="16" cy="16" r="9" fill="#f7d7c4"/>
    <path d="M9 16c2-7 12-8 15 0-3-2-5-2-8-2s-5 0-7 2z" fill="#2f2a3a"/>
    <circle cx="13" cy="17" r="1.2" fill="#1f2937"/>
    <circle cx="19" cy="17" r="1.2" fill="#1f2937"/>
    <path d="M13 22c2 1.4 4 1.4 6 0" stroke="#1f2937" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function petSize(scale: number) {
  const normalized = clamp(scale || 1, PET_MIN_SCALE, PET_MAX_SCALE);
  if (normalized < 0.85) return { ...PET_WINDOW_SIZES.small };
  if (normalized > 1.15) return { ...PET_WINDOW_SIZES.large };
  return { ...PET_WINDOW_SIZES.standard };
}

function normalizedPetBaseBounds(bounds: PetBounds, scale: number): PetBounds {
  const size = petSize(scale);
  return {
    x: bounds.x,
    y: bounds.y + bounds.height - size.height,
    ...size
  };
}

function currentPetBaseBounds(settings = database.getSettings()): PetBounds {
  if (petBubbleVisible && petBubbleBaseBounds) return { ...petBubbleBaseBounds };
  const pet = ensurePetWindow();
  return normalizedPetBaseBounds(pet.getBounds(), settings.pet.scale);
}

function presentedPetBounds(bounds: PetBounds): PetBounds {
  if (!petBubbleVisible) return bounds;
  return {
    ...bounds,
    y: bounds.y - PET_BUBBLE_EXTRA_HEIGHT,
    height: bounds.height + PET_BUBBLE_EXTRA_HEIGHT
  };
}

function setPetBaseBounds(bounds: PetBounds, animate: boolean) {
  const pet = ensurePetWindow();
  petBubbleBaseBounds = petBubbleVisible ? { ...bounds } : undefined;
  pet.setBounds(presentedPetBounds(bounds), animate);
}

function applyPetMousePolicy(settings = database.getSettings()) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const ignoreMouse = settings.pet.clickThrough || !petInteractiveRegion;
  petWindow.setIgnoreMouseEvents(ignoreMouse, { forward: true });
}

function setPetBubbleVisibility(visible: boolean) {
  if (!petWindow || petWindow.isDestroyed() || petBubbleVisible === visible) return;
  const settings = database.getSettings();
  const baseBounds = petBubbleVisible && petBubbleBaseBounds
    ? petBubbleBaseBounds
    : normalizedPetBaseBounds(petWindow.getBounds(), settings.pet.scale);
  petBubbleVisible = visible;
  petBubbleBaseBounds = visible ? { ...baseBounds } : undefined;
  petWindow.setBounds(presentedPetBounds(baseBounds), false);
}

function activeWorkArea() {
  if (petWindow && !petWindow.isDestroyed()) return screen.getDisplayMatching(petWindow.getBounds()).workArea;
  if (mainWindow && !mainWindow.isDestroyed()) return screen.getDisplayMatching(mainWindow.getBounds()).workArea;
  return screen.getPrimaryDisplay().workArea;
}

function petWorkAreaForBounds(bounds: PetBounds) {
  return screen.getDisplayNearestPoint({
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2)
  }).workArea;
}

function dockedPetBounds(scale: number): PetBounds {
  const size = petSize(scale);
  const area = activeWorkArea();
  return {
    width: size.width,
    height: size.height,
    x: area.x + area.width - size.width - 18,
    y: area.y + area.height - size.height - 4
  };
}

function clampedPetBounds(bounds: PetBounds): PetBounds {
  const area = petWorkAreaForBounds(bounds);
  const minX = area.x + PET_EDGE_SAFE_MARGIN;
  const minY = area.y + PET_EDGE_SAFE_MARGIN;
  const maxX = Math.max(minX, area.x + area.width - bounds.width - PET_EDGE_SAFE_MARGIN);
  const maxY = Math.max(minY, area.y + area.height - bounds.height - PET_EDGE_SAFE_MARGIN);
  return {
    ...bounds,
    x: Math.round(clamp(bounds.x, minX, maxX)),
    y: Math.round(clamp(bounds.y, minY, maxY))
  };
}

function snappedPetBounds(bounds: PetBounds, options: { force?: boolean } = {}): PetBounds {
  const next = clampedPetBounds(bounds);
  const area = petWorkAreaForBounds(next);
  const edges = {
    left: area.x + PET_EDGE_SAFE_MARGIN,
    right: area.x + area.width - next.width - PET_EDGE_SAFE_MARGIN,
    bottom: area.y + area.height - next.height - PET_EDGE_SAFE_MARGIN
  };
  const distances = {
    left: Math.abs(next.x - edges.left),
    right: Math.abs(next.x - edges.right),
    bottom: Math.abs(next.y - edges.bottom)
  };

  if (options.force) {
    const edge = (Object.entries(distances) as Array<[keyof typeof distances, number]>)
      .sort((left, right) => left[1] - right[1])[0]?.[0];
    if (edge === 'left' || edge === 'right') next.x = edges[edge];
    if (edge === 'bottom') next.y = edges.bottom;
    return next;
  }

  if (Math.min(distances.left, distances.right) <= PET_EDGE_SNAP_THRESHOLD) {
    next.x = distances.left <= distances.right ? edges.left : edges.right;
  }
  if (distances.bottom <= PET_EDGE_SNAP_THRESHOLD) next.y = edges.bottom;
  return next;
}

function initialPetPlacement(settings: Settings): PetPlacement {
  return settings.pet.lockedToTaskbar ? 'taskbar' : 'free';
}

function isMainWindowSeatReady() {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized());
}

function isUsableSeatAnchor(anchor = petSeatAnchor) {
  return Boolean(anchor && anchor.visible && anchor.width > 0 && anchor.height > 0);
}

function windowSeatPetBounds(scale: number): PetBounds | undefined {
  if (!mainWindow || mainWindow.isDestroyed() || !isUsableSeatAnchor()) return undefined;
  const size = petSize(scale);
  const contentBounds = mainWindow.getContentBounds();
  const anchor = petSeatAnchor!;
  return clampedPetBounds({
    width: size.width,
    height: size.height,
    x: contentBounds.x + anchor.x + anchor.width / 2 - size.width / 2,
    y: contentBounds.y + anchor.y + anchor.height - size.height - PET_WINDOW_SEAT_BOTTOM_OFFSET
  });
}

function initialPetBounds(settings: Settings): PetBounds {
  const size = petSize(settings.pet.scale);
  if (!settings.pet.lockedToTaskbar && settings.pet.position) {
    return snappedPetBounds({ ...settings.pet.position, ...size });
  }
  return dockedPetBounds(settings.pet.scale);
}

function sendPetState(state = currentPetState) {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.webContents.send('pet:stateChanged', state);
}

function setPetState(state: PetState, options: { holdMs?: number } = {}) {
  currentPetState = state;
  petStateHoldUntil = options.holdMs ? Date.now() + options.holdMs : 0;
  sendPetState(state);
}

function celebratePetState() {
  if (derivePetState(database.getSnapshot(), new Date()) === 'sleeping') {
    setPetState('sleeping');
    return;
  }
  setPetState('happy', { holdMs: PET_CELEBRATION_HOLD_MS });
}

function syncPetStateFromSnapshot(now = new Date(), options: { force?: boolean } = {}) {
  if (!database) return currentPetState;
  const nextState = derivePetState(database.getSnapshot(), now);
  if (!options.force && petStateHoldUntil > Date.now() && nextState !== 'sleeping') return currentPetState;
  if (nextState !== currentPetState || petStateHoldUntil) setPetState(nextState);
  return currentPetState;
}

function startPetStateSync() {
  if (petStateSyncTimer) clearInterval(petStateSyncTimer);
  petStateSyncTimer = setInterval(() => {
    if (!quitting) syncPetStateFromSnapshot();
  }, PET_STATE_SYNC_INTERVAL_MS);
  petStateSyncTimer.unref?.();
}

function stopPetStateSync() {
  if (!petStateSyncTimer) return;
  clearInterval(petStateSyncTimer);
  petStateSyncTimer = undefined;
}

function sendPetSettings(settings = database.getSettings()) {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.webContents.send('pet:settingsChanged', settings);
}

function petPlacementInfo(settings = database.getSettings()): PetPlacementState {
  return {
    placement: petPlacement,
    visible: Boolean(settings.pet.enabled && petWindow && !petWindow.isDestroyed() && petWindow.isVisible()),
    lockedToTaskbar: settings.pet.lockedToTaskbar,
    freeDragLocked,
    hasWindowSeatAnchor: isUsableSeatAnchor()
  };
}

function sendPetPlacement(settings = database.getSettings()) {
  const state = petPlacementInfo(settings);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('pet:placementChanged', state);
  if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('pet:placementChanged', state);
}

function setPetPlacement(nextPlacement: PetPlacement, settings = database.getSettings()) {
  const changed = petPlacement !== nextPlacement;
  petPlacement = nextPlacement;
  if (changed) sendPetPlacement(settings);
}

function requestPetSeatAnchorReport() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('pet:requestSeatAnchor');
}

function scheduleWindowSeatReturn(options: { allowFromFree?: boolean } = {}) {
  if (petWindowSeatRetryTimer) clearTimeout(petWindowSeatRetryTimer);
  petWindowSeatRetryTimer = setTimeout(() => {
    petWindowSeatRetryTimer = undefined;
    if (!database || windowSeatAutoReturnSuppressed) return;
    requestPetSeatAnchorReport();
    if (isUsableSeatAnchor()) placePetAtWindowSeat(options);
  }, 260);
  petWindowSeatRetryTimer.unref?.();
}

function requestWindowSeatReturn(options: { allowFromFree?: boolean } = {}) {
  requestPetSeatAnchorReport();
  if (!placePetAtWindowSeat(options)) scheduleWindowSeatReturn(options);
}

function normalizePetSeatAnchor(input: unknown): PetSeatAnchorBounds | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const value = input as Partial<PetSeatAnchorBounds>;
  const numbers = [value.x, value.y, value.width, value.height];
  if (!numbers.every((item) => typeof item === 'number' && Number.isFinite(item))) return undefined;
  return {
    x: Math.round(value.x!),
    y: Math.round(value.y!),
    width: Math.round(value.width!),
    height: Math.round(value.height!),
    visible: Boolean(value.visible) && value.width! > 0 && value.height! > 0
  };
}

function placePetAtWindowSeat(options: { allowFromFree?: boolean } = {}) {
  if (!database || !isMainWindowSeatReady() || !isUsableSeatAnchor()) return false;
  const settings = database.getSettings();
  if (!settings.pet.enabled || windowSeatAutoReturnSuppressed) return false;
  if (petPlacement === 'free' && (!options.allowFromFree || freeDragLocked)) return false;

  const bounds = windowSeatPetBounds(settings.pet.scale);
  if (!bounds) return false;

  const pet = ensurePetWindow();
  applyPetMousePolicy(settings);
  setPetBaseBounds(bounds, true);
  pet.showInactive();
  pet.setAlwaysOnTop(settings.pet.alwaysOnTop, process.platform === 'win32' ? 'screen-saver' : 'floating');
  if (settings.pet.alwaysOnTop) pet.moveTop();
  setPetPlacement('window-seat', settings);
  rebuildTrayMenu();
  return true;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  mainWindow?.show();
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.focus();
  windowSeatAutoReturnSuppressed = false;
  requestWindowSeatReturn({ allowFromFree: !freeDragLocked });
}

/* ---- Win32 自定义标题栏(Q12/Q13 授权的 chrome 变更):
   titleBarStyle hidden + 原生 Window Controls Overlay,
   颜色随外观模式切换;非 win32 平台保持原生窗框,行为不变。 ---- */
const TITLEBAR_OVERLAY_LIGHT = { color: '#00000000', symbolColor: '#625860', height: 44 };
const TITLEBAR_OVERLAY_DARK = { color: '#00000000', symbolColor: '#c8bec4', height: 44 };
let nativeThemeHooked = false;

function resolveDarkChrome(settings: Settings): boolean {
  const scheme = settings.appearance?.colorScheme ?? 'auto';
  if (scheme === 'dark') return true;
  if (scheme === 'light') return false;
  return nativeTheme.shouldUseDarkColors;
}

function titleBarOverlayOptions(settings: Settings) {
  return resolveDarkChrome(settings) ? TITLEBAR_OVERLAY_DARK : TITLEBAR_OVERLAY_LIGHT;
}

function applyTitleBarOverlay(settings: Settings) {
  if (process.platform !== 'win32') return;
  try {
    mainWindow?.setTitleBarOverlay(titleBarOverlayOptions(settings));
  } catch {
    // 旧版 Windows 不支持 overlay 更新:静默忽略,保持初始配色。
  }
}

function createMainWindow() {
  if (!nativeThemeHooked) {
    nativeThemeHooked = true;
    nativeTheme.on('updated', () => {
      try {
        if (database) applyTitleBarOverlay(database.getSettings());
      } catch {
        // 主题联动失败不影响主流程。
      }
    });
  }
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: process.env.TIMEMATE_SMOKE_VIEWPORT === '1' ? 420 : 920,
    minHeight: process.env.TIMEMATE_SMOKE_VIEWPORT === '1' ? 420 : 640,
    title: 'TimeMate',
    backgroundColor: '#f7f3f5',
    show: false,
    ...(process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: titleBarOverlayOptions(database.getSettings())
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    requestWindowSeatReturn({ allowFromFree: !freeDragLocked });
  });

  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      dockPet({ source: 'system' });
      mainWindow?.hide();
    }
  });
  mainWindow.on('hide', () => {
    if (!quitting) dockPet({ source: 'system' });
  });
  mainWindow.on('minimize', () => {
    if (!quitting) dockPet({ source: 'system' });
  });
  mainWindow.on('restore', () => {
    windowSeatAutoReturnSuppressed = false;
    requestWindowSeatReturn({ allowFromFree: !freeDragLocked });
  });
  mainWindow.on('show', () => {
    windowSeatAutoReturnSuppressed = false;
    requestWindowSeatReturn({ allowFromFree: !freeDragLocked });
  });
  mainWindow.on('focus', () => {
    windowSeatAutoReturnSuppressed = false;
    requestWindowSeatReturn({ allowFromFree: !freeDragLocked });
  });
  mainWindow.on('move', () => {
    if (petPlacement === 'window-seat') schedulePetPlacementRefresh();
  });
  mainWindow.on('resize', () => {
    if (petPlacement === 'window-seat') schedulePetPlacementRefresh();
    requestPetSeatAnchorReport();
  });
  mainWindow.on('closed', () => {
    mainWindow = undefined;
    petSeatAnchor = undefined;
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!);
    if (!isSmoke) mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function onceLoaded(window: BrowserWindow): Promise<void> {
  if (!window.webContents.isLoading()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.webContents.removeListener('did-finish-load', onLoad);
      window.webContents.removeListener('did-fail-load', onFail);
    };
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onFail = (_event: unknown, errorCode: number, errorDescription: string) => {
      cleanup();
      reject(new Error(`Window failed to load: ${errorCode} ${errorDescription}`));
    };
    window.webContents.once('did-finish-load', onLoad);
    window.webContents.once('did-fail-load', onFail);
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function failedSmokeChecks(checks: Record<string, unknown>) {
  return Object.entries(checks).filter(([, value]) => {
    if (typeof value === 'boolean') return !value;
    if (value && typeof value === 'object' && 'hasShell' in value) {
      const renderer = value as { hasShell: boolean; hasImage?: boolean; imageComplete?: boolean };
      return !renderer.hasShell || renderer.hasImage === false || renderer.imageComplete === false;
    }
    if (value && typeof value === 'object' && 'hasModelMeta' in value) {
      const model = value as { hasModelMeta: boolean; hasCurrentMotion: boolean; supportsStateClasses: boolean };
      return !model.hasModelMeta || !model.hasCurrentMotion || !model.supportsStateClasses;
    }
    return false;
  });
}

async function captureSmokeScreenshots(label: string) {
  if (!smokeScreenshotDir || !mainWindow || !petWindow) return undefined;
  fs.mkdirSync(smokeScreenshotDir, { recursive: true });
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  await mainWindow.webContents.executeJavaScript(`
    (async () => {
      const homeButton = document.querySelector('button[title="当前"]')
        ?? [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('当前'));
      homeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await new Promise((resolve) => setTimeout(resolve, 220));
      return true;
    })()
  `);
  const mainPath = path.join(smokeScreenshotDir, `main-window-${label}.png`);
  const petPath = path.join(smokeScreenshotDir, `pet-window-${label}.png`);
  const mainImage = await mainWindow.webContents.capturePage();
  fs.writeFileSync(mainPath, mainImage.toPNG());
  if (petWindow.isVisible()) {
    const petImage = await petWindow.webContents.capturePage();
    fs.writeFileSync(petPath, petImage.toPNG());
  }
  return {
    main: mainPath,
    pet: petWindow.isVisible() ? petPath : undefined
  };
}

async function showPlannerForSmoke() {
  if (!mainWindow) return;
  await mainWindow.webContents.executeJavaScript(`
    (async () => {
      const plannerButton = await new Promise((resolve) => {
        let tries = 0;
        const findButton = () => document.querySelector('button[title="规划"]')
          ?? [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('规划'));
        const tick = () => {
          const button = findButton();
          if (button || tries++ > 80) resolve(button);
          else setTimeout(tick, 50);
        };
        tick();
      });
      plannerButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await new Promise((resolve) => setTimeout(resolve, 260));
      document.querySelector('.workspace')?.scrollTo(0, 0);
      return true;
    })()
  `);
}

async function capturePlannerScreenshots(label: string) {
  if (!smokeScreenshotDir || !mainWindow) return undefined;
  fs.mkdirSync(smokeScreenshotDir, { recursive: true });
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();

  const originalBounds = mainWindow.getBounds();
  const desktopPath = path.join(smokeScreenshotDir, `planner-desktop-${label}.png`);
  const mobilePath = path.join(smokeScreenshotDir, `planner-mobile-${label}.png`);

  mainWindow.setBounds({ ...originalBounds, width: 1180, height: 780 }, false);
  await showPlannerForSmoke();
  const desktopImage = await mainWindow.webContents.capturePage();
  fs.writeFileSync(desktopPath, desktopImage.toPNG());

  mainWindow.setBounds({ ...originalBounds, width: 420, height: 900 }, false);
  await showPlannerForSmoke();
  const mobileImage = await mainWindow.webContents.capturePage();
  fs.writeFileSync(mobilePath, mobileImage.toPNG());

  mainWindow.setBounds(originalBounds, false);
  return { desktop: desktopPath, mobile: mobilePath };
}

async function runSmokeCheck() {
  const checks: Record<string, unknown> = {};
  const finish = (ok: boolean, error?: unknown) => {
    const result = {
      ok,
      checks,
      error: error instanceof Error ? error.message : error ? String(error) : undefined
    };
    const text = JSON.stringify(result, null, 2);
    if (smokeResultPath) fs.writeFileSync(smokeResultPath, text, 'utf8');
    console.log(`TIMEMATE_SMOKE_RESULT ${text}`);
    quitting = true;
    stopPetStateSync();
    stopDisplayPlacementSync();
    app.exit(ok ? 0 : 1);
  };

  try {
    if (!mainWindow || !petWindow) throw new Error('Expected mainWindow and petWindow to exist.');
    await Promise.all([onceLoaded(mainWindow), onceLoaded(petWindow)]);
    checks.phase = smokePhase;

    if (smokePhase === 'persist') {
      const persisted = await mainWindow.webContents.executeJavaScript(`
        (async () => {
          const taskTitle = ${JSON.stringify(SMOKE_TASK_TITLE)};
          const lifeTaskTitle = ${JSON.stringify(SMOKE_LIFE_TASK_TITLE)};
          const scheduleTitle = ${JSON.stringify(SMOKE_SCHEDULE_TITLE)};
          const scheduleStart = ${JSON.stringify(SMOKE_SCHEDULE_START_AT)};
          const scheduleEnd = ${JSON.stringify(SMOKE_SCHEDULE_END_AT)};
          const memoryContent = ${JSON.stringify(SMOKE_MEMORY_CONTENT)};
          const chatText = ${JSON.stringify(SMOKE_CHAT_TEXT)};
          const snapshot = await window.timeMate.getSnapshot();
          return {
            hasTask: snapshot.tasks.some((task) => task.title === taskTitle && task.priority === 'urgent'),
            hasLifeTaskKind: snapshot.tasks.some((task) => task.title === lifeTaskTitle && task.kind === 'life'),
            hasSchedule: snapshot.schedules.some((item) => item.title === scheduleTitle && item.startAt === scheduleStart && item.endAt === scheduleEnd),
            hasMemory: snapshot.memories.some((memory) => memory.content === memoryContent && memory.tags.includes('smoke')),
            hasUserMessage: snapshot.messages.some((message) => message.role === 'user' && message.content === chatText),
            hasCompanionMessage: snapshot.messages.some((message) => message.role === 'companion' && message.content.length > 0),
            settingsPersisted: snapshot.settings.privateMode === false && snapshot.settings.reducedMotion === true,
            petSettingsPersisted: snapshot.settings.pet.enabled === true
              && snapshot.settings.pet.alwaysOnTop === true
              && snapshot.settings.pet.lockedToTaskbar === true
              && snapshot.settings.pet.scale === 1,
            hasAiAudit: snapshot.aiAudit.some((entry) => entry.providerId === 'local-fallback')
          };
        })()
      `) as {
        hasTask: boolean;
        hasLifeTaskKind: boolean;
        hasSchedule: boolean;
        hasMemory: boolean;
        hasUserMessage: boolean;
        hasCompanionMessage: boolean;
        settingsPersisted: boolean;
        petSettingsPersisted: boolean;
        hasAiAudit: boolean;
      };
      checks.persistTask = persisted.hasTask;
      checks.persistTaskKind = persisted.hasLifeTaskKind;
      checks.persistSchedule = persisted.hasSchedule;
      checks.persistMemory = persisted.hasMemory;
      checks.persistChatUserMessage = persisted.hasUserMessage;
      checks.persistChatCompanionMessage = persisted.hasCompanionMessage;
      checks.persistSettings = persisted.settingsPersisted;
      checks.persistPetSettings = persisted.petSettingsPersisted;
      checks.persistAiAudit = persisted.hasAiAudit;

      const failed = failedSmokeChecks(checks);
      if (failed.length) throw new Error(`Persistence smoke checks failed: ${failed.map(([key]) => key).join(', ')}`);
      finish(true);
      return;
    }

    const petHasStateClass = async (state: PetState) => {
      await delay(80);
      return petWindow?.webContents.executeJavaScript(`
        Boolean(document.querySelector('.pet-shell')?.classList.contains('state-${state}'))
      `);
    };

    requestPetSeatAnchorReport();
    await delay(300);
    placePetAtWindowSeat({ allowFromFree: true });
    await delay(80);

    const petBounds = petWindow.getBounds();
    const petArea = screen.getDisplayMatching(petBounds).workArea;
    const dockTolerance = 6;
    const expectedWindowSeat = windowSeatPetBounds(database.getSettings().pet.scale);

    checks.mainRenderer = await mainWindow.webContents.executeJavaScript(`
      (() => ({
        hasShell: Boolean(document.querySelector('.app-shell') || document.querySelector('.boot')),
        hasRoot: Boolean(document.querySelector('#root')),
        title: document.title
      }))()
    `);

    const petRenderer = await petWindow.webContents.executeJavaScript(`
      (async () => {
        const shell = document.querySelector('.pet-shell');
        const hitRegions = Array.from(document.querySelectorAll('.pet-hit-region'));
        const hitRegion = hitRegions[0];
        const sprites = Array.from(document.querySelectorAll('img[data-pixel-sprite]'));
        const image = sprites[0];
        if (image && (!image.complete || image.naturalWidth === 0)) {
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, 6000);
            image.addEventListener('load', () => {
              clearTimeout(timer);
              resolve();
            }, { once: true });
            image.addEventListener('error', () => {
              clearTimeout(timer);
              resolve();
            }, { once: true });
          });
        }
        const normalize = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const forbiddenNodeSignatures = [
          ['pet', 'layered', '2d'].join(''),
          ['layered', '2d'].join(''),
          ['live', '2d'].join(''),
          ['cu', 'bism'].join(''),
          ['m', 'oc', '3'].join(''),
          ['model', '3'].join('')
        ];
        const forbiddenResourceSignatures = [
          ...forbiddenNodeSignatures,
          ['companions', 'ruohan', 'default'].join(''),
          ['companions', 'ruohan', 'layered'].join(''),
          ['companions', 'ruohan', 'home', 'soft'].join(''),
          ['companions', 'ruohan', 'focus', 'clean'].join('')
        ];
        const legacyNodes = Array.from(document.querySelectorAll('*')).filter((node) => {
          const signature = normalize([
            node.tagName,
            node.id,
            node.getAttribute('class'),
            node.getAttribute('src'),
            node.getAttribute('data-model-kind'),
            node.getAttribute('data-source-model-kind'),
            node.getAttribute('data-render-engine')
          ].join(' '));
          return forbiddenNodeSignatures.some((token) => signature.includes(token));
        });
        const resourceUrls = performance.getEntriesByType('resource').map((entry) => entry.name);
        const resourceViolations = resourceUrls.filter((url) => {
          const signature = normalize(url);
          return forbiddenResourceSignatures.some((token) => signature.includes(token));
        });
        const imageRendering = image ? getComputedStyle(image).imageRendering : '';
        const imageRect = image?.getBoundingClientRect();
        const shellPointerEvents = shell ? getComputedStyle(shell).pointerEvents : '';
        const hitRegionStyle = hitRegion ? getComputedStyle(hitRegion) : undefined;
        const hitRegionRect = hitRegion?.getBoundingClientRect();
        const hitTargetAt = (x, y) => document.elementFromPoint(x, y)?.closest('.pet-hit-region') === hitRegion;
        const centerHit = Boolean(hitRegionRect && hitTargetAt(
          hitRegionRect.left + hitRegionRect.width / 2,
          hitRegionRect.top + hitRegionRect.height / 2
        ));
        const cornerHits = hitRegionRect ? [
          ['top-left', hitRegionRect.left + 1, hitRegionRect.top + 1],
          ['top-right', hitRegionRect.right - 1, hitRegionRect.top + 1],
          ['bottom-left', hitRegionRect.left + 1, hitRegionRect.bottom - 1],
          ['bottom-right', hitRegionRect.right - 1, hitRegionRect.bottom - 1]
        ].map(([name, x, y]) => ({ name, hit: hitTargetAt(x, y) })) : [];
        return {
          hasShell: Boolean(shell),
          hitRegionCount: hitRegions.length,
          shellPointerEvents,
          hitRegionPointerEvents: hitRegionStyle?.pointerEvents ?? '',
          hitRegionClipPath: hitRegionStyle?.clipPath ?? '',
          hitRegionCenterHit: centerHit,
          hitRegionExcludedCornerCount: cornerHits.filter((point) => !point.hit).length,
          hitRegionCornerHits: cornerHits,
          hasImage: sprites.length === 1,
          imageComplete: Boolean(image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0),
          spriteCount: sprites.length,
          naturalWidth: image?.naturalWidth ?? 0,
          naturalHeight: image?.naturalHeight ?? 0,
          imageRendering,
          imageWithinViewport: Boolean(imageRect
            && imageRect.left >= 0
            && imageRect.top >= 0
            && imageRect.right <= window.innerWidth
            && imageRect.bottom <= window.innerHeight),
          imageRect: imageRect ? {
            left: imageRect.left,
            top: imageRect.top,
            right: imageRect.right,
            bottom: imageRect.bottom,
            width: imageRect.width,
            height: imageRect.height
          } : undefined,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          modelId: shell?.getAttribute('data-model-id'),
          modelKind: shell?.getAttribute('data-model-kind'),
          renderEngine: shell?.getAttribute('data-render-engine'),
          placement: shell?.getAttribute('data-placement'),
          state: shell?.getAttribute('data-state'),
          frameKey: shell?.getAttribute('data-frame-key'),
          imageState: image?.getAttribute('data-state'),
          imagePlacement: image?.getAttribute('data-placement'),
          imageFrameKey: image?.getAttribute('data-frame-key'),
          supportedStates: shell?.getAttribute('data-supported-states'),
          supportedPlacements: shell?.getAttribute('data-supported-placements'),
          canvasCount: document.querySelectorAll('canvas').length,
          legacyNodeCount: legacyNodes.length,
          legacyNodes: legacyNodes.map((node) => ({
            tag: node.tagName,
            id: node.id,
            className: node.getAttribute('class'),
            modelKind: node.getAttribute('data-model-kind'),
            renderEngine: node.getAttribute('data-render-engine')
          })),
          resourceViolationCount: resourceViolations.length,
          resourceViolations,
          bodyBackground: getComputedStyle(document.body).backgroundColor,
          htmlBackground: getComputedStyle(document.documentElement).backgroundColor
        };
      })()
    `) as {
      hasShell: boolean;
      hitRegionCount: number;
      shellPointerEvents: string;
      hitRegionPointerEvents: string;
      hitRegionClipPath: string;
      hitRegionCenterHit: boolean;
      hitRegionExcludedCornerCount: number;
      hitRegionCornerHits: Array<{ name: string; hit: boolean }>;
      hasImage: boolean;
      imageComplete: boolean;
      spriteCount: number;
      naturalWidth: number;
      naturalHeight: number;
      imageRendering: string;
      imageWithinViewport: boolean;
      imageRect?: { left: number; top: number; right: number; bottom: number; width: number; height: number };
      viewport: { width: number; height: number };
      modelId?: string;
      modelKind?: string;
      renderEngine?: string;
      placement?: string;
      state?: string;
      frameKey?: string;
      imageState?: string;
      imagePlacement?: string;
      imageFrameKey?: string;
      supportedStates?: string;
      supportedPlacements?: string;
      canvasCount: number;
      legacyNodeCount: number;
      legacyNodes: Array<Record<string, string | null>>;
      resourceViolationCount: number;
      resourceViolations: string[];
      bodyBackground: string;
      htmlBackground: string;
    };
    checks.petRenderer = petRenderer;
    checks.petHitRegionContract =
      petRenderer.hitRegionCount === 1 &&
      petRenderer.shellPointerEvents === 'none' &&
      petRenderer.hitRegionPointerEvents === 'auto' &&
      petRenderer.hitRegionClipPath !== '' &&
      petRenderer.hitRegionClipPath !== 'none' &&
      petRenderer.hitRegionCenterHit &&
      petRenderer.hitRegionExcludedCornerCount >= 1;
    checks.petHitRegionContractDetails = {
      count: petRenderer.hitRegionCount,
      shellPointerEvents: petRenderer.shellPointerEvents,
      hitRegionPointerEvents: petRenderer.hitRegionPointerEvents,
      clipPath: petRenderer.hitRegionClipPath,
      centerHit: petRenderer.hitRegionCenterHit,
      excludedCornerCount: petRenderer.hitRegionExcludedCornerCount,
      cornerHits: petRenderer.hitRegionCornerHits
    };
    checks.petPixelSpriteContract =
      petRenderer.modelId === 'ruohan-pixel-v1' &&
      petRenderer.modelKind === 'pixel-sprite' &&
      petRenderer.renderEngine === 'pixel-sprite' &&
      petRenderer.spriteCount === 1 &&
      petRenderer.imageComplete &&
      petRenderer.naturalWidth === 48 &&
      petRenderer.naturalHeight === 64 &&
      ['pixelated', 'crisp-edges'].includes(petRenderer.imageRendering) &&
      petRenderer.imageWithinViewport &&
      petRenderer.canvasCount === 0 &&
      petRenderer.legacyNodeCount === 0 &&
      petRenderer.resourceViolationCount === 0 &&
      petRenderer.supportedStates === 'idle,focus,happy,worried,asking,sleeping,tap,drag' &&
      petRenderer.supportedPlacements === 'taskbar,window-seat,free' &&
      petRenderer.frameKey === `${petRenderer.placement}:${petRenderer.state}` &&
      petRenderer.imageState === petRenderer.state &&
      petRenderer.imagePlacement === petRenderer.placement &&
      petRenderer.imageFrameKey === petRenderer.frameKey;
    checks.petPixelSpriteContractDetails = petRenderer;

    const petBusinessFrames = await petWindow.webContents.executeJavaScript(`
      (async () => {
        const states = ['idle', 'focus', 'happy', 'worried', 'asking', 'sleeping'];
        const results = [];
        for (const state of states) {
          await window.timeMate.setPetState(state);
          await new Promise((resolve) => setTimeout(resolve, 100));
          const shell = document.querySelector('.pet-shell');
          const image = document.querySelector('img[data-pixel-sprite]');
          const placement = shell?.getAttribute('data-placement');
          const expectedFrameKey = placement + ':' + state;
          results.push({
            state,
            shellState: shell?.getAttribute('data-state'),
            imageState: image?.getAttribute('data-state'),
            frameKey: shell?.getAttribute('data-frame-key'),
            imageFrameKey: image?.getAttribute('data-frame-key'),
            expectedFrameKey,
            hasClass: Boolean(shell?.classList.contains('state-' + state)),
            spriteCount: document.querySelectorAll('img[data-pixel-sprite]').length
          });
        }
        await window.timeMate.setPetState('idle');
        await new Promise((resolve) => setTimeout(resolve, 100));
        return results;
      })()
    `) as Array<{
      state: string;
      shellState?: string;
      imageState?: string;
      frameKey?: string;
      imageFrameKey?: string;
      expectedFrameKey: string;
      hasClass: boolean;
      spriteCount: number;
    }>;
    checks.petBusinessStateFrames = petBusinessFrames.length === 6 && petBusinessFrames.every((item) => (
      item.shellState === item.state &&
      item.imageState === item.state &&
      item.frameKey === item.expectedFrameKey &&
      item.imageFrameKey === item.expectedFrameKey &&
      item.hasClass &&
      item.spriteCount === 1
    ));
    checks.petBusinessStateFramesDetails = petBusinessFrames;

    checks.mainWindowLoaded = !mainWindow.webContents.isLoading();
    checks.petWindowLoaded = !petWindow.webContents.isLoading();
    checks.petWindowVisible = petWindow.isVisible();
    checks.petWindowAlwaysOnTop = petWindow.isAlwaysOnTop();
    checks.petWindowDoesNotStealFocus = !petWindow.isFocusable();
    checks.singleInstanceLock = hasSingleInstanceLock;
    checks.petDisplayPlacementSync =
      screen.listenerCount('display-metrics-changed') > 0 &&
      screen.listenerCount('display-added') > 0 &&
      screen.listenerCount('display-removed') > 0;
    checks.petWindowSeatPlacement = petPlacement === 'window-seat' && Boolean(expectedWindowSeat);
    checks.petWindowSeatNearAnchor =
      Boolean(expectedWindowSeat) &&
      Math.abs(petBounds.x - expectedWindowSeat!.x) <= dockTolerance &&
      Math.abs(petBounds.y - expectedWindowSeat!.y) <= dockTolerance;
    const petWindowSizeDelta = {
      width: petBounds.width - PET_WINDOW_SIZES.standard.width,
      height: petBounds.height - PET_WINDOW_SIZES.standard.height
    };
    checks.petWindowCompactStandard =
      Math.abs(petWindowSizeDelta.width) <= 1 &&
      Math.abs(petWindowSizeDelta.height) <= 1;
    checks.petWindowCompactStandardDetails = {
      bounds: petBounds,
      configured: PET_WINDOW_SIZES.standard,
      delta: petWindowSizeDelta
    };
    checks.homeWindowSeatSingleCharacterDom = await mainWindow.webContents.executeJavaScript(`
      (() => {
        const anchor = document.querySelector('#pet-seat-anchor');
        return anchor?.getAttribute('data-pet-placement') === 'window-seat'
          && anchor?.getAttribute('data-model-id') === 'ruohan-pixel-v1'
          && Boolean(anchor.querySelector('.room-sofa'))
          && !anchor.querySelector('.home-companion-portrait')
          && !anchor.querySelector('img[data-pixel-sprite]');
      })()
    `);
    sendPetPlacement();
    await delay(160);
    const petWindowSeatFrame = await petWindow.webContents.executeJavaScript(`
      (() => {
        const shell = document.querySelector('.pet-shell');
        const image = document.querySelector('img[data-pixel-sprite]');
        return {
          placement: shell?.getAttribute('data-placement'),
          modelKind: shell?.getAttribute('data-model-kind'),
          modelId: shell?.getAttribute('data-model-id'),
          renderEngine: shell?.getAttribute('data-render-engine'),
          state: shell?.getAttribute('data-state'),
          frameKey: shell?.getAttribute('data-frame-key'),
          imageFrameKey: image?.getAttribute('data-frame-key'),
          imagePlacement: image?.getAttribute('data-placement'),
          anchorType: image?.getAttribute('data-anchor-type'),
          anchorX: image?.getAttribute('data-anchor-x'),
          anchorY: image?.getAttribute('data-anchor-y'),
          spriteCount: document.querySelectorAll('img[data-pixel-sprite]').length,
          imageComplete: Boolean(image && image.complete && image.naturalWidth === 48 && image.naturalHeight === 64)
        };
      })()
    `) as {
      placement?: string;
      modelKind?: string;
      modelId?: string;
      renderEngine?: string;
      state?: string;
      frameKey?: string;
      imageFrameKey?: string;
      imagePlacement?: string;
      anchorType?: string;
      anchorX?: string;
      anchorY?: string;
      spriteCount: number;
      imageComplete: boolean;
    };
    checks.petWindowSeatPixelFrame =
      petWindowSeatFrame.placement === 'window-seat' &&
      petWindowSeatFrame.modelKind === 'pixel-sprite' &&
      petWindowSeatFrame.modelId === 'ruohan-pixel-v1' &&
      petWindowSeatFrame.renderEngine === 'pixel-sprite' &&
      petWindowSeatFrame.frameKey === `window-seat:${petWindowSeatFrame.state}` &&
      petWindowSeatFrame.imageFrameKey === petWindowSeatFrame.frameKey &&
      petWindowSeatFrame.imagePlacement === 'window-seat' &&
      petWindowSeatFrame.anchorType === 'seat' &&
      petWindowSeatFrame.anchorX === '24' &&
      petWindowSeatFrame.anchorY === '49' &&
      petWindowSeatFrame.spriteCount === 1 &&
      petWindowSeatFrame.imageComplete;
    checks.petWindowSeatPixelFrameDetails = petWindowSeatFrame;
    setPetBubbleVisibility(false);
    freeDragLocked = false;
    windowSeatAutoReturnSuppressed = false;
    const resetToWindowSeat = placePetAtWindowSeat({ allowFromFree: true });
    await delay(300);
    const mainBeforeMove = mainWindow.getBounds();
    const petBeforeMainMove = petWindow.getBounds();
    mainWindow.setPosition(mainBeforeMove.x + 24, mainBeforeMove.y + 18, false);
    const followDeadline = Date.now() + 1500;
    let expectedAfterMainMove = windowSeatPetBounds(database.getSettings().pet.scale);
    let petAfterMainMove = petWindow.getBounds();
    while (expectedAfterMainMove && Date.now() < followDeadline) {
      const follows =
        Math.abs(petAfterMainMove.x - expectedAfterMainMove.x) <= dockTolerance &&
        Math.abs(petAfterMainMove.y - expectedAfterMainMove.y) <= dockTolerance;
      if (follows) break;
      await delay(50);
      expectedAfterMainMove = windowSeatPetBounds(database.getSettings().pet.scale);
      petAfterMainMove = petWindow.getBounds();
    }
    checks.petFollowsMainWindowMove =
      resetToWindowSeat &&
      petPlacement === 'window-seat' &&
      Boolean(expectedAfterMainMove) &&
      Math.abs(petAfterMainMove.x - expectedAfterMainMove!.x) <= dockTolerance &&
      Math.abs(petAfterMainMove.y - expectedAfterMainMove!.y) <= dockTolerance;
    checks.petFollowsMainWindowMoveDetails = {
      resetToWindowSeat,
      placement: petPlacement,
      freeDragLocked,
      mainBeforeMove,
      mainAfterMove: mainWindow.getBounds(),
      petBeforeMainMove,
      expectedAfterMainMove,
      petAfterMainMove
    };
    mainWindow.setBounds(mainBeforeMove, false);
    await delay(350);
    checks.petStateSyncTimer = Boolean(petStateSyncTimer);

    await mainWindow.webContents.executeJavaScript(`window.timeMate.setPetState('happy')`);
    checks.petStateSet = currentPetState === 'happy';

    await mainWindow.webContents.executeJavaScript(`
      window.timeMate.updateSettings({ reminders: { lateSleep: false } })
    `);
    await mainWindow.webContents.executeJavaScript(`window.timeMate.startActivity({ title: '代码开发', mood: '平静' })`);
    syncPetStateFromSnapshot(new Date('2026-07-05T12:00:00'), { force: true });
    checks.petFocusLinked = currentPetState === 'focus' && (await petHasStateClass('focus'));

    await mainWindow.webContents.executeJavaScript(`window.timeMate.endActivity('done')`);
    checks.petActivityDoneHappy = currentPetState === 'happy' && (await petHasStateClass('happy'));

    await mainWindow.webContents.executeJavaScript(`window.timeMate.startActivity({ title: '摸鱼游戏', mood: '平静' })`);
    syncPetStateFromSnapshot(new Date('2026-07-05T12:00:00'), { force: true });
    checks.petAskingLinked = currentPetState === 'asking' && (await petHasStateClass('asking'));

    await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const snapshot = await window.timeMate.startActivity({ title: '代码工作', mood: '平静' });
        await window.timeMate.setActivityStatus(snapshot.currentActivity.id, 'paused');
      })()
    `);
    syncPetStateFromSnapshot(new Date('2026-07-05T12:00:00'), { force: true });
    checks.petWorriedLinked = currentPetState === 'worried' && (await petHasStateClass('worried'));

    await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const snapshot = await window.timeMate.createTask({ title: '完成桌宠状态验证', priority: 'normal' });
        await window.timeMate.setTaskStatus(snapshot.tasks[0].id, 'done');
      })()
    `);
    checks.petTaskDoneHappy = currentPetState === 'happy' && (await petHasStateClass('happy'));
    database.updateSettings({ reminders: { lateSleep: true } } as Partial<Settings>);
    checks.petSleepingRule = derivePetState(database.getSnapshot(), new Date('2026-07-05T23:30:00')) === 'sleeping';
    syncPetStateFromSnapshot(new Date('2026-07-05T12:00:00'));
    checks.petHappyHoldBeforeExpiry = currentPetState === 'happy' && (await petHasStateClass('happy'));
    petStateHoldUntil = Date.now() - 1;
    syncPetStateFromSnapshot(new Date('2026-07-05T12:00:00'));
    checks.petHappyHoldExpires = currentPetState === 'worried' && (await petHasStateClass('worried'));
    syncPetStateFromSnapshot(new Date('2026-07-05T23:30:00'), { force: true });
    checks.petSleepingAutoSync = currentPetState === 'sleeping' && (await petHasStateClass('sleeping'));

    const petTapReaction = await petWindow.webContents.executeJavaScript(`
      (async () => {
        const shell = document.querySelector('.pet-shell');
        const hitRegions = document.querySelectorAll('.pet-hit-region');
        if (!shell || hitRegions.length !== 1) return { supported: false, hitRegionCount: hitRegions.length };
        const hitRegion = hitRegions[0];
        const hitRect = hitRegion.getBoundingClientRect();
        const clientX = hitRect.left + hitRect.width / 2;
        const clientY = hitRect.top + hitRect.height / 2;
        const beforeBusinessState = shell.getAttribute('data-business-state');
        const startedAt = performance.now();
        hitRegion.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX, clientY }));
        await new Promise((resolve) => setTimeout(resolve, 260));
        const imageDuring = document.querySelector('img[data-pixel-sprite]');
        const during = {
          state: shell.getAttribute('data-state'),
          businessState: shell.getAttribute('data-business-state'),
          frameKey: shell.getAttribute('data-frame-key'),
          imageState: imageDuring?.getAttribute('data-state'),
          imageFrameKey: imageDuring?.getAttribute('data-frame-key'),
          hasBubble: Boolean(document.querySelector('.pet-bubble'))
        };
        await new Promise((resolve) => setTimeout(resolve, 460));
        const imageAfter = document.querySelector('img[data-pixel-sprite]');
        return {
          supported: true,
          hitRegionCount: hitRegions.length,
          beforeBusinessState,
          during,
          after: {
            state: shell.getAttribute('data-state'),
            businessState: shell.getAttribute('data-business-state'),
            frameKey: shell.getAttribute('data-frame-key'),
            imageState: imageAfter?.getAttribute('data-state'),
            imageFrameKey: imageAfter?.getAttribute('data-frame-key')
          },
          elapsedMs: Math.round(performance.now() - startedAt)
        };
      })()
    `) as {
      supported: boolean;
      hitRegionCount?: number;
      beforeBusinessState?: string;
      during?: {
        state?: string;
        businessState?: string;
        frameKey?: string;
        imageState?: string;
        imageFrameKey?: string;
        hasBubble: boolean;
      };
      after?: {
        state?: string;
        businessState?: string;
        frameKey?: string;
        imageState?: string;
        imageFrameKey?: string;
      };
      elapsedMs?: number;
    };
    checks.petClickTip = petTapReaction.during?.hasBubble === true;
    checks.petTapShortReaction =
      petTapReaction.supported &&
      petTapReaction.during?.state === 'tap' &&
      petTapReaction.during.imageState === 'tap' &&
      petTapReaction.during.frameKey?.endsWith(':tap') === true &&
      petTapReaction.during.imageFrameKey === petTapReaction.during.frameKey &&
      petTapReaction.during.businessState === petTapReaction.beforeBusinessState &&
      petTapReaction.after?.state === petTapReaction.beforeBusinessState &&
      petTapReaction.after?.imageState === petTapReaction.beforeBusinessState &&
      petTapReaction.after?.businessState === petTapReaction.beforeBusinessState &&
      petTapReaction.after?.imageFrameKey === petTapReaction.after?.frameKey &&
      (petTapReaction.elapsedMs ?? Infinity) < 1500;
    checks.petTapShortReactionDetails = petTapReaction;

    mainWindow.hide();
    await delay(120);
    const hiddenDocked = petWindow.getBounds();
    const hiddenDockArea = screen.getDisplayMatching(hiddenDocked).workArea;
    checks.petDockedNearTaskbar =
      petPlacement === 'taskbar' &&
      Math.abs(hiddenDocked.x - (hiddenDockArea.x + hiddenDockArea.width - hiddenDocked.width - 18)) <= dockTolerance &&
      Math.abs(hiddenDocked.y - (hiddenDockArea.y + hiddenDockArea.height - hiddenDocked.height - 4)) <= dockTolerance;
    const petTaskbarFrame = await petWindow.webContents.executeJavaScript(`
      (() => {
        const shell = document.querySelector('.pet-shell');
        const image = document.querySelector('img[data-pixel-sprite]');
        return {
          placement: shell?.getAttribute('data-placement'),
          modelId: shell?.getAttribute('data-model-id'),
          modelKind: shell?.getAttribute('data-model-kind'),
          renderEngine: shell?.getAttribute('data-render-engine'),
          frameKey: shell?.getAttribute('data-frame-key'),
          imagePlacement: image?.getAttribute('data-placement'),
          imageFrameKey: image?.getAttribute('data-frame-key'),
          anchorType: image?.getAttribute('data-anchor-type'),
          anchorX: image?.getAttribute('data-anchor-x'),
          anchorY: image?.getAttribute('data-anchor-y'),
          spriteCount: document.querySelectorAll('img[data-pixel-sprite]').length,
          canvasCount: document.querySelectorAll('canvas').length,
          imageComplete: Boolean(image && image.complete && image.naturalWidth === 48 && image.naturalHeight === 64)
        };
      })()
    `) as {
      placement?: string;
      modelId?: string;
      modelKind?: string;
      renderEngine?: string;
      frameKey?: string;
      imagePlacement?: string;
      imageFrameKey?: string;
      anchorType?: string;
      anchorX?: string;
      anchorY?: string;
      spriteCount: number;
      canvasCount: number;
      imageComplete: boolean;
    };
    checks.petTaskbarPixelFrame =
      petTaskbarFrame.placement === 'taskbar' &&
      petTaskbarFrame.modelId === 'ruohan-pixel-v1' &&
      petTaskbarFrame.modelKind === 'pixel-sprite' &&
      petTaskbarFrame.renderEngine === 'pixel-sprite' &&
      petTaskbarFrame.frameKey?.startsWith('taskbar:') === true &&
      petTaskbarFrame.imagePlacement === 'taskbar' &&
      petTaskbarFrame.imageFrameKey === petTaskbarFrame.frameKey &&
      petTaskbarFrame.anchorType === 'baseline' &&
      petTaskbarFrame.anchorX === '24' &&
      petTaskbarFrame.anchorY === '63' &&
      petTaskbarFrame.spriteCount === 1 &&
      petTaskbarFrame.canvasCount === 0 &&
      petTaskbarFrame.imageComplete;
    checks.petTaskbarPixelFrameDetails = petTaskbarFrame;
    await petWindow.webContents.executeJavaScript(`
      (async () => {
        const hitRegions = document.querySelectorAll('.pet-hit-region');
        if (hitRegions.length !== 1) return false;
        const hitRegion = hitRegions[0];
        const hitRect = hitRegion.getBoundingClientRect();
        hitRegion.dispatchEvent(new MouseEvent('dblclick', {
          bubbles: true,
          clientX: hitRect.left + hitRect.width / 2,
          clientY: hitRect.top + hitRect.height / 2
        }));
        await new Promise((resolve) => setTimeout(resolve, 80));
        return true;
      })()
    `);
    checks.petDoubleClickShowsMain = mainWindow.isVisible();

    const beforeDrag = petWindow.getBounds();
    const dragTarget = {
      x: Math.max(petArea.x, beforeDrag.x - 28),
      y: Math.max(petArea.y, beforeDrag.y - 24)
    };
    const petDragReaction = await petWindow.webContents.executeJavaScript(`
      (async () => {
        const shell = document.querySelector('.pet-shell');
        const hitRegions = document.querySelectorAll('.pet-hit-region');
        if (!shell || hitRegions.length !== 1 || typeof PointerEvent === 'undefined') {
          return { supported: false, hitRegionCount: hitRegions.length };
        }
        const hitRegion = hitRegions[0];
        const hitRect = hitRegion.getBoundingClientRect();
        const startClientX = hitRect.left + hitRect.width / 2;
        const startClientY = hitRect.top + hitRect.height / 2;
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const beforeBusinessState = shell.getAttribute('data-business-state');
        const startedAt = performance.now();
        hitRegion.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 7,
          pointerType: 'mouse',
          screenX: 120,
          screenY: 120,
          clientX: startClientX,
          clientY: startClientY
        }));
        await wait(80);
        hitRegion.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 7,
          pointerType: 'mouse',
          screenX: 106,
          screenY: 108,
          clientX: startClientX - 14,
          clientY: startClientY - 12
        }));
        await wait(80);
        hitRegion.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 7,
          pointerType: 'mouse',
          screenX: 92,
          screenY: 96,
          clientX: startClientX - 28,
          clientY: startClientY - 24
        }));
        await wait(100);
        const imageDuring = document.querySelector('img[data-pixel-sprite]');
        const during = {
          state: shell.getAttribute('data-state'),
          businessState: shell.getAttribute('data-business-state'),
          placement: shell.getAttribute('data-placement'),
          frameKey: shell.getAttribute('data-frame-key'),
          imageState: imageDuring?.getAttribute('data-state'),
          imageFrameKey: imageDuring?.getAttribute('data-frame-key'),
          dragging: shell.getAttribute('data-dragging')
        };
        hitRegion.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true,
          pointerId: 7,
          pointerType: 'mouse',
          screenX: 92,
          screenY: 96,
          clientX: startClientX - 28,
          clientY: startClientY - 24
        }));
        const deadline = performance.now() + 1500;
        while (shell.getAttribute('data-state') === 'drag' && performance.now() < deadline) {
          await wait(25);
        }
        const imageAfter = document.querySelector('img[data-pixel-sprite]');
        return {
          supported: true,
          hitRegionCount: hitRegions.length,
          beforeBusinessState,
          during,
          after: {
            state: shell.getAttribute('data-state'),
            businessState: shell.getAttribute('data-business-state'),
            placement: shell.getAttribute('data-placement'),
            frameKey: shell.getAttribute('data-frame-key'),
            imageState: imageAfter?.getAttribute('data-state'),
            imageFrameKey: imageAfter?.getAttribute('data-frame-key'),
            dragging: shell.getAttribute('data-dragging')
          },
          elapsedMs: Math.round(performance.now() - startedAt)
        };
      })()
    `) as {
      supported: boolean;
      hitRegionCount?: number;
      beforeBusinessState?: string;
      during?: {
        state?: string;
        businessState?: string;
        placement?: string;
        frameKey?: string;
        imageState?: string;
        imageFrameKey?: string;
        dragging?: string;
      };
      after?: {
        state?: string;
        businessState?: string;
        placement?: string;
        frameKey?: string;
        imageState?: string;
        imageFrameKey?: string;
        dragging?: string;
      };
      elapsedMs?: number;
    };
    checks.petDragInteraction =
      petDragReaction.supported &&
      petDragReaction.during?.state === 'drag' &&
      petDragReaction.during.imageState === 'drag' &&
      petDragReaction.during.frameKey?.endsWith(':drag') === true &&
      petDragReaction.during.imageFrameKey === petDragReaction.during.frameKey &&
      petDragReaction.during.dragging === 'true';
    checks.petDragShortReaction =
      checks.petDragInteraction === true &&
      petDragReaction.after?.state === petDragReaction.beforeBusinessState &&
      petDragReaction.after?.imageState === petDragReaction.beforeBusinessState &&
      petDragReaction.after?.businessState === petDragReaction.beforeBusinessState &&
      petDragReaction.after?.imageFrameKey === petDragReaction.after?.frameKey &&
      petDragReaction.after?.dragging === 'false' &&
      (petDragReaction.elapsedMs ?? Infinity) < 2000;
    checks.petDragInteractionDetails = petDragReaction;
    await delay(500);
    const afterDrag = petWindow.getBounds();
    const petAfterDrag = database.getSettings().pet;
    checks.petDragMoved =
      (afterDrag.x === dragTarget.x && afterDrag.y === dragTarget.y) ||
      afterDrag.x !== beforeDrag.x ||
      afterDrag.y !== beforeDrag.y;
    checks.petDragSavedPosition =
      petAfterDrag.lockedToTaskbar === false &&
      petAfterDrag.position?.x === afterDrag.x &&
      petAfterDrag.position?.y === afterDrag.y;
    checks.petDragSavedPositionDetails = {
      afterDrag,
      beforeDrag,
      dragTarget,
      petPosition: petAfterDrag.position,
      lockedToTaskbar: petAfterDrag.lockedToTaskbar
    };
    mainWindow.hide();
    await delay(80);
    mainWindow.show();
    mainWindow.focus();
    await delay(220);
    const afterMainFocusWhileFree = petWindow.getBounds();
    checks.petFreeLockSurvivesMainFocus =
      freeDragLocked &&
      petPlacement === 'free' &&
      afterMainFocusWhileFree.x === afterDrag.x &&
      afterMainFocusWhileFree.y === afterDrag.y;

    await mainWindow.webContents.executeJavaScript(`
      (async () => {
        await window.timeMate.movePetTo({
          x: ${petArea.x + PET_EDGE_SAFE_MARGIN + PET_EDGE_SNAP_THRESHOLD - 1},
          y: ${afterDrag.y}
        });
        await window.timeMate.savePetPosition();
      })()
    `);
    const snappedFree = petWindow.getBounds();
    const snappedArea = screen.getDisplayMatching(snappedFree).workArea;
    const snappedSettings = database.getSettings().pet;
    checks.petFreeEdgeSnap =
      snappedFree.x === snappedArea.x + PET_EDGE_SAFE_MARGIN &&
      snappedFree.y >= snappedArea.y + PET_EDGE_SAFE_MARGIN &&
      snappedFree.y + snappedFree.height <= snappedArea.y + snappedArea.height - PET_EDGE_SAFE_MARGIN &&
      snappedSettings.position?.x === snappedFree.x &&
      snappedSettings.position?.y === snappedFree.y;
    await delay(120);
    const petFreeFrame = await petWindow.webContents.executeJavaScript(`
      (() => {
        const shell = document.querySelector('.pet-shell');
        const image = document.querySelector('img[data-pixel-sprite]');
        return {
          placement: shell?.getAttribute('data-placement'),
          modelId: shell?.getAttribute('data-model-id'),
          modelKind: shell?.getAttribute('data-model-kind'),
          renderEngine: shell?.getAttribute('data-render-engine'),
          frameKey: shell?.getAttribute('data-frame-key'),
          imagePlacement: image?.getAttribute('data-placement'),
          imageFrameKey: image?.getAttribute('data-frame-key'),
          anchorType: image?.getAttribute('data-anchor-type'),
          anchorX: image?.getAttribute('data-anchor-x'),
          anchorY: image?.getAttribute('data-anchor-y'),
          spriteCount: document.querySelectorAll('img[data-pixel-sprite]').length,
          canvasCount: document.querySelectorAll('canvas').length,
          imageComplete: Boolean(image && image.complete && image.naturalWidth === 48 && image.naturalHeight === 64)
        };
      })()
    `) as {
      placement?: string;
      modelId?: string;
      modelKind?: string;
      renderEngine?: string;
      frameKey?: string;
      imagePlacement?: string;
      imageFrameKey?: string;
      anchorType?: string;
      anchorX?: string;
      anchorY?: string;
      spriteCount: number;
      canvasCount: number;
      imageComplete: boolean;
    };
    checks.petFreePixelFrame =
      petFreeFrame.placement === 'free' &&
      petFreeFrame.modelId === 'ruohan-pixel-v1' &&
      petFreeFrame.modelKind === 'pixel-sprite' &&
      petFreeFrame.renderEngine === 'pixel-sprite' &&
      petFreeFrame.frameKey?.startsWith('free:') === true &&
      petFreeFrame.imagePlacement === 'free' &&
      petFreeFrame.imageFrameKey === petFreeFrame.frameKey &&
      petFreeFrame.anchorType === 'foot' &&
      petFreeFrame.anchorX === '24' &&
      petFreeFrame.anchorY === '63' &&
      petFreeFrame.spriteCount === 1 &&
      petFreeFrame.canvasCount === 0 &&
      petFreeFrame.imageComplete;
    checks.petFreePixelFrameDetails = petFreeFrame;
    checks.petThreePixelPlacements =
      checks.petWindowSeatPixelFrame === true &&
      checks.petTaskbarPixelFrame === true &&
      checks.petFreePixelFrame === true;

    await mainWindow.webContents.executeJavaScript(`window.timeMate.hidePet()`);
    checks.petHide = !petWindow.isVisible();

    await mainWindow.webContents.executeJavaScript(`window.timeMate.showPet()`);
    checks.petShow = petWindow.isVisible();
    checks.petContextMenu = await petWindow.webContents.executeJavaScript(`
      (async () => {
        const menu = await window.timeMate.openPetMenu(false);
        return menu.visible === true
          && menu.clickThrough === false
          && menu.lockedToTaskbar === false
          && ['打开 TimeMate', '回到任务栏', '隐藏小人', '鼠标穿透'].every((label) => menu.labels.includes(label));
      })()
    `);

    await mainWindow.webContents.executeJavaScript(`window.timeMate.setPetScale(1)`);
    checks.petScale = database.getSettings().pet.scale === 1;

    await mainWindow.webContents.executeJavaScript(`window.timeMate.dockPet()`);
    const redocked = petWindow.getBounds();
    checks.petDockAfterIpc =
      Math.abs(redocked.x - (petArea.x + petArea.width - redocked.width - 18)) <= dockTolerance &&
      Math.abs(redocked.y - (petArea.y + petArea.height - redocked.height - 4)) <= dockTolerance &&
      petPlacement === 'taskbar' &&
      !freeDragLocked;
    petWindow.setPosition(petArea.x + 20, petArea.y + 20, false);
    refreshPetPlacementForDisplayChange();
    const afterDisplayRefresh = petWindow.getBounds();
    checks.petDockAfterDisplayRefresh =
      Math.abs(afterDisplayRefresh.x - (petArea.x + petArea.width - afterDisplayRefresh.width - 18)) <= dockTolerance &&
      Math.abs(afterDisplayRefresh.y - (petArea.y + petArea.height - afterDisplayRefresh.height - 4)) <= dockTolerance;

    const dataSmoke = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const taskTitle = ${JSON.stringify(SMOKE_TASK_TITLE)};
        const scheduleTitle = ${JSON.stringify(SMOKE_SCHEDULE_TITLE)};
        const memoryContent = ${JSON.stringify(SMOKE_MEMORY_CONTENT)};
        const chatText = ${JSON.stringify(SMOKE_CHAT_TEXT)};
        const scheduleStart = ${JSON.stringify(SMOKE_SCHEDULE_START_AT)};
        const scheduleEnd = ${JSON.stringify(SMOKE_SCHEDULE_END_AT)};
        const lifeTaskTitle = ${JSON.stringify(SMOKE_LIFE_TASK_TITLE)};

        let snapshot = await window.timeMate.createTask({ title: taskTitle, priority: 'urgent', notes: 'smoke-task' });
        snapshot = await window.timeMate.createTask({ title: lifeTaskTitle, priority: 'normal', kind: 'life', notes: 'smoke-life-task' });
        snapshot = await window.timeMate.createSchedule({ title: scheduleTitle, startAt: scheduleStart, endAt: scheduleEnd, notes: 'smoke-schedule' });
        snapshot = await window.timeMate.createMemory({
          type: 'fact',
          confidence: 'confirmed',
          content: memoryContent,
          tags: ['smoke'],
          neverMention: false
        });
        snapshot = await window.timeMate.updateSettings({ privateMode: false, reducedMotion: true });

        const assistantReply = await window.timeMate.sendAssistantMessage(chatText);

        const exportedText = await window.timeMate.exportText();
        const exported = JSON.parse(exportedText);
        const exportedSnapshot = exported.snapshot;
        const importedSnapshot = await window.timeMate.importText(exportedText);

        const hasTask = importedSnapshot.tasks.some((task) => task.title === taskTitle && task.priority === 'urgent');
        const hasLifeTaskKind = importedSnapshot.tasks.some((task) => task.title === lifeTaskTitle && task.kind === 'life');
        const hasSchedule = importedSnapshot.schedules.some((item) => item.title === scheduleTitle && item.startAt === scheduleStart && item.endAt === scheduleEnd);
        const hasMemory = importedSnapshot.memories.some((memory) => memory.content === memoryContent && memory.tags.includes('smoke'));
        const settingsPersisted = importedSnapshot.settings.privateMode === false && importedSnapshot.settings.reducedMotion === true;
        const hasUserMessage = importedSnapshot.messages.some((message) => message.role === 'user' && message.content === chatText);
        const hasCompanionMessage = importedSnapshot.messages.some((message) => message.role === 'companion' && message.content.length > 0);
        const assistantUsedFallback = assistantReply.audit?.providerId === 'local-fallback';
        const assistantSnapshotHasMessages = assistantReply.snapshot.messages.some((message) => message.role === 'user' && message.content === chatText)
          && assistantReply.snapshot.messages.some((message) => message.id === assistantReply.message.id && message.role === 'companion');
        const exportRoundTripMessage = exportedSnapshot.messages.some((message) => message.role === 'user' && message.content === chatText)
          && exportedSnapshot.messages.some((message) => message.role === 'companion' && message.content.length > 0);

        return {
          hasTask,
          hasSchedule,
          hasMemory,
          settingsPersisted,
          hasUserMessage,
          hasCompanionMessage,
          assistantUsedFallback,
          assistantSnapshotHasMessages,
          exportHasSnapshot: Boolean(exportedSnapshot),
          exportRoundTripTask: exportedSnapshot.tasks.some((task) => task.title === taskTitle),
          exportRoundTripMessage,
          importRoundTripTask: hasTask,
          hasLifeTaskKind
        };
      })()
    `) as {
      hasTask: boolean;
      hasLifeTaskKind: boolean;
      hasSchedule: boolean;
      hasMemory: boolean;
      settingsPersisted: boolean;
      hasUserMessage: boolean;
      hasCompanionMessage: boolean;
      assistantUsedFallback: boolean;
      assistantSnapshotHasMessages: boolean;
      exportHasSnapshot: boolean;
      exportRoundTripTask: boolean;
      exportRoundTripMessage: boolean;
      importRoundTripTask: boolean;
    };
    checks.mainTaskCreate = dataSmoke.hasTask;
    checks.mainScheduleCreate = dataSmoke.hasSchedule;
    checks.mainMemoryCreate = dataSmoke.hasMemory;
    checks.mainSettingsUpdate = dataSmoke.settingsPersisted;
    checks.mainChatUserMessage = dataSmoke.hasUserMessage;
    checks.mainChatCompanionMessage = dataSmoke.hasCompanionMessage;
    checks.mainChatLocalFallback = dataSmoke.assistantUsedFallback;
    checks.mainChatSnapshot = dataSmoke.assistantSnapshotHasMessages;
    checks.mainExportHasSnapshot = dataSmoke.exportHasSnapshot;
    checks.mainExportRoundTrip = dataSmoke.exportRoundTripTask;
    checks.mainExportChatRoundTrip = dataSmoke.exportRoundTripMessage;
    checks.mainImportRoundTrip = dataSmoke.importRoundTripTask;
    checks.mainTaskKindRoundTrip = dataSmoke.hasLifeTaskKind;

    const aiPrivacySnapshot = database.getSnapshot();
    const privateModeReply = await replyWithCompanion(
      '我想聊一下今天的状态',
      aiPrivacySnapshot,
      {
        ...aiPrivacySnapshot.settings,
        privateMode: true
      },
      'smoke-placeholder-private-mode-should-not-call-provider'
    );
    const sensitiveReply = await replyWithCompanion(
      '密码：smoke-secret-123，帮我记一下',
      aiPrivacySnapshot,
      {
        ...aiPrivacySnapshot.settings,
        privateMode: false
      },
      'smoke-placeholder-sensitive-should-not-call-provider'
    );
    checks.aiPrivateModeLocal = privateModeReply.audit.providerId === 'private-mode-local';
    checks.aiSensitiveLocal = sensitiveReply.audit.providerId === 'sensitive-local';
    checks.aiSensitiveRedacted =
      sensitiveReply.audit.redactions.includes('password') &&
      !sensitiveReply.audit.contextSummary.includes('smoke-secret-123');

    checks.mainAiPrivacyStatusVisible = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const settingsButton = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('设置'));
        settingsButton?.click();
        await new Promise((resolve) => setTimeout(resolve, 80));
        return document.body.textContent?.includes('AI 隐私状态')
          && (document.body.textContent?.includes('本地回复模式') || document.body.textContent?.includes('本地 fallback'));
      })()
    `);

    checks.mainChatComposerOnChatTab = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const chatButton = document.querySelector('button[title="对话"]')
          ?? [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('对话'));
        if (!chatButton) return false;
        chatButton.click();
        await new Promise((resolve) => setTimeout(resolve, 260));
        return Boolean(document.querySelector('[data-chat-composer]'));
      })()
    `);

    checks.mainHomeDashboardContract = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const homeButton = document.querySelector('button[title="当前"]')
          ?? [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('当前'));
        if (!homeButton) return false;
        homeButton.click();
        await new Promise((resolve) => setTimeout(resolve, 260));
        return Boolean(document.querySelector('[data-now-card]'))
          && Boolean(document.querySelector('#pet-seat-anchor'))
          && !document.querySelector('[data-chat-composer]');
      })()
    `);

    checks.aiNeverMentionExcluded = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const token = 'SMOKE-NEVERMENTION-9F2A7';
        const created = await window.timeMate.createMemory({
          type: 'boundary',
          confidence: 'confirmed',
          content: '这条秘密只留在本地:' + token,
          tags: ['smoke-never'],
          neverMention: true
        });
        const memory = created.memories.find((item) => item.tags.includes('smoke-never'));
        if (!memory) return false;
        const reply = await window.timeMate.sendAssistantMessage('随便和我说两句,今天有点累。');
        const summary = reply.audit && reply.audit.contextSummary ? String(reply.audit.contextSummary) : '';
        const promptLeak = summary.includes(token);
        const after = await window.timeMate.deleteMemory(memory.id);
        const cleanupOk = !after.memories.some((item) => item.id === memory.id);
        return !promptLeak && cleanupOk;
      })()
    `);

    mainWindow.webContents.reload();
    await onceLoaded(mainWindow);
    const plannerSmoke = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const scheduleTitle = ${JSON.stringify(SMOKE_SCHEDULE_TITLE)};
        const plannerButton = await new Promise((resolve) => {
          let tries = 0;
          const findButton = () => document.querySelector('button[title="规划"]')
            ?? [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('规划'));
          const tick = () => {
            const button = findButton();
            if (button || tries++ > 80) resolve(button);
            else setTimeout(tick, 50);
          };
          tick();
        });
        if (!plannerButton) return { hasButton: false, body: document.body.textContent };
        plannerButton.click();
        await new Promise((resolve) => setTimeout(resolve, 320));
        const panel = document.querySelector('.legacy-calendar-panel');
        const cells = [...document.querySelectorAll('.legacy-calendar-panel .mc')];
        const weekheads = [...document.querySelectorAll('.legacy-calendar-panel .m-weekhead div')].map((node) => node.textContent?.trim());
        const chips = [...document.querySelectorAll('.legacy-calendar-panel .chip')].map((node) => node.textContent || '');
        const selectedCell = document.querySelector('.legacy-calendar-panel .mc.sel');
        const clickView = async (view) => {
          const button = document.querySelector('.legacy-calendar-panel .seg button[data-view="' + view + '"]');
          button?.click();
          await new Promise((resolve) => setTimeout(resolve, 180));
          return Boolean(button);
        };
        const scheduleChip = [...document.querySelectorAll('.legacy-calendar-panel .chip')]
          .find((node) => (node.textContent || '').includes(scheduleTitle));
        scheduleChip?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 220));
        const hasDayView = Boolean(document.querySelector('.legacy-calendar-panel #view-day'));
        const hasDayStrip = Boolean(document.querySelector('.legacy-calendar-panel #view-day .daystrip'));
        const hasDayTimeGrid = Boolean(document.querySelector('.legacy-calendar-panel #view-day .timegrid'));
        const dayEvents = [...document.querySelectorAll('.legacy-calendar-panel #view-day .tev')].map((node) => node.textContent || '');
        const dayEvent = [...document.querySelectorAll('.legacy-calendar-panel #view-day .tev')]
          .find((node) => (node.textContent || '').includes(scheduleTitle));
        dayEvent?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 120));
        const dayInspectorTitle = document.querySelector('.legacy-calendar-panel #day-inspector.open .di-title')?.textContent || '';
        const weekButton = await clickView('week');
        const hasWeekView = Boolean(document.querySelector('.legacy-calendar-panel #view-week'));
        const weekEvents = [...document.querySelectorAll('.legacy-calendar-panel #view-week .tev')].map((node) => node.textContent || '');
        const weekColumns = document.querySelectorAll('.legacy-calendar-panel #view-week .t-col').length;
        const yearButton = await clickView('year');
        const hasYearView = Boolean(document.querySelector('.legacy-calendar-panel #view-year'));
        const yearBlocks = document.querySelectorAll('.legacy-calendar-panel #view-year .year-block').length;
        const miniMonths = document.querySelectorAll('.legacy-calendar-panel #view-year .ym').length;
        const hasYearToday = Boolean(document.querySelector('.legacy-calendar-panel #view-year .ym-d.today'));
        const monthButton = await clickView('month');
        const hasMonthRestored = document.querySelectorAll('.legacy-calendar-panel #view-month .mc').length === 42;
        return {
          hasButton: true,
          hasPanel: Boolean(panel),
          cellCount: cells.length,
          weekheadText: weekheads.join(','),
          hasMonthTitle: Boolean(document.querySelector('.legacy-calendar-toolbar .title h1')?.textContent?.includes('年')),
          hasLunar: Boolean(document.querySelector('.legacy-calendar-panel .mc-lun')),
          hasToday: Boolean(document.querySelector('.legacy-calendar-panel .mc.today .mc-num')),
          hasSelected: Boolean(selectedCell),
          hasScheduleChip: chips.some((text) => text.includes(scheduleTitle)),
          hasVirtualChip: chips.some((text) => text.includes('小暑') || text.includes('大暑') || text.includes('劳动节') || text.includes('端午节') || text.includes('中秋节')),
          hasDayView,
          hasDayStrip,
          hasDayTimeGrid,
          hasDayEvent: dayEvents.some((text) => text.includes(scheduleTitle)),
          hasDayInspector: dayInspectorTitle.includes(scheduleTitle),
          hasWeekButton: weekButton,
          hasWeekView,
          hasWeekColumns: weekColumns === 7,
          hasWeekEvent: weekEvents.some((text) => text.includes(scheduleTitle)),
          hasYearButton: yearButton,
          hasYearView,
          hasYearBlocks: yearBlocks === 3,
          hasMiniMonths: miniMonths === 36,
          hasYearToday,
          hasMonthButton: monthButton,
          hasMonthRestored
        };
      })()
    `) as {
      hasButton?: boolean;
      hasPanel?: boolean;
      cellCount?: number;
      weekheadText?: string;
      hasMonthTitle?: boolean;
      hasLunar?: boolean;
      hasToday?: boolean;
      hasSelected?: boolean;
      hasScheduleChip?: boolean;
      hasVirtualChip?: boolean;
      hasDayView?: boolean;
      hasDayStrip?: boolean;
      hasDayTimeGrid?: boolean;
      hasDayEvent?: boolean;
      hasDayInspector?: boolean;
      hasWeekButton?: boolean;
      hasWeekView?: boolean;
      hasWeekColumns?: boolean;
      hasWeekEvent?: boolean;
      hasYearButton?: boolean;
      hasYearView?: boolean;
      hasYearBlocks?: boolean;
      hasMiniMonths?: boolean;
      hasYearToday?: boolean;
      hasMonthButton?: boolean;
      hasMonthRestored?: boolean;
    };
    checks.mainLegacyCalendarButton = plannerSmoke.hasButton;
    checks.mainLegacyCalendarPanel = plannerSmoke.hasPanel;
    checks.mainLegacyCalendarGrid = plannerSmoke.cellCount === 42;
    checks.mainLegacyCalendarWeekhead = plannerSmoke.weekheadText === '周一,周二,周三,周四,周五,周六,周日';
    checks.mainLegacyCalendarTitle = plannerSmoke.hasMonthTitle;
    checks.mainLegacyCalendarLunar = plannerSmoke.hasLunar;
    checks.mainLegacyCalendarToday = plannerSmoke.hasToday;
    checks.mainLegacyCalendarSelected = plannerSmoke.hasSelected;
    checks.mainLegacyCalendarScheduleChip = plannerSmoke.hasScheduleChip;
    checks.mainLegacyCalendarVirtualChip = plannerSmoke.hasVirtualChip;
    checks.mainLegacyCalendarDayView = plannerSmoke.hasDayView;
    checks.mainLegacyCalendarDayStrip = plannerSmoke.hasDayStrip;
    checks.mainLegacyCalendarDayGrid = plannerSmoke.hasDayTimeGrid;
    checks.mainLegacyCalendarDayEvent = plannerSmoke.hasDayEvent;
    checks.mainLegacyCalendarDayInspector = plannerSmoke.hasDayInspector;
    checks.mainLegacyCalendarWeekButton = plannerSmoke.hasWeekButton;
    checks.mainLegacyCalendarWeekView = plannerSmoke.hasWeekView;
    checks.mainLegacyCalendarWeekColumns = plannerSmoke.hasWeekColumns;
    checks.mainLegacyCalendarWeekEvent = plannerSmoke.hasWeekEvent;
    checks.mainLegacyCalendarYearButton = plannerSmoke.hasYearButton;
    checks.mainLegacyCalendarYearView = plannerSmoke.hasYearView;
    checks.mainLegacyCalendarYearBlocks = plannerSmoke.hasYearBlocks;
    checks.mainLegacyCalendarMiniMonths = plannerSmoke.hasMiniMonths;
    checks.mainLegacyCalendarYearToday = plannerSmoke.hasYearToday;
    checks.mainLegacyCalendarMonthButton = plannerSmoke.hasMonthButton;
    checks.mainLegacyCalendarMonthRestored = plannerSmoke.hasMonthRestored;
    checks.plannerScreenshots = await capturePlannerScreenshots('full');
    checks.visualScreenshots = await captureSmokeScreenshots('full');

    const failed = failedSmokeChecks(checks);
    if (failed.length) throw new Error(`Smoke checks failed: ${failed.map(([key]) => key).join(', ')}`);
    finish(true);
  } catch (error) {
    finish(false, error);
  }
}

function ensurePetWindow(): BrowserWindow {
  if (!petWindow || petWindow.isDestroyed()) createPetWindow();
  if (!petWindow) throw new Error('Pet window could not be created.');
  return petWindow;
}

function createPetWindow() {
  const settings = database.getSettings();
  const bounds = initialPetBounds(settings);
  petWindow = new BrowserWindow({
    ...bounds,
    minWidth: PET_WINDOW_SIZES.small.width,
    minHeight: PET_WINDOW_SIZES.small.height,
    maxWidth: PET_WINDOW_SIZES.large.width,
    maxHeight: PET_WINDOW_SIZES.large.height + PET_BUBBLE_EXTRA_HEIGHT,
    frame: false,
    transparent: !isSmoke,
    hasShadow: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: settings.pet.alwaysOnTop,
    focusable: false,
    show: false,
    backgroundColor: isSmoke ? '#181818' : '#00000000',
    title: 'TimeMate Pet',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  petWindow.on('closed', () => {
    petWindow = undefined;
    petInteractiveRegion = false;
    petBubbleVisible = false;
    petBubbleBaseBounds = undefined;
    sendPetPlacement();
    rebuildTrayMenu();
  });

  petWindow.webContents.once('did-finish-load', () => {
    applyPetWindowSettings(database.getSettings());
    sendPetState();
  });

  if (isDev) {
    petWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL!}/pet.html`);
  } else {
    petWindow.loadFile(path.join(__dirname, '../renderer/pet.html'));
  }
}

function applyPetWindowSettings(settings: Settings) {
  const pet = ensurePetWindow();
  const petSettings = settings.pet;
  const current = currentPetBaseBounds(settings);
  const size = petSize(petSettings.scale);
  const seatBounds = petPlacement === 'window-seat' ? windowSeatPetBounds(petSettings.scale) : undefined;
  const bounds = seatBounds
    ?? (petPlacement === 'taskbar'
      ? dockedPetBounds(petSettings.scale)
      : snappedPetBounds({ x: current.x, y: current.y, ...size }));

  applyPetMousePolicy(settings);
  setPetBaseBounds(bounds, true);

  if (petSettings.enabled) {
    pet.showInactive();
    pet.setAlwaysOnTop(petSettings.alwaysOnTop, process.platform === 'win32' ? 'screen-saver' : 'floating');
    if (petSettings.alwaysOnTop) pet.moveTop();
  } else {
    pet.setAlwaysOnTop(false);
    pet.hide();
  }
  sendPetSettings(settings);
  sendPetPlacement(settings);
  rebuildTrayMenu();
}

function persistFreePetBounds(bounds: PetBounds, options: { forceSnap?: boolean } = {}) {
  const settingsBeforeSave = database.getSettings();
  const next = snappedPetBounds(normalizedPetBaseBounds(bounds, settingsBeforeSave.pet.scale), { force: options.forceSnap });
  setPetBaseBounds(next, true);
  freeDragLocked = true;
  windowSeatAutoReturnSuppressed = true;
  const settings = database.updateSettings({
    pet: {
      lockedToTaskbar: false,
      position: { x: next.x, y: next.y }
    }
  } as Partial<Settings>);
  setPetPlacement('free', settings);
  sendPetSettings(settings);
  sendPetPlacement(settings);
  rebuildTrayMenu();
  return { bounds: next, settings };
}

function snapPetToNearestEdge() {
  const pet = ensurePetWindow();
  return persistFreePetBounds(pet.getBounds(), { forceSnap: true }).bounds;
}

function dockPet(options: { source?: 'user' | 'system' } = { source: 'user' }) {
  const pet = ensurePetWindow();
  if (options.source === 'system' && petPlacement === 'free' && freeDragLocked) {
    windowSeatAutoReturnSuppressed = true;
    applyPetWindowSettings(database.getSettings());
    return pet.getBounds();
  }
  freeDragLocked = false;
  windowSeatAutoReturnSuppressed = options.source === 'user';
  const settings = database.updateSettings({ pet: { enabled: true, lockedToTaskbar: true } } as Partial<Settings>);
  setPetPlacement('taskbar', settings);
  const bounds = dockedPetBounds(settings.pet.scale);
  setPetBaseBounds(bounds, true);
  applyPetWindowSettings(settings);
  return bounds;
}

function showPet() {
  const settings = database.updateSettings({ pet: { enabled: true } } as Partial<Settings>);
  applyPetWindowSettings(settings);
  requestWindowSeatReturn({ allowFromFree: !freeDragLocked });
  return settings.pet;
}

function hidePet() {
  const settings = database.updateSettings({ pet: { enabled: false } } as Partial<Settings>);
  setPetBubbleVisibility(false);
  petWindow?.hide();
  sendPetSettings(settings);
  sendPetPlacement(settings);
  rebuildTrayMenu();
  return settings.pet;
}

function restorePetInteraction() {
  petInteractiveRegion = false;
  const settings = database.updateSettings({ pet: { clickThrough: false } } as Partial<Settings>);
  applyPetWindowSettings(settings);
  return settings.pet;
}

function petContextMenuTemplate(settings = database.getSettings()): Electron.MenuItemConstructorOptions[] {
  return [
    { label: '打开 TimeMate', click: () => showMainWindow() },
    { label: '回到任务栏', click: () => dockPet() },
    { label: '贴到最近边缘', click: () => snapPetToNearestEdge() },
    { label: '隐藏小人', click: () => hidePet() },
    { type: 'separator' },
    {
      label: '鼠标穿透',
      type: 'checkbox',
      checked: settings.pet.clickThrough,
      click: () => {
        const next = database.updateSettings({ pet: { clickThrough: !database.getSettings().pet.clickThrough } } as Partial<Settings>);
        applyPetWindowSettings(next);
      }
    }
  ];
}

function petMenuInfo(settings = database.getSettings()) {
  return {
    labels: petContextMenuTemplate(settings).filter((item) => item.type !== 'separator').map((item) => String(item.label ?? '')),
    clickThrough: settings.pet.clickThrough,
    visible: Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible()),
    lockedToTaskbar: settings.pet.lockedToTaskbar
  };
}

function openPetContextMenu(show = true) {
  const settings = database.getSettings();
  if (show) {
    const pet = ensurePetWindow();
    Menu.buildFromTemplate(petContextMenuTemplate(settings)).popup({ window: pet });
  }
  return petMenuInfo(settings);
}

function refreshPetPlacementForDisplayChange() {
  if (!database || !petWindow || petWindow.isDestroyed()) return;
  const settings = database.getSettings();
  if (petPlacement === 'window-seat') {
    if (placePetAtWindowSeat()) return;
  }
  if (petPlacement === 'taskbar') {
    applyPetWindowSettings(settings);
    return;
  }

  const current = currentPetBaseBounds(settings);
  const next = snappedPetBounds(current);
  if (next.x === current.x && next.y === current.y && next.width === current.width && next.height === current.height) return;
  setPetBaseBounds(next, true);
  const updated = database.updateSettings({
    pet: {
      position: { x: next.x, y: next.y }
    }
  } as Partial<Settings>);
  sendPetSettings(updated);
}

function schedulePetPlacementRefresh() {
  if (petLayoutRefreshTimer) clearTimeout(petLayoutRefreshTimer);
  petLayoutRefreshTimer = setTimeout(() => {
    petLayoutRefreshTimer = undefined;
    refreshPetPlacementForDisplayChange();
  }, 250);
  petLayoutRefreshTimer.unref?.();
}

function stopPetPlacementRefresh() {
  if (!petLayoutRefreshTimer) return;
  clearTimeout(petLayoutRefreshTimer);
  petLayoutRefreshTimer = undefined;
}

function stopWindowSeatReturn() {
  if (!petWindowSeatRetryTimer) return;
  clearTimeout(petWindowSeatRetryTimer);
  petWindowSeatRetryTimer = undefined;
}

function showPrimaryExperience() {
  if (!database) return;
  showMainWindow();
  const settings = database.getSettings();
  if (settings.pet.enabled) {
    applyPetWindowSettings(settings);
  }
}

function startDisplayPlacementSync() {
  screen.on('display-metrics-changed', schedulePetPlacementRefresh);
  screen.on('display-added', schedulePetPlacementRefresh);
  screen.on('display-removed', schedulePetPlacementRefresh);
}

function stopDisplayPlacementSync() {
  screen.off('display-metrics-changed', schedulePetPlacementRefresh);
  screen.off('display-added', schedulePetPlacementRefresh);
  screen.off('display-removed', schedulePetPlacementRefresh);
  stopPetPlacementRefresh();
  stopWindowSeatReturn();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const petVisible = Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible());
  const settings = database.getSettings();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开 TimeMate', click: () => showMainWindow() },
      { label: '显示小人', enabled: !petVisible, click: () => showPet() },
      { label: '隐藏小人', enabled: petVisible, click: () => hidePet() },
      { label: '回到任务栏', click: () => dockPet() },
      { label: '贴到最近边缘', click: () => snapPetToNearestEdge() },
      { label: '恢复桌宠交互', enabled: settings.pet.clickThrough, click: () => restorePetInteraction() },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ])
  );
}

function createTray() {
  tray = new Tray(trayImage());
  tray.setToolTip('TimeMate');
  rebuildTrayMenu();
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else showMainWindow();
  });
}

function dockNearTaskbar() {
  dockPet();
}

function applyStartupSetting(settings: Settings) {
  app.setLoginItemSettings({
    openAtLogin: settings.startup.openAtLogin,
    openAsHidden: true
  });
}

function appInfo(): AppInfo {
  return {
    appName: app.getName(),
    version: app.getVersion(),
    userDataPath: app.getPath('userData'),
    databasePath: database.dbPath,
    secureStoreAvailable: secureStore.isAvailable()
  };
}

function parseImportPayload(text: string): AppSnapshot {
  const parsed = JSON.parse(text) as { snapshot?: AppSnapshot } | AppSnapshot;
  if ('snapshot' in parsed && parsed.snapshot) return parsed.snapshot;
  return parsed as AppSnapshot;
}

function registerIpc() {
  ipcMain.handle('app:info', () => appInfo());
  ipcMain.handle('app:openUserData', async () => {
    await shell.openPath(app.getPath('userData'));
  });
  ipcMain.handle('window:showMain', () => showMainWindow());
  ipcMain.handle('window:dock', () => dockNearTaskbar());

  ipcMain.handle('pet:show', () => showPet());
  ipcMain.handle('pet:hide', () => hidePet());
  ipcMain.handle('pet:dock', () => dockPet());
  ipcMain.handle('pet:contextMenu', (_event, show?: boolean) => openPetContextMenu(show ?? true));
  ipcMain.handle('pet:setState', (_event, state: PetState) => {
    if (!isPetState(state)) throw new Error(`Invalid pet state: ${state}`);
    setPetState(state);
    return currentPetState;
  });
  ipcMain.handle('pet:setScale', (_event, scale: number) => {
    const settings = database.updateSettings({ pet: { scale: clamp(scale, PET_MIN_SCALE, PET_MAX_SCALE) } } as Partial<Settings>);
    applyPetWindowSettings(settings);
    return settings.pet;
  });
  ipcMain.handle('pet:setClickThrough', (_event, clickThrough: boolean) => {
    const settings = database.updateSettings({ pet: { clickThrough } } as Partial<Settings>);
    applyPetWindowSettings(settings);
    return settings.pet;
  });
  ipcMain.handle('pet:setInteractiveRegion', (event, interactive: boolean) => {
    if (!petWindow || event.sender !== petWindow.webContents) return;
    petInteractiveRegion = Boolean(interactive);
    applyPetMousePolicy();
  });
  ipcMain.handle('pet:setBubbleVisible', (event, visible: boolean) => {
    if (!petWindow || event.sender !== petWindow.webContents) return;
    setPetBubbleVisibility(Boolean(visible));
  });
  ipcMain.handle('pet:getBounds', () => petWindow?.getBounds());
  ipcMain.handle('pet:getPlacement', () => petPlacementInfo());
  ipcMain.handle('pet:reportSeatAnchor', (event, bounds: PetSeatAnchorBounds | null) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return petPlacementInfo();
    petSeatAnchor = normalizePetSeatAnchor(bounds);
    if (isUsableSeatAnchor()) {
      if (!placePetAtWindowSeat({ allowFromFree: !freeDragLocked })) {
        scheduleWindowSeatReturn({ allowFromFree: !freeDragLocked });
      }
    } else if (petPlacement === 'window-seat') {
      dockPet({ source: 'system' });
    } else {
      sendPetPlacement();
    }
    return petPlacementInfo();
  });
  ipcMain.handle('pet:moveTo', (_event, position: PetPosition) => {
    ensurePetWindow();
    const settings = database.getSettings();
    const bounds = currentPetBaseBounds(settings);
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return bounds;
    freeDragLocked = true;
    windowSeatAutoReturnSuppressed = true;
    setPetPlacement('free');
    const next = clampedPetBounds({
      x: Math.round(position.x),
      y: Math.round(position.y),
      width: bounds.width,
      height: bounds.height
    });
    setPetBaseBounds(next, false);
    return next;
  });
  ipcMain.handle('pet:savePosition', () => {
    const pet = ensurePetWindow();
    return persistFreePetBounds(pet.getBounds()).settings.pet;
  });

  ipcMain.handle('data:snapshot', () => database.getSnapshot());
  ipcMain.handle('data:exportText', () => database.exportJson());
  ipcMain.handle('data:exportFile', async () => {
    const options = {
      title: '导出 TimeMate JSON',
      defaultPath: `timemate-export-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    };
    const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return undefined;
    fs.writeFileSync(result.filePath, database.exportJson(), 'utf8');
    return result.filePath;
  });
  ipcMain.handle('data:importText', (_event, text: string) => {
    const snapshot = database.importSnapshot(parseImportPayload(text));
    applyPetWindowSettings(snapshot.settings);
    syncPetStateFromSnapshot(new Date(), { force: true });
    return snapshot;
  });

  ipcMain.handle('activity:start', (_event, input: { title: string; mood?: string }) => {
    database.startActivity(input);
    const snapshot = database.getSnapshot();
    setPetState(derivePetState(snapshot));
    return snapshot;
  });
  ipcMain.handle('activity:end', (_event, status: ActivityStatus) => {
    database.endCurrentActivity(status);
    const snapshot = database.getSnapshot();
    if (status === 'done') celebratePetState();
    else setPetState('worried');
    return snapshot;
  });
  ipcMain.handle('activity:status', (_event, id: string, status: ActivityStatus) => {
    database.updateActivityStatus(id, status);
    const snapshot = database.getSnapshot();
    setPetState(derivePetState(snapshot));
    return snapshot;
  });

  ipcMain.handle('task:create', (_event, input: TaskInput) => {
    database.createTask(input);
    return database.getSnapshot();
  });
  ipcMain.handle('task:status', (_event, id: string, status: TaskStatus) => {
    database.updateTaskStatus(id, status);
    const snapshot = database.getSnapshot();
    if (status === 'done') celebratePetState();
    else setPetState(derivePetState(snapshot));
    return snapshot;
  });
  ipcMain.handle('task:delete', (_event, id: string) => {
    database.deleteTask(id);
    return database.getSnapshot();
  });

  ipcMain.handle('schedule:create', (_event, input: ScheduleInput) => {
    database.createSchedule(input);
    return database.getSnapshot();
  });
  ipcMain.handle('schedule:delete', (_event, id: string) => {
    database.deleteSchedule(id);
    return database.getSnapshot();
  });

  ipcMain.handle('memory:create', (_event, input: MemoryInput) => {
    database.createMemory(input);
    return database.getSnapshot();
  });
  ipcMain.handle('memory:update', (_event, id: string, input: Partial<MemoryInput>) => {
    database.updateMemory(id, input);
    return database.getSnapshot();
  });
  ipcMain.handle('memory:delete', (_event, id: string) => {
    database.deleteMemory(id);
    return database.getSnapshot();
  });

  ipcMain.handle('clue:status', (_event, id: string, status: 'draft' | 'confirmed' | 'ignored') => {
    database.updateExternalClueStatus(id, status);
    return database.getSnapshot();
  });

  ipcMain.handle('settings:update', (_event, patch: Partial<Settings>) => {
    const settings = database.updateSettings(patch);
    applyStartupSetting(settings);
    applyPetWindowSettings(settings);
    applyTitleBarOverlay(settings);
    const snapshot = database.getSnapshot();
    syncPetStateFromSnapshot(new Date(), { force: true });
    return snapshot;
  });
  ipcMain.handle('settings:visualMode', (_event, visualMode: VisualMode) => {
    database.updateSettings({ visualMode } as Partial<Settings>);
    return database.getSnapshot();
  });

  ipcMain.handle('secure:setApiKey', (_event, apiKey: string) => {
    secureStore.setApiKey(apiKey);
    database.setAiKeyPresence(Boolean(apiKey.trim()));
    return database.getSnapshot();
  });
  ipcMain.handle('secure:clearApiKey', () => {
    secureStore.clearApiKey();
    database.setAiKeyPresence(false);
    return database.getSnapshot();
  });

  ipcMain.handle('assistant:send', async (_event, text: string) => {
    database.addMessage({ role: 'user', content: text, tone: /废|难受|孤独|烦|崩|不想/.test(text) ? 'emotional' : 'friend' });
    const snapshot = database.getSnapshot();
    const settings = snapshot.settings;
    const apiKey = secureStore.getApiKey();
    const result = await replyWithCompanion(text, snapshot, settings, apiKey);
    const message = database.addMessage(toCompanionMessage(result.content));
    const audit = settings.ai.auditEnabled ? database.addAudit(result.audit) : undefined;
    return { message, audit, snapshot: database.getSnapshot() };
  });
}

app.whenReady().then(async () => {
  database = await openTimeMateDatabase(app.getPath('userData'));
  const initialSettings = database.getSettings();
  petPlacement = initialPetPlacement(initialSettings);
  freeDragLocked = petPlacement === 'free' && Boolean(initialSettings.pet.position);
  windowSeatAutoReturnSuppressed = freeDragLocked;
  secureStore = new SecureStore(app.getPath('userData'));
  applyStartupSetting(initialSettings);
  registerIpc();
  createMainWindow();
  createTray();
  createPetWindow();
  syncPetStateFromSnapshot(new Date(), { force: true });
  startPetStateSync();
  startDisplayPlacementSync();
  if (isSmoke) void runSmokeCheck();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  mainWindow = undefined;
});

app.on('before-quit', () => {
  quitting = true;
  stopPetStateSync();
  stopDisplayPlacementSync();
  database?.close();
});
