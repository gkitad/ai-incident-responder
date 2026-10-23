// A simulated CRM stack for a fictional company, with six injectable faults.
// Every diagnostic the agent runs is answered from here: host status, logs,
// DNS, ping, TLS certificates, the change log and end-to-end synthetic checks.
// Answers depend only on the injected fault and the fixes applied so far, so
// a wrong fix really does leave the outage in place.

export type NodeId =
  | "office"
  | "remote"
  | "dns-01"
  | "vpn-01"
  | "lb-01"
  | "crm-app-01"
  | "crm-app-02"
  | "db-01"
  | "idp-01";
export type ServerId = Exclude<NodeId, "office" | "remote">;
export type Health = "ok" | "warn" | "fail";
export type ScenarioId = "db-disk-full" | "cert-expired" | "dns-stale" | "app-oom" | "idp-clock" | "vpn-pool";

export const SERVERS: ServerId[] = ["dns-01", "vpn-01", "lb-01", "crm-app-01", "crm-app-02", "db-01", "idp-01"];

export const NODES: { id: NodeId; label: string; role: string; ip?: string; dependsOn: NodeId[] }[] = [
  { id: "office", label: "Office users", role: "About 140 employees on the HQ network", dependsOn: ["dns-01", "lb-01"] },
  { id: "remote", label: "Remote users", role: "Staff working from home over the VPN", dependsOn: ["vpn-01"] },
  { id: "dns-01", label: "dns-01", role: "Internal DNS for lakeside.example", ip: "10.20.0.10", dependsOn: [] },
  { id: "vpn-01", label: "vpn-01", role: "VPN gateway for remote staff", ip: "10.20.0.20", dependsOn: ["dns-01", "lb-01"] },
  { id: "lb-01", label: "lb-01", role: "Load balancer and TLS for crm.lakeside.example", ip: "10.20.0.40", dependsOn: ["crm-app-01", "crm-app-02"] },
  { id: "crm-app-01", label: "crm-app-01", role: "CRM application server", ip: "10.20.1.11", dependsOn: ["db-01", "idp-01"] },
  { id: "crm-app-02", label: "crm-app-02", role: "CRM application server", ip: "10.20.1.12", dependsOn: ["db-01", "idp-01"] },
  { id: "db-01", label: "db-01", role: "PostgreSQL database for the CRM", ip: "10.20.2.21", dependsOn: [] },
  { id: "idp-01", label: "idp-01", role: "Single sign-on (SAML) for internal apps", ip: "10.20.0.30", dependsOn: [] },
];

export const CRM = "crm.lakeside.example";
export const LB_IP = "10.20.0.40";
const RETIRED_IP = "10.20.0.15";
const DOMAIN = "lakeside.example";

const BASE_DNS: Record<string, string> = {
  [CRM]: LB_IP,
  [`sso.${DOMAIN}`]: "10.20.0.30",
  [`vpn.${DOMAIN}`]: "10.20.0.20",
  ...Object.fromEntries(NODES.filter((n) => n.ip).map((n) => [`${n.id}.${DOMAIN}`, n.ip as string])),
};

export type ScenarioInfo = {
  id: ScenarioId;
  title: string;
  teaser: string;
  reporter: string;
  complaint: string;
  location: "office" | "remote";
  rootNode: ServerId;
  explanation: string;
};

