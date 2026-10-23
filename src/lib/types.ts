// Shapes shared by the server and the browser.

import type { Health, NodeId } from "./infra";

export type Hypothesis = {
  cause: string;
  likelihood: "low" | "medium" | "high";
  status: "open" | "ruled out" | "confirmed";
  evidence: string;
};

export type Postmortem = {
  title: string;
  severity: "SEV1" | "SEV2" | "SEV3" | "SEV4";
  status: "Resolved" | "Mitigated" | "Unresolved";
  summary: string;
  root_cause: string;
  trigger: string;
  impact: string;
  timeline: { time: string; event: string }[];
  resolution: string;
  action_items: { item: string; owner: string }[];
};

export type RunEvent =
  | { id: string; type: "note"; text: string }
  | {
      id: string;
      type: "check";
      tool: string;
      label: string;
      target: string;
      reason: string;
      output: string;
      finding: Health | null;
      failed?: boolean;
    }
  | { id: string; type: "hypotheses"; open: number; ruledOut: number; confirmed: number }
  | { id: string; type: "approval"; tool: string; label: string; target: string; reason: string; risk: string }
  | {
      id: string;
      type: "change";
      tool: string;
      label: string;
      target: string;
      reason: string;
      status: "applied" | "denied" | "invalid";
      output: string;
    }
  | { id: string; type: "postmortem"; postmortem: Postmortem }
  | { id: string; type: "error"; message: string };

export type MapState = Partial<Record<NodeId, { health: Health; order: number }>>;

export type RunResult = {
  restored: boolean;
  scenarioTitle: string;
  explanation: string;
  rootNode: NodeId;
  truth: Record<NodeId, Health>;
  fixesApplied: number;
  toolCalls: number;
  agentSeconds: number;
};

export type View = {
  incidentId: string;
  mystery: boolean;
  scenarioTitle: string | null;
  reporter: string;
  complaint: string;
  location: "office" | "remote";
  startedAt: number;
  events: RunEvent[];
  hypotheses: Hypothesis[];
  map: MapState;
  focus: NodeId | null;
  pending: boolean;
  done: boolean;
  result: RunResult | null;
};

export type StreamMessage =
  | { type: "view"; view: View }
  | { type: "event"; event: RunEvent }
  | { type: "map"; map: MapState; focus: NodeId | null }
  | { type: "hypotheses"; hypotheses: Hypothesis[] }
  | { type: "final"; token: string; view: View };
