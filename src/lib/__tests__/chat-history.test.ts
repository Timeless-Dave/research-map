import { expect, test } from 'vitest';
import { boundedChatHistory } from '../chat-history';
import { CHAT_LIMITS, parseChatMessages } from '../chat-guard';

test('long conversations and oversized assistant replies stay valid on the wire', () => {
  for (const content of ['a'.repeat(4000), '漢'.repeat(4000), '😀'.repeat(2000)]) {
    const messages = boundedChatHistory([...Array.from({ length: 60 }, () => ({ role: 'assistant' as const, content })), { role: 'user', content: 'Latest question' }]);
    expect(messages.at(-1)?.content).toBe('Latest question');
    expect(parseChatMessages({ messages }).ok).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify({ messages })).length).toBeLessThanOrEqual(CHAT_LIMITS.maxBodyBytes);
    expect(messages.length).toBeLessThanOrEqual(CHAT_LIMITS.maxForwardedMessages);
  }
});