export const SCENARIOS: ScenarioInfo[] = [
  {
    id: "db-disk-full",
    title: "Database disk full",
    teaser: "Fill the database server's disk",
    reporter: "Maria Lopez, Sales",
    complaint:
      "The CRM opens fine, but every time I try to save a customer or an order I get an error page. It started about 20 minutes ago and my whole team has the same problem.",
    location: "office",
    rootNode: "db-01",
    explanation:
      "db-01's data disk was full. The backup share's NFS export was rotated three hours earlier, so write-ahead log archiving started failing and unarchived WAL files piled up until the disk ran out of space. The v4.12.1 deploy on crm-app-02 was a red herring.",
  },
  {
    id: "cert-expired",
    title: "Expired TLS certificate",
    teaser: "Let the CRM's certificate expire",
    reporter: "James Okafor, Sales",
    complaint:
      "When I open the CRM, Chrome says 'Your connection is not private.' The mobile app won't sign in at all. I clicked through on my laptop, but I don't think we should be doing that.",
    location: "office",
    rootNode: "lb-01",
    explanation:
      "The certificate on lb-01 expired yesterday. Automatic renewal had been failing for days because the DNS provider's API token was rotated and the renewal job still used the old one. The VPN firmware update was a red herring.",
  },
  {
    id: "dns-stale",
    title: "Stale DNS record",
    teaser: "Point the CRM's DNS at a retired server",
    reporter: "Dana Whitfield, Finance",
    complaint:
      "The CRM won't load at all. The page just spins and then says the site can't be reached. Email and Teams work fine. I'm in the office.",
    location: "office",
    rootNode: "dns-01",
    explanation:
      "A migration cleanup script rewrote crm.lakeside.example to 10.20.0.15, the address of the retired load balancer. Every server was healthy; nobody could reach them. Last night's patching on crm-app-02 was a red herring.",
  },
  {
    id: "app-oom",
    title: "Crashed app server",
    teaser: "Crash one of the two CRM app servers",
    reporter: "Luis Ortega, Operations",
    complaint:
      "The CRM is really slow today, and about every other click I get a '502 Bad Gateway' page. Refreshing sometimes works.",
    location: "office",
    rootNode: "crm-app-01",
    explanation:
      "crm-api on crm-app-01 was killed by the kernel for running out of memory during a large report export. The load balancer kept sending it half the traffic because its health checks were left disabled after maintenance. The busy database was a red herring.",
  },
  {
    id: "idp-clock",
    title: "SSO clock drift",
    teaser: "Knock the sign-in server's clock out of sync",
    reporter: "Alicia Grant, HR",
    complaint:
      "I can't get into the CRM. It takes my password and MFA, then says 'Sign-in failed: the token isn't valid yet.' Two people on my team have the same problem.",
    location: "office",
    rootNode: "idp-01",
    explanation:
      "idp-01 came back from this morning's patching without time sync running, and its clock drifted about nine minutes fast. Every sign-in token it issued looked like it came from the future, so the CRM rejected them. The SAML trust change from three days ago was a red herring.",
  },
  {
    id: "vpn-pool",
    title: "VPN address pool exhausted",
    teaser: "Fill the VPN's address pool",
    reporter: "Tom Becker, Engineering",
    complaint:
      "I'm working from home and the VPN won't connect. It says 'No IP address available.' People in the office say the CRM is fine for them.",
    location: "remote",
    rootNode: "vpn-01",
    explanation:
      "Two days ago the VPN's idle timeout was disabled for a test and never turned back on. Abandoned sessions held onto their addresses until all 250 in the pool were taken. The new rate-limiting rule on lb-01 was a red herring.",
  },
];

export function scenarioInfo(id: ScenarioId): ScenarioInfo {
  return SCENARIOS.find((s) => s.id === id) as ScenarioInfo;
}

export type Infra = {
  scenario: ScenarioId;
  runStart: number;
  dns: Record<string, string>;
  applied: { key: string; at: number }[];
};

export function newInfra(scenario: ScenarioId, now: number): Infra {
  const dns = { ...BASE_DNS };
  if (scenario === "dns-stale") dns[CRM] = RETIRED_IP;
  return { scenario, runStart: now, dns, applied: [] };
}

const has = (inf: Infra, key: string) => inf.applied.some((a) => a.key === key);
const appliedAt = (inf: Infra, key: string) => inf.applied.find((a) => a.key === key)?.at;

export function faultActive(inf: Infra): boolean {
  switch (inf.scenario) {
    case "db-disk-full":
      return !has(inf, "free_disk_space:db-01");
    case "cert-expired":
      return !has(inf, `renew_certificate:${CRM}`);
    case "dns-stale":
      return inf.dns[CRM] !== LB_IP;
    case "app-oom":
      return !has(inf, "restart_service:crm-app-01:crm-api");
    case "idp-clock":
      return !has(inf, "resync_clock:idp-01");
    case "vpn-pool":
      return !has(inf, "clear_stale_sessions:vpn-01");
  }
}

const on = (inf: Infra, id: ScenarioId) => inf.scenario === id && faultActive(inf);

/** True when users can use the CRM again, from both the office and the VPN. */
export function serviceRestored(inf: Infra): boolean {
  return !faultActive(inf) && inf.dns[CRM] === LB_IP;
}

/** The real state of every node, revealed when the run ends. */
export function truth(inf: Infra): Record<NodeId, Health> {
  const all = Object.fromEntries(NODES.map((n) => [n.id, "ok"])) as Record<NodeId, Health>;
  if (inf.dns[CRM] !== LB_IP) {
    all["dns-01"] = "fail";
    all.office = "fail";
    all.remote = "fail";
  }
  if (!faultActive(inf)) return all;
  const set = (nodes: Partial<Record<NodeId, Health>>) => Object.assign(all, nodes);
  switch (inf.scenario) {
    case "db-disk-full":
      set({ "db-01": "fail", "crm-app-01": "warn", "crm-app-02": "warn", office: "fail", remote: "fail" });
      break;
    case "cert-expired":
      set({ "lb-01": "fail", office: "fail", remote: "fail" });
      break;
    case "app-oom":
      set({ "crm-app-01": "fail", "lb-01": "warn", office: "warn", remote: "warn" });
      break;
    case "idp-clock":
      set({ "idp-01": "fail", "crm-app-01": "warn", "crm-app-02": "warn", office: "fail", remote: "fail" });
      break;
    case "vpn-pool":
      set({ "vpn-01": "fail", remote: "fail" });
      break;
  }
  return all;
}

// ---------- formatting helpers ----------

const clockFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "America/Chicago",
});
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const ts = (ms: number) => clockFmt.format(new Date(ms));
const minutesAgo = (inf: Infra, m: number, s = 0) => inf.runStart - m * 60_000 - s * 1000;

