import type Anthropic from "@anthropic-ai/sdk";
import type { ScenarioId } from "./infra";
import type { RunState } from "./state";

// Scripted stand-in for the model, used only when MOCK_AGENT=1 so the UI can
// be built and tested without an API key. Each script follows the path a good
// responder would take for that fault.

type Step = [string, Record<string, unknown>];

const h = (cause: string, likelihood: string, status: string, evidence: string) => ({ cause, likelihood, status, evidence });

const PATHS: Record<ScenarioId, { from: "office" | "remote"; investigate: Step[]; fix: Step; pm: Record<string, unknown> }> = {
  "db-disk-full": {
    from: "office",
    investigate: [
      ["update_hypotheses", { hypotheses: [h("Database can't accept writes", "high", "open", "Reads work but saving returns 500."), h("Bad deploy on crm-app-02", "medium", "open", "A new version went out recently.")] }],
      ["read_logs", { node: "crm-app-01", reason: "See what error the app gets when a save fails." }],
      ["check_status", { node: "db-01", reason: "The app reports a disk_full error from the database, so check its disk." }],
      ["read_logs", { node: "db-01", reason: "Find out why the database disk filled up." }],
      ["update_hypotheses", { hypotheses: [h("db-01 disk full from unarchived WAL", "high", "confirmed", "Disk 100%, archiving failing since the NFS change."), h("Bad deploy on crm-app-02", "low", "ruled out", "Both app servers show the same database error.")] }],
    ],
    fix: ["free_disk_space", { node: "db-01", reason: "Archive the piled-up WAL files so the database can write again." }],
    pm: { title: "CRM saves failing: database disk full", severity: "SEV2", root_cause: "Write-ahead logs filled db-01's disk because archiving failed.", trigger: "NFS export rotation on backup-01 (CHG-2236)." },
  },
  "cert-expired": {
    from: "office",
    investigate: [
      ["update_hypotheses", { hypotheses: [h("Expired certificate on lb-01", "high", "open", "TLS handshake fails with certificate expired.")] }],
      ["check_certificate", { host: "crm.lakeside.example", reason: "Confirm the certificate the load balancer presents has expired." }],
      ["read_logs", { node: "lb-01", reason: "See why automatic renewal didn't run." }],
    ],
    fix: ["renew_certificate", { host: "crm.lakeside.example", reason: "Issue a valid certificate so browsers trust the CRM again." }],
    pm: { title: "CRM certificate expired", severity: "SEV1", root_cause: "TLS certificate on lb-01 expired after renewals failed.", trigger: "DNS provider token rotation (CHG-2228)." },
  },
  "dns-stale": {
    from: "office",
    investigate: [
      ["update_hypotheses", { hypotheses: [h("CRM name resolves to the wrong address", "high", "open", "The check connects to 10.20.0.15, not lb-01."), h("Load balancer down", "medium", "open", "Connection times out.")] }],
      ["dns_lookup", { name: "crm.lakeside.example", reason: "Check what address the CRM name resolves to." }],
      ["ping", { target: "lb-01", reason: "Make sure the real load balancer is reachable." }],
      ["list_recent_changes", { reason: "Find what changed the DNS record." }],
    ],
    fix: ["update_dns_record", { name: "crm.lakeside.example", ip: "10.20.0.40", reason: "Point the CRM name back at lb-01." }],
    pm: { title: "CRM unreachable: stale DNS record", severity: "SEV1", root_cause: "crm.lakeside.example pointed at the retired load balancer.", trigger: "Migration cleanup script (CHG-2233)." },
  },
  "app-oom": {
    from: "office",
    investigate: [
      ["update_hypotheses", { hypotheses: [h("One app server is down", "high", "open", "About half of requests return 502."), h("Database overloaded", "medium", "open", "Slow responses.")] }],
      ["read_logs", { node: "lb-01", reason: "See which backend is returning 502s." }],
      ["check_status", { node: "crm-app-01", reason: "The load balancer can't connect to crm-app-01, so check the service." }],
    ],
    fix: ["restart_service", { node: "crm-app-01", service: "crm-api", reason: "crm-api was OOM-killed and never restarted." }],
    pm: { title: "Intermittent 502s: crm-app-01 down", severity: "SEV3", root_cause: "crm-api on crm-app-01 was killed for running out of memory.", trigger: "Large report export job." },
  },
  "idp-clock": {
    from: "office",
    investigate: [
      ["update_hypotheses", { hypotheses: [h("Clock skew on the identity provider", "high", "open", "Assertion NotBefore is in the future.")] }],
      ["check_status", { node: "idp-01", reason: "Check the sign-in server's clock, since tokens look like they're from the future." }],
    ],
    fix: ["resync_clock", { node: "idp-01", reason: "Time sync isn't running and the clock is nine minutes fast." }],
    pm: { title: "Sign-in failing: SSO clock drift", severity: "SEV1", root_cause: "idp-01's clock drifted after chronyd failed to start.", trigger: "OS patching reboot (CHG-2235)." },
  },
  "vpn-pool": {
    from: "remote",
    investigate: [
      ["update_hypotheses", { hypotheses: [h("VPN address pool exhausted", "high", "open", "The VPN refuses connections with no IP available.")] }],
      ["check_status", { node: "vpn-01", reason: "See how many VPN sessions are using the pool." }],
      ["list_recent_changes", { reason: "Find out why idle sessions aren't being cleaned up." }],
    ],
    fix: ["clear_stale_sessions", { node: "vpn-01", reason: "Free addresses held by sessions idle for days." }],
    pm: { title: "Remote staff can't connect: VPN pool full", severity: "SEV2", root_cause: "Idle sessions held every address in the pool.", trigger: "Idle timeout disabled (CHG-2219)." },
  },
};

export async function mockModel(state: RunState): Promise<Pick<Anthropic.Message, "content" | "stop_reason">> {
  await new Promise((r) => setTimeout(r, 300));
  const p = PATHS[state.infra.scenario];
  const script: Step[] = [
    ["run_synthetic_check", { from: p.from, reason: "Reproduce the problem the way the user sees it." }],
    ...p.investigate,
    p.fix,
    ["run_synthetic_check", { from: p.from, reason: "Verify the fix from the user's side." }],
    [
      "submit_postmortem",
      {
        status: "Resolved",
        summary: "Users couldn't use the CRM normally. The on-call agent found the cause and fixed it.",
        impact: "CRM users were affected for about 25 minutes.",
        timeline: [{ time: "15:20", event: "Problem began" }, { time: "15:45", event: "Fix applied and verified" }],
        resolution: "Applied the fix and verified with a synthetic check.",
        action_items: [{ item: "Add an alert for this failure mode", owner: "Infrastructure team" }],
        ...p.pm,
      },
    ],
  ];
  const index = state.messages.filter((m) => m.role === "assistant").length;
  const [name, input] = script[Math.min(index, script.length - 1)];
  return {
    content: [{ type: "tool_use", id: `toolu_mock_${index}`, name, input } as Anthropic.ToolUseBlock],
    stop_reason: "tool_use",
  };
}
