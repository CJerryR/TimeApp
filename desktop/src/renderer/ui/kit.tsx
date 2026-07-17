import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from 'react';
import { Check, CircleAlert, CircleCheck, Heart, Loader2, Sparkles, X } from 'lucide-react';

export function cls(...items: Array<string | false | undefined | null>) {
  return items.filter(Boolean).join(' ');
}

/* ============================================================
   Button / IconButton
   ============================================================ */
export function Button({
  variant = 'secondary',
  size,
  loading = false,
  icon,
  children,
  disabled,
  onClick,
  title,
  className
}: {
  variant?: 'primary' | 'secondary' | 'tinted' | 'plain' | 'danger-plain';
  size?: 'sm';
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cls('btn', variant, size, loading && 'loading', className)}
      disabled={disabled || loading}
      onClick={onClick}
      title={title}
      aria-busy={loading || undefined}
    >
      {loading ? <Loader2 className="spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  danger = false,
  disabled,
  onClick
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button type="button" className={cls('icon-btn', danger && 'danger')} title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      {icon}
    </button>
  );
}

/* ============================================================
   Chip / Switch / Segmented
   ============================================================ */
export type ChipTone = 'neutral' | 'accent' | 'positive' | 'warning' | 'critical' | 'late' | 'companion';

export function Chip({
  tone = 'neutral',
  size,
  icon,
  children,
  onClick,
  title,
  disabled = false,
  loading = false,
  selected
}: {
  tone?: ChipTone;
  size?: 'sm';
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  loading?: boolean;
  selected?: boolean;
}) {
  const className = cls('chip', tone !== 'neutral' && tone, size, loading && 'loading');
  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        title={title}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        aria-pressed={selected ?? tone !== 'neutral'}
      >
        {loading ? <Loader2 className="spin" /> : icon}
        {children}
      </button>
    );
  }
  return (
    <span className={className} title={title}>
      {icon}
      {children}
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  loading = false
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={loading || undefined}
      className={cls('switch', loading && 'loading')}
      disabled={disabled || loading}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const handleKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    const focusedIndex = buttons.indexOf(event.target as HTMLButtonElement);
    const index = focusedIndex >= 0 ? focusedIndex : activeIndex;
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : event.key === 'ArrowRight'
          ? (index + 1) % options.length
          : (index - 1 + options.length) % options.length;
    onChange(options[next].value);
    buttons[next]?.focus();
  };

  return (
    <div
      className="segmented"
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      onKeyDown={handleKey}
      style={
        {
          '--segment-count': options.length,
          '--segment-index': activeIndex
        } as CSSProperties
      }
    >
      <span className="segmented-selection" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          className={cls(option.value === value && 'active')}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ============================================================
   Field / SectionHeader / EmptyState / CheckDot
   ============================================================ */
export function Field({
  value,
  onChange,
  placeholder,
  icon,
  large = false,
  type = 'text',
  onEnter,
  autoFocus,
  ariaLabel
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: ReactNode;
  large?: boolean;
  type?: string;
  onEnter?: () => void;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  return (
    <label className={cls('field', large && 'lg')}>
      {icon}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={ariaLabel ?? placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onEnter) {
            event.preventDefault();
            onEnter();
          }
        }}
      />
    </label>
  );
}

export function SectionHeader({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="section-header">
      <h3>{title}</h3>
      {aside && <div className="section-aside">{aside}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Sparkles />}
      <span className="empty-title">{title}</span>
      {text && <span className="empty-text">{text}</span>}
      {action}
    </div>
  );
}

export function CheckDot({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" className={cls('check-dot', checked && 'checked')} aria-label={label} aria-pressed={checked} onClick={onToggle}>
      <Check />
    </button>
  );
}

/* ============================================================
   Sheet(中央模态浮层,Esc / 点背景关闭)
   ============================================================ */
