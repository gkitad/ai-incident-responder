import Anthropic from "@anthropic-ai/sdk";
import { randomInt } from "node:crypto";
import {
  applyFix,
  fixRisk,
  newInfra,
  scenarioInfo,
  SCENARIOS,
  serviceRestored,
  truth,
  validateFix,
  type Health,
  type NodeId,
  type ScenarioId,
} from "./infra";
import { DIAGNOSTICS, FIXES, LABELS, runDiagnostic, targetOf, tools } from "./tools";
import type { RunState } from "./state";
import type { Hypothesis, MapState, Postmortem, RunEvent, StreamMessage, View } from "./types";
import { mockModel } from "./mock";

export const MODEL = process.env.AGENT_MODEL ?? "claude-haiku-5-5";

/** Hard cap on model calls per incident, kept in the encrypted state. */
export const MAX_STEPS = 30;

const SYSTEM = `You are the on-call engineer for Lakeside Logistics' IT team. A user has reported a problem with the CRM. You can only see the infrastructure through the tools provided, which run against a simulated but realistic stack.

How to work:
1. Reproduce the problem first with run_synthetic_check from where the user is. Look at the topology if you need the layout.
2. Once you've reproduced it, call update_hypotheses with two to four candidate causes. Call it again whenever evidence rules one out or confirms one.
3. Follow the evidence along the dependency chain from the user inward. Check the change log: recent changes often explain an outage, but not every change is guilty.
4. Don't change anything until you have evidence for the cause. Restarting things at random is not acceptable. Every fix pauses for a person's approval automatically.
5. Restore service first, with the smallest safe fix from the tools you have: free_disk_space, restart_service, renew_certificate, update_dns_record, resync_clock, clear_stale_sessions. Deeper repairs you can't make with these tools (fixing a mount, changing a config, reverting a change) go in the postmortem's action items. If a fix is rejected, pick another of these tools; don't give up while a reasonable fix is available. After a fix, run run_synthetic_check again to verify. If the check still fails, keep investigating.
6. Finish by calling submit_postmortem exactly once. Name the root cause and the trigger separately, and include action items that would stop it happening again.

Every diagnostic and fix needs a reason: one plain sentence a hiring manager watching could follow. Don't write text between tool calls; the reasons and hypotheses carry your thinking. Aim to resolve the incident in fewer than 20 tool calls. If a fix is denied, look for another safe option or document the incident as unresolved.`;

let client: Anthropic | null = null;

async function callModel(state: RunState): Promise<Pick<Anthropic.Message, "content" | "stop_reason">> {
  if (process.env.MOCK_AGENT === "1") return mockModel(state);
  client ??= new Anthropic();
  return client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: SYSTEM,
    tools,
    tool_choice: { type: "auto", disable_parallel_tool_use: true },
    messages: state.messages,
  });
}

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });

export function newRun(choice: ScenarioId | "mystery"): RunState {
  const now = Date.now();
  const scenario = choice === "mystery" ? SCENARIOS[randomInt(SCENARIOS.length)].id : choice;
  const info = scenarioInfo(scenario);
  const incidentId = `INC${randomInt(40000, 99999)}`;
  return {
    v: 1,
    incidentId,
    mystery: choice === "mystery",
    startedAt: now,
    infra: newInfra(scenario, now),
    messages: [
      {
        role: "user",
        content: `Incident ${incidentId} opened at ${timeFmt.format(new Date(now))} Central. Reported by ${info.reporter}, ${
          info.location === "office" ? "in the office" : "working from home"
        }:\n\n"${info.complaint}"\n\nInvestigate and resolve it.`,
      },
    ],
    events: [],
    hypotheses: [],
    map: { [info.location]: { health: "fail", order: 0 } },
    focus: info.location,
    pending: null,
    done: false,
    steps: 0,
    agentMs: 0,
    fixesApplied: 0,
  };
}

