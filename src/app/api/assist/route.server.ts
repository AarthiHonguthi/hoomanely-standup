import Anthropic from "@anthropic-ai/sdk";
import { chatWithClaude, claudeConfigured, planWithClaude, RefusalError, tidyWithClaude } from "@/lib/ai/claude";
import { AI_LIMITS, type AssistRequest, type ChatTurn } from "@/lib/ai/types";

/**
 * POST /api/assist - tidy, plan or chat through Claude.
 * GET  /api/assist - reports whether Claude is configured.
 *
 * Without ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) every POST returns
 * 200 {offline: true} and the browser uses the built-in offline assistant.
 * This route has no authentication: it is meant for local use only.
 */

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ mode: claudeConfigured() ? "claude" : "offline" });
}

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function errorResponse(err: unknown) {
  if (err instanceof RefusalError) return bad(err.message, 422);
  if (err instanceof Anthropic.AuthenticationError) return bad("The AI key on the server was rejected. Check ANTHROPIC_API_KEY.", 502);
  if (err instanceof Anthropic.RateLimitError) return bad("The assistant is busy right now. Try again in a moment.", 429);
  if (err instanceof Anthropic.APIError) return bad(`The AI service returned an error (${err.status ?? "unknown"}).`, 502);
  if (err instanceof Anthropic.APIConnectionError) return bad("Couldn't reach the AI service.", 502);
  return bad("Something went wrong with the assistant.", 500);
}

export async function POST(request: Request) {
  let body: AssistRequest;
  try {
    body = (await request.json()) as AssistRequest;
  } catch {
    return bad("Invalid request.");
  }
  if (!claudeConfigured()) return Response.json({ offline: true });

  try {
    switch (body?.action) {
      case "tidy": {
        const i = body.input;
        if (!i || (i.kind !== "task" && i.kind !== "goal")) return bad("Invalid tidy request.");
        const result = await tidyWithClaude({
          kind: i.kind,
          title: clip(i.title, AI_LIMITS.title),
          notes: clip(i.notes, AI_LIMITS.notes),
          goalTitle: clip(i.goalTitle, AI_LIMITS.title) || undefined,
        });
        return Response.json({ result });
      }
      case "plan": {
        const text = clip(body.input?.text, AI_LIMITS.planText).trim();
        if (text.length < 5) return bad("Describe what you're working on first.");
        const goals = Array.isArray(body.input.goals)
          ? body.input.goals.slice(0, 50).map((g) => ({ id: clip(g.id, 64), title: clip(g.title, AI_LIMITS.title) }))
          : [];
        return Response.json({ result: await planWithClaude({ text, goals }) });
      }
      case "chat": {
        const messages: ChatTurn[] = (Array.isArray(body.messages) ? body.messages : [])
          .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim())
          .slice(-AI_LIMITS.chatTurns)
          .map((m) => ({ role: m.role, content: m.content.slice(0, AI_LIMITS.chatMessage) }));
        // The conversation must start with the user.
        while (messages.length && messages[0].role !== "user") messages.shift();
        if (!messages.length) return bad("Ask a question first.");
        const snapshot = clip(body.snapshot, AI_LIMITS.snapshot);
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              for await (const text of chatWithClaude(messages, snapshot)) controller.enqueue(encoder.encode(text));
            } catch (err) {
              const msg = err instanceof RefusalError ? err.message : "Sorry, the assistant hit an error. Try again.";
              controller.enqueue(encoder.encode(`\n\n${msg}`));
            }
            controller.close();
          },
        });
        return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
      }
      default:
        return bad("Unknown action.");
    }
  } catch (err) {
    return errorResponse(err);
  }
}
