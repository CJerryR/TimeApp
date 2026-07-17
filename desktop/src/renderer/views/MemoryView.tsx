import { useEffect, useRef, useState } from 'react';
import { ArrowUpCircle, Brain, ChevronDown, EyeOff, Plus, Search, ShieldOff, Trash2 } from 'lucide-react';
import type { AppSnapshot, MemoryConfidence, MemoryType } from '../../shared/types';
import { Button, Chip, EmptyState, Field, IconButton, Segmented, Sheet, cls } from '../ui/kit';
import { CONFIDENCES, MEMORY_TYPES, confidenceLabel, filterMemories, memoryTypeLabel } from '../lib/format';
import '../styles/views/memory.css';

type TypeFilter = MemoryType | 'all';

function motionExitDelay() {
  if (document.documentElement.hasAttribute('data-reduce-motion')) return 0;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
  return 180;
}

export function MemoryView({
  snapshot,
  busy,
  run
}: {
  snapshot: AppSnapshot;
  busy: boolean;
  run: (action: () => Promise<AppSnapshot | void>) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [listOpen, setListOpen] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newType, setNewType] = useState<MemoryType>('fact');
  const [newConfidence, setNewConfidence] = useState<MemoryConfidence>('inferred');
  const [content, setContent] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | undefined>();
  const [removingId, setRemovingId] = useState<string | undefined>();
  const confirmTimer = useRef<number | undefined>(undefined);
  const removeTimer = useRef<number | undefined>(undefined);

  const normalizedQuery = query.trim();
  const list = filterMemories(snapshot.memories, normalizedQuery, typeFilter);
  const hasFilters = Boolean(normalizedQuery) || typeFilter !== 'all';
  const listStateKey = `${typeFilter}:${normalizedQuery}:${list.map((memory) => memory.id).join(',')}`;

  useEffect(() => {
    return () => {
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
      if (removeTimer.current) window.clearTimeout(removeTimer.current);
    };
  }, []);

  useEffect(() => {
    setConfirmingId(undefined);
  }, [normalizedQuery, typeFilter]);

  function armDelete(id: string) {
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    setConfirmingId(id);
    confirmTimer.current = window.setTimeout(() => setConfirmingId(undefined), 3200);
  }

  function deleteMemory(id: string) {
    if (removingId) return;
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    setConfirmingId(undefined);
    setRemovingId(id);
    removeTimer.current = window.setTimeout(() => {
      void run(() => window.timeMate.deleteMemory(id)).finally(() => {
        setRemovingId((current) => (current === id ? undefined : current));
      });
    }, motionExitDelay());
  }

  function clearFilters() {
    setQuery('');
    setTypeFilter('all');
  }

  async function addMemory() {
    const value = content.trim();
    if (!value) return;
    await run(() => window.timeMate.createMemory({ type: newType, confidence: newConfidence, content: value, tags: [] }));
    setContent('');
    setAddOpen(false);
    setListOpen(true);
  }

  const typeOptions: Array<{ value: TypeFilter; label: string }> = [
    { value: 'all', label: '全部' },
    ...MEMORY_TYPES.map((type) => ({ value: type as TypeFilter, label: memoryTypeLabel(type) }))
  ];

  return (
    <div className="page memory-page" data-view="memory">
      <div className="memory-surface">
        <div className="page-head memory-page-head">
          <div>
            <h1 tabIndex={-1}>记忆</h1>
            <span className="memory-page-count">{snapshot.memories.length} 条已保存</span>
          </div>
          <div className="page-head-actions">
            <Button variant="primary" icon={<Plus />} onClick={() => setAddOpen(true)}>
              记一条
            </Button>
          </div>
        </div>

        <div className="memory-toolbar" aria-label="搜索与筛选记忆">
          <div className="memory-search-row">
            <Field value={query} onChange={setQuery} placeholder="搜索内容或标签" icon={<Search />} ariaLabel="搜索记忆" />
            <span className="memory-result-count" aria-live="polite">
              {list.length} 条结果
            </span>
          </div>
          <div className="memory-filter-row">
            <label className="memory-filter-select">
              <span>类型</span>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)} aria-label="按类型筛选">
                {typeOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <section className="card memory-list-region" aria-labelledby="memory-list-title">
          <div className="memory-list-head">
            <div>
              <h2 id="memory-list-title">她记住了什么</h2>
              <span>{hasFilters ? '当前筛选' : '全部记忆'}</span>
            </div>
            <button
              type="button"
              className="memory-list-toggle"
              aria-label={listOpen ? '收起记忆列表' : '展开记忆列表'}
              aria-expanded={listOpen}
              title={listOpen ? '收起记忆列表' : '展开记忆列表'}
              onClick={() => setListOpen((open) => !open)}
            >
              <ChevronDown />
            </button>
          </div>

          <div
            className={cls('memory-list-collapse', !listOpen && 'is-collapsed')}
            aria-hidden={!listOpen}
            inert={!listOpen ? '' : undefined}
          >
            <div className="memory-list-collapse-inner">
              <div className="memory-list-state" key={listStateKey}>
                {list.length === 0 ? (
                  <EmptyState
                    icon={<Brain />}
                    title={snapshot.memories.length === 0 ? '还没有记忆' : '没找到匹配的记忆'}
                    text={snapshot.memories.length === 0 ? '可以手动记录事实、目标、偏好或边界。' : '换个关键词或清除当前筛选。'}
                    action={
                      snapshot.memories.length === 0 ? undefined : (
                        <Button size="sm" variant="plain" onClick={clearFilters}>
                          清除筛选
                        </Button>
                      )
                    }
                  />
                ) : (
                  <div className="list memory-list">
                    {list.map((memory) => {
                      const isConfirming = confirmingId === memory.id;
                      const isRemoving = removingId === memory.id;
                      return (
                        <div className={cls('memory-row-shell', isRemoving && 'is-removing')} key={memory.id}>
                          <div className="list-row memory-row">
                            <span className={cls('type-dot', memory.type)} aria-hidden="true" />
                            <div className="row-main">
                              <span className="row-title memory-content">{memory.content}</span>
                              <span className="row-sub memory-meta">
                                <span>{memoryTypeLabel(memory.type)}</span>
                                <Chip
                                  size="sm"
                                  tone={
                                    memory.confidence === 'confirmed'
                                      ? 'positive'
                                      : memory.confidence === 'inferred'
                                        ? 'warning'
                                        : 'neutral'
                                  }
                                >
                                  {confidenceLabel(memory.confidence)}
                                </Chip>
                                {memory.neverMention && (
                                  <Chip size="sm" tone="critical" icon={<ShieldOff />}>
                                    不再提
                                  </Chip>
                                )}
                              </span>
                            </div>
                            <div className={cls('row-actions', 'memory-row-actions', isConfirming && 'is-confirming')}>
                              {isConfirming ? (
                                <div className="memory-delete-confirm" role="group" aria-label="确认删除这条记忆">
                                  <span>确定删除？</span>
                                  <Button size="sm" variant="danger-plain" loading={busy || isRemoving} onClick={() => deleteMemory(memory.id)}>
                                    确认
                                  </Button>
                                  <Button size="sm" variant="plain" disabled={isRemoving} onClick={() => setConfirmingId(undefined)}>
                                    取消
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  {memory.confidence === 'inferred' && (
                                    <Button
                                      size="sm"
                                      variant="plain"
                                      icon={<ArrowUpCircle />}
                                      title="她确认了，这条从推测升级为事实"
                                      disabled={isRemoving}
                                      onClick={() => void run(() => window.timeMate.updateMemory(memory.id, { confidence: 'confirmed' }))}
                                    >
                                      升为事实
                                    </Button>
                                  )}
                                  <IconButton
                                    icon={<EyeOff />}
                                    label={memory.neverMention ? '恢复可提' : '不要再提'}
                                    disabled={isRemoving}
                                    onClick={() => void run(() => window.timeMate.updateMemory(memory.id, { neverMention: !memory.neverMention }))}
                                  />
                                  <IconButton icon={<Trash2 />} label="删除这条记忆" danger disabled={isRemoving} onClick={() => armDelete(memory.id)} />
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <Sheet
        open={addOpen}
        title="记一条"
        subtitle="写给她的备注：目标、情绪模式、偏好、边界都可以。"
        onClose={() => setAddOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button variant="primary" icon={<Brain />} loading={busy} disabled={!content.trim()} onClick={() => void addMemory()}>
              记下来
            </Button>
          </>
        }
      >
        <div className="task-add-meta">
          <Segmented
            value={newType}
            options={MEMORY_TYPES.map((type) => ({ value: type, label: memoryTypeLabel(type) }))}
            onChange={setNewType}
            ariaLabel="记忆类型"
          />
        </div>
        <div className="task-add-meta">
          <Segmented
            value={newConfidence}
            options={CONFIDENCES.map((confidence) => ({ value: confidence, label: confidenceLabel(confidence) }))}
            onChange={setNewConfidence}
            ariaLabel="置信度"
          />
        </div>
        <textarea
          className="area"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="例如：晚上计划乱掉时容易自责，提醒要轻一点。"
          aria-label="记忆内容"
        />
      </Sheet>
    </div>
  );
}
