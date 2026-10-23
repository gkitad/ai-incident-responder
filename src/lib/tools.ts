import type Anthropic from "@anthropic-ai/sdk";
import {
  checkCertificate,
  dnsLookup,
  hostStatus,
  nodeFrom,
  ping,
  readLogs,
  recentChanges,
  SERVERS,
  syntheticCheck,
  topology,
  type Infra,
  type Result,
} from "./infra";

const reason = {
  type: "string",
  description: "One plain-language sentence: what you're checking or changing and why. Shown to the person watching.",
} as const;

const node = { type: "string", enum: SERVERS } as const;

export const DIAGNOSTICS = new Set([
  "get_topology",
  "run_synthetic_check",
  "check_status",
  "read_logs",
  "list_recent_changes",
  "dns_lookup",
  "ping",
  "check_certificate",
]);

export const FIXES = new Set([
  "restart_service",
  "free_disk_space",
  "renew_certificate",
  "update_dns_record",
  "resync_clock",
  "clear_stale_sessions",
]);

const definitions: Anthropic.Tool[] = [
  {
    name: "get_topology",
    description: "List every node in the CRM stack with its address, role and dependencies.",
    input_schema: { type: "object", properties: { reason }, required: ["reason"] },
  },
  {
    name: "run_synthetic_check",
    description:
      "Run a scripted test user through the CRM end to end (VPN if remote, DNS, TLS, sign-in, dashboard, saving a record) and report the first step that fails. Use it to reproduce the problem and to verify a fix.",
    input_schema: {
      type: "object",
      properties: { from: { type: "string", enum: ["office", "remote"] }, reason },
      required: ["from", "reason"],
    },
  },
  {
    name: "check_status",
    description: "Host health for one server: uptime, CPU, memory, disk, service states, clock offset and notable counters.",
    input_schema: { type: "object", properties: { node, reason }, required: ["node", "reason"] },
  },
  {
    name: "read_logs",
    description: "The last 10 log lines on one server.",
    input_schema: { type: "object", properties: { node, reason }, required: ["node", "reason"] },
  },
  {
    name: "list_recent_changes",
    description: "The change log: deployments, config changes and maintenance across the stack, most recent first.",
    input_schema: { type: "object", properties: { reason }, required: ["reason"] },
  },
  {
    name: "dns_lookup",
    description: "Resolve a hostname against the internal DNS server, dns-01.",
    input_schema: { type: "object", properties: { name: { type: "string" }, reason }, required: ["name", "reason"] },
  },
  {
    name: "ping",
    description: "Ping a node name, hostname or IP address from the monitoring host.",
    input_schema: { type: "object", properties: { target: { type: "string" }, reason }, required: ["target", "reason"] },
  },
  {
    name: "check_certificate",
    description: "Inspect the TLS certificate a host presents on port 443.",
    input_schema: { type: "object", properties: { host: { type: "string" }, reason }, required: ["host", "reason"] },
  },
  {
    name: "update_hypotheses",
    description:
      "Record your current list of candidate causes. Call it once you've reproduced the problem, and again whenever evidence rules a cause out or confirms one. Replaces the previous list.",
    input_schema: {
      type: "object",
      properties: {
        hypotheses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              cause: { type: "string", description: "Short description of the possible cause." },
              likelihood: { type: "string", enum: ["low", "medium", "high"] },
              status: { type: "string", enum: ["open", "ruled out", "confirmed"] },
              evidence: { type: "string", description: "One sentence on the evidence so far." },
            },
            required: ["cause", "likelihood", "status", "evidence"],
          },
        },
      },
      required: ["hypotheses"],
    },
  },
  {
    name: "restart_service",
    description: "Restart one service on a server. Pauses for a person's approval.",
    input_schema: { type: "object", properties: { node, service: { type: "string" }, reason }, required: ["node", "service", "reason"] },
  },
  {
    name: "free_disk_space",
    description:
      "Archive data that is safe to move (for a database: write-ahead logs already copied elsewhere) and remove old rotated logs on a server's data volume. Pauses for approval.",
    input_schema: { type: "object", properties: { node, reason }, required: ["node", "reason"] },
  },
  {
    name: "renew_certificate",
    description: "Issue a fresh TLS certificate for a hostname and reload the service that presents it. Pauses for approval.",
    input_schema: { type: "object", properties: { host: { type: "string" }, reason }, required: ["host", "reason"] },
  },
  {
    name: "update_dns_record",
    description: "Change the A record for a hostname in the internal zone. Pauses for approval.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" }, ip: { type: "string" }, reason },
      required: ["name", "ip", "reason"],
    },
  },
  {
    name: "resync_clock",
    description: "Repair and restart time sync on a server and step its clock to the correct time. Pauses for approval.",
    input_schema: { type: "object", properties: { node, reason }, required: ["node", "reason"] },
  },
  {
    name: "clear_stale_sessions",
    description: "Disconnect VPN sessions idle for more than 24 hours on vpn-01. Pauses for approval.",
    input_schema: { type: "object", properties: { node, reason }, required: ["node", "reason"] },
  },
  {
    name: "submit_postmortem",
    description: "Close the incident. Call once, last, after verifying the fix (or after concluding you can't fix it).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        severity: { type: "string", enum: ["SEV1", "SEV2", "SEV3", "SEV4"], description: "SEV1: everyone blocked. SEV2: a core function broken for many users. SEV3: degraded with a workaround. SEV4: minor." },
        status: { type: "string", enum: ["Resolved", "Mitigated", "Unresolved"] },
        summary: { type: "string", description: "Two or three sentences for a non-technical reader." },
        root_cause: { type: "string" },
        trigger: { type: "string", description: "The change or event that set it off." },
        impact: { type: "string" },
        timeline: {
          type: "array",
          items: {
            type: "object",
            properties: { time: { type: "string", description: "HH:MM from the logs or change log." }, event: { type: "string" } },
            required: ["time", "event"],
          },
        },
        resolution: { type: "string" },
        action_items: {
          type: "array",
          items: {
            type: "object",
            properties: { item: { type: "string" }, owner: { type: "string", description: "Team, e.g. Database team, Network team, Service Desk." } },
            required: ["item", "owner"],
          },
        },
      },
      required: ["title", "severity", "status", "summary", "root_cause", "trigger", "impact", "timeline", "resolution", "action_items"],
    },
  },
];

