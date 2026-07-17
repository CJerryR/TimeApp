import { useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Heart, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { MOODS } from '../lib/format';
import {
  Button,
  CheckDot,
  Chip,
  EmptyState,
  Field,
  IconButton,
  MoodWheel,
  Segmented,
  Sheet,
  Switch,
  toast
} from '../ui/kit';
import '../styles/views/lab.css';

type SegmentValue = 'default' | 'selected' | 'disabled';

/** design-lab:?lab=1 打开;共享组件 × 交互状态,做视觉回归用。 */
export function LabView() {
  const [seg, setSeg] = useState<SegmentValue>('selected');
  const [on, setOn] = useState(true);
  const [text, setText] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [checked, setChecked] = useState(true);
  const [mood, setMood] = useState<string | undefined>('平静');
  const [wheelOpen, setWheelOpen] = useState(false);
  const [motionRun, setMotionRun] = useState(0);
  const wheelButton = useRef<HTMLButtonElement>(null);

  return (
    <div className="page lab-page" data-view="lab">
      <div className="page-head lab-page-head">
        <div>
          <h1 tabIndex={-1}>Design Lab</h1>
          <span className="page-date">共享组件验收 · ?lab=1</span>
        </div>
        <Button size="sm" variant="secondary" icon={<RefreshCw />} onClick={() => setMotionRun((value) => value + 1)}>
          重播动效
        </Button>
      </div>

      <div className="lab-board">
        <section className="lab-section" aria-labelledby="lab-interaction-title">
          <LabSectionHead id="lab-interaction-title" title="交互状态" meta="90-260ms" />
          <div className="lab-state-grid">
            <StateSpecimen label="Default">
              <Button variant="secondary">默认</Button>
            </StateSpecimen>
            <StateSpecimen label="Hover" state="hover">
              <Button variant="secondary">悬停</Button>
            </StateSpecimen>
            <StateSpecimen label="Press" state="press">
              <Button variant="secondary">按压</Button>
            </StateSpecimen>
            <StateSpecimen label="Focus" state="focus">
              <Button variant="secondary">聚焦</Button>
            </StateSpecimen>
            <StateSpecimen label="Selected" state="selected">
              <Chip tone="accent" selected onClick={() => undefined}>
                已选中
              </Chip>
            </StateSpecimen>
            <StateSpecimen label="Disabled">
              <Button variant="primary" disabled>
                不可用
              </Button>
            </StateSpecimen>
            <StateSpecimen label="Loading">
              <Button variant="primary" loading>
                加载中
              </Button>
            </StateSpecimen>
            <StateSpecimen label="Danger" state="danger">
              <Button variant="danger-plain" icon={<Trash2 />}>
                删除
              </Button>
            </StateSpecimen>
          </div>
        </section>

        <section className="lab-section" aria-labelledby="lab-selection-title">
          <LabSectionHead id="lab-selection-title" title="选择控件" meta="默认 / 选中 / 禁用 / 加载" />
          <div className="lab-control-grid">
            <div className="lab-control-group">
              <span className="lab-control-label">Segmented</span>
              <Segmented
                value={seg}
                options={[
                  { value: 'default', label: '默认' },
                  { value: 'selected', label: '选中' },
                  { value: 'disabled', label: '禁用' }
                ]}
                onChange={setSeg}
                ariaLabel="分段控件验收"
              />
              <Segmented
                value="selected"
                options={[
                  { value: 'default', label: '默认' },
                  { value: 'selected', label: '选中' }
                ]}
                onChange={() => undefined}
                ariaLabel="禁用分段控件"
                disabled
              />
            </div>

            <div className="lab-control-group">
              <span className="lab-control-label">Switch</span>
              <div className="lab-inline-controls">
                <Switch checked={on} onChange={setOn} label="普通开关" />
                <Switch checked={false} onChange={() => undefined} label="关闭开关" />
                <Switch checked disabled onChange={() => undefined} label="禁用开关" />
                <Switch checked loading onChange={() => undefined} label="加载中开关" />
              </div>
            </div>

            <div className="lab-control-group">
              <span className="lab-control-label">CheckDot / Icon</span>
              <div className="lab-inline-controls">
                <CheckDot checked={checked} onToggle={() => setChecked((value) => !value)} label="示例勾选" />
                <CheckDot checked={false} onToggle={() => setChecked(true)} label="未勾选" />
                <IconButton icon={<Heart />} label="心情" />
                <IconButton icon={<Trash2 />} label="删除" danger />
                <IconButton icon={<Plus />} label="不可用操作" disabled />
              </div>
            </div>

            <div className="lab-control-group">
              <span className="lab-control-label">Chip</span>
              <div className="lab-inline-controls">
                <Chip>默认</Chip>
                <Chip tone="accent" selected onClick={() => undefined}>
                  选中
                </Chip>
                <Chip tone="positive">完成</Chip>
                <Chip tone="warning">提醒</Chip>
                <Chip tone="critical">错误</Chip>
                <Chip tone="accent" loading onClick={() => undefined}>
                  加载
                </Chip>
                <Chip disabled onClick={() => undefined}>
                  禁用
                </Chip>
              </div>
            </div>
          </div>
        </section>

        <section className="lab-section" aria-labelledby="lab-input-title">
          <LabSectionHead id="lab-input-title" title="输入与反馈" meta="Focus / Confirm / Error" />
          <div className="lab-input-grid">
            <div className="lab-control-group">
              <span className="lab-control-label">Field</span>
              <Field value={text} onChange={setText} placeholder="普通输入" icon={<Search />} />
              <div className="lab-force-focus">
                <Field value="焦点状态" onChange={() => undefined} ariaLabel="焦点状态输入" />
              </div>
              <label className="field lab-error-field">
                <CircleAlert aria-hidden="true" />
                <input value="无法保存的内容" readOnly aria-label="错误状态输入" />
              </label>
            </div>

            <div className="lab-feedback-stack" aria-live="polite">
              <div className="lab-feedback is-confirm">
                <CircleCheck aria-hidden="true" />
                <div>
                  <strong>等待确认</strong>
                  <span>格式校验完成，下一步会替换当前数据。</span>
                </div>
                <Button size="sm" variant="primary">确认</Button>
              </div>
              <div className="lab-feedback is-error">
                <CircleAlert aria-hidden="true" />
                <div>
                  <strong>导入失败</strong>
                  <span>JSON 格式无效，请检查后重试。</span>
                </div>
                <Button size="sm" variant="danger-plain">重试</Button>
              </div>
            </div>
          </div>
        </section>

        <section className="lab-section" aria-labelledby="lab-motion-title">
          <LabSectionHead id="lab-motion-title" title="动效模式" meta="正常 / 减弱" />
          <div className="lab-motion-grid">
            <div className="lab-motion-specimen">
              <div className="lab-motion-copy">
                <strong>正常动效</strong>
                <span>200ms 位移、透明度与玻璃高光。</span>
              </div>
              <div className="lab-motion-track" aria-hidden="true">
                <span key={`normal-${motionRun}`} className="lab-motion-dot is-normal" />
              </div>
            </div>
            <div className="lab-motion-specimen">
              <div className="lab-motion-copy">
                <strong>减弱动效</strong>
                <span>100ms 淡入，不使用位移或缩放。</span>
              </div>
              <div className="lab-motion-track" aria-hidden="true">
                <span key={`reduced-${motionRun}`} className="lab-motion-dot is-reduced" />
              </div>
            </div>
          </div>
        </section>

        <section className="lab-section" aria-labelledby="lab-overlay-title">
          <LabSectionHead id="lab-overlay-title" title="浮层与空态" meta="Toast / Sheet / MoodWheel" />
          <div className="lab-toolbar">
            <Button variant="secondary" onClick={() => toast('操作已完成')}>
              默认 Toast
            </Button>
            <Button variant="danger-plain" onClick={() => toast('出了点问题,再试一次', 'critical')}>
              错误 Toast
            </Button>
            <Button variant="tinted" onClick={() => setSheetOpen(true)}>
              打开 Sheet
            </Button>
            <button ref={wheelButton} type="button" className="btn secondary" onClick={() => setWheelOpen(true)}>
              心情轮盘 · {mood ?? '未选'}
            </button>
          </div>
          <EmptyState title="暂无内容" text="当前筛选条件下没有项目。" action={<Button variant="tinted" size="sm">新建</Button>} />
        </section>
      </div>

      <Sheet
        open={sheetOpen}
        title="示例 Sheet"
        subtitle="默认、焦点与按钮状态验收。"
        onClose={() => setSheetOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSheetOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={() => setSheetOpen(false)}>
              确认
            </Button>
          </>
        }
      >
        <Field value={text} onChange={setText} placeholder="Sheet 里的输入" />
      </Sheet>

      <MoodWheel
        open={wheelOpen}
        anchor={
          wheelButton.current
            ? {
                x: wheelButton.current.getBoundingClientRect().left + wheelButton.current.getBoundingClientRect().width / 2,
                y: wheelButton.current.getBoundingClientRect().top
              }
            : undefined
        }
        moods={MOODS}
        value={mood}
        onSelect={setMood}
        onClose={() => setWheelOpen(false)}
      />
    </div>
  );
}

function LabSectionHead({ id, title, meta }: { id: string; title: string; meta: string }) {
  return (
    <div className="lab-section-head">
      <h2 id={id}>{title}</h2>
      <span>{meta}</span>
    </div>
  );
}

function StateSpecimen({ label, state, children }: { label: string; state?: string; children: ReactNode }) {
  return (
    <div className={`lab-state-specimen${state ? ` is-${state}` : ''}`}>
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}
