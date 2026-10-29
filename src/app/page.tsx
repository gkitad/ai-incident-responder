"use client";

import { useEffect, useState } from "react";
import styles from "./ui.module.css";
import NetworkMap from "@/components/NetworkMap";
import Timeline from "@/components/Timeline";
import Hypotheses from "@/components/Hypotheses";
import Postmortem from "@/components/Postmortem";
import { SCENARIOS, type ScenarioId } from "@/lib/infra";
import type { StreamMessage, View } from "@/lib/types";

const PORTFOLIO = "https://portfolio-eosin-delta-24.vercel.app/";
const SOURCE = "https://github.com/gkitad/ai-incident-responder";

async function stream(body: unknown, onMessage: (m: StreamMessage) => void) {
  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    let message = "The incident couldn't start. Try again in a moment.";
    try {
      message = (await res.json()).error ?? message;
    } catch {}
    throw new Error(message);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onMessage(JSON.parse(line) as StreamMessage);
    }
    if (done) break;
  }
}

function useClock(running: boolean) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [running]);
  return now;
}

function duration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Home() {
  const [view, setView] = useState<View | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useClock(busy || (view !== null && !view.done));

  function handle(m: StreamMessage) {
    if (m.type === "view") setView(m.view);
    else if (m.type === "event") setView((v) => (v ? { ...v, events: [...v.events, m.event] } : v));
    else if (m.type === "map") setView((v) => (v ? { ...v, map: m.map, focus: m.focus } : v));
    else if (m.type === "hypotheses") setView((v) => (v ? { ...v, hypotheses: m.hypotheses } : v));
    else {
      setView(m.view);
      setToken(m.token);
    }
  }

  async function run(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await stream(body, handle);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function start(scenario: ScenarioId | "mystery") {
    setView(null);
    setToken(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    run({ action: "start", scenario });
  }

  function decide(approve: boolean) {
    if (token) run({ action: approve ? "approve" : "deny", token });
  }

  function reset() {
    setView(null);
    setToken(null);
    setError(null);
  }

  const waiting = view?.pending ? [...view.events].reverse().find((e) => e.type === "approval") : undefined;
  const postmortem = view?.events.find((e) => e.type === "postmortem");
  const result = view?.result ?? null;
  const status = !view
    ? null
    : view.done
      ? result?.restored
        ? "Resolved"
        : "Not resolved"
      : view.pending && !busy
        ? "Waiting for approval"
        : "Investigating";

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <button className={styles.brand} onClick={reset} disabled={busy}>
          <span className={styles.brandName}>Incident Responder</span>
          <span className={styles.brandBy}>by Anthony Jaimez</span>
        </button>
        <nav className={styles.topLinks} aria-label="Links">
          <a href={SOURCE}>Source ↗</a>
          <a href={PORTFOLIO}>Portfolio ↗</a>
        </nav>
      </header>

      {!view ? (
        <main>
          <section className={styles.window}>
            <div className={styles.chrome} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className={styles.hero}>
              <h1 className={styles.heroTitle}>
                Break something.
                <br />
                Watch the AI <em>fix it.</em>
              </h1>
              <p className={styles.heroText}>
                Pick a failure and it gets injected into a simulated company network. The AI on-call engineer only
                sees the user&apos;s complaint. It has to reproduce the problem, follow the evidence to the cause, ask
                you before fixing anything and write up what happened.
              </p>
            </div>
            <NetworkMap map={{}} focus={null} healthy />
          </section>

          <section className={styles.picker} aria-labelledby="pick-title">
            <h2 id="pick-title" className={styles.sectionTitle}>
              Choose what to break
            </h2>
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            <button className={styles.mystery} onClick={() => start("mystery")} disabled={busy}>
              <span className={styles.mysteryTitle}>Mystery outage</span>
              <span className={styles.mysteryText}>
                One of the six faults below, picked at random and hidden from you until the agent closes the incident.
              </span>
              <span className={styles.mysteryCta}>Start incident ↗</span>
            </button>
            <ul className={styles.faults}>
              {SCENARIOS.map((s) => (
                <li key={s.id}>
                  <button className={styles.fault} onClick={() => start(s.id)} disabled={busy}>
                    <span className={styles.faultTitle}>{s.title}</span>
                    <span className={styles.faultText}>{s.teaser}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className={styles.fine}>
              The servers, logs and changes here are all simulated. Every fix waits for your approval, and the agent
              only sees the network through the same tools an on-call engineer would use.
            </p>
          </section>
        </main>
      ) : (
        <main className={styles.incident}>
          <section className={styles.ticket} aria-label="Incident">
            <div className={styles.ticketRow}>
              <span className={styles.ticketId}>{view.incidentId}</span>
              <span className={`${styles.state} ${styles[`st_${(status ?? "").replaceAll(" ", "")}`]}`}>{status}</span>
              <span className={styles.ticketMeta}>
                {view.mystery && !view.done ? "Mystery outage" : view.scenarioTitle}
              </span>
              <span className={styles.timer}>
                {view.done && result ? `Agent time ${duration(result.agentSeconds * 1000)}` : duration(now ? now - view.startedAt : 0)}
              </span>
            </div>
            <blockquote className={styles.complaint}>
              <p>&ldquo;{view.complaint}&rdquo;</p>
              <footer>{view.reporter}, {view.location === "office" ? "in the office" : "working from home"}</footer>
            </blockquote>
          </section>

          {result && (
            <section className={`${styles.result} ${result.restored ? styles.resultOk : styles.resultBad}`} aria-live="polite">
              <div>
                <p className={styles.resultHead}>{result.restored ? "Service restored" : "Service not restored"}</p>
                <p className={styles.resultText}>
                  {view.mystery ? "The hidden fault was " : "The injected fault was "}
                  <strong>{result.scenarioTitle.toLowerCase()}</strong>. {result.explanation}
                </p>
              </div>
              <dl className={styles.stats}>
                <div>
                  <dt>Agent time</dt>
                  <dd>{duration(result.agentSeconds * 1000)}</dd>
                </div>
                <div>
                  <dt>Tool calls</dt>
                  <dd>{result.toolCalls}</dd>
                </div>
                <div>
                  <dt>Changes made</dt>
                  <dd>{result.fixesApplied}</dd>
                </div>
              </dl>
            </section>
          )}

          <div className={styles.grid}>
            <div className={styles.left}>
              <section className={styles.window}>
                <div className={styles.chrome}>
                  <span />
                  <span />
                  <span />
                  <p className={styles.chromeTitle}>{result ? "What was really broken" : "What the agent has found"}</p>
                </div>
                <NetworkMap
                  map={view.map}
                  focus={view.focus}
                  truth={result?.truth ?? null}
                  root={result?.rootNode ?? null}
                />
              </section>
              <section className={styles.panel} aria-labelledby="hyp-title">
                <h2 id="hyp-title" className={styles.panelTitle}>
                  Hypotheses
                </h2>
                <Hypotheses items={view.hypotheses} />
              </section>
            </div>

            <section className={`${styles.panel} ${styles.log}`} aria-labelledby="log-title">
              <h2 id="log-title" className={styles.panelTitle}>
                Investigation
              </h2>
              <div className={styles.logScroll} data-scroll>
                <Timeline events={view.events} waitingId={!busy && waiting ? waiting.id : null} busy={busy} onDecide={decide} />
              </div>
              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}
            </section>
          </div>

          {postmortem && postmortem.type === "postmortem" && (
            <Postmortem pm={postmortem.postmortem} incidentId={view.incidentId} />
          )}

          {view.done && (
            <div className={styles.again}>
              <button className={styles.btnPrimary} onClick={reset}>
                Break something else
              </button>
            </div>
          )}
        </main>
      )}

      <footer className={styles.footer}>
        <p>
          A portfolio project by <a href={PORTFOLIO}>Anthony Jaimez</a>. Built with Next.js and the Claude API.
        </p>
      </footer>
    </div>
  );
}
