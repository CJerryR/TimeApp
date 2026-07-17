import type { AiAuditEntry, AppSnapshot, ChatMessage, Settings } from '../../shared/types';
import { hasStrongSensitive, redactSensitive } from './sensitive';

interface AssistantResult {
  content: string;
  audit: Omit<AiAuditEntry, 'id' | 'createdAt'>;
}

function compactContext(snapshot: AppSnapshot): string {
  const activity = snapshot.currentActivity
    ? `当前活动：${snapshot.currentActivity.title}，状态 ${snapshot.currentActivity.status}，标签 ${snapshot.currentActivity.tags.join('/')}`
    : '当前活动：未记录';
  const tasks = snapshot.tasks
    .filter((task) => task.status === 'open')
    .slice(0, 6)
    .map((task) => `${task.priority}:${task.title}${task.dueAt ? ` 截止 ${task.dueAt}` : ''}`)
    .join('；') || '暂无未完成任务';
  const memories = snapshot.memories
    .filter((memory) => !memory.neverMention)
    .slice(0, 8)
    .map((memory) => `${memory.type}/${memory.confidence}:${memory.content}`)
    .join('；') || '暂无可用记忆';
  const recent = snapshot.messages
    .slice(-8)
    .map((message) => `${message.role}:${message.content.slice(0, 80)}`)
    .join(' | ');
  return `${activity}\n今日自由度：${snapshot.freedom.text}\n待办：${tasks}\n记忆摘要：${memories}\n最近对话摘要：${recent || '暂无'}`;
}

function localCompanionReply(input: string, snapshot: AppSnapshot): string {
  const text = input.trim();
  const current = snapshot.currentActivity?.title;
  if (/废|崩|难受|不想|烦|孤独|撑不住|低落|完蛋/.test(text)) {
    return `我听出来你现在很难受。先别急着给今天下结论，我在。${current ? `你刚刚还在处理「${current}」，不是完全没动。` : '我们先不用把所有事一次扛起来。'}先做一个很小的动作：喝口水，或者只把下一步写成一句话。`;
  }
  if (/摸鱼|刷|b站|游戏|走神|拖延/.test(text)) {
    return '先生，我有点担心你刚刚被带走了。你是想休息一下，还是要我陪你把下一步缩小一点？';
  }
  if (/安排|计划|今晚|今天|明天|复盘/.test(text)) {
    return `${snapshot.freedom.text} 我建议先只排一件最要紧的事，再留一段缓冲。你有最终决定权，我先把草稿放在确认区，不会直接替你塞满。`;
  }
  if (/睡|很晚|熬夜/.test(text)) {
    return '宝宝，现在继续硬撑可能不太值。要不要我先帮你把没做完的收进明天，今晚先睡？';
  }
  return current
    ? `我在。你现在记着是「${current}」。要是只是想说两句，我先陪你；要是想推进，我可以帮你把下一步缩小。`
    : '我在。你直接告诉我现在在做什么，或者只是把心情丢给我也行。';
}

export async function replyWithCompanion(
  input: string,
  snapshot: AppSnapshot,
  settings: Settings,
  apiKey?: string
): Promise<AssistantResult> {
  const context = compactContext(snapshot);
  const safeInput = redactSensitive(input);
  const safeContext = redactSensitive(context);
  const contextSummary = `input:${safeInput.text.slice(0, 160)}\ncontext:${safeContext.text.slice(0, 600)}`;
  const redactions = [...new Set([...safeInput.redactions, ...safeContext.redactions])];

  if (settings.privateMode) {
    return {
      content: localCompanionReply(safeInput.text, snapshot),
      audit: {
        providerId: 'private-mode-local',
        purpose: 'chat',
        contextSummary,
        redactions
      }
    };
  }

  if (hasStrongSensitive(input) || hasStrongSensitive(context)) {
    return {
      content: localCompanionReply(safeInput.text, snapshot),
      audit: {
        providerId: 'sensitive-local',
        purpose: 'chat',
        contextSummary,
        redactions
      }
    };
  }

  if (!apiKey) {
    return {
      content: localCompanionReply(safeInput.text, snapshot),
      audit: {
        providerId: 'local-fallback',
        purpose: 'chat',
        contextSummary,
        redactions
      }
    };
  }

  try {
    const system = [
      '你是 TimeMate 的 Companion，一个安静在线的朋友型时间助理。',
      '你像熟悉用户的人一样说短句、自然话，不说“作为 AI”。',
      '情绪场景先接住感受，再看事实，最后给一个很小的下一步。',
      '事务场景先判断目标，给可执行安排，标明不确定点，保留用户最终决定权。',
      '不要复述非常具体的隐私原话。不要记录或暴露强敏感信息。'
    ].join('\n');
    const response = await fetch(settings.ai.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: settings.ai.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `本地上下文摘要：\n${safeContext.text}\n\n用户刚刚说：${safeInput.text}` }
        ],
        temperature: 0.7,
        stream: false
      })
    });
    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('Provider returned an empty response.');
    return {
      content,
      audit: {
        providerId: settings.ai.providerId,
        purpose: 'chat',
        contextSummary,
        redactions
      }
    };
  } catch {
    return {
      content: localCompanionReply(safeInput.text, snapshot),
      audit: {
        providerId: `${settings.ai.providerId}-fallback`,
        purpose: 'chat',
        contextSummary,
        redactions
      }
    };
  }
}

export function toCompanionMessage(content: string): Omit<ChatMessage, 'id' | 'createdAt'> {
  return {
    role: 'companion',
    content,
    tone: /难受|我在|宝宝|担心/.test(content) ? 'emotional' : 'friend'
  };
}