function relative(minutes: number): string {
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  const d = Math.round(minutes / (60 * 24));
  return `${d} day${d > 1 ? "s" : ""} ago`;
}

export type Result = {
  output: string;
  observations: [NodeId, Health][];
  isError?: boolean;
};

const err = (output: string): Result => ({ output, observations: [], isError: true });

function nodeFrom(value: string): ServerId | null {
  const v = value.trim().toLowerCase().replace(`.${DOMAIN}`, "");
  return (SERVERS as string[]).includes(v) ? (v as ServerId) : null;
}

function nodeByIp(ip: string): ServerId | null {
  const n = NODES.find((x) => x.ip === ip);
  return n ? (n.id as ServerId) : null;
}

function hostname(value: string): string {
  const v = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (v.includes(".")) return v;
  return `${v}.${DOMAIN}`;
}

// ---------- topology ----------

export function topology(): Result {
  const lines = [
    "Lakeside Logistics: CRM service map",
    "",
    "office: about 140 employees on the HQ network. They look names up on dns-01 and reach the CRM through lb-01.",
    "remote: staff working from home. They connect through vpn-01, then reach the CRM through lb-01.",
    "",
    ...NODES.filter((n) => n.ip).map(
      (n) => `${n.id} ${n.ip}: ${n.role}${n.dependsOn.length ? `. Depends on ${n.dependsOn.join(", ")}` : ""}`,
    ),
    "",
    `Users open https://${CRM}, which should resolve to lb-01 (${LB_IP}). lb-01 terminates TLS and balances across crm-app-01 and crm-app-02.`,
    `Sign-in goes through sso.${DOMAIN} (idp-01) with SAML.`,
    `Retired: lb-old ${RETIRED_IP}, the previous load balancer, decommissioned Oct 1.`,
  ];
  return { output: lines.join("\n"), observations: [] };
}

// ---------- synthetic check ----------

export function syntheticCheck(inf: Infra, from: "office" | "remote"): Result {
  const steps: [string, "PASS" | "FAIL" | "DEGRADED", string][] = [];
  let stopped = false;
  const step = (name: string, state: "PASS" | "FAIL" | "DEGRADED", detail: string) => {
    if (stopped) return;
    steps.push([name, state, detail]);
    if (state === "FAIL") stopped = true;
  };

  if (from === "remote") {
    if (on(inf, "vpn-pool")) step("Connect VPN", "FAIL", "server refused: no IP address available in pool remote-users");
    else step("Connect VPN", "PASS", "connected to vpn-01, assigned 10.30.0.87");
  }
  const ip = inf.dns[CRM];
  step(`Resolve ${CRM}`, "PASS", ip);
  if (ip !== LB_IP) step("Connect to port 443", "FAIL", `TCP connect to ${ip}:443 timed out after 10 s`);
  else step("Connect to port 443", "PASS", "connected in 1 ms");
  if (on(inf, "cert-expired")) {
    const y = dateFmt.format(new Date(inf.runStart - 86_400_000));
    step("TLS handshake", "FAIL", `certificate has expired (NotAfter: ${y} 23:59:59 UTC)`);
  } else {
    step("TLS handshake", "PASS", "TLS 1.3, certificate valid");
  }
  step("Load sign-in page", "PASS", "GET /login 200 in 140 ms");
  if (on(inf, "idp-clock")) {
    step("Sign in with SSO", "FAIL", "CRM rejected the SAML response: assertion NotBefore is 8 min 58 s in the future");
  } else {
    step("Sign in with SSO", "PASS", `signed in through sso.${DOMAIN}`);
  }
  if (on(inf, "app-oom")) step("Open dashboard", "DEGRADED", "2 of 4 requests returned 502 Bad Gateway; the others took 3.8 s");
  else step("Open dashboard", "PASS", "GET /dashboard 200 in 210 ms");
  if (on(inf, "db-disk-full")) step("Save a test record", "FAIL", "POST /customers returned 500 Internal Server Error");
  else if (on(inf, "app-oom")) step("Save a test record", "DEGRADED", "succeeded on the second attempt; the first returned 502");
  else step("Save a test record", "PASS", "POST /customers 201 in 180 ms, test record deleted");

  const failed = steps.find((s) => s[1] === "FAIL");
  const degraded = steps.some((s) => s[1] === "DEGRADED");
  const verdict = failed ? `FAILED at "${failed[0]}"` : degraded ? "DEGRADED" : "PASSED";
  const output = [
    `Synthetic check from ${from === "office" ? "the office network" : "a home connection over VPN"}, as test user svc-synthetic`,
    ...steps.map(([n, s, d]) => `${s.padEnd(8)} ${n}: ${d}`),
    `Result: ${verdict}`,
  ].join("\n");
  return { output, observations: [[from, failed ? "fail" : degraded ? "warn" : "ok"]] };
}

// ---------- host status ----------

type Status = {
  uptime: string;
  cpu: number;
  mem: number;
  disk: [string, number, string];
  services: [string, string][];
  clock: string;
  notes: string[];
};

const SYNCED = "+0.003 s (chronyd synced)";