export function Sheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusableSelector = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []).filter(
        (element) => element.offsetParent !== null
      );
      if (focusable.length === 0) {
        event.preventDefault();
        sheetRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    const frame = window.requestAnimationFrame(() => {
      const first = sheetRef.current?.querySelector<HTMLElement>(focusableSelector);
      (first ?? sheetRef.current)?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="sheet-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={sheetRef} tabIndex={-1}>
        <div className="sheet-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton icon={<X />} label="关闭" onClick={onClose} />
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ============================================================
   Toast(全局瞬态提示:模块级事件总线 + Host)
   ============================================================ */
export type ToastTone = 'positive' | 'critical' | 'companion';

type ToastItem = { id: number; text: string; tone: ToastTone };

let toastSeq = 0;
const toastListeners = new Set<(item: ToastItem) => void>();

export function toast(text: string, tone: ToastTone = 'positive') {
  const item = { id: (toastSeq += 1), text, tone };
  toastListeners.forEach((listener) => listener(item));
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener = (item: ToastItem) => {
      setItems((current) => [...current.slice(-2), item]);
      window.setTimeout(() => {
        setItems((current) => current.filter((existing) => existing.id !== item.id));
      }, item.tone === 'critical' ? 5200 : 2600);
    };
    toastListeners.add(listener);
    return () => {
      toastListeners.delete(listener);
    };
  }, []);

  return (
    <div className="toast-host" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={cls('toast', item.tone !== 'positive' && item.tone)}>
          {item.tone === 'critical' ? <CircleAlert /> : item.tone === 'companion' ? <Heart /> : <CircleCheck />}
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   MoodWheel(心情轮盘 · 苹果式径向快选)
   从触发按钮上方弹出:毛玻璃圆盘,六个心情围成一圈,
   ← → 键轮转,Esc 关闭,点背景关闭。
   ============================================================ */
const WHEEL_SIZE = 216;
const WHEEL_RADIUS = 74;

export function MoodWheel({
  open,
  anchor,
  moods,
  value,
  onSelect,
  onClose
}: {
  open: boolean;
  anchor: { x: number; y: number } | undefined;
  moods: string[];
  value?: string;
  onSelect: (mood: string) => void;
  onClose: () => void;
}) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const focusOption = useCallback(
    (index: number) => {
      const total = moods.length;
      const target = ((index % total) + total) % total;
      optionRefs.current[target]?.focus();
    },
    [moods.length]
  );

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const activeIndex = optionRefs.current.findIndex((node) => node === document.activeElement);
        const base = activeIndex >= 0 ? activeIndex : moods.indexOf(value ?? '');
        focusOption(base + (event.key === 'ArrowRight' ? 1 : -1));
      }
    };
    window.addEventListener('keydown', onKey);
    const initial = Math.max(0, moods.indexOf(value ?? ''));
    window.setTimeout(() => focusOption(initial), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, [open, moods, value, onClose, focusOption]);

  if (!open || !anchor) return null;

  const left = Math.min(Math.max(12, anchor.x - WHEEL_SIZE / 2), window.innerWidth - WHEEL_SIZE - 12);
  const top = Math.max(12, anchor.y - WHEEL_SIZE - 14);

  return (
    <>
      <div className="mood-pop-scrim" onMouseDown={onClose} />
      <div className="mood-wheel" role="menu" aria-label="心情轮盘" style={{ left, top }}>
        <span className="wheel-center">现在的心情</span>
        {moods.map((mood, index) => {
          const angle = -Math.PI / 2 + (index * 2 * Math.PI) / moods.length;
          const x = Math.round(Math.cos(angle) * WHEEL_RADIUS);
          const y = Math.round(Math.sin(angle) * WHEEL_RADIUS);
          const pos = `translate(${x}px, ${y}px)`;
          return (
            <button
              key={mood}
              type="button"
              role="menuitemradio"
              aria-checked={mood === value}
              tabIndex={mood === (value ?? moods[0]) ? 0 : -1}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              className={cls('mood-option', mood === value && 'active')}
              style={{ transform: pos, '--pos': pos } as CSSProperties}
              onClick={() => {
                onSelect(mood);
                onClose();
              }}
            >
              {mood}
            </button>
          );
        })}
      </div>
    </>
  );
}