// Strict mode makes the API guarantee every tool input matches its schema
// (grammar-constrained sampling), which strict mode requires to be closed.
type Schema = Record<string, unknown>;
function closed(schema: Schema): Schema {
  const out: Schema = { ...schema };
  if (out.type === "object") {
    out.additionalProperties = false;
    out.properties = Object.fromEntries(
      Object.entries((out.properties ?? {}) as Record<string, Schema>).map(([k, v]) => [k, closed(v)]),
    );
  }
  if (out.type === "array" && out.items) out.items = closed(out.items as Schema);
  return out;
}

export const tools: Anthropic.Tool[] = definitions.map((t) => ({
  ...t,
  strict: true,
  input_schema: closed(t.input_schema as Schema) as Anthropic.Tool.InputSchema,
}));

export const LABELS: Record<string, string> = {
  get_topology: "Map the stack",
  run_synthetic_check: "Synthetic check",
  check_status: "Host status",
  read_logs: "Read logs",
  list_recent_changes: "Recent changes",
  dns_lookup: "DNS lookup",
  ping: "Ping",
  check_certificate: "Check certificate",
  update_hypotheses: "Update hypotheses",
  restart_service: "Restart service",
  free_disk_space: "Free disk space",
  renew_certificate: "Renew certificate",
  update_dns_record: "Update DNS record",
  resync_clock: "Resync clock",
  clear_stale_sessions: "Clear stale VPN sessions",
  submit_postmortem: "Postmortem",
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function targetOf(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "run_synthetic_check":
      return `from ${str(input.from)}`;
    case "restart_service":
      return `${str(input.service)} on ${str(input.node)}`;
    case "update_dns_record":
      return `${str(input.name)} → ${str(input.ip)}`;
    default:
      return str(input.node) || str(input.host) || str(input.name) || str(input.target);
  }
}

/** Runs a read-only diagnostic against the simulated stack. */
export function runDiagnostic(inf: Infra, name: string, input: Record<string, unknown>, now: number): Result {
  const server = nodeFrom(str(input.node));
  switch (name) {
    case "get_topology":
      return topology();
    case "run_synthetic_check":
      return syntheticCheck(inf, str(input.from) === "remote" ? "remote" : "office");
    case "check_status":
      return server ? hostStatus(inf, server) : { output: `Unknown node ${str(input.node)}.`, observations: [], isError: true };
    case "read_logs":
      return server ? readLogs(inf, server, now) : { output: `Unknown node ${str(input.node)}.`, observations: [], isError: true };
    case "list_recent_changes":
      return recentChanges(inf);
    case "dns_lookup":
      return dnsLookup(inf, str(input.name));
    case "ping":
      return ping(inf, str(input.target));
    case "check_certificate":
      return checkCertificate(inf, str(input.host));
  }
  return { output: `Unknown tool ${name}.`, observations: [], isError: true };
}