function baseStatus(node: ServerId): Status {
  const s: Record<ServerId, Status> = {
    "dns-01": { uptime: "63 days", cpu: 4, mem: 31, disk: ["/", 22, "40 GB"], services: [["named", "active (running)"]], clock: SYNCED, notes: [] },
    "vpn-01": { uptime: "12 days", cpu: 17, mem: 44, disk: ["/", 35, "40 GB"], services: [["ocserv", "active (running)"]], clock: SYNCED, notes: ["Active sessions: 61 of 250 (pool remote-users)"] },
    "lb-01": {
      uptime: "41 days",
      cpu: 12,
      mem: 38,
      disk: ["/", 29, "40 GB"],
      services: [["haproxy", "active (running)"], ["certbot-renew.timer", "active, last run succeeded"]],
      clock: SYNCED,
      notes: ["Backend crm_app: crm-app-01, crm-app-02"],
    },
    "crm-app-01": { uptime: "18 days", cpu: 23, mem: 58, disk: ["/", 41, "100 GB"], services: [["crm-api", "active (running)"]], clock: SYNCED, notes: ["Version: crm-api 4.12.0"] },
    "crm-app-02": { uptime: "11 hours", cpu: 21, mem: 55, disk: ["/", 39, "100 GB"], services: [["crm-api", "active (running)"]], clock: SYNCED, notes: ["Version: crm-api 4.12.1"] },
    "db-01": { uptime: "88 days", cpu: 21, mem: 64, disk: ["/var/lib/postgresql", 38, "500 GB"], services: [["postgresql", "active (running)"]], clock: SYNCED, notes: ["Connections: 46 of 200"] },
    "idp-01": {
      uptime: "34 days",
      cpu: 9,
      mem: 47,
      disk: ["/", 31, "40 GB"],
      services: [["idp", "active (running)"], ["chronyd", "active (running)"]],
      clock: SYNCED,
      notes: [],
    },
  };
  return structuredClone(s[node]);
}

export function hostStatus(inf: Infra, node: ServerId): Result {
  const st = baseStatus(node);
  let health: Health = "ok";

  if (on(inf, "db-disk-full")) {
    if (node === "db-01") {
      st.disk[1] = 100;
      st.services[0][1] = "active (running), writes failing";
      st.notes.push("pg_wal directory: 412 GB (normally under 5 GB)");
      health = "fail";
    }
    if (node === "crm-app-01" || node === "crm-app-02") {
      st.cpu = node === "crm-app-01" ? 71 : 66;
      st.notes.push("Request errors: 38% of POST requests returning 5xx");
      health = "warn";
    }
  }
  if (on(inf, "cert-expired") && node === "lb-01") {
    st.services[1][1] = "active, last run FAILED (3 consecutive failures)";
    health = "warn";
  }
  if (on(inf, "app-oom")) {
    if (node === "crm-app-01") {
      st.services[0][1] = "failed (OOM killed 19 min ago, not restarted)";
      st.mem = 23;
      st.notes.push("Kernel OOM kills in the last hour: 1");
      health = "fail";
    }
    if (node === "db-01") {
      st.cpu = 68;
      st.notes.push("Top query: finance monthly report (running 34 min)");
      health = "warn";
    }
  }
  if (inf.scenario === "app-oom" && node === "lb-01") {
    st.notes.push("Health checks for backend crm_app: DISABLED");
    if (faultActive(inf)) health = "warn";
  }
  if (on(inf, "idp-clock") && node === "idp-01") {
    st.uptime = "6 hours";
    st.services[1][1] = "inactive (dead) since boot";
    st.clock = "+538.214 s (NOT synchronized)";
    health = "fail";
  }
  if (on(inf, "vpn-pool") && node === "vpn-01") {
    st.notes = ["Active sessions: 250 of 250 (pool remote-users FULL)", "Sessions idle more than 24 h: 187"];
    st.cpu = 22;
    health = "fail";
  }

  for (const a of inf.applied) {
    const [tool, n, svc] = a.key.split(":");
    if (tool === "restart_service" && n === node) {
      const s = st.services.find((x) => x[0] === svc);
      if (s) s[1] = `active (running), restarted at ${ts(a.at)}`;
    }
  }
  if (node === "db-01" && has(inf, "free_disk_space:db-01") && inf.scenario === "db-disk-full") st.disk[1] = 18;
  if (node === "vpn-01" && has(inf, "clear_stale_sessions:vpn-01") && inf.scenario === "vpn-pool") {
    st.notes = ["Active sessions: 63 of 250 (pool remote-users)", "Idle timeout: disabled in config"];
  }
  if (node === "idp-01" && has(inf, "resync_clock:idp-01") && inf.scenario === "idp-clock") {
    st.uptime = "6 hours";
    st.services[1][1] = `active (running), started at ${ts(appliedAt(inf, "resync_clock:idp-01") as number)}`;
  }

  const info = NODES.find((n) => n.id === node)!;
  const output = [
    `${node} (${info.ip}): ${info.role}`,
    `Host: up, uptime ${st.uptime}`,
    `CPU ${st.cpu}%   Memory ${st.mem}%   Disk ${st.disk[0]} ${st.disk[1]}% of ${st.disk[2]}`,
    "Services:",
    ...st.services.map(([n, s]) => `  ${n}: ${s}`),
    `Clock offset: ${st.clock}`,
    ...st.notes,
  ].join("\n");
  return { output, observations: [[node, health]] };
}