export function publicView(state: RunState): View {
  const info = scenarioInfo(state.infra.scenario);
  const done = state.done;
  return {
    incidentId: state.incidentId,
    mystery: state.mystery,
    scenarioTitle: state.mystery && !done ? null : info.title,
    reporter: info.reporter,
    complaint: info.complaint,
    location: info.location,
    startedAt: state.startedAt,
    events: state.events,
    hypotheses: state.hypotheses,
    map: state.map,
    focus: state.focus,
    pending: state.pending !== null,
    done,
    result: done
      ? {
          restored: serviceRestored(state.infra),
          scenarioTitle: info.title,
          explanation: info.explanation,
          rootNode: info.rootNode,
          truth: truth(state.infra),
          fixesApplied: state.fixesApplied,
          toolCalls: state.events.filter((e) => e.type === "check" || e.type === "change").length,
          agentSeconds: Math.round(state.agentMs / 1000),
        }
      : null,
  };
}

const PM_TEXT = ["title", "severity", "status", "summary", "root_cause", "trigger", "impact", "resolution"] as const;

/**
 * Smaller models occasionally leak tool-call markup into a string field
 * ("...</root_cause>\n<parameter name="trigger">..."), swallowing the fields
 * after it. Split those back out so the postmortem always renders.
 */
export function repairPostmortem(input: Record<string, unknown>): Postmortem {
  const out: Record<string, unknown> = { ...input };
  const leak = /<\/[a-z_]+>\s*<parameter name="([a-z_]+)">/;
  for (let pass = 0; pass < 12; pass++) {
    const key = Object.keys(out).find((k) => typeof out[k] === "string" && leak.test(out[k] as string));
    if (!key) break;
    const text = out[key] as string;
    const m = text.match(leak)!;
    out[key] = text.slice(0, m.index).trim();
    const rest = text.slice((m.index ?? 0) + m[0].length);
    if (!out[m[1]] || out[m[1]] === "") out[m[1]] = rest.replace(/<\/[a-z_]+>\s*$/, "").trim();
  }
  for (const k of ["timeline", "action_items"]) {
    if (typeof out[k] === "string") {
      try {
        out[k] = JSON.parse((out[k] as string).replace(/<\/[a-z_]+>[\s\S]*$/, ""));
      } catch {
        out[k] = [];
      }
    }
    if (!Array.isArray(out[k])) out[k] = [];
  }
  for (const k of PM_TEXT) if (typeof out[k] !== "string") out[k] = "";
  return out as unknown as Postmortem;
}

export type Emit = (msg: StreamMessage) => void;

let counter = 0;
const eid = () => `e${Date.now().toString(36)}${(counter++).toString(36)}`;

function push(state: RunState, emit: Emit, event: RunEvent) {
  state.events.push(event);
  emit({ type: "event", event });
}

function observe(state: RunState, emit: Emit, observations: [NodeId, Health][]) {
  if (observations.length === 0) return;
  const map: MapState = { ...state.map };
  let order = Math.max(0, ...Object.values(map).map((m) => m?.order ?? 0));
  for (const [node, health] of observations) {
    const prev = map[node];
    map[node] = { health, order: prev ? prev.order : ++order };
  }
  state.map = map;
  state.focus = observations[observations.length - 1][0];
  emit({ type: "map", map, focus: state.focus });
}

