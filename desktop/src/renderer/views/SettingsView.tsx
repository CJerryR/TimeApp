import { useEffect, useState, type ReactNode } from 'react';
import {
  Bell,
  Brain,
  Database,
  Download,
  FileJson,
  FolderOpen,
  KeyRound,
  Palette,
  PawPrint,
  Pin,
  Settings2,
  Upload,
  type LucideIcon
} from 'lucide-react';
import { derivePetState } from '../../shared/pet';
import type {
  AppInfo,
  AppSnapshot,
  ColorScheme,
  PetPlacement,
  PetPlacementState,
  PetState,
  Settings as TimeMateSettings
} from '../../shared/types';
import { pixelStateLabel, RUOHAN_PIXEL_MODEL } from '../pet-model';
import { normalizePixelScale } from '../pixel/pixel-loader';
import { PixelPetPreview } from '../pixel/PixelPetPreview';
import { Button, Chip, Segmented, Switch, cls, toast } from '../ui/kit';
import '../styles/views/settings.css';

const COLOR_SCHEMES: Array<{ value: ColorScheme; label: string }> = [
  { value: 'auto', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' }
];

type PetSizeChoice = '2' | '3' | '4';
type PetMotionChoice = 'still' | 'soft';
type SettingsSection = 'general' | 'appearance' | 'pet' | 'reminders' | 'ai' | 'data';
type ExpandedSetting = 'api-key' | 'import' | undefined;

const PET_SIZE_OPTIONS: Array<{ value: PetSizeChoice; label: string }> = [
  { value: '2', label: '2x' },
  { value: '3', label: '3x' },
  { value: '4', label: '4x' }
];

const PET_SCALE_VALUES: Record<PetSizeChoice, number> = {
  '2': 0.7,
  '3': 1,
  '4': 1.35
};

const PET_MOTION_OPTIONS: Array<{ value: PetMotionChoice; label: string }> = [
  { value: 'still', label: '静止' },
  { value: 'soft', label: '轻动' }
];

const PET_PLACEMENT_LABELS: Record<PetPlacement, string> = {
  taskbar: '任务栏',
  'window-seat': '窗口座位',
  free: '自由位置'
};

const PET_PREVIEW_STATES: PetState[] = ['idle', 'focus', 'happy', 'worried', 'asking', 'sleeping', 'tap', 'drag'];

const SETTINGS_SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: 'general', label: '通用', description: '启动与语言', icon: Settings2 },
  { id: 'appearance', label: '外观', description: '主题与动效', icon: Palette },
  { id: 'pet', label: '桌宠', description: '若涵像素精灵', icon: PawPrint },
  { id: 'reminders', label: '提醒', description: '日程与作息', icon: Bell },
  { id: 'ai', label: 'AI', description: '隐私与密钥', icon: Brain },
  { id: 'data', label: '数据', description: '路径与备份', icon: Database }
];