// ---------- logs ----------

type Line = [number, string]; // [minutes ago at run start, text]

const BASE_LOGS: Record<ServerId, Line[]> = {
  "dns-01": [
    [180, "named: client 10.20.4.88 query: outlook.office.com IN A"],
    [62, `named: zone ${DOMAIN}/IN: loaded serial 2026102201`],
    [4, `named: client 10.20.4.17 query: ${CRM} IN A`],
  ],
  "vpn-01": [
    [92, "ocserv: user jlee connected, assigned 10.30.0.44"],
    [41, "ocserv: user mbrooks disconnected (idle)"],
    [3, "ocserv: 61 active sessions"],
  ],
  "lb-01": [
    [33, "haproxy: backend crm_app: 2 of 2 servers UP"],
    [6, "haproxy: 1,284 requests in last 5 min, 0.2% 5xx"],
  ],
  "crm-app-01": [
    [16, "crm-api: GET /dashboard 200 84ms"],
    [2, "crm-api: POST /orders 201 112ms"],
  ],
  "crm-app-02": [
    [95, "crm-api: started version 4.12.1"],
    [15, "crm-api: GET /customers 200 91ms"],
    [1, "crm-api: GET /dashboard 200 77ms"],
  ],
  "db-01": [
    [121, "postgres: checkpoint complete: wrote 2133 buffers"],
    [11, "postgres: automatic vacuum of table crm.public.orders"],
  ],
  "idp-01": [
    [21, "idp: SAML assertion issued for app crm (user dwhitfield)"],
    [2, "idp: SAML assertion issued for app crm (user jokafor)"],
  ],
};

function scenarioLogs(inf: Infra, node: ServerId): { lines: Line[]; health: Health } {
  const s = inf.scenario;
  if (s === "db-disk-full") {
    if (node === "db-01")
      return {
        health: "fail",
        lines: [
          [187, "postgres: archive command failed with exit code 1: cp: cannot create '/mnt/backup/wal/000000010000A1B2': Stale file handle"],
          [64, "postgres: WARNING: archiving write-ahead log file \"000000010000A1B2\" failed too many times, will try again later"],
          [22, "postgres: ERROR: could not extend file \"base/16384/24576\": No space left on device"],
          [1, "postgres: ERROR: could not write to file \"pg_wal/xlogtemp.4102\": No space left on device"],
        ],
      };
    if (node === "crm-app-01" || node === "crm-app-02")
      return {
        health: "warn",
        lines: [
          [21, "crm-api: ERROR: could not write to database: SQLSTATE 53100 (disk_full)"],
          [8, "crm-api: POST /customers 500 31ms"],
          [1, "crm-api: POST /orders 500 27ms"],
        ],
      };
  }
  if (s === "cert-expired" && node === "lb-01")
    return {
      health: "fail",
      lines: [
        [2950, `certbot: renewal failed for ${CRM}: DNS-01 challenge: provider API returned 401 Unauthorized`],
        [1510, `certbot: renewal failed for ${CRM}: DNS-01 challenge: provider API returned 401 Unauthorized`],
        [70, `certbot: renewal failed for ${CRM}: DNS-01 challenge: provider API returned 401 Unauthorized`],
        [28, "haproxy: SSL handshake failure from 10.20.4.17: client rejected certificate (expired)"],
        [2, "haproxy: 312 TLS handshake failures in last 5 min"],
      ],
    };
  if (s === "dns-stale") {
    if (node === "dns-01")
      return {
        health: "warn",
        lines: [
          [24, "dnsupdate: user svc-migration: delete records for retired host lb-old"],
          [24, `dnsupdate: user svc-migration: update A ${CRM} ${LB_IP} -> ${RETIRED_IP}`],
          [24, `named: zone ${DOMAIN}/IN: loaded serial 2026102302`],
        ],
      };
    if (node === "lb-01")
      return {
        health: "warn",
        lines: [
          [20, "haproxy: 17 requests in last 5 min, 0% 5xx (usual: about 1,200)"],
          [5, "haproxy: 0 requests in last 5 min"],
        ],
      };
  }
  if (s === "app-oom") {
    if (node === "crm-app-01")
      return {
        health: "fail",
        lines: [
          [41, "crm-api: WARN: heap usage 92% (job: export full customer report)"],
          [19, "kernel: Out of memory: Killed process 2211 (java) total-vm:9.8GB"],
          [19, "systemd: crm-api.service: Main process exited, status=9/KILL"],
          [19, "systemd: crm-api.service: Failed with result 'oom-kill'."],
        ],
      };
    if (node === "lb-01")
      return {
        health: "warn",
        lines: [
          [8 * 1440, "haproxy: health checks disabled for backend crm_app (maintenance, CHG-2207)"],
          [17, "haproxy: crm-app-01:8080 connect() failed: Connection refused, returned 502 to client"],
          [2, "haproxy: 214 responses with status 502 from crm-app-01 in last 5 min"],
        ],
      };
  }
  if (s === "idp-clock") {
    if (node === "idp-01")
      return {
        health: "fail",
        lines: [
          [362, "systemd: Rebooting after OS patching (CHG-2235)"],
          [360, "chronyd: Could not open configuration file /etc/chrony.conf: No such file or directory"],
          [360, "systemd: chronyd.service: Failed with result 'exit-code'."],
          [2, "idp: SAML assertion issued for app crm (user agrant)"],
        ],
      };
    if (node === "crm-app-01" || node === "crm-app-02")
      return {
        health: "warn",
        lines: [
          [21, "crm-api: WARN: SAML validation failed: assertion NotBefore is 538 s in the future (allowed skew 120 s)"],
          [3, "crm-api: WARN: SAML validation failed: assertion NotBefore is 538 s in the future (allowed skew 120 s)"],
        ],
      };
  }
  if (s === "vpn-pool" && node === "vpn-01")
    return {
      health: "fail",
      lines: [
        [2880, "ocserv: configuration reloaded: idle-timeout = 0 (disabled) (CHG-2219)"],
        [46, "ocserv: pool remote-users: 250 of 250 addresses in use"],
        [1, "ocserv: rejecting user tbecker: no IP address available in pool remote-users"],
      ],
    };
  return { lines: [], health: "ok" };
}

