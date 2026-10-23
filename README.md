# Incident Responder

Break something in a simulated company network and watch an AI on-call engineer fix it.

You pick a failure to inject, or let **Mystery mode** pick one and hide it from you. The agent gets only the user's complaint, the way a real ticket arrives. It has to reproduce the problem, form hypotheses, follow the evidence through logs, metrics, DNS, certificates and the change log, apply the smallest fix (with your approval), verify it, and write a postmortem. The network map lights up as it investigates, and at the end the real fault is revealed so you can judge how it did.

**Live demo:** https://ai-incident-responder.vercel.app/

Built by [Anthony Jaimez](https://portfolio-eosin-delta-24.vercel.app/), from years of being the person who gets that ticket.

## The faults

Each fault has a realistic trigger, symptoms that show up several layers away from the cause, and a red herring.

| Fault | What the user sees | Red herring |
| --- | --- | --- |
| Database disk full | Pages load, saving fails | A deploy on one app server |
| Expired TLS certificate | Browser security warning | A VPN firmware update |
| Stale DNS record | CRM unreachable, servers all healthy | Patching on an app server |
| Crashed app server | Every other click returns 502 | A busy database |
| SSO clock drift | Sign-in token "not valid yet" | A recent SAML trust change |
| VPN address pool exhausted | Remote staff can't connect, office is fine | A new load balancer rule |

## How it works

- **Simulated infrastructure** (`src/lib/infra.ts`): nine nodes with status, logs, DNS, certificates, a change log and an end-to-end synthetic check. Every answer is computed from the injected fault and the fixes applied so far, so a wrong fix really does leave the outage in place, and a careless DNS change can cause a new one.
- **Agent loop** (`src/lib/agent.ts`): Claude with tool use, one tool call per turn. Every call carries a plain-language reason, and the agent maintains an explicit list of hypotheses that it rules out or confirms as evidence comes in.
- **Human approval enforced in code.** The six remediation tools always pause the run until a person approves or denies the change.
- **Stateless and tamper-proof.** The whole run (conversation, injected fault, step budget) travels with the browser, compressed and encrypted with AES-256-GCM (`src/lib/state.ts`). Visitors can't read the Mystery answer or edit the history between requests.
- **Live streaming**: the API streams newline-delimited JSON, so each step, map update and hypothesis change appears as it happens.

## Live evaluation

Each fault was run end to end against the deployed app with Claude Haiku 5.5, approving every change the agent proposed:

| Fault | Service restored | Tool calls | Changes made | Agent time |
| --- | --- | --- | --- | --- |
| Database disk full | Yes | 8 | 1 | 46 s |
| Expired TLS certificate | Yes | 8 | 1 | 28 s |
| Stale DNS record | Yes | 9 | 1 | 25 s |
| Crashed app server | Yes | 9 | 1 | 24 s |
| SSO clock drift | Yes | 6 | 1 | 21 s |
| VPN address pool exhausted | Yes | 5 | 1 | 18 s |

Six of six restored with one change each, no unnecessary restarts. An earlier run of the database fault correctly diagnosed the cause but gave up after proposing a fix it didn't have a tool for; the prompt now tells it to restore service with the tools it has and put deeper repairs in the action items, and rejected fixes list the alternatives.

## Running locally

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev
```

Set `MOCK_AGENT=1` to run a scripted agent without an API key. `npm run simulate` runs every fault through the scripted agent and checks that the right fix restores service.

## Guardrails on the public demo

- Each visitor can start 6 incidents per 10 minutes.
- Each incident is capped at 30 model calls, tracked inside the encrypted state.
- The API key lives only on the server, and a monthly spend limit in the Claude Console caps cost.
