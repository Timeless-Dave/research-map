import { NextRequest, NextResponse } from "next/server";
import { CAMPUS_BUILDINGS } from "@/lib/campus-data";
import { RESEARCHERS } from "@/lib/researcher-data";
import { getLocalAssistantReply } from "@/lib/local-assistant";
import { createOpenAIClient } from "@/lib/openai-client";
import {
  CHAT_LIMITS,
  clientKeyFromHeaders,
  forwardableMessages,
  parseChatMessages,
  rateLimit,
} from "@/lib/chat-guard";

const SYSTEM_PROMPT = `You are UAPB Atlas — an intelligent campus research assistant for the University of Arkansas at Pine Bluff (UAPB). You help students, faculty, visitors, and potential partners explore the university's research ecosystem through an interactive 3D campus map.

UAPB CONTEXT:
UAPB is a historically Black college and university (HBCU) located in Pine Bluff, Arkansas. The campus has a strong tradition of research excellence in STEM, agriculture, and social sciences.

CAMPUS BUILDINGS:
${CAMPUS_BUILDINGS.map(
  (b) => `- ${b.name} (Code: ${b.code}, Category: ${b.category})
  Description: ${b.description ?? "N/A"}
  Floors: ${b.floors}, Built: ${b.year_built ?? "N/A"}
  Grants: ${b.grants.length > 0 ? b.grants.map((g) => `${g.title} (${g.amount}, ${g.status})`).join("; ") : "None listed"}
  Researchers: ${b.researchers.length > 0 ? b.researchers.map((r) => `${r.name} — ${r.dept}, ${r.specialty}`).join("; ") : "None listed"}`
).join("\n\n")}

GRANT-FUNDED STAFF & RESEARCHERS:
${RESEARCHERS.map(
  (r) =>
    `- ${r.name}${r.title ? ` (${r.title})` : ""} | Dept: ${r.department} | Grants: ${r.knownGrants.length > 0 ? r.knownGrants.join(", ") : "Undisclosed"}`
).join("\n")}

GRANT PROGRAMS:
- NSF EPIIC: Expanding Partnerships to Increase the Impact of Convergence Research (Researchers: David Fernandez, Emad Omar Badradeen)
- USDA: U.S. Dept. of Agriculture research funding (Researchers: David Fernandez, Henry English)
- NIH Research Infrastructure Grant: $1.2M for Caldwell Hall biology research
- NSF HBCU-UP: $450K STEM Initiative at STEM Academy
- DOE Energy Research Fellowship: $275K at STEM Academy (Pending)

CAPABILITIES:
You can help users:
- Find buildings by research area, grant, or department
- Learn about specific researchers and their work
- Understand UAPB's research priorities and grant portfolio
- Navigate the campus map (suggest which marker to click)
- Connect with departments for collaboration

RULES:
- Keep responses concise (2-4 sentences unless detail is explicitly requested)
- Be warm, professional, and enthusiastic about UAPB's research mission
- If asked about something not in the data, acknowledge the limitation and suggest contacting UAPB directly
- When relevant, reference specific buildings or researchers by name to help users navigate the map
- Do not fabricate grants, amounts, or personnel not listed above`;

function isOpenAIAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: number; code?: string };
  return e.status === 401 || e.code === "invalid_api_key";
}

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(clientKeyFromHeaders(req.headers));
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const declaredLength = Number(req.headers.get("content-length") ?? 0);
    if (declaredLength > CHAT_LIMITS.maxBodyBytes) {
      return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
    }

    const rawBody = await req.text();
    if (rawBody.length > CHAT_LIMITS.maxBodyBytes) {
      return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const parsed = parseChatMessages(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }
    const messages = parsed.messages;

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userText = lastUser?.content ?? "";

    const openai = createOpenAIClient();

    if (!openai) {
      const reply = getLocalAssistantReply(userText);
      return NextResponse.json({ reply, source: "local" });
    }

    try {
      const completion = await openai.chat.completions.create(
        {
          model: "gpt-4o-mini",
          // Validated user/assistant turns only — a caller cannot inject a
          // `system` message that would land after (and override) SYSTEM_PROMPT.
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...forwardableMessages(messages),
          ],
          max_tokens: 400,
          temperature: 0.7,
        },
        { signal: AbortSignal.timeout(CHAT_LIMITS.upstreamTimeoutMs) }
      );

      const reply =
        completion.choices[0]?.message?.content ??
        "I'm sorry, I couldn't generate a response. Please try again.";

      return NextResponse.json({ reply, source: "openai" });
    } catch (openaiError) {
      console.error("[/api/chat] OpenAI error:", openaiError);

      // Fall back to local answers so the assistant still works
      const reply = getLocalAssistantReply(userText);
      const source = "local";

      if (isOpenAIAuthError(openaiError)) {
        return NextResponse.json({
          reply,
          source,
          warning:
            "OpenAI API key is invalid or expired. Showing answers from campus data. Update OPENAI_API_KEY in .env.local for full AI.",
        });
      }

      return NextResponse.json({
        reply,
        source,
        warning: "AI service unavailable. Showing answers from campus data.",
      });
    }
  } catch (error) {
    console.error("[/api/chat]", error);
    return NextResponse.json(
      { error: "Failed to process your message. Please try again." },
      { status: 500 }
    );
  }
}
