import type { PetPlacement, PetState, Settings } from '../shared/types';
import type { PixelSpriteManifest, PixelSpriteModel } from './pixel/pixel-types';
import freeAskingFrame from './assets/companions/ruohan-pixel-v1/frames/free/asking.png';
import freeDragFrame from './assets/companions/ruohan-pixel-v1/frames/free/drag.png';
import freeFocusFrame from './assets/companions/ruohan-pixel-v1/frames/free/focus.png';
import freeHappyFrame from './assets/companions/ruohan-pixel-v1/frames/free/happy.png';
import freeIdleFrame from './assets/companions/ruohan-pixel-v1/frames/free/idle.png';
import freeSleepingFrame from './assets/companions/ruohan-pixel-v1/frames/free/sleeping.png';
import freeTapFrame from './assets/companions/ruohan-pixel-v1/frames/free/tap.png';
import freeWorriedFrame from './assets/companions/ruohan-pixel-v1/frames/free/worried.png';
import taskbarAskingFrame from './assets/companions/ruohan-pixel-v1/frames/taskbar/asking.png';
import taskbarDragFrame from './assets/companions/ruohan-pixel-v1/frames/taskbar/drag.png';
import taskbarFocusFrame from './assets/companions/ruohan-pixel-v1/frames/taskbar/focus.png';
import taskbarHappyFrame from './assets/companions/ruohan-pixel-v1/frames/taskbar/happy.png';
import taskbarIdleFrame from './assets/companions/ruohan-pixel-v1/frames/taskbar/idle.png';
import taskbarSleepingFrame from './assets/companions/ruohan-pixel-v1/frames/taskbar/sleeping.png';
import taskbarTapFrame from './assets/companions/ruohan-pixel-v1/frames/taskbar/tap.png';
import taskbarWorriedFrame from './assets/companions/ruohan-pixel-v1/frames/taskbar/worried.png';
import manifestJson from './assets/companions/ruohan-pixel-v1/manifest.json';
import previewSrc from './assets/companions/ruohan-pixel-v1/preview.png';
import windowSeatAskingFrame from './assets/companions/ruohan-pixel-v1/frames/window-seat/asking.png';
import windowSeatDragFrame from './assets/companions/ruohan-pixel-v1/frames/window-seat/drag.png';
import windowSeatFocusFrame from './assets/companions/ruohan-pixel-v1/frames/window-seat/focus.png';
import windowSeatHappyFrame from './assets/companions/ruohan-pixel-v1/frames/window-seat/happy.png';
import windowSeatIdleFrame from './assets/companions/ruohan-pixel-v1/frames/window-seat/idle.png';
import windowSeatSleepingFrame from './assets/companions/ruohan-pixel-v1/frames/window-seat/sleeping.png';
import windowSeatTapFrame from './assets/companions/ruohan-pixel-v1/frames/window-seat/tap.png';
import windowSeatWorriedFrame from './assets/companions/ruohan-pixel-v1/frames/window-seat/worried.png';

export const DEFAULT_COMPANION_ID = 'ruohan-pixel-v1';

export const PIXEL_STATE_LABELS: Record<Settings['language'], Record<PetState, string>> = {
  zh: {
    idle: '待机',
    focus: '专注中',
    happy: '开心',
    worried: '需要关注',
    asking: '等你确认',
    sleeping: '休息中',
    tap: '回应你',
    drag: '移动中'
  },
  en: {
    idle: 'Idle',
    focus: 'Focusing',
    happy: 'Happy',
    worried: 'Needs attention',
    asking: 'Waiting for you',
    sleeping: 'Resting',
    tap: 'Responding',
    drag: 'Moving'
  }
};

export const PIXEL_STATE_MOTIONS: Record<PetState, string> = {
  idle: 'quiet-breathe',
  focus: 'focus-pause',
  happy: 'happy-hold',
  worried: 'worried-settle',
  asking: 'asking-hold',
  sleeping: 'sleep-breathe',
  tap: 'tap-clip',
  drag: 'drag-hold'
};

export const PIXEL_FRAME_SRCS: PixelSpriteModel['frameSrcs'] = {
  taskbar: {
    idle: taskbarIdleFrame,
    focus: taskbarFocusFrame,
    happy: taskbarHappyFrame,
    worried: taskbarWorriedFrame,
    asking: taskbarAskingFrame,
    sleeping: taskbarSleepingFrame,
    tap: taskbarTapFrame,
    drag: taskbarDragFrame
  },
  'window-seat': {
    idle: windowSeatIdleFrame,
    focus: windowSeatFocusFrame,
    happy: windowSeatHappyFrame,
    worried: windowSeatWorriedFrame,
    asking: windowSeatAskingFrame,
    sleeping: windowSeatSleepingFrame,
    tap: windowSeatTapFrame,
    drag: windowSeatDragFrame
  },
  free: {
    idle: freeIdleFrame,
    focus: freeFocusFrame,
    happy: freeHappyFrame,
    worried: freeWorriedFrame,
    asking: freeAskingFrame,
    sleeping: freeSleepingFrame,
    tap: freeTapFrame,
    drag: freeDragFrame
  }
};

export const RUOHAN_PIXEL_MODEL: PixelSpriteModel = {
  id: DEFAULT_COMPANION_ID,
  displayName: '若涵 · 像素桌宠',
  kind: 'pixel-sprite',
  version: '1.0.0',
  alt: '若涵像素桌宠',
  previewSrc,
  frameSrcs: PIXEL_FRAME_SRCS,
  manifest: manifestJson as unknown as PixelSpriteManifest
};

export function pixelStateLabel(state: PetState, language: Settings['language'] = 'zh') {
  return PIXEL_STATE_LABELS[language][state];
}

export function pixelStateMotion(state: PetState) {
  return PIXEL_STATE_MOTIONS[state];
}

export function pixelFrameId(placement: PetPlacement, state: PetState) {
  return `${placement}:${state}`;
}
