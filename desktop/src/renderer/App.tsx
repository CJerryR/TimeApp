import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BrainCircuit, Cable, CalendarRange, House, MessageSquareText, PanelBottomClose, Settings2, Sparkles } from 'lucide-react';
import type { AppInfo, AppSnapshot, PetPlacementState } from '../shared/types';
import { ToastHost, cls, toast } from './ui/kit';
import { HomeView } from './views/HomeView';
import { ChatView } from './views/ChatView';
import { PlannerView } from './views/PlannerView';
import { MemoryView } from './views/MemoryView';
import { IntegrationsView } from './views/IntegrationsView';
import { SettingsView } from './views/SettingsView';
import { LabView } from './views/LabView';

type Tab = 'home' | 'chat' | 'planner' | 'memory' | 'integrations' | 'settings';

const TAB_ORDER: Tab[] = ['home', 'chat', 'planner', 'memory', 'integrations', 'settings'];
const TAB_LABELS: Record<Tab, string> = {
  home: '当前',
  chat: '对话',
  planner: '规划',
  memory: '记忆',
  integrations: '接入',
  settings: '设置'
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const shortcutModifier = isMac ? '⌘' : 'Ctrl';
const isLab = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('lab') === '1';

function useTicker() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
}

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | undefined>();
  const [info, setInfo] = useState<AppInfo | undefined>();
  const [tab, setTab] = useState<Tab>('home');
  const [busy, setBusy] = useState(false);
  const [petPlacement, setPetPlacement] = useState<PetPlacementState | undefined>();
  const [mood, setMood] = useState<string | undefined>();
  const [pageDirection, setPageDirection] = useState<'forward' | 'backward'>('forward');
  const workspaceRef = useRef<HTMLElement>(null);
  const hasNavigatedRef = useRef(false);

  useTicker();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;

      const codeMatch = /^(?:Digit|Numpad)([1-6])$/.exec(event.code);
      const shortcut = Number(codeMatch?.[1] ?? event.key);
      if (!Number.isInteger(shortcut) || shortcut < 1 || shortcut > TAB_ORDER.length) return;

      event.preventDefault();
      navigateTab(TAB_ORDER[shortcut - 1]);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    void Promise.all([window.timeMate.getSnapshot(), window.timeMate.appInfo(), window.timeMate.getPetPlacement()])
      .then(([nextSnapshot, appInfo, placement]) => {
        setSnapshot(nextSnapshot);
        setInfo(appInfo);
        setPetPlacement(placement);
      })
      .catch((err) => toast(err instanceof Error ? err.message : String(err), 'critical'));
  }, []);

  useEffect(() => window.timeMate.onPetPlacement((placement) => setPetPlacement(placement)), []);

  /* ---- 主题解析:appearance.colorScheme + 系统偏好 → html[data-theme] ---- */
  const colorScheme = snapshot?.settings.appearance.colorScheme ?? 'auto';
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = colorScheme === 'dark' || (colorScheme === 'auto' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    if (colorScheme === 'auto') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
    return undefined;
  }, [colorScheme]);

  /* ---- 减弱动效 / 角色动效 → html data 属性 ---- */
  useLayoutEffect(() => {
    document.documentElement.toggleAttribute('data-reduce-motion', Boolean(snapshot?.settings.reducedMotion));
    document.documentElement.dataset.motion = snapshot?.settings.characterMotionEnabled === false ? 'off' : 'on';
  }, [snapshot?.settings.reducedMotion, snapshot?.settings.characterMotionEnabled]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-transparency: reduce)');
    const apply = () => {
      document.documentElement.toggleAttribute(
        'data-reduce-transparency',
        Boolean(snapshot?.settings.appearance.reducedTransparency) || media.matches
      );
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [snapshot?.settings.appearance.reducedTransparency]);

  useEffect(() => {
    if (!hasNavigatedRef.current) {
      hasNavigatedRef.current = true;
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      workspaceRef.current?.querySelector<HTMLElement>('h1')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tab]);

  async function refresh() {
    setSnapshot(await window.timeMate.getSnapshot());
  }

  async function run(action: () => Promise<AppSnapshot | void>) {
    setBusy(true);
    try {
      const result = await action();
      if (result) setSnapshot(result);
      else await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'critical');
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(text: string) {
    setBusy(true);
    try {
      const reply = await window.timeMate.sendAssistantMessage(text);
      setSnapshot(reply.snapshot);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'critical');
    } finally {
      setBusy(false);
    }
  }

  function navigateTab(nextTab: Tab) {
    setTab((currentTab) => {
      if (currentTab === nextTab) return currentTab;
      setPageDirection(TAB_ORDER.indexOf(nextTab) >= TAB_ORDER.indexOf(currentTab) ? 'forward' : 'backward');
      return nextTab;
    });
  }

  if (isLab) {
    return (
      <main className="app-shell">
        <div className="window-drag-region" aria-hidden="true" />
        <aside className="sidebar" />
        <section className="workspace">
          <LabView />
        </section>
        <ToastHost />
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="boot">
        <Sparkles />
        <span>TimeMate 正在醒来…</span>
      </main>
    );
  }

  const draftClueCount = snapshot.externalClues.filter((clue) => clue.status === 'draft').length;
  return (
    <main className="app-shell">
      <a className="skip-link" href="#main-workspace">跳到主要内容</a>
      <div className="window-drag-region" aria-hidden="true" />

      <nav className="sidebar" aria-label="主导航">
        <NavButton tab="home" icon={<House />} label="当前" shortcut={1} active={tab === 'home'} onClick={() => navigateTab('home')} />
        <NavButton tab="chat" icon={<MessageSquareText />} label="对话" shortcut={2} active={tab === 'chat'} onClick={() => navigateTab('chat')} />
        <NavButton
          tab="planner"
          icon={<CalendarRange />}
          label="规划"
          shortcut={3}
          active={tab === 'planner'}
          badge={draftClueCount > 0 ? draftClueCount : undefined}
          onClick={() => navigateTab('planner')}
        />
        <NavButton tab="memory" icon={<BrainCircuit />} label="记忆" shortcut={4} active={tab === 'memory'} onClick={() => navigateTab('memory')} />
        <NavButton tab="integrations" icon={<Cable />} label="接入" shortcut={5} active={tab === 'integrations'} onClick={() => navigateTab('integrations')} />
        <div className="sidebar-spacer" />
        <div className="sidebar-foot">
          <NavButton tab="settings" icon={<Settings2 />} label="设置" shortcut={6} active={tab === 'settings'} onClick={() => navigateTab('settings')} />
          <button
            type="button"
            className="nav-button"
            title="回任务栏"
            onClick={() =>
              void run(async () => {
                await window.timeMate.dockPet();
              })
            }
          >
            <PanelBottomClose />
            <span className="nav-label">回任务栏</span>
          </button>
        </div>
      </nav>

      <section id="main-workspace" ref={workspaceRef} className="workspace" aria-label={TAB_LABELS[tab]} tabIndex={-1}>
        <div className="workspace-view" data-direction={pageDirection} key={tab}>
          {tab === 'home' && (
            <HomeView
              snapshot={snapshot}
              petPlacement={petPlacement}
              busy={busy}
              mood={mood}
              setMood={setMood}
              run={run}
              goChat={() => navigateTab('chat')}
              goPlanner={() => navigateTab('planner')}
            />
          )}
          {tab === 'chat' && <ChatView snapshot={snapshot} busy={busy} mood={mood} setMood={setMood} sendMessage={sendMessage} />}
          {tab === 'planner' && <PlannerView snapshot={snapshot} busy={busy} run={run} />}
          {tab === 'memory' && <MemoryView snapshot={snapshot} busy={busy} run={run} />}
          {tab === 'integrations' && <IntegrationsView snapshot={snapshot} goPlanner={() => navigateTab('planner')} />}
          {tab === 'settings' && <SettingsView snapshot={snapshot} info={info} busy={busy} run={run} />}
        </div>
      </section>

      <ToastHost />
    </main>
  );
}

function NavButton({
  tab,
  icon,
  label,
  shortcut,
  active,
  badge,
  onClick
}: {
  tab: Tab;
  icon: JSX.Element;
  label: string;
  shortcut?: number;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cls('nav-button', active && 'active')}
      data-tab={tab}
      title={shortcut ? `${label} · ${shortcutModifier} ${shortcut}` : label}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-keyshortcuts={shortcut ? `${isMac ? 'Meta' : 'Control'}+${shortcut}` : undefined}
    >
      <span className="nav-icon" aria-hidden="true">{icon}</span>
      <span className="nav-label">{label}</span>
      {badge !== undefined && (
        <span className="nav-badge" aria-label={`${badge} 条待处理`}>
          {badge}
        </span>
      )}
    </button>
  );
}