export function readLogs(inf: Infra, node: ServerId, now: number): Result {
  const sc = scenarioLogs(inf, node);
  const timed: [number, string][] = [...BASE_LOGS[node], ...sc.lines].map(([m, t], i) => [minutesAgo(inf, m, Math.max(0, 50 - i * 3)), t]);
  const active = faultActive(inf);

  // Errors that keep happening while the fault is live.
  if (active) {
    const live: Partial<Record<ScenarioId, Partial<Record<ServerId, string>>>> = {
      "db-disk-full": { "crm-app-01": "crm-api: POST /customers 500 29ms", "db-01": "postgres: ERROR: could not extend file: No space left on device" },
      "cert-expired": { "lb-01": "haproxy: SSL handshake failure: client rejected certificate (expired)" },
      "app-oom": { "lb-01": "haproxy: crm-app-01:8080 connect() failed: Connection refused, returned 502 to client" },
      "idp-clock": { "crm-app-01": "crm-api: WARN: SAML validation failed: assertion NotBefore is 538 s in the future" },
      "vpn-pool": { "vpn-01": "ocserv: rejecting user: no IP address available in pool remote-users" },
    };
    const line = live[inf.scenario]?.[node];
    if (line) timed.push([now - 12_000, line]);
  }

  // What the fixes left behind.
  for (const a of inf.applied) {
    const [tool, n, svc] = a.key.split(":");
    if (tool === "restart_service" && n === node) {
      timed.push([a.at, `systemd: Stopping ${svc}.service`], [a.at + 4000, `systemd: Started ${svc}.service`]);
    }
    if (tool === "free_disk_space" && n === node) timed.push([a.at + 2000, "cleanup: archived and removed old files from the data volume"]);
    if (tool === "renew_certificate" && node === "lb-01") timed.push([a.at + 3000, `certbot: certificate for ${n} issued, haproxy reloaded`]);
    if (tool === "resync_clock" && n === node) timed.push([a.at + 1000, "chronyd: System clock wrong by -538.2 seconds, adjustment started"]);
    if (tool === "clear_stale_sessions" && n === node) timed.push([a.at + 1000, "ocserv: disconnected 187 sessions idle more than 24 h"]);
    if (tool === "update_dns" && node === "dns-01") timed.push([a.at, `dnsupdate: user agent-oncall: update A ${n} -> ${svc}`]);
  }

  timed.sort((x, y) => x[0] - y[0]);
  const output = [`Last log lines on ${node}:`, ...timed.slice(-10).map(([t, line]) => `${ts(t)} ${line}`)].join("\n");
  return { output, observations: [[node, active ? sc.health : "ok"]] };
}

// ---------- change log ----------