function toolResult(id: string, content: string, isError = false): Anthropic.MessageParam {
  return { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError }] };
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Runs the agent until it finishes, needs approval, or hits the step cap. */
export async function advance(state: RunState, emit: Emit): Promise<void> {
  const started = Date.now();
  try {
    while (!state.done && !state.pending) {
      if (state.steps >= MAX_STEPS) {
        push(state, emit, { id: eid(), type: "error", message: "The agent reached its step limit and stopped." });
        state.done = true;
        return;
      }

      const response = await callModel(state);
      state.steps += 1;
      state.messages.push({ role: "assistant", content: response.content as Anthropic.ContentBlockParam[] });

      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) push(state, emit, { id: eid(), type: "note", text: block.text.trim() });
      }

      const call = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (!call || response.stop_reason !== "tool_use") {
        if (!state.events.some((e) => e.type === "postmortem")) {
          push(state, emit, { id: eid(), type: "error", message: "The agent stopped without writing a postmortem." });
        }
        state.done = true;
        return;
      }

      const input = (call.input ?? {}) as Record<string, unknown>;
      const label = LABELS[call.name] ?? call.name;
      const target = targetOf(call.name, input);

      if (call.name === "submit_postmortem") {
        push(state, emit, { id: eid(), type: "postmortem", postmortem: repairPostmortem(input) });
        state.messages.push(toolResult(call.id, "Postmortem filed. Incident closed."));
        state.done = true;
        return;
      }

      if (call.name === "update_hypotheses") {
        const raw = (Array.isArray(input.hypotheses) ? input.hypotheses : []).slice(0, 5) as Hypothesis[];
        const list = raw.map((h) => ({
          ...h,
          likelihood: String(h.likelihood).toLowerCase() as Hypothesis["likelihood"],
          status: String(h.status).toLowerCase() as Hypothesis["status"],
        }));
        state.hypotheses = list;
        emit({ type: "hypotheses", hypotheses: list });
        push(state, emit, {
          id: eid(),
          type: "hypotheses",
          open: list.filter((h) => h.status === "open").length,
          ruledOut: list.filter((h) => h.status === "ruled out").length,
          confirmed: list.filter((h) => h.status === "confirmed").length,
        });
        state.messages.push(toolResult(call.id, "Hypotheses recorded."));
        continue;
      }

      if (DIAGNOSTICS.has(call.name)) {
        const r = runDiagnostic(state.infra, call.name, input, Date.now());
        const finding = r.observations.length ? r.observations[r.observations.length - 1][1] : null;
        push(state, emit, {
          id: eid(),
          type: "check",
          tool: call.name,
          label,
          target,
          reason: str(input.reason),
          output: r.output,
          finding,
          failed: r.isError,
        });
        observe(state, emit, r.observations);
        state.messages.push(toolResult(call.id, r.output, r.isError));
        continue;
      }

      if (FIXES.has(call.name)) {
        const problem = validateFix(state.infra, call.name, input);
        if (problem) {
          push(state, emit, { id: eid(), type: "change", tool: call.name, label, target, reason: str(input.reason), status: "invalid", output: problem });
          state.messages.push(toolResult(call.id, problem, true));
          continue;
        }
        state.pending = { toolUseId: call.id, tool: call.name, input };
        push(state, emit, {
          id: eid(),
          type: "approval",
          tool: call.name,
          label,
          target,
          reason: str(input.reason),
          risk: fixRisk(state.infra, call.name, input),
        });
        return;
      }

      state.messages.push(toolResult(call.id, `Unknown tool ${call.name}.`, true));
    }
  } finally {
    state.agentMs += Date.now() - started;
  }
}

/** Applies a person's decision on the pending fix, then lets the agent continue. */
export async function decide(state: RunState, approve: boolean, emit: Emit): Promise<void> {
  const p = state.pending;
  if (!p) return;
  state.pending = null;
  const label = LABELS[p.tool] ?? p.tool;
  const target = targetOf(p.tool, p.input);
  const reason = str(p.input.reason);

  if (approve) {
    const r = applyFix(state.infra, p.tool, p.input, Date.now());
    state.fixesApplied += 1;
    push(state, emit, { id: eid(), type: "change", tool: p.tool, label, target, reason, status: "applied", output: r.output });
    observe(state, emit, r.observations);
    state.messages.push(toolResult(p.toolUseId, r.output));
  } else {
    push(state, emit, { id: eid(), type: "change", tool: p.tool, label, target, reason, status: "denied", output: "Denied by the approver." });
    state.messages.push(
      toolResult(p.toolUseId, "A person reviewed this change and denied it. Don't retry the same change; find another safe option or document it.", true),
    );
  }

  await advance(state, emit);
}
