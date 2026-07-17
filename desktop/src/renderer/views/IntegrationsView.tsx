import { ArrowRight, CalendarDays, Inbox, Mail, MessageSquare, ShieldCheck } from 'lucide-react';
import type { AppSnapshot, SourceKind } from '../../shared/types';
import { Button, EmptyState } from '../ui/kit';
import '../styles/views/integrations.css';

const SOURCES: Array<{
  source: Extract<SourceKind, 'feishu' | 'email' | 'wechat' | 'icloud'>;
  icon: typeof Inbox;
  name: string;
  detail: string;
}> = [
  {
    source: 'feishu',
    icon: Inbox,
    name: '飞书',
    detail: '待办与会议邀请进入待确认队列。'
  },
  {
    source: 'email',
    icon: Mail,
    name: '邮箱',
    detail: '.eml 或 IMAP 中的时间与任务线索。'
  },
  {
    source: 'wechat',
    icon: MessageSquare,
    name: '微信',
    detail: '仅处理你主动导出的聊天记录。'
  },
  {
    source: 'icloud',
    icon: CalendarDays,
    name: 'iCloud 日历',
    detail: '通过 ICS 或 CalDAV 接入已有日程。'
  }
];

const SOURCE_LABELS: Partial<Record<SourceKind, string>> = {
  feishu: '飞书',
  email: '邮箱',
  wechat: '微信',
  icloud: 'iCloud 日历',
  ai: 'AI 解析',
  import: '导入',
  manual: '手动'
};

const RISK_LABELS = {
  low: '低风险',
  medium: '需核对',
  high: '高风险'
};

function dueLabel(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function IntegrationsView({
  snapshot,
  goPlanner
}: {
  snapshot: AppSnapshot;
  goPlanner: () => void;
}) {
  const draftClues = snapshot.externalClues.filter((clue) => clue.status === 'draft');

  return (
    <div className="page integrations-page" data-view="integrations">
      <div className="integrations-surface">
        <div className="page-head integrations-page-head">
          <div>
            <h1 tabIndex={-1}>接入</h1>
            <span>外部线索先确认，再进入任务</span>
          </div>
        </div>

        <div className="integrations-workspace">
          <section className="card integration-queue" aria-labelledby="integration-queue-title">
            <div className="integration-section-head">
              <div>
                <h2 id="integration-queue-title">待确认队列</h2>
                <span className="integration-queue-count" key={draftClues.length} aria-live="polite">
                  {draftClues.length > 0 ? `${draftClues.length} 条待处理` : '当前为空'}
                </span>
              </div>
              <Button variant={draftClues.length > 0 ? 'tinted' : 'plain'} size="sm" icon={<ArrowRight />} onClick={goPlanner}>
                去规划页处理
              </Button>
            </div>

            <div className="integration-boundary">
              <ShieldCheck aria-hidden="true" />
              <span>确认后才写入任务，忽略不会创建任务。</span>
            </div>

            <div className="integration-queue-state" key={draftClues.length === 0 ? 'empty' : draftClues.map((clue) => clue.id).join(':')}>
              {draftClues.length === 0 ? (
                <EmptyState icon={<Inbox />} title="队列已清空" text="新的外部线索会先停在这里。" />
              ) : (
                <div className="integration-clue-list">
                  {draftClues.map((clue) => {
                    const due = dueLabel(clue.suggestedDueAt);
                    return (
                      <div className="integration-clue-row" key={clue.id}>
                        <div className="integration-clue-main">
                          <span className="integration-clue-title">{clue.suggestedTitle}</span>
                          <span className="integration-clue-summary">{clue.rawSummary}</span>
                        </div>
                        <div className="integration-clue-meta">
                          <span>{SOURCE_LABELS[clue.source] ?? clue.source}</span>
                          <span className={`risk-${clue.risk}`}>{RISK_LABELS[clue.risk]}</span>
                          {due && <span>{due}</span>}
                        </div>
                      </div>
                    );
                  })}
                  <p className="integration-queue-footnote">在规划页逐条确认或忽略。</p>
                </div>
              )}
            </div>
          </section>

          <section className="integration-sources" aria-labelledby="integration-sources-title">
            <div className="integration-section-head integration-sources-head">
              <div>
                <h2 id="integration-sources-title">来源状态</h2>
                <span>{SOURCES.length} 个规划来源</span>
              </div>
            </div>

            <div className="integration-grid integration-source-list">
              {SOURCES.map((source) => {
                const SourceIcon = source.icon;
                const pendingCount = draftClues.filter((clue) => clue.source === source.source).length;
                return (
                  <div className="integration-source-row" data-status="planned" key={source.source}>
                    <span className="integration-source-icon" aria-hidden="true">
                      <SourceIcon />
                    </span>
                    <div className="integration-source-main">
                      <div className="integration-source-title">
                        <span>{source.name}</span>
                        <span className="integration-source-status">
                          <i aria-hidden="true" />
                          规划中
                        </span>
                      </div>
                      <p>{source.detail}</p>
                      {pendingCount > 0 && (
                        <span className="integration-source-activity" key={`${source.source}-${pendingCount}`}>
                          {pendingCount} 条线索在队列
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