export function recentChanges(inf: Infra): Result {
  const changes: [number, string][] = [
    [1500, "crm-app-01: Patched OS packages (CHG-2226)"],
    [4320, "dns-01: Added A record for new printer prn-floor2 (CHG-2221)"],
  ];
  const s = inf.scenario;
  if (s === "db-disk-full") changes.push([95, "crm-app-02: Deployed crm-api 4.12.1 (CHG-2240)"], [190, "backup-01: Rotated NFS export for /mnt/backup (CHG-2236)"]);
  if (s === "cert-expired") changes.push([5760, "dns-01: Rotated DNS provider API tokens (CHG-2228)"], [1440, "vpn-01: Firmware update to 9.4.2 (CHG-2231)"]);
  if (s === "dns-stale") changes.push([24, "dns-01: Ran migration cleanup for retired load balancer lb-old (CHG-2233)"], [660, "crm-app-02: OS patches and reboot (CHG-2232)"]);
  if (s === "app-oom") changes.push([8 * 1440, "lb-01: Disabled health checks for maintenance window (CHG-2207)"], [1440, "db-01: Moved finance monthly report to business hours (CHG-2238)"]);
  if (s === "idp-clock") changes.push([362, "idp-01: OS patching and reboot (CHG-2235)"], [4320, "crm-app-01, crm-app-02: Rotated SAML signing certificate trust (CHG-2229)"]);
  if (s === "vpn-pool") changes.push([2880, "vpn-01: Disabled idle timeout to test long-running sessions (CHG-2219)"], [1440, "lb-01: Added rate limiting rule for /api (CHG-2237)"]);
  for (const a of inf.applied) {
    const mins = Math.max(0, Math.round((inf.runStart - a.at) / 60000));
    changes.push([mins, `Agent change: ${a.key.replaceAll(":", " ")}`]);
  }
  changes.sort((a, b) => a[0] - b[0]);
  const output = ["Change log, most recent first:", ...changes.map(([m, t]) => `${relative(m).padEnd(12)} ${t}`)].join("\n");
  return { output, observations: [] };
}

// ---------- network ----------

export function dnsLookup(inf: Infra, name: string): Result {
  const host = hostname(name);
  const ip = inf.dns[host];
  const dnsHealth: Health = host === CRM && ip !== LB_IP ? "fail" : "ok";
  if (!ip) return { output: `${host}: NXDOMAIN (no such name)\n;; answered by dns-01 (10.20.0.10)`, observations: [["dns-01", "ok"]] };
  return {
    output: `${host}. 300 IN A ${ip}\n;; answered by dns-01 (10.20.0.10) in 2 ms`,
    observations: [["dns-01", dnsHealth]],
  };
}

export function ping(inf: Infra, target: string): Result {
  const t = target.trim().toLowerCase();
  let ip: string | undefined;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(t)) ip = t;
  else {
    const node = nodeFrom(t);
    ip = node ? NODES.find((n) => n.id === node)?.ip : inf.dns[hostname(t)];
  }
  if (!ip) return err(`ping: ${target}: Name or service not known`);
  const node = nodeByIp(ip);
  if (!node) {
    return { output: `PING ${t} (${ip})\n4 packets transmitted, 0 received, 100% packet loss`, observations: [] };
  }
  return {
    output: `PING ${t} (${ip})\n4 packets transmitted, 4 received, 0% packet loss\nrtt min/avg/max = 0.41/0.58/0.83 ms`,
    observations: [[node, "ok"]],
  };
}

export function checkCertificate(inf: Infra, host: string): Result {
  const h = hostname(host);
  const map: Record<string, [string, ServerId]> = {
    [CRM]: [CRM, "lb-01"],
    [`lb-01.${DOMAIN}`]: [CRM, "lb-01"],
    [`sso.${DOMAIN}`]: [`sso.${DOMAIN}`, "idp-01"],
    [`idp-01.${DOMAIN}`]: [`sso.${DOMAIN}`, "idp-01"],
    [`vpn.${DOMAIN}`]: [`vpn.${DOMAIN}`, "vpn-01"],
    [`vpn-01.${DOMAIN}`]: [`vpn.${DOMAIN}`, "vpn-01"],
  };
  const entry = map[h];
  if (!entry) return err(`${h}: no TLS service answering on port 443`);
  const [cn, node] = entry;
  const day = 86_400_000;
  let notAfter = inf.runStart + 54 * day;
  let status = "VALID";
  let health: Health = "ok";
  if (cn === CRM) {
    if (on(inf, "cert-expired")) {
      notAfter = inf.runStart - day;
      status = "EXPIRED 1 day ago";
      health = "fail";
    } else if (inf.scenario === "cert-expired") {
      notAfter = inf.runStart + 90 * day;
    }
  }
  const output = [
    `Certificate presented by ${h}:443`,
    `Subject: CN=${cn}`,
    "Issuer: Let's Encrypt R11",
    `Not after: ${dateFmt.format(new Date(notAfter))} 23:59:59 UTC`,
    `Status: ${status}`,
  ].join("\n");
  return { output, observations: [[node, health]] };
}

// ---------- fixes ----------

const SERVICES: Record<ServerId, string[]> = {
  "dns-01": ["named"],
  "vpn-01": ["ocserv"],
  "lb-01": ["haproxy"],
  "crm-app-01": ["crm-api"],
  "crm-app-02": ["crm-api"],
  "db-01": ["postgresql"],
  "idp-01": ["idp", "chronyd"],
};

