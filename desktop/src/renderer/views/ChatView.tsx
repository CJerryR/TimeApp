import { Fragment, useEffect, useRef, useState } from 'react';
import { Heart, LockKeyhole, Send, ShieldCheck } from 'lucide-react';
import type { AppSnapshot } from '../../shared/types';
import { Button, MoodWheel, cls, toast } from '../ui/kit';
import { MOODS, clockLabel, dayHeading, isSameDay } from '../lib/format';
import '../styles/views/chat.css';

export function ChatView({
  snapshot,
  busy,
  mood,
  setMood,
  sendMessage
}: {
  snapshot: AppSnapshot;
  busy: boolean;
  mood?: string;
  setMood: (mood?: string) => void;
  sendMessage: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [wheelOpen, setWheelOpen] = useState(false);
  const [wheelAnchor, setWheelAnchor] = useState<{ x: number; y: number } | undefined>();
  const streamRef = useRef<HTMLDivElement>(null);
  const moodButtonRef = useRef<HTMLButtonElement>(null);

  const messages = snapshot.messages;
  const settings = snapshot.settings;
  const connectionText = busy ? '正在回复' : settings.ai.hasApiKey ? `${settings.ai.providerId} 在线` : '本地回复';
  const privacyText = settings.privateMode ? '私人模式' : '标准模式';

  useEffect(() => {
    const node = streamRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, busy]);

  async function submit() {
    const value = text.trim();
    if (!value || busy) return;
    setText('');
    await sendMessage(value);
  }

  function openWheel() {
    const rect = moodButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setWheelAnchor({ x: rect.left + rect.width / 2, y: rect.top });
    setWheelOpen(true);
  }

  return (
    <div className="page chat-page liquid-chat" data-view="chat">
      <section className="chat-surface" aria-label="与若涵的对话">
        <header className="chat-header">
          <div className="chat-identity">
            <h1 tabIndex={-1}>若涵</h1>
            <span className={cls('chat-presence', busy && 'is-busy')} role="status" aria-live="polite">
              <span className="chat-presence-dot" aria-hidden="true" />
              {connectionText}
            </span>
          </div>
          <div className="chat-security" aria-label={`${privacyText}, ${settings.privateMode ? '消息不外发' : connectionText}`}>
            {settings.privateMode ? <LockKeyhole aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
            <span>{privacyText}</span>
          </div>
        </header>

        <div className="chat-stream" ref={streamRef} role="log" aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 ? (
            <div className="chat-empty">
              <Heart aria-hidden="true" />
              <strong>我在。</strong>
              <span>想说什么就说什么。</span>
            </div>
          ) : (
            messages.map((message, index) => {
              const date = new Date(message.createdAt);
              const previous = index > 0 ? new Date(messages[index - 1].createdAt) : undefined;
              const showDay = !previous || !isSameDay(previous, date);
              const isLatest = index === messages.length - 1;
              return (
                <Fragment key={message.id}>
                  {showDay && <span className="chat-day-divider">{dayHeading(date)}</span>}
                  <div
                    className={cls('bubble-row', message.role === 'user' ? 'user' : 'companion', isLatest && 'is-latest')}
                    aria-label={`${message.role === 'user' ? '你' : '若涵'}, ${clockLabel(message.createdAt)}`}
                  >
                    <div className="chat-message-block">
                      <div className="bubble">{message.content}</div>
                      <span className="bubble-time">{clockLabel(message.createdAt)}</span>
                    </div>
                  </div>
                </Fragment>
              );
            })
          )}
        </div>

        <div className="chat-composer" data-chat-composer="true">
          <button
            ref={moodButtonRef}
            type="button"
            className={cls('icon-btn', 'chat-mood-button', mood && 'mood-set', wheelOpen && 'is-open')}
            title={mood ? `现在的心情:${mood}` : '记一下心情'}
            aria-label={mood ? `心情轮盘,当前心情${mood}` : '心情轮盘'}
            aria-haspopup="menu"
            aria-expanded={wheelOpen}
            onClick={openWheel}
          >
            <Heart />
          </button>
          <label className="field chat-input-field">
            <input
              value={text}
              placeholder="和她说..."
              aria-label="和若涵说"
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
          </label>
          <Button
            variant="primary"
            icon={<Send />}
            loading={busy}
            disabled={!text.trim()}
            onClick={() => void submit()}
            title="发送"
            className="chat-send-button"
          >
            <span className="chat-send-label">发送</span>
          </Button>
        </div>
      </section>

      <MoodWheel
        open={wheelOpen}
        anchor={wheelAnchor}
        moods={MOODS}
        value={mood}
        onClose={() => setWheelOpen(false)}
        onSelect={(value) => {
          setMood(value === mood ? undefined : value);
          if (value !== mood) toast(`记下了:${value}`, 'companion');
        }}
      />
    </div>
  );
}
