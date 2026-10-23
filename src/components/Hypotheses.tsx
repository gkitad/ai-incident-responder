"use client";

import styles from "@/app/ui.module.css";
import type { Hypothesis } from "@/lib/types";

const level = { low: 1, medium: 2, high: 3 } as const;

export default function Hypotheses({ items }: { items: Hypothesis[] }) {
  if (items.length === 0) {
    return <p className={styles.muted}>The agent lists its candidate causes here once it has reproduced the problem.</p>;
  }
  return (
    <ul className={styles.hyps}>
      {items.map((h) => (
        <li key={h.cause} className={styles[`h_${h.status.replace(" ", "")}`]}>
          <div className={styles.hypHead}>
            <p className={styles.hypCause}>{h.cause}</p>
            <span className={styles.hypStatus}>{h.status === "open" ? `${h.likelihood} likelihood` : h.status}</span>
          </div>
          <span className={styles.meter} aria-label={`${h.likelihood} likelihood`}>
            {[1, 2, 3].map((i) => (
              <span key={i} className={i <= level[h.likelihood] ? styles.meterOn : undefined} />
            ))}
          </span>
          <p className={styles.hypEvidence}>{h.evidence}</p>
        </li>
      ))}
    </ul>
  );
}
