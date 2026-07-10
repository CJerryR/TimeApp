import { useEffect, useState, type ReactNode } from 'react';
import {
  Brain,
  Download,
  FileJson,
  FolderOpen,
  KeyRound,
  Pin,
  Upload
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

const COLOR_SCHEMES: Array<{ value: ColorScheme; label: string }> = [
  { value: 'auto', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' }
];

type PetSizeChoice = '2' | '3' | '4';
type PetMotionChoice = 'still' | 'soft';

const PET_SIZE_OPTIONS: Array<{ value: PetSizeChoice; label: string }> = [
  { value: '2', label: '小' },
  { value: '3', label: '标准' },
  { value: '4', label: '大' }
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

  return (
    <div className="page settings-page" data-view="settings">
      <div className="page-head">
        <h1 tabIndex={-1}>设置</h1>
      </div>

      {/* ---- 通用 ---- */}
      <section className="card settings-group">
        <h3>通用</h3>
        <SettingRow title="开机自启动" sub="登录 Windows 后让她先醒来。">
          <Switch checked={settings.startup.openAtLogin} label="开机自启动" onChange={(checked) => void update({ startup: { openAtLogin: checked } })} />
        </SettingRow>
        <SettingRow title="语言" sub="本轮界面全中文;英文文案保留字段、暂不翻译。">
          <Chip size="sm">中文</Chip>
        </SettingRow>
      </section>

      {/* ---- 外观 ---- */}
      <section className="card settings-group">
        <h3>外观</h3>
        <SettingRow title="外观模式" sub="跟随系统会随 Windows 深浅色自动切换。">
          <Segmented
            value={settings.appearance.colorScheme}
            options={COLOR_SCHEMES}
            onChange={(value) => void update({ appearance: { ...settings.appearance, colorScheme: value } })}
            ariaLabel="外观模式"
          />
        </SettingRow>
        <SettingRow title="减弱动效" sub="关闭界面过渡与弹入动画,立即生效。">
          <Switch checked={settings.reducedMotion} label="减弱动效" onChange={(checked) => void update({ reducedMotion: checked })} />
        </SettingRow>
      </section>

      {/* ---- 若涵像素桌宠 ---- */}
      <section className="card pixel-pet-settings" data-model-id={RUOHAN_PIXEL_MODEL.id}>
        <div className="pixel-pet-settings-head">
          <div className="pixel-pet-preview-stage">
            <PixelPetPreview
              state={displayedPetState}
              placement={placement}
              size={pixelSize}
              theme={settings.appearance.colorScheme}
              motionEnabled={petMotionEnabled}
            />
          </div>
          <div className="pixel-pet-settings-intro">
            <span className="pixel-pet-eyebrow">唯一角色 · 像素精灵</span>
            <h3>若涵像素桌宠</h3>
            <p>安静待在任务栏、窗口座位或你放下她的位置。</p>
            <div className="pixel-pet-current-state" aria-live="polite">
              <span className="pixel-pet-state-dot" data-state={displayedPetState} aria-hidden="true" />
              <span>当前：{pixelStateLabel(displayedPetState)}</span>
              {previewState && <small>本地预览</small>}
            </div>
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
              <span>当前为 {pixelSize}× 整数像素缩放</span>
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
              <span>恢复交互：<kbd>Ctrl + Alt + P</kbd></span>
            </div>
            <Switch
              checked={settings.pet.clickThrough}
              label="鼠标穿透"
              onChange={(checked) =>
                void run(async () => {
                  await window.timeMate.setPetClickThrough(checked);
                  if (checked) toast('已开启鼠标穿透，按 Ctrl + Alt + P 恢复交互', 'companion');
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
              <strong>状态预览</strong>
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

      {/* ---- 提醒 ---- */}
      <section className="card settings-group">
        <h3>提醒</h3>
        <SettingRow title="摸鱼提醒" sub={`同一件事停滞 ${settings.reminders.fishAfterMinutes} 分钟后,她轻轻问一句。`}>
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
        </SettingRow>
        <SettingRow title="晚间复盘" sub="晚上她会帮你把今天收个尾。">
          <Switch
            checked={settings.reminders.eveningReview}
            label="晚间复盘"
            onChange={(checked) => void update({ reminders: { ...settings.reminders, eveningReview: checked } })}
          />
        </SettingRow>
        <SettingRow title="日程提前提醒" sub={`日程开始前 ${settings.reminders.scheduleBeforeMinutes} 分钟提醒。`}>
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
        </SettingRow>
        <SettingRow title="晚睡提醒" sub="太晚还醒着,她会劝你去睡。">
          <Switch
            checked={settings.reminders.lateSleep}
            label="晚睡提醒"
            onChange={(checked) => void update({ reminders: { ...settings.reminders, lateSleep: checked } })}
          />
        </SettingRow>
      </section>

      {/* ---- AI 与隐私 ---- */}
      <section className="card settings-group">
        <h3>AI 与隐私</h3>
        <SettingRow title="私人模式" sub="开启后聊天完全本地,不外发。">
          <Switch checked={settings.privateMode} label="私人模式" onChange={(checked) => void update({ privateMode: checked })} />
        </SettingRow>
        <SettingRow title="AI 隐私状态" sub={`${aiModeTitle} · ${aiModeDescription}`}>
          <Brain />
        </SettingRow>
        <SettingRow title="AI 审计" sub="记录每次外发内容的脱敏摘要,只存在本地。">
          <Switch checked={settings.ai.auditEnabled} label="AI 审计" onChange={(checked) => void update({ ai: { ...settings.ai, auditEnabled: checked } })} />
        </SettingRow>
        <SettingRow title="API Key 安全存储" sub={info?.secureStoreAvailable ? 'Electron safeStorage 可用。' : '当前系统 safeStorage 不可用。'}>
          <KeyRound />
        </SettingRow>
        <div className="api-key-row">
          <label className="field">
            <KeyRound />
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
      </section>

      {/* ---- 数据 ---- */}
      <section className="card settings-group">
        <h3>数据</h3>
        <SettingRow title="应用数据目录" sub={info?.userDataPath ?? '加载中'}>
          <Button size="sm" variant="secondary" icon={<FolderOpen />} onClick={() => void run(() => window.timeMate.openUserData())}>
            打开
          </Button>
        </SettingRow>
        <SettingRow title="SQLite 数据库" sub={info?.databasePath ?? '加载中'}>
          <FileJson />
        </SettingRow>
        <SettingRow title="导出与备份" sub="导出完整 JSON,或复制当前快照到剪贴板。">
          <div className="setting-control">
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
        <SettingRow title="导入 JSON" sub="粘贴 TimeMate 备份;导入会整体替换当前数据。" stacked>
          <textarea
            className="area"
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder="粘贴 TimeMate JSON 备份后导入"
            aria-label="导入 JSON"
          />
          <div className="setting-control" style={{ paddingTop: 8 }}>
            <Button
              size="sm"
              variant="secondary"
              icon={<Upload />}
              loading={busy}
              disabled={!importText.trim()}
              onClick={() => void run(() => window.timeMate.importText(importText)).then(() => setImportText(''))}
            >
              导入 JSON
            </Button>
          </div>
        </SettingRow>
      </section>
    </div>
  );
}

function SettingRow({ title, sub, children, stacked = false }: { title: string; sub?: string; children: ReactNode; stacked?: boolean }) {
  if (stacked) {
    return (
      <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
        <div className="setting-main">
          <span className="setting-title">{title}</span>
          {sub && <span className="setting-sub">{sub}</span>}
        </div>
        <div>{children}</div>
      </div>
    );
  }
  return (
    <div className="setting-row">
      <div className="setting-main">
        <span className="setting-title">{title}</span>
        {sub && <span className="setting-sub">{sub}</span>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}