type Input = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Returns a problem with the fix's input, or null if it can be sent for approval. */
export function validateFix(inf: Infra, tool: string, input: Input): string | null {
  const node = nodeFrom(s(input.node));
  switch (tool) {
    case "restart_service":
      if (!node) return `Unknown node ${s(input.node)}.`;
      if (!SERVICES[node].includes(s(input.service))) return `${node} has no service named ${s(input.service)}. Services: ${SERVICES[node].join(", ")}.`;
      return null;
    case "free_disk_space":
    case "resync_clock":
      return node ? null : `Unknown node ${s(input.node)}.`;
    case "clear_stale_sessions":
      return node === "vpn-01" ? null : "Only vpn-01 has VPN sessions.";
    case "renew_certificate": {
      const h = hostname(s(input.host));
      return [CRM, `sso.${DOMAIN}`, `vpn.${DOMAIN}`, `lb-01.${DOMAIN}`].includes(h) ? null : `${h} has no certificate managed here.`;
    }
    case "update_dns_record": {
      const h = hostname(s(input.name));
      if (!(h in inf.dns)) return `${h} isn't in the ${DOMAIN} zone.`;
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(s(input.ip))) return "ip must be an IPv4 address.";
      return null;
    }
  }
  return `Unknown fix ${tool}.`;
}

/** What a person approving the fix should know about it. */
export function fixRisk(inf: Infra, tool: string, input: Input): string {
  const node = s(input.node);
  switch (tool) {
    case "restart_service":
      return `Restarts ${s(input.service)} on ${node}. Anyone connected to it sees errors for about 30 seconds.`;
    case "free_disk_space":
      return `Archives and deletes old files on ${node}'s data volume.`;
    case "resync_clock":
      return `Steps ${node}'s system clock and restarts time sync. Sign-in tokens issued in the last few minutes may stop working.`;
    case "clear_stale_sessions":
      return "Disconnects every VPN session that has been idle for more than 24 hours.";
    case "renew_certificate":
      return `Issues a new TLS certificate for ${hostname(s(input.host))} and reloads the load balancer.`;
    case "update_dns_record": {
      const h = hostname(s(input.name));
      return `Changes what ${h} resolves to for every user: ${inf.dns[h]} to ${s(input.ip)}.`;
    }
  }
  return "Changes production infrastructure.";
}

/** Applies an approved fix. Wrong fixes succeed as operations but leave the outage in place. */
export function applyFix(inf: Infra, tool: string, input: Input, now: number): Result {
  const node = nodeFrom(s(input.node)) as ServerId;
  const before = faultActive(inf);
  const record = (key: string) => {
    if (!has(inf, key)) inf.applied.push({ key, at: now });
  };
  let output = "";

  switch (tool) {
    case "restart_service": {
      const svc = s(input.service);
      record(`restart_service:${node}:${svc}`);
      output = `${svc} restarted on ${node}. Status: active (running).`;
      if (inf.scenario === "db-disk-full" && node === "db-01" && before) {
        output += "\nWarning: postgresql came back up, but writes still fail: No space left on device.";
      }
      break;
    }
    case "free_disk_space":
      record(`free_disk_space:${node}`);
      output =
        inf.scenario === "db-disk-full" && node === "db-01"
          ? "Archived 409 GB of write-ahead log files to backup-02 and removed them locally. /var/lib/postgresql is now 18% used.\nNote: WAL archiving to /mnt/backup is still failing (Stale file handle)."
          : `Removed 1.4 GB of rotated logs on ${node}. Disk usage dropped by 3%.`;
      break;
    case "resync_clock":
      record(`resync_clock:${node}`);
      output =
        inf.scenario === "idp-clock" && node === "idp-01"
          ? "Restored /etc/chrony.conf from the config backup, started chronyd and stepped the clock by -538.2 s. Offset now +0.004 s."
          : `${node}'s clock is already in sync (+0.003 s). Nothing changed.`;
      break;
    case "clear_stale_sessions":
      record("clear_stale_sessions:vpn-01");
      output =
        inf.scenario === "vpn-pool"
          ? "Disconnected 187 sessions idle more than 24 hours. Pool remote-users: 63 of 250 in use.\nNote: idle-timeout is still disabled in the ocserv config."
          : "Disconnected 3 sessions idle more than 24 hours. Pool remote-users: 58 of 250 in use.";
      break;
    case "renew_certificate": {
      const h = hostname(s(input.host));
      const cn = h === `lb-01.${DOMAIN}` ? CRM : h;
      record(`renew_certificate:${cn}`);
      output =
        cn === CRM && inf.scenario === "cert-expired"
          ? `Issued a new certificate for ${CRM} (valid 90 days) using a freshly generated DNS provider token, and reloaded haproxy.`
          : `Issued a new certificate for ${cn} (valid 90 days). The old one was still valid.`;
      break;
    }
    case "update_dns_record": {
      const h = hostname(s(input.name));
      const ip = s(input.ip);
      const old = inf.dns[h];
      inf.dns[h] = ip;
      inf.applied.push({ key: `update_dns:${h}:${ip}`, at: now });
      output = `${h} A ${old} -> ${ip}. Zone serial 2026102303, TTL 300 s, so some clients may keep the old answer for up to 5 minutes.`;
      break;
    }
  }

  const fixedNow = before && !faultActive(inf);
  const root = scenarioInfo(inf.scenario).rootNode;
  const observations: [NodeId, Health][] = fixedNow ? [[root, "ok"]] : [];
  if (tool === "update_dns_record" && hostname(s(input.name)) === CRM) {
    observations.push(["dns-01", inf.dns[CRM] === LB_IP ? "ok" : "fail"]);
  }
  return { output, observations };
}

export { nodeFrom };
