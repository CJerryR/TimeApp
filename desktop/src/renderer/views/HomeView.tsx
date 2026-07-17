import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  CircleCheck,
  CirclePause,
  CirclePlay,
  ListTodo,
  MessageCircle,
  Sparkles
} from 'lucide-react';
import type { ActivityStatus, AppSnapshot, PetPlacementState } from '../../shared/types';
import { derivePetState } from '../../shared/pet';
import { RUOHAN_PIXEL_MODEL } from '../pet-model';
import { PixelSprite } from '../pixel/PixelSprite';
import { Button, Chip, CheckDot, Sheet, cls } from '../ui/kit';
import {
  MOODS,
  activityStatusText,
  dayHeading,
  doneTodayCount,
  greeting,
  keyTasks,
  timerDigits
} from '../lib/format';
import '../styles/views/home.css';

export function HomeView({
  snapshot,
  petPlacement,
  busy,
  mood,
  setMood,
  run,
  goChat,
  goPlanner
}: {
  snapshot: AppSnapshot;
  petPlacement?: PetPlacementState;
  busy: boolean;
  mood?: string;
  setMood: (mood?: string) => void;
  run: (action: () => Promise<AppSnapshot | void>) => Promise<void>;
  goChat: () => void;
  goPlanner: () => void;
}) {
  const [activityText, setActivityText] = useState('');
  const [wrapOpen, setWrapOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState<string>();

  const current = snapshot.currentActivity;
  const companionState = derivePetState(snapshot);
  const petOnline = snapshot.settings.pet.enabled;
  const petWindowSeatActive = petPlacement?.placement === 'window-seat';

  const focusList = keyTasks(snapshot.tasks);
  const doneToday = doneTodayCount(snapshot.tasks);
  const focusTotal = focusList.length + doneToday;
  const focusRatio = focusTotal === 0 ? 1 : doneToday / focusTotal;

  useEffect(() => {
    let frame: number | undefined;
    let disposed = false;
    const report = () => {
      if (disposed) return;
      frame = undefined;
      const anchor = document.querySelector<HTMLElement>('#pet-seat-anchor[data-pet-seat-anchor="true"]');
      if (!anchor) {
        void window.timeMate.reportPetSeatAnchor(undefined);
        return;
      }
      const rect = anchor.getBoundingClientRect();
      void window.timeMate.reportPetSeatAnchor({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        visible:
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth
      });
    };
    const scheduleReport = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(report);
    };
    const resizeObserver = new ResizeObserver(scheduleReport);
    const anchor = document.querySelector<HTMLElement>('#pet-seat-anchor[data-pet-seat-anchor="true"]');
    if (anchor) resizeObserver.observe(anchor);
    resizeObserver.observe(document.body);
    const offSeatRequest = window.timeMate.onPetSeatAnchorRequest(scheduleReport);

    scheduleReport();
    window.addEventListener('resize', scheduleReport);
    window.addEventListener('scroll', scheduleReport, true);

    return () => {
      disposed = true;
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      offSeatRequest();
      window.removeEventListener('resize', scheduleReport);
      window.removeEventListener('scroll', scheduleReport, true);
      void window.timeMate.reportPetSeatAnchor(undefined);
    };
  }, []);

  async function startActivity() {
    const title = activityText.trim();
    if (!title) return;
    await run(() => window.timeMate.startActivity({ title, mood }));
    setActivityText('');
  }

  async function finishActivity(status: ActivityStatus) {
    setWrapOpen(false);
    await run(() => window.timeMate.endActivity(status));
  }

  async function completeTask(taskId: string) {
    if (busy || completingTaskId) return;
    setCompletingTaskId(taskId);
    const reducedMotion =
      document.documentElement.hasAttribute('data-reduce-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reducedMotion) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 160));
    }
    try {
      await run(() => window.timeMate.setTaskStatus(taskId, 'done'));
    } finally {
      setCompletingTaskId(undefined);
    }
  }

  return (
    <div className="page home-page" data-view="home">
      <div className="page-head home-page-head">
        <h1 tabIndex={-1}>{greeting()}</h1>
        <span className="page-date">{dayHeading(new Date())}</span>
      </div>

      <main className="home-continuum">
        <section className={cls('home-stage', current ? 'is-active' : 'is-idle')} data-now-card="true">
          <div className="home-stage-head">
            <div className="home-stage-status">
              <span className="home-stage-kicker">现在</span>
              {current && <span className="home-stage-state">{activityStatusText(current)}</span>}
            </div>
            <Button variant="plain" size="sm" icon={<MessageCircle />} onClick={goChat} className="home-chat-action">
              和若涵聊聊
            </Button>
          </div>

          <div className="home-stage-focus">
            <div className="home-activity-panel">
              <div className="home-activity-transition" key={current?.id ?? 'idle'}>
                {current ? (
                  <>
                    <h2 className="home-activity-title">{current.title}</h2>
                    <span className="home-timer" aria-label={`已进行 ${timerDigits(current.startAt)}`}>
                      {timerDigits(current.startAt)}
                    </span>
                    <div className="home-activity-meta">
                      {current.tags.length > 0 && <span>{current.tags.join(' · ')}</span>}
                      {(current.mood ?? mood) && <span>{current.mood ?? mood}</span>}
                    </div>
                    <div className="home-activity-actions">
                      <Button variant="primary" icon={<CircleCheck />} loading={busy} onClick={() => setWrapOpen(true)}>
                        完成这段
                      </Button>
                      <Button variant="secondary" icon={<CirclePause />} disabled={busy} onClick={() => setWrapOpen(true)}>
                        被打断了
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="home-activity-title">先定下这一小段</h2>
                    <div className="home-start-row">
                      <label className="field lg home-start-field">
                        <Sparkles />
                        <input
                          value={activityText}
                          placeholder="现在要做什么"
                          aria-label="现在要做什么"
                          onChange={(event) => setActivityText(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void startActivity();
                          }}
                        />
                      </label>
                      <Button
                        variant="primary"
                        icon={<CirclePlay />}
                        loading={busy}
                        disabled={!activityText.trim()}
                        onClick={() => void startActivity()}
                      >
                        开始
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div
              className={cls('pet-seat-anchor', 'home-pet-seat', petWindowSeatActive && 'pet-window-seat-active')}
              id="pet-seat-anchor"
              data-pet-seat-anchor="true"
              data-model-id={RUOHAN_PIXEL_MODEL.id}
              data-pet-placement={petPlacement?.placement ?? 'taskbar'}
            >
              <div className="room-sofa" aria-hidden="true" />
              {!petWindowSeatActive && (
                <>
                  <div className="home-companion-portrait" aria-label="若涵像素桌宠预览">
                    <PixelSprite
                      model={RUOHAN_PIXEL_MODEL}
                      state={companionState}
                      placement="window-seat"
                      size={RUOHAN_PIXEL_MODEL.manifest.sizes.standard}
                      motionEnabled={snapshot.settings.characterMotionEnabled && !snapshot.settings.reducedMotion}
                      className="home-pixel-sprite"
                    />
                  </div>
                  <span className={cls('online-pill', petOnline && 'active')}>
                    {petOnline ? '若涵在线' : '桌宠已隐藏'}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="home-stage-footer">
            <p className="home-companion-line">
              {current ? `我陪你把「${current.title}」这一段守住。` : '我在。先从眼前这一件开始。'}
            </p>
            <div className={cls('home-freedom-line', snapshot.freedom.tone)}>
              <span className="home-freedom-dot" aria-hidden="true" />
              <span className="home-freedom-text">{snapshot.freedom.text}</span>
              {snapshot.freedom.urgentOpenCount > 0 && (
                <span className="home-urgent-count">{snapshot.freedom.urgentOpenCount} 件紧急</span>
              )}
              <Button variant="plain" size="sm" icon={<ArrowRight />} onClick={goPlanner}>
                规划
              </Button>
            </div>
          </div>
        </section>

        <section className={cls('home-tasks', tasksOpen && 'is-open')} aria-label="要紧的事">
          <button
            type="button"
            className="home-task-summary"
            aria-expanded={tasksOpen}
            aria-controls="home-task-list"
            onClick={() => setTasksOpen((open) => !open)}
          >
            <ListTodo aria-hidden="true" />
            <span className="home-task-summary-title">要紧的事</span>
            <span className="home-task-progress" aria-hidden="true">
              <span style={{ transform: `scaleX(${focusRatio})` }} />
            </span>
            <span className="home-task-ratio">
              {doneToday}/{focusTotal}
            </span>
            <ChevronDown className="home-task-chevron" aria-hidden="true" />
          </button>

          {tasksOpen && (
            <div className="home-task-panel" id="home-task-list">
              {focusList.length > 0 ? (
                <div className="home-task-list">
                  {focusList.slice(0, 4).map((task) => (
                    <div
                      className={cls('home-task-row', completingTaskId === task.id && 'is-completing')}
                      key={task.id}
                    >
                      <CheckDot checked={false} label={`完成 ${task.title}`} onToggle={() => void completeTask(task.id)} />
                      <span className="home-task-title">{task.title}</span>
                      {task.priority === 'urgent' && <span className="home-task-priority">紧急</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="home-task-empty">{doneToday > 0 ? '今天要紧的都完成了。' : '今天还没有要紧的事。'}</p>
              )}
              <Button variant="plain" size="sm" icon={<ArrowRight />} onClick={goPlanner} className="home-task-planner">
                打开规划
              </Button>
            </div>
          )}
        </section>
      </main>

      <Sheet
        open={wrapOpen}
        title="这一段怎么样?"
        subtitle="轻轻收个尾就好,不想说也没关系(Esc 直接关)。"
        onClose={() => void finishActivity('unconfirmed')}
      >
        <div className="home-wrap-actions">
          <Button variant="primary" icon={<CircleCheck />} onClick={() => void finishActivity('done')}>
            完成了
          </Button>
          <Button variant="secondary" onClick={() => void finishActivity('interrupted')}>
            没做完
          </Button>
          <Button variant="secondary" onClick={() => void finishActivity('interrupted')}>
            被打断了
          </Button>
          <Button variant="plain" onClick={() => void finishActivity('unconfirmed')}>
            先不说
          </Button>
        </div>
        <div>
          <p className="home-wrap-label">现在的心情</p>
          <div className="home-mood-list">
            {MOODS.map((item) => (
              <Chip
                key={item}
                size="sm"
                tone={mood === item ? 'accent' : 'neutral'}
                selected={mood === item}
                onClick={() => setMood(mood === item ? undefined : item)}
              >
                {item}
              </Chip>
            ))}
          </div>
        </div>
      </Sheet>
    </div>
  );
}