export function SettingsView({
  snapshot,
  info,
  busy,
  run
}: {
  snapshot: AppSnapshot;
  info?: AppInfo;
  busy: boolean;
  run: (action: () => Promise<AppSnapshot | void>) => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState('');
  const [importText, setImportText] = useState('');
  const [petPlacement, setPetPlacement] = useState<PetPlacementState>();
  const [previewState, setPreviewState] = useState<PetState>();
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const [expandedSetting, setExpandedSetting] = useState<ExpandedSetting>();
  const [importConfirmed, setImportConfirmed] = useState(false);
  const [importError, setImportError] = useState('');
  const settings = snapshot.settings;

  useEffect(() => {
    let disposed = false;
    void window.timeMate.getPetPlacement().then((placement) => {
      if (!disposed) setPetPlacement(placement);
    });
    const offPlacement = window.timeMate.onPetPlacement((placement) => setPetPlacement(placement));
    return () => {
      disposed = true;
      offPlacement();
    };
  }, []);

  useEffect(() => {
    if (!previewState) return undefined;
    const timer = window.setTimeout(() => setPreviewState(undefined), 10_000);
    return () => window.clearTimeout(timer);
  }, [previewState]);

  const aiModeTitle = settings.privateMode
    ? '本地回复模式'
    : settings.ai.hasApiKey
      ? `${settings.ai.providerId} 可用`
      : '本地 fallback';
  const aiModeDescription = settings.privateMode
    ? '私人模式已开启,聊天不会外发到外部 AI。'
    : settings.ai.hasApiKey
      ? '外部 AI 可用;发送前会脱敏,审计记录保存在本地。'
      : '未保存 API Key,聊天只使用本地回复。';

  const update = (patch: Partial<TimeMateSettings>) => run(() => window.timeMate.updateSettings(patch));
  const actualPetState = derivePetState(snapshot);
  const displayedPetState = previewState ?? actualPetState;
  const pixelSize = normalizePixelScale(settings.pet.scale);
  const pixelSizeChoice = String(pixelSize) as PetSizeChoice;
  const placement = petPlacement?.placement ?? (settings.pet.lockedToTaskbar ? 'taskbar' : 'free');
  const placementLabel = PET_PLACEMENT_LABELS[placement];
  const petMotionChoice: PetMotionChoice = settings.characterMotionEnabled ? 'soft' : 'still';
  const petMotionEnabled = settings.characterMotionEnabled && !settings.reducedMotion;

  const toggleExpanded = (setting: Exclude<ExpandedSetting, undefined>) => {
    setExpandedSetting((current) => (current === setting ? undefined : setting));
  };

  const reviewImport = () => {
    try {
      JSON.parse(importText);
      setImportError('');
      setImportConfirmed(true);
    } catch {
      setImportConfirmed(false);
      setImportError('JSON 格式无效，请检查括号、引号与逗号。');
    }
  };

  const panelProps = (section: SettingsSection) => ({
    id: `settings-panel-${section}`,
    role: 'tabpanel' as const,
    'aria-labelledby': `settings-tab-${section}`,
    hidden: activeSection !== section,
    className: 'settings-section'
  });

  return (
    <div className="page settings-page" data-view="settings">
      <div className="page-head settings-page-head">
        <div>
          <h1 tabIndex={-1}>设置</h1>
          <span className="page-date">TimeMate 偏好与本地数据</span>
        </div>
      </div>

      <div className="settings-workspace">
        <nav className="settings-nav" role="tablist" aria-label="设置分组">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon;
            const selected = activeSection === section.id;
            return (
              <button
                key={section.id}
                id={`settings-tab-${section.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`settings-panel-${section.id}`}
                tabIndex={selected ? 0 : -1}
                className={cls('settings-nav-item', selected && 'active')}
                onClick={() => setActiveSection(section.id)}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
                  const index = tabs.indexOf(event.currentTarget);
                  const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
                  const next = event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : (index + direction + tabs.length) % tabs.length;
                  tabs[next]?.focus();
                  tabs[next]?.click();
                }}
              >
                <Icon aria-hidden="true" />
                <span>
                  <strong>{section.label}</strong>
                  <small>{section.description}</small>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="settings-content">
          <section {...panelProps('general')}>
            <SettingsSectionHeader title="通用" description="应用启动与界面语言。" />
            <div className="settings-list">
              <SettingRow title="开机自启动" sub="登录 Windows 后让她先醒来。">
                <Switch checked={settings.startup.openAtLogin} label="开机自启动" onChange={(checked) => void update({ startup: { openAtLogin: checked } })} />
              </SettingRow>
              <SettingRow title="语言" sub="本轮界面全中文;英文文案保留字段、暂不翻译。">
                <Chip size="sm">中文</Chip>
              </SettingRow>
            </div>
          </section>

          <section {...panelProps('appearance')}>
            <SettingsSectionHeader title="外观" description="主题与界面动效保持同一套系统偏好。" />
            <div className="settings-list">
              <SettingRow title="外观模式" sub="跟随系统会随 Windows 深浅色自动切换。">
                <Segmented
                  value={settings.appearance.colorScheme}
                  options={COLOR_SCHEMES}
                  onChange={(value) => void update({ appearance: { ...settings.appearance, colorScheme: value } })}
                  ariaLabel="外观模式"
                />
              </SettingRow>
              <SettingRow title="减弱动效" sub="减少位移与弹入动画,立即生效。">
                <Switch checked={settings.reducedMotion} label="减弱动效" onChange={(checked) => void update({ reducedMotion: checked })} />
              </SettingRow>
              <SettingRow title="降低透明度" sub="关闭背景采样和模糊，使用更稳定、对比更清晰的实色表面。">
                <Switch
                  checked={settings.appearance.reducedTransparency}
                  label="降低透明度"
                  onChange={(checked) =>
                    void update({ appearance: { ...settings.appearance, reducedTransparency: checked } })
                  }
                />
              </SettingRow>
            </div>
          </section>

          <section {...panelProps('pet')} className="settings-section pixel-pet-settings" data-model-id={RUOHAN_PIXEL_MODEL.id}>
            <SettingsSectionHeader title="若涵像素桌宠" description="像素预览保持原始画面，设置控件使用统一液态玻璃材质。" />
            <div className="pixel-pet-overview">
              <div className="pixel-pet-preview-stage">
                <PixelPetPreview
                  key={`${displayedPetState}-${pixelSize}-${placement}`}
                  state={displayedPetState}
                  placement={placement}
                  size={pixelSize}
                  theme={settings.appearance.colorScheme}
                  motionEnabled={petMotionEnabled}
                />
              </div>
              <div className="pixel-pet-settings-intro">
                <span className="pixel-pet-eyebrow">唯一角色 · 像素精灵</span>
                <div className="pixel-pet-current-state" aria-live="polite">
                  <span className="pixel-pet-state-dot" data-state={displayedPetState} aria-hidden="true" />
                  <span>当前：{pixelStateLabel(displayedPetState)}</span>
                  {previewState && <small>本地预览</small>}
                </div>
                <span className="pixel-pet-placement">{petPlacement?.visible === false ? `桌宠已隐藏 · ${placementLabel}` : placementLabel}</span>
              </div>
              <div className="pixel-pet-master-switch">
                <span>启用</span>
                <Switch
                  checked={settings.pet.enabled}
                  label="启用若涵像素桌宠"
                  onChange={(checked) =>
                    void run(async () => {
                      if (checked) await window.timeMate.showPet();
                      else await window.timeMate.hidePet();
                    })
                  }
                />
              </div>
            </div>

            <div className="pixel-pet-control-grid">
              <div className="pixel-pet-control">
                <div>
                  <strong>大小</strong>
                  <span>当前为 {pixelSize}x 整数像素缩放</span>
                </div>
                <Segmented
                  value={pixelSizeChoice}
                  options={PET_SIZE_OPTIONS}
                  ariaLabel="桌宠大小"
                  onChange={(value) =>
                    void run(async () => {
                      await window.timeMate.setPetScale(PET_SCALE_VALUES[value]);
                    })
                  }
                />
              </div>

              <div className="pixel-pet-control">
                <div>
                  <strong>角色动效</strong>
                  <span>{settings.reducedMotion ? '已由“减弱动效”覆盖' : '只保留低频、轻量的像素动作'}</span>
                </div>
                <Segmented
                  value={petMotionChoice}
                  options={PET_MOTION_OPTIONS}
                  ariaLabel="角色动效"
                  onChange={(value) => void update({ characterMotionEnabled: value === 'soft' })}
                />
              </div>

              <div className="pixel-pet-control">
                <div>
                  <strong>鼠标穿透</strong>
                  <span>恢复交互：从系统托盘菜单选择“恢复桌宠交互”</span>
                </div>
                <Switch
                  checked={settings.pet.clickThrough}
                  label="鼠标穿透"
                  onChange={(checked) =>
                    void run(async () => {
                      await window.timeMate.setPetClickThrough(checked);
                      if (checked) toast('已开启鼠标穿透，可从系统托盘菜单选择“恢复桌宠交互”', 'companion');
                    })
                  }
                />
              </div>

              <div className="pixel-pet-control">
                <div>
                  <strong>位置</strong>
                  <span>{petPlacement?.visible === false ? `桌宠已隐藏 · ${placementLabel}` : placementLabel}</span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Pin />}
                  disabled={placement === 'taskbar'}
                  onClick={() =>
                    void run(async () => {
                      await window.timeMate.dockPet();
                    })
                  }
                >
                  回任务栏
                </Button>
              </div>
            </div>

            <div className="pixel-pet-state-preview">
              <div className="pixel-pet-state-preview-head">
                <div>
                  <strong>八种状态</strong>
                  <span>只在本页显示，10 秒后恢复真实状态。</span>
                </div>
                {previewState && (
                  <Button size="sm" variant="plain" onClick={() => setPreviewState(undefined)}>
                    结束预览
                  </Button>
                )}
              </div>
              <div className="pixel-pet-state-grid" role="group" aria-label="像素桌宠状态预览">
                {PET_PREVIEW_STATES.map((state) => {
                  const interactionState = state === 'tap' || state === 'drag';
                  return (
                    <button
                      key={state}
                      type="button"
                      className={cls('pixel-pet-state-button', previewState === state && 'active')}
                      aria-pressed={previewState === state}
                      onClick={() => setPreviewState(previewState === state ? undefined : state)}
                    >
                      <span>{pixelStateLabel(state)}</span>
                      {interactionState && <small>交互态</small>}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section {...panelProps('reminders')}>
            <SettingsSectionHeader title="提醒" description="控制日程、停滞与作息提示。" />
            <div className="settings-list">
              <SettingRow title="摸鱼提醒" sub={`同一件事停滞 ${settings.reminders.fishAfterMinutes} 分钟后,她轻轻问一句。`}>
                <RangeControl value={`${settings.reminders.fishAfterMinutes} 分钟`}>
                  <input
                    type="range"
                    className="slider"
                    min="10"
                    max="60"
                    step="5"
                    aria-label="摸鱼提醒阈值(分钟)"
                    value={settings.reminders.fishAfterMinutes}
                    onChange={(event) => void update({ reminders: { ...settings.reminders, fishAfterMinutes: Number(event.target.value) } })}
                  />
                </RangeControl>
              </SettingRow>
              <SettingRow title="晚间复盘" sub="晚上她会帮你把今天收个尾。">
                <Switch
                  checked={settings.reminders.eveningReview}
                  label="晚间复盘"
                  onChange={(checked) => void update({ reminders: { ...settings.reminders, eveningReview: checked } })}
                />
              </SettingRow>
              <SettingRow title="日程提前提醒" sub={`日程开始前 ${settings.reminders.scheduleBeforeMinutes} 分钟提醒。`}>
                <RangeControl value={`${settings.reminders.scheduleBeforeMinutes} 分钟`}>
                  <input
                    type="range"
                    className="slider"
                    min="0"
                    max="30"
                    step="5"
                    aria-label="日程提前提醒(分钟)"
                    value={settings.reminders.scheduleBeforeMinutes}
                    onChange={(event) => void update({ reminders: { ...settings.reminders, scheduleBeforeMinutes: Number(event.target.value) } })}
                  />
                </RangeControl>
              </SettingRow>
              <SettingRow title="晚睡提醒" sub="太晚还醒着,她会劝你去睡。">
                <Switch
                  checked={settings.reminders.lateSleep}
                  label="晚睡提醒"
                  onChange={(checked) => void update({ reminders: { ...settings.reminders, lateSleep: checked } })}
                />
              </SettingRow>
            </div>
          </section>

          <section {...panelProps('ai')}>
            <SettingsSectionHeader title="AI 与隐私" description="外部模型调用、审计与本地安全存储。" />
            <div className="settings-list">
              <SettingRow title="私人模式" sub="开启后聊天完全本地,不外发。">
                <Switch checked={settings.privateMode} label="私人模式" onChange={(checked) => void update({ privateMode: checked })} />
              </SettingRow>
              <SettingRow title="AI 隐私状态" sub={`${aiModeTitle} · ${aiModeDescription}`}>
                <Brain aria-hidden="true" />
              </SettingRow>
              <SettingRow title="AI 审计" sub="记录每次外发内容的脱敏摘要,只存在本地。">
                <Switch checked={settings.ai.auditEnabled} label="AI 审计" onChange={(checked) => void update({ ai: { ...settings.ai, auditEnabled: checked } })} />
              </SettingRow>
              <SettingRow title="API Key 安全存储" sub={info?.secureStoreAvailable ? 'Electron safeStorage 可用。' : '当前系统 safeStorage 不可用。'}>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<KeyRound />}
                  onClick={() => toggleExpanded('api-key')}
                  className="settings-expand-trigger"
                >
                  {expandedSetting === 'api-key' ? '收起' : '管理'}
                </Button>
              </SettingRow>
              <ExpandableSetting id="api-key-editor" open={expandedSetting === 'api-key'}>
                <div className="api-key-row">
                  <label className="field">
                    <KeyRound aria-hidden="true" />
                    <input
                      type="password"
                      value={apiKey}
                      placeholder="DeepSeek API Key"
                      aria-label="API Key"
                      onChange={(event) => setApiKey(event.target.value)}
                    />
                  </label>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={busy}
                    disabled={!apiKey.trim()}
                    onClick={() => {
                      const value = apiKey.trim();
                      if (!value) return;
                      void run(() => window.timeMate.setApiKey(value)).then(() => toast('API Key 已保存'));
                      setApiKey('');
                    }}
                  >
                    保存
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void run(() => window.timeMate.clearApiKey()).then(() => toast('API Key 已清除'))}>
                    清除
                  </Button>
                </div>
              </ExpandableSetting>
            </div>
          </section>

          <section {...panelProps('data')}>
            <SettingsSectionHeader title="数据" description="本地路径、导出与整体备份恢复。" />
            <div className="settings-list">
              <SettingRow title="应用数据目录" sub={info?.userDataPath ?? '加载中'}>
                <Button size="sm" variant="secondary" icon={<FolderOpen />} onClick={() => void run(() => window.timeMate.openUserData())}>
                  打开
                </Button>
              </SettingRow>
              <SettingRow title="SQLite 数据库" sub={info?.databasePath ?? '加载中'}>
                <FileJson aria-hidden="true" />
              </SettingRow>
              <SettingRow title="导出与备份" sub="导出完整 JSON,或复制当前快照到剪贴板。">
                <div className="setting-control settings-action-group">
                  <Button
                    size="sm"
                    variant="tinted"
                    icon={<Download />}
                    onClick={() =>
                      void run(async () => {
                        await window.timeMate.exportFile();
                      }).then(() => toast('已导出 JSON'))
                    }
                  >
                    导出 JSON
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<FileJson />}
                    onClick={() => {
                      void navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
                      toast('快照已复制');
                    }}
                  >
                    复制快照
                  </Button>
                </div>
              </SettingRow>
              <SettingRow title="导入 JSON" sub="导入会整体替换当前数据。">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Upload />}
                  onClick={() => toggleExpanded('import')}
                  className="settings-expand-trigger"
                >
                  {expandedSetting === 'import' ? '收起' : '展开'}
                </Button>
              </SettingRow>
              <ExpandableSetting id="json-import-editor" open={expandedSetting === 'import'}>
                <div className="settings-import-editor">
                  <textarea
                    className="area"
                    value={importText}
                    onChange={(event) => {
                      setImportText(event.target.value);
                      setImportConfirmed(false);
                      setImportError('');
                    }}
                    placeholder="粘贴 TimeMate JSON 备份后导入"
                    aria-label="导入 JSON"
                  />
                  <div className="settings-import-actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Upload />}
                      disabled={!importText.trim()}
                      onClick={reviewImport}
                    >
                      导入 JSON
                    </Button>
                  </div>
                  <div className="settings-feedback-region" aria-live="polite">
                    {importError && <div className="settings-feedback is-error">{importError}</div>}
                    {importConfirmed && (
                      <div className="settings-import-confirm">
                        <div>
                          <strong>确认替换当前数据？</strong>
                          <span>已通过 JSON 格式校验，导入后将刷新本地快照。</span>
                        </div>
                        <div className="settings-import-confirm-actions">
                          <Button size="sm" variant="plain" onClick={() => setImportConfirmed(false)}>
                            取消
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            loading={busy}
                            onClick={() =>
                              void run(() => window.timeMate.importText(importText)).then(() => {
                                setImportText('');
                                setImportConfirmed(false);
                              })
                            }
                          >
                            确认导入
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </ExpandableSetting>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SettingsSectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="settings-section-head">
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

function SettingRow({ title, sub, children, stacked = false }: { title: string; sub?: string; children: ReactNode; stacked?: boolean }) {
  return (
    <div className={cls('setting-row', stacked && 'is-stacked')}>
      <div className="setting-main">
        <span className="setting-title">{title}</span>
        {sub && <span className="setting-sub">{sub}</span>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function RangeControl({ value, children }: { value: string; children: ReactNode }) {
  return (
    <div className="settings-range-control">
      {children}
      <output>{value}</output>
    </div>
  );
}

function ExpandableSetting({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  return (
    <div id={id} className="settings-expandable" data-open={open} aria-hidden={!open} inert={!open ? '' : undefined}>
      <div className="settings-expandable-inner">{children}</div>
    </div>
  );
}
