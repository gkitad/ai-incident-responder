"use client";

import { useState } from "react";
import styles from "@/app/ui.module.css";
import type { Postmortem as PM } from "@/lib/types";

function markdown(pm: PM, incidentId: string): string {
  return [
    `# ${pm.title}`,
    "",
    `**Incident:** ${incidentId}  `,
    `**Severity:** ${pm.severity}  `,
    `**Status:** ${pm.status}`,
    "",
    "## Summary",
    pm.summary,
    "",
    "## Root cause",
    pm.root_cause,
    "",
    "## Trigger",
    pm.trigger,
    "",
    "## Impact",
    pm.impact,
    "",
    "## Timeline",
    ...pm.timeline.map((t) => `- **${t.time}** ${t.event}`),
    "",
    "## Resolution",
    pm.resolution,
    "",
    "## Action items",
    ...pm.action_items.map((a) => `- [ ] ${a.item} (${a.owner})`),
  ].join("\n");
}

export default function Postmortem({ pm, incidentId }: { pm: PM; incidentId: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown(pm, incidentId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className={styles.pm} aria-labelledby="pm-title">
      <header className={styles.pmHead}>
        <div>
          <p className={styles.pmMeta}>
            <span className={styles.sev}>{pm.severity}</span>
            <span className={pm.status === "Resolved" ? styles.pmResolved : styles.pmOpen}>{pm.status}</span>
            <span className={styles.muted}>Postmortem for {incidentId}</span>
          </p>
          <h2 id="pm-title" className={styles.pmTitle}>
            {pm.title}
          </h2>
        </div>
        <button className={styles.btnGhost} onClick={copy}>
          {copied ? "Copied" : "Copy as Markdown"}
        </button>
      </header>

      <p className={styles.pmSummary}>{pm.summary}</p>

      <dl className={styles.pmGrid}>
        <div>
          <dt>Root cause</dt>
          <dd>{pm.root_cause}</dd>
        </div>
        <div>
          <dt>Trigger</dt>
          <dd>{pm.trigger}</dd>
        </div>
        <div>
          <dt>Impact</dt>
          <dd>{pm.impact}</dd>
        </div>
        <div>
          <dt>Resolution</dt>
          <dd>{pm.resolution}</dd>
        </div>
      </dl>

      <div className={styles.pmCols}>
        <section>
          <h3>Timeline</h3>
          <ol className={styles.pmTimeline}>
            {pm.timeline.map((t, i) => (
              <li key={i}>
                <time>{t.time}</time>
                <span>{t.event}</span>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h3>Action items</h3>
          <ul className={styles.pmActions}>
            {pm.action_items.map((a, i) => (
              <li key={i}>
                <span>{a.item}</span>
                <span className={styles.owner}>{a.owner}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}
