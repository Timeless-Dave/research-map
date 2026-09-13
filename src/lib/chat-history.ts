import { CHAT_LIMITS, type ChatMessage } from './chat-guard';

/** Keep displayed history intact; bound only the wire payload, including UTF-8. */
export function boundedChatHistory(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  const encoder = new TextEncoder();
  let chars = 0;
  for (const message of messages.slice(-CHAT_LIMITS.maxForwardedMessages).reverse()) {
    const content = message.content.trim().slice(0, CHAT_LIMITS.maxMessageChars);
    if (!content) continue;
    const candidate = [{ role: message.role, content }, ...result];
    if (chars + content.length > CHAT_LIMITS.maxTotalChars || encoder.encode(JSON.stringify({ messages: candidate })).length > CHAT_LIMITS.maxBodyBytes) break;
    result.unshift({ role: message.role, content });
    chars += content.length;
  }
  return result;
}
