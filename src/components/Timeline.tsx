"use client";

import { useEffect, useRef } from "react";
import styles from "@/app/ui.module.css";
import type { RunEvent } from "@/lib/types";

const changeText = { applied: "Applied", denied: "Denied", invalid: "Rejected" } as const;

export default function Timeline({
  events,
  waitingId,
  busy,
  onDecide,
}: {
  events: RunEvent[];
  waitingId: string | null;
  busy: boolean;
  onDecide: (approve: boolean) => void;
}) {
  const end = useRef<HTMLLIElement>(null);
  const count = events.length;
  useEffect(() => {
    const el = end.current;
    const box = el?.closest("[data-scroll]") as HTMLElement | null;
    if (el && box && box.scrollHeight > box.clientHeight) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [count, busy]);

  // On narrow screens the approval card can be far below the map; bring it into view.
  useEffect(() => {
    if (!waitingId || window.innerWidth > 980) return;
    document.getElementById(waitingId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [waitingId]);

  return (
    <ol className={styles.timeline} aria-live="polite">
      {events.map((e) => {
        switch (e.type) {
          case "note":
            return (
              <li key={e.id} className={styles.tNote}>
                {e.text}
              </li>
            );
          case "check":
            return (
              <li key={e.id} className={`${styles.tItem} ${styles[`f_${e.failed ? "fail" : (e.finding ?? "none")}`]}`}>
                <span className={styles.tDot} aria-hidden="true" />
                <div className={styles.tBody}>
                  <p className={styles.tHead}>
                    <strong>{e.label}</strong>
                    {e.target && <code className={styles.chip}>{e.target}</code>}
                  </p>
                  {e.reason && <p className={styles.tReason}>{e.reason}</p>}
                  <details className={styles.output}>
                    <summary>Output</summary>
                    <pre>{e.output}</pre>
                  </details>
                </div>
              </li>
            );
          case "hypotheses":
            return (
              <li key={e.id} className={styles.tMeta}>
                Hypotheses updated: {e.open} open
                {e.ruledOut > 0 && `, ${e.ruledOut} ruled out`}
                {e.confirmed > 0 && `, ${e.confirmed} confirmed`}
              </li>
            );
          case "approval": {
            const waiting = e.id === waitingId;
            return (
              <li key={e.id} id={e.id} className={`${styles.approval} ${waiting ? styles.approvalLive : ""}`}>
                <p className={styles.approvalHead}>{waiting ? "The agent wants to make a change" : "Change requested"}</p>
                <p className={styles.tHead}>
                  <strong>{e.label}</strong>
                  <code className={styles.chip}>{e.target}</code>
                </p>
                <p className={styles.tReason}>{e.reason}</p>
                <p className={styles.risk}>{e.risk}</p>
                {waiting && (
                  <div className={styles.actions}>
                    <button className={styles.btnPrimary} onClick={() => onDecide(true)} disabled={busy}>
                      Approve change
                    </button>
                    <button className={styles.btnGhost} onClick={() => onDecide(false)} disabled={busy}>
                      Deny
                    </button>
                  </div>
                )}
              </li>
            );
          }
          case "change":
            return (
              <li key={e.id} className={`${styles.tItem} ${styles[`c_${e.status}`]}`}>
                <span className={styles.tDot} aria-hidden="true" />
                <div className={styles.tBody}>
                  <p className={styles.tHead}>
                    <span className={styles.changeTag}>{changeText[e.status]}</span>
                    <strong>{e.label}</strong>
                    <code className={styles.chip}>{e.target}</code>
                  </p>
                  <pre className={styles.changeOut}>{e.output}</pre>
                </div>
              </li>
            );
          case "postmortem":
            return (
              <li key={e.id} className={styles.tMeta}>
                Postmortem filed. Incident closed.
              </li>
            );
          case "error":
            return (
              <li key={e.id} className={styles.tError} role="alert">
                {e.message}
              </li>
            );
        }
      })}
      {busy && !waitingId && (
        <li className={styles.tWorking}>
          <span className={styles.spinner} aria-hidden="true" /> Investigating
        </li>
      )}
      <li ref={end} aria-hidden="true" className={styles.tEnd} />
    </ol>
  );
}
