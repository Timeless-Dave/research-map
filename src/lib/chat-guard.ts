/**
 * Request guards for the public, unauthenticated /api/chat endpoint.
 *
 * The endpoint forwards caller-supplied text to a paid model, so every request
 * is a cost and abuse surface. These guards bound what a single caller can spend
 * and reject the shapes that let a caller steer the model.
 */

export const CHAT_LIMITS = {
  /** Reject the body before parsing it. */
  maxBodyBytes: 16 * 1024,
  /** Most a caller may send in one turn. */
  maxMessageChars: 2_000,
  /** Total characters across the whole submitted conversation. */
  maxTotalChars: 12_000,
  /** Messages accepted per request. */
  maxMessages: 40,
  /** Trailing messages actually forwarded to the model, bounding token cost. */
  maxForwardedMessages: 12,
  /** Requests allowed per client per window. */
  rateLimitRequests: 20,
  rateLimitWindowMs: 60_000,
  /** Hard stop on a hung upstream call. */
  upstreamTimeoutMs: 20_000,
} as const;

export type ChatRole = "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type ChatParseResult =
  | { ok: true; messages: ChatMessage[] }
  | { ok: false; status: number; error: string };

/**
 * `system` and `developer` roles are rejected rather than filtered: the route
 * spreads caller messages after its own system prompt, so accepting a
 * caller-supplied privileged role would let the caller override the persona and
 * the "do not fabricate" rules that follow it.
 */
function isChatRole(value: unknown): value is ChatRole {
  return value === "user" || value === "assistant";
}

export function parseChatMessages(raw: unknown): ChatParseResult {
  if (typeof raw !== "object" || raw === null || !("messages" in raw)) {
    return { ok: false, status: 400, error: "Invalid request body." };
  }

  const messages = (raw as { messages: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, status: 400, error: "Invalid messages." };
  }
  if (messages.length > CHAT_LIMITS.maxMessages) {
    return { ok: false, status: 413, error: "Conversation is too long. Start a new chat." };
  }

  const parsed: ChatMessage[] = [];
  let totalChars = 0;

  for (const message of messages) {
    if (typeof message !== "object" || message === null) {
      return { ok: false, status: 400, error: "Invalid message entry." };
    }
    const { role, content } = message as { role?: unknown; content?: unknown };

    if (!isChatRole(role)) {
      return { ok: false, status: 400, error: "Unsupported message role." };
    }
    if (typeof content !== "string") {
      return { ok: false, status: 400, error: "Message content must be text." };
    }
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return { ok: false, status: 400, error: "Message content must not be empty." };
    }
    if (trimmed.length > CHAT_LIMITS.maxMessageChars) {
      return { ok: false, status: 413, error: "That message is too long." };
    }

    totalChars += trimmed.length;
    if (totalChars > CHAT_LIMITS.maxTotalChars) {
      return { ok: false, status: 413, error: "Conversation is too long. Start a new chat." };
    }

    parsed.push({ role, content: trimmed });
  }

  return { ok: true, messages: parsed };
}

/** Keep the tail of the conversation so cost per request stays bounded. */
export function forwardableMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-CHAT_LIMITS.maxForwardedMessages);
}

// ── Rate limiting ───────────────────────────────────────────────────────────
// In-process fixed-window counter. This bounds abuse from a single client
// against a single instance; it is NOT a substitute for a shared store
// (Redis/Upstash) once the app runs on more than one instance.
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  clientKey: string,
  now = Date.now()
): { allowed: boolean; retryAfterSeconds: number } {
  const existing = hits.get(clientKey);

  if (!existing || now >= existing.resetAt) {
    hits.set(clientKey, { count: 1, resetAt: now + CHAT_LIMITS.rateLimitWindowMs });
    if (hits.size > 10_000) pruneExpired(now);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > CHAT_LIMITS.rateLimitRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

function pruneExpired(now: number) {
  for (const [key, entry] of hits) {
    if (now >= entry.resetAt) hits.delete(key);
  }
}

/** Test seam — the counter is module-global. */
export function resetRateLimits() {
  hits.clear();
}

export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}
