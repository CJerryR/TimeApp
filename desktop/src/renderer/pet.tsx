import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  PetBusinessState,
  PetPlacementState,
  PetSettings,
  PetState,
  Settings
} from '../shared/types';
import { derivePetState } from '../shared/pet';
import {
  pixelFrameId,
  pixelStateLabel,
  pixelStateMotion,
  RUOHAN_PIXEL_MODEL
} from './pet-model';
import { normalizePixelScale } from './pixel/pixel-loader';
import { PixelSprite } from './pixel/PixelSprite';
import './styles/pet.css';

const DEFAULT_PET: PetSettings = {
  enabled: true,
  alwaysOnTop: true,
  lockedToTaskbar: true,
  clickThrough: false,
  scale: 0.9
};

const TIP_LIFETIME_MS = 2400;
const CLICK_DELAY_MS = 220;
const TAP_LIFETIME_MS = 360;
const LONG_PRESS_MS = 280;
const DRAG_THRESHOLD_PX = 4;

type PetCopy = {
  tips: Record<PetBusinessState, readonly string[]>;
  feedback: Record<PetBusinessState, string>;
  opening: string;
  snapped: string;
};

const PET_I18N: Record<Settings['language'], PetCopy> = {
  zh: {
    tips: {
      idle: ['我在。', '要开始一段记录吗？', '先写下现在做什么就好。'],
      focus: ['先守住这一段。', '我在旁边，不急着开新坑。', '把注意力放回眼前这一步。'],
      worried: ['卡住了就先缩小任务。', '先停一下，告诉我哪里乱了。', '要不要把它拆成一步？'],
      happy: ['完成得不错。', '这一段收住了。', '可以轻一点了。'],
      sleeping: ['已经很晚了。', '该把明天交给明天。', '先睡，任务不会跑。'],
      asking: ['这是摸鱼吗？', '玩可以，先确认不欠急事。', '要不要设个结束点？']
    },
    feedback: {
      idle: '我回到这里陪你。',
      focus: '好，先专注眼前这一段。',
      worried: '好像卡久了，要不要缩小一步？',
      happy: '完成啦，做得不错。',
      sleeping: '夜深了，先把自己照顾好。',
      asking: '休息可以，要不要留个结束点？'
    },
    opening: '我打开主界面。',
    snapped: '已经稳稳贴在边缘啦。'
  },
  en: {
    tips: {
      idle: ['I am here.', 'Want to start a short log?', 'Just note what you are doing now.'],
      focus: ['Stay with this stretch.', 'I am beside you. No need to open another thread.', 'Bring your attention back to this next step.'],
      worried: ['If you are stuck, make the task smaller.', 'Pause for a moment and find the tangled part.', 'Want to break it into one step?'],
      happy: ['Nicely finished.', 'That stretch is wrapped up.', 'You can ease off a little.'],
      sleeping: ['It is already late.', 'Let tomorrow belong to tomorrow.', 'Sleep first. The task will still be here.'],
      asking: ['Is this a break?', 'Play is fine; just check the urgent things first.', 'Want to set an end point?']
    },
    feedback: {
      idle: 'I am back here with you.',
      focus: 'All right. Stay with this stretch.',
      worried: 'This has been stuck for a while. Make it one step smaller?',
      happy: 'Done. Nicely handled.',
      sleeping: 'It is late. Take care of yourself first.',
      asking: 'A break is fine. Want to set an end point?'
    },
    opening: 'Opening TimeMate.',
    snapped: 'All set along the screen edge.'
  }
};

type DragState = {
  startScreenX: number;
  startScreenY: number;
  startX: number;
  startY: number;
  armed: boolean;
  dragging: boolean;
};

function cls(...items: Array<string | false | undefined>) {
  return items.filter(Boolean).join(' ');
}

function randomTip(state: PetBusinessState, language: Settings['language']) {
  const pool = PET_I18N[language].tips[state];
  return pool[Math.floor(Math.random() * pool.length)];
}

