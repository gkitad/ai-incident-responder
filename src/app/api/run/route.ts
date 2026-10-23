import { advance, decide, newRun, publicView, type Emit } from "@/lib/agent";
import { SCENARIOS, type ScenarioId } from "@/lib/infra";
import { seal, unseal, type RunState } from "@/lib/state";

export const maxDuration = 120;

// Best-effort limits per server instance, so the public demo can't run up the
// API bill. Pair them with a monthly spend limit in the Claude Console.
const WINDOW_MS = 10 * 60 * 1000;
const LIMITS = { start: 6, any: 40 };
const hits = new Map<string, number[]>();

function limited(key: string, max: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  const over = recent.length >= max;
  if (!over) recent.push(now);
  hits.set(key, recent);
  return over;
}

const json = (message: string, status: number) => Response.json({ error: message }, { status });

const CHOICES = new Set<string>(["mystery", ...SCENARIOS.map((s) => s.id)]);

export async function POST(request: Request) {
  let body: { action?: string; scenario?: string; token?: string };
  try {
    body = await request.json();
  } catch {
    return json("The request wasn't valid JSON.", 400);
  }

  if (process.env.MOCK_AGENT !== "1" && !process.env.ANTHROPIC_API_KEY) {
    return json("The agent isn't configured yet: ANTHROPIC_API_KEY is missing on the server.", 503);
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(`any:${ip}`, LIMITS.any)) return json("Too many requests in a short time. Wait a few minutes and try again.", 429);

  let state: RunState;
  const action = body.action;
  if (action === "start") {
    if (!body.scenario || !CHOICES.has(body.scenario)) return json("Pick a failure to inject.", 400);
    if (limited(`start:${ip}`, LIMITS.start)) {
      return json("You've started several incidents in a short time. Wait a few minutes and try again.", 429);
    }
    state = newRun(body.scenario as ScenarioId | "mystery");
  } else if (action === "approve" || action === "deny") {
    const restored = typeof body.token === "string" ? unseal(body.token) : null;
    if (!restored) return json("This incident couldn't be resumed. Start a new one.", 400);
    if (!restored.pending) return json("There's nothing waiting for approval.", 409);
    state = restored;
  } else {
    return json("Unknown action.", 400);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit: Emit = (msg) => controller.enqueue(encoder.encode(JSON.stringify(msg) + "\n"));
      if (action === "start") emit({ type: "view", view: publicView(state) });
      try {
        if (action === "start") await advance(state, emit);
        else await decide(state, action === "approve", emit);
      } catch (e) {
        console.error("incident run failed", e);
        const status = e instanceof Error && "status" in e ? Number((e as { status: number }).status) : 0;
        const message =
          status === 429 || status === 529
            ? "The AI service is busy right now. Try again in a minute."
            : "The agent hit an error and stopped.";
        const event = { id: `err${Date.now()}`, type: "error" as const, message };
        state.events.push(event);
        emit({ type: "event", event });
        state.pending = null;
        state.done = true;
      }
      emit({ type: "final", token: seal(state), view: publicView(state) });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
