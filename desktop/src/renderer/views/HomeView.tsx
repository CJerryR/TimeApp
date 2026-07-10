import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowRight, CircleCheck, CirclePause, CirclePlay, MessageCircle, Sparkles } from 'lucide-react';
import type { ActivityStatus, AppSnapshot, PetPlacementState } from '../../shared/types';
import { derivePetState } from '../../shared/pet';
import { RUOHAN_PIXEL_MODEL } from '../pet-model';
import { PixelPetPreview } from '../pixel/PixelPetPreview';
import { Button, Chip, CheckDot, SectionHeader, Sheet, cls } from '../ui/kit';
import {
  MOODS,
  activityStatusText,
  dayHeading,
  doneTodayCount,
  greeting,
  keyTasks,
  timerDigits
} from '../lib/format';

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

  const current = snapshot.currentActivity;
  const companionState = derivePetState(snapshot);
  const petOnline = snapshot.settings.pet.enabled;
  const petWindowSeatActive = petPlacement?.placement === 'window-seat' && petPlacement.visible;

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
        visible: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
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

  return (
    <div className="page" data-view="home">
      <div className="page-head">
        <h1 tabIndex={-1}>{greeting()}</h1>
        <span className="page-date">{dayHeading(new Date())}</span>
      </div>

      <div className="home-grid">
        <div className="home-main">
          {/* ---- 现在 · 小计时器 ---- */}
          <section className="card now-card" data-now-card="true">
            <SectionHeader title="现在" aside={current && <Chip tone="accent">{activityStatusText(current)}</Chip>} />
            {current ? (
              <>
                <h2 className="now-title">{current.title}</h2>
                <div className="now-timer">
                  <span className="timer-digits">{timerDigits(current.startAt)}</span>
                </div>
                <div className="now-meta">
                  {current.tags.length > 0 && <Chip size="sm">{current.tags.join(' · ')}</Chip>}
                  {(current.mood ?? mood) && (
                    <Chip size="sm" tone="companion">
                      {current.mood ?? mood}
                    </Chip>
                  )}
                </div>
                <div className="now-actions">
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
                <p className="now-idle-lede">先定下这一小段。</p>
                <p className="now-idle-sub">写下现在要做的事,回车就开始计时。</p>
                <div className="now-idle-row">
                  <label className="field lg">
                    <Sparkles />
                    <input
                      value={activityText}
                      placeholder="写作业 / 飞书开会 / 摸鱼 / 睡不着"
                      aria-label="现在要做什么"
                      onChange={(event) => setActivityText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void startActivity();
                      }}
                    />
                  </label>
                  <Button variant="primary" icon={<CirclePlay />} loading={busy} disabled={!activityText.trim()} onClick={() => void startActivity()}>
                    开始
                  </Button>
                </div>
              </>
            )}
          </section>

          {/* ---- 今日自由度 ---- */}
          <section className={cls('card', 'freedom-card', snapshot.freedom.tone)}>
            <span className="freedom-dot" aria-hidden="true" />
            <span className="freedom-text">{snapshot.freedom.text}</span>
            {snapshot.freedom.urgentOpenCount > 0 && (
              <Chip size="sm" tone="critical">
                {snapshot.freedom.urgentOpenCount} 件紧急
              </Chip>
            )}
            <Button variant="plain" size="sm" icon={<ArrowRight />} onClick={goPlanner}>
              去规划
            </Button>
          </section>

          {/* ---- 要紧的事(任务完成情况) ---- */}
          <section className="card">
            <SectionHeader
              title="要紧的事"
              aside={
                <div className="focus-progress" style={{ width: 160 }}>
                  <div className="bar">
                    <span style={{ width: `${Math.round(focusRatio * 100)}%` }} />
                  </div>
                  <span className="ratio">
                    {doneToday}/{focusTotal}
                  </span>
                </div>
              }
            />
            {focusList.length > 0 ? (
              <div className="list">
                {focusList.slice(0, 4).map((task) => (
                  <div className="list-row" key={task.id}>
                    <CheckDot
                      checked={false}
                      label={`完成 ${task.title}`}
                      onToggle={() => void run(() => window.timeMate.setTaskStatus(task.id, 'done'))}
                    />
                    <div className="row-main">
                      <span className="row-title">{task.title}</span>
                    </div>
                    {task.priority === 'urgent' && (
                      <Chip size="sm" tone="critical">
                        紧急
                      </Chip>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="setting-sub" style={{ padding: '4px 2px 6px' }}>
                {doneToday > 0 ? '今天要紧的都收住了,剩下的时间是你的。' : '今天还没有要紧的事,想安排就去规划页。'}
              </p>
            )}
          </section>
        </div>

        {/* ---- 若涵的陪伴位（anchor 协议区，属性与上报语义保持不变） ---- */}
        <section className="card companion-card">
          <div className="companion-head">
            <h3>若涵在</h3>
            <Button variant="plain" size="sm" icon={<MessageCircle />} onClick={goChat}>
              找她说说
            </Button>
          </div>
          <div
            className={cls('pet-seat-anchor', petWindowSeatActive && 'pet-window-seat-active')}
            id="pet-seat-anchor"
            data-pet-seat-anchor="true"
            data-model-id={RUOHAN_PIXEL_MODEL.id}
            data-pet-placement={petPlacement?.placement ?? 'taskbar'}
          >
            <div className="room-sofa" aria-hidden="true" />
            <div
              className="home-companion-portrait"
              aria-label="若涵像素桌宠预览"
              aria-hidden={petWindowSeatActive}
              style={{ opacity: petWindowSeatActive ? 0 : 1 } as CSSProperties}
            >
              <PixelPetPreview
                state={companionState}
                placement="window-seat"
                size={RUOHAN_PIXEL_MODEL.manifest.sizes.standard}
                theme={snapshot.settings.appearance.colorScheme}
                motionEnabled={snapshot.settings.characterMotionEnabled && !snapshot.settings.reducedMotion}
              />
            </div>
            <span className={cls('online-pill', petOnline && 'active')} style={{ opacity: petWindowSeatActive ? 0 : 1 } as CSSProperties}>
              {petOnline ? '在这里陪你' : '桌宠已隐藏'}
            </span>
          </div>
          <div className="companion-whisper">
            {current ? `我在这儿，陪你把「${current.title}」这一段守住。` : '我在。先说一句现在要做什么就好。'}
          </div>
          <div className="companion-foot">
            <span className="hint">{petWindowSeatActive ? '若涵正坐在窗口座位上，这里给她留着。' : '想聊两句就去对话页，我一直在。'}</span>
          </div>
        </section>
      </div>

      {/* ---- 轻收尾 Sheet ---- */}
      <Sheet
        open={wrapOpen}
        title="这一段怎么样?"
        subtitle="轻轻收个尾就好,不想说也没关系(Esc 直接关)。"
        onClose={() => void finishActivity('unconfirmed')}
      >
        <div className="now-actions" style={{ flexWrap: 'wrap' }}>
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
          <p className="setting-sub" style={{ marginBottom: 8 }}>顺手记一下现在的心情(可选,下一段开始时她会记得):</p>
          <div className="now-meta">
            {MOODS.map((item) => (
              <Chip key={item} size="sm" tone={mood === item ? 'accent' : 'neutral'} onClick={() => setMood(mood === item ? undefined : item)}>
                {item}
              </Chip>
            ))}
          </div>
        </div>
      </Sheet>
    </div>
  );
}