function PetApp() {
  const [businessState, setBusinessState] = useState<PetBusinessState>('idle');
  const [interactionState, setInteractionState] = useState<'tap' | 'drag' | undefined>();
  const [settings, setSettings] = useState<Settings | undefined>();
  const [petPlacement, setPetPlacement] = useState<PetPlacementState | undefined>();
  const [tip, setTip] = useState<{ id: number; text: string } | undefined>();
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<DragState | undefined>();
  const suppressClickRef = useRef(false);
  const latestMoveRef = useRef<{ x: number; y: number } | undefined>();
  const frameRef = useRef<number | undefined>();
  const movePromiseRef = useRef<Promise<unknown> | undefined>();
  const clickTimerRef = useRef<number | undefined>();
  const tapTimerRef = useRef<number | undefined>();
  const longPressTimerRef = useRef<number | undefined>();
  const previousStateRef = useRef<PetBusinessState>('idle');
  const hydratedRef = useRef(false);
  const interactiveRegionRef = useRef(false);

  const petSettings = settings?.pet ?? DEFAULT_PET;
  const language = settings?.language ?? 'zh';
  const copy = PET_I18N[language];
  const motionOff = Boolean(settings?.reducedMotion || settings?.characterMotionEnabled === false);
  const placement = petPlacement?.placement ?? 'taskbar';
  const pixelScale = normalizePixelScale(petSettings.scale);
  const visualState: PetState = interactionState ?? businessState;
  const stateLabel = pixelStateLabel(visualState, language);
  const stateMotion = pixelStateMotion(visualState);
  const frameKey = pixelFrameId(placement, visualState);
  const [logicalWidth, logicalHeight] = RUOHAN_PIXEL_MODEL.manifest.logicalSize;
  const pixelWidth = logicalWidth * pixelScale;
  const pixelHeight = logicalHeight * pixelScale;
  const stageStyle = {
    '--pixel-width': `${pixelWidth}px`,
    '--pixel-height': `${pixelHeight}px`,
    '--pixel-dot-size': `${pixelScale * 3}px`,
    '--pixel-dot-offset': `${-(pixelWidth / 2) + pixelScale * 2}px`,
    '--pixel-dot-bottom': `${6 + pixelScale * 2}px`
  } as CSSProperties;
  const shouldAnnounceTip = businessState === 'asking' || businessState === 'worried';
  const ariaLabel = language === 'zh'
    ? `若涵，当前状态：${stateLabel}`
    : `Ruohan, current state: ${stateLabel}`;

  useEffect(() => {
    void Promise.all([window.timeMate.getSnapshot(), window.timeMate.getPetPlacement()]).then(([snapshot, initialPlacement]) => {
      const initialState = derivePetState(snapshot);
      setSettings(snapshot.settings);
      previousStateRef.current = initialState;
      setBusinessState(initialState);
      setPetPlacement(initialPlacement);
      window.setTimeout(() => {
        hydratedRef.current = true;
      }, 0);
    });
    const offState = window.timeMate.onPetState((state) => {
      if (state === 'tap' || state === 'drag') return;
      setBusinessState(state);
    });
    const offPlacement = window.timeMate.onPetPlacement((nextPlacement) => setPetPlacement(nextPlacement));
    const offSettings = window.timeMate.onPetSettings((nextSettings) => setSettings(nextSettings));
    return () => {
      offState();
      offPlacement();
      offSettings();
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
      if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
      if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!tip) return undefined;
    const timer = window.setTimeout(() => setTip(undefined), TIP_LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [tip]);

  useEffect(() => {
    const visible = Boolean(tip);
    void window.timeMate.setPetBubbleVisible(visible);
    return () => {
      if (visible) void window.timeMate.setPetBubbleVisible(false);
    };
  }, [Boolean(tip)]);

  useEffect(() => {
    function setInteractiveRegion(interactive: boolean) {
      if (interactiveRegionRef.current === interactive) return;
      interactiveRegionRef.current = interactive;
      void window.timeMate.setPetInteractiveRegion(interactive);
    }

    function handleMouseMove(event: MouseEvent) {
      const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const interactive = !petSettings.clickThrough && Boolean(target?.closest('[data-pet-interactive="true"]'));
      setInteractiveRegion(interactive);
    }

    function handleMouseLeave() {
      setInteractiveRegion(false);
    }

    setInteractiveRegion(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      setInteractiveRegion(false);
    };
  }, [petSettings.clickThrough]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (previousStateRef.current === businessState) return;
    previousStateRef.current = businessState;
    if (!isDragging) setTip({ id: Date.now(), text: copy.feedback[businessState] });
  }, [businessState, copy.feedback, isDragging]);

  function showTip(text: string) {
    setTip({ id: Date.now(), text });
  }

  function clearTapReaction() {
    if (tapTimerRef.current) {
      window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = undefined;
    }
    setInteractionState((current) => current === 'tap' ? undefined : current);
  }

  function movePet(position: { x: number; y: number }) {
    const pending = window.timeMate.movePetTo(position);
    movePromiseRef.current = pending;
    void pending.catch(() => undefined);
    return pending;
  }

  function queueMove(x: number, y: number) {
    latestMoveRef.current = { x, y };
    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = undefined;
      const next = latestMoveRef.current;
      if (!next) return;
      void movePet(next);
    });
  }

  function beginDrag(drag: DragState) {
    if (drag.dragging) return;
    drag.dragging = true;
    suppressClickRef.current = true;
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = undefined;
    }
    clearTapReaction();
    setTip(undefined);
    setIsDragging(true);
    setInteractionState('drag');
  }

  async function handlePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (petSettings.clickThrough || event.button !== 0) return;
    suppressClickRef.current = false;
    if (tip) {
      setTip(undefined);
      await window.timeMate.setPetBubbleVisible(false);
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic smoke-test events do not always have an active pointer capture target.
    }
    const bounds = await window.timeMate.getPetBounds();
    if (!bounds) return;
    const drag: DragState = {
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      startX: bounds.x,
      startY: bounds.y,
      armed: false,
      dragging: false
    };
    dragRef.current = drag;
    longPressTimerRef.current = window.setTimeout(() => {
      if (dragRef.current === drag) drag.armed = true;
      longPressTimerRef.current = undefined;
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.screenX - drag.startScreenX;
    const dy = event.screenY - drag.startScreenY;
    const distance = Math.hypot(dx, dy);
    if (!drag.dragging) {
      const crossedThreshold = distance >= DRAG_THRESHOLD_PX;
      const movedAfterLongPress = drag.armed && distance >= 1;
      if (!crossedThreshold && !movedAfterLongPress) return;
      beginDrag(drag);
    }
    queueMove(drag.startX + dx, drag.startY + dy);
  }

  async function handlePointerUp(event: React.PointerEvent<HTMLElement>) {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = undefined;
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // See handlePointerDown: real pointer input captures normally, tests may not.
    }
    const wasDragging = Boolean(dragRef.current?.dragging);
    dragRef.current = undefined;
    if (!wasDragging) return;

    let snapped = false;
    try {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = undefined;
        const next = latestMoveRef.current;
        if (next) await movePet(next).catch(() => undefined);
      } else if (movePromiseRef.current) {
        await movePromiseRef.current.catch(() => undefined);
      }
      latestMoveRef.current = undefined;
      const beforeSave = await window.timeMate.getPetBounds();
      await window.timeMate.savePetPosition();
      const afterSave = await window.timeMate.getPetBounds();
      snapped = Boolean(beforeSave && afterSave && (beforeSave.x !== afterSave.x || beforeSave.y !== afterSave.y));
    } finally {
      setIsDragging(false);
      setInteractionState((current) => current === 'drag' ? undefined : current);
    }
    if (snapped) showTip(copy.snapped);
  }

  function handleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = undefined;
      clearTapReaction();
      setInteractionState('tap');
      showTip(randomTip(businessState, language));
      tapTimerRef.current = window.setTimeout(() => {
        tapTimerRef.current = undefined;
        setInteractionState((current) => current === 'tap' ? undefined : current);
      }, TAP_LIFETIME_MS);
    }, CLICK_DELAY_MS);
  }

  function handleDoubleClick() {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = undefined;
    }
    clearTapReaction();
    showTip(copy.opening);
    void window.timeMate.showMainWindow();
  }

  function handleContextMenu(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (petSettings.clickThrough) return;
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = undefined;
    }
    setTip(undefined);
    void window.timeMate.openPetMenu();
  }

  return (
    <main
      className={cls(
        'pet-shell',
        `state-${visualState}`,
        motionOff && 'motion-off',
        isDragging && 'dragging',
        tip && 'has-tip',
        petSettings.clickThrough && 'click-through'
      )}
      aria-label={ariaLabel}
      data-model-id={RUOHAN_PIXEL_MODEL.id}
      data-requested-model-id={settings?.companion.activeCompanionId ?? RUOHAN_PIXEL_MODEL.id}
      data-model-kind="pixel-sprite"
      data-source-model-kind="pixel-sprite"
      data-model-version={RUOHAN_PIXEL_MODEL.version}
      data-model-asset-status="pixel-sprite-ready"
      data-fallback-asset={frameKey}
      data-placement={placement}
      data-render-engine="pixel-sprite"
      data-frame-key={frameKey}
      data-supported-states={RUOHAN_PIXEL_MODEL.manifest.stateOrder.join(',')}
      data-supported-placements={Object.keys(RUOHAN_PIXEL_MODEL.manifest.placements).join(',')}
      data-state={visualState}
      data-business-state={businessState}
      data-motion={stateMotion}
      data-expression={`pixel-${visualState}`}
      data-dragging={isDragging ? 'true' : 'false'}
      data-pixel-scale={pixelScale}
      data-character-origin="ruohan"
      data-low-distraction="true"
    >
      <div className="pet-stage" style={stageStyle}>
        <div
          className="pet-hit-region"
          data-pet-interactive="true"
          onPointerDown={(event) => void handlePointerDown(event)}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => void handlePointerUp(event)}
          onPointerCancel={(event) => void handlePointerUp(event)}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
        >
          <PixelSprite
            model={RUOHAN_PIXEL_MODEL}
            state={visualState}
            placement={placement}
            size={pixelScale}
            motionEnabled={!motionOff && !isDragging}
          />
        </div>
        <span className="pet-state-dot" aria-hidden="true" />
        <div className="pet-state-label" aria-hidden="true">{stateLabel}</div>
        {tip && (
          <div
            key={tip.id}
            className="pet-bubble"
            data-pet-interactive="true"
            role={shouldAnnounceTip ? 'status' : undefined}
            aria-live={shouldAnnounceTip ? 'polite' : 'off'}
            onContextMenu={handleContextMenu}
          >
            {tip.text}
          </div>
        )}
      </div>
    </main>
  );
}

createRoot(document.getElementById('pet-root') as HTMLElement).render(
  <React.StrictMode>
    <PetApp />
  </React.StrictMode>
);
