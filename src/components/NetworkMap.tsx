"use client";

import styles from "@/app/ui.module.css";
import { NODES, type Health, type NodeId } from "@/lib/infra";
import type { MapState } from "@/lib/types";

type Layout = { w: number; h: number; pos: Record<NodeId, [number, number]> };

const WIDE: Layout = {
  w: 770,
  h: 430,
  pos: {
    office: [72, 134],
    remote: [72, 324],
    "dns-01": [238, 64],
    "vpn-01": [238, 324],
    "lb-01": [400, 219],
    "crm-app-01": [560, 134],
    "crm-app-02": [560, 314],
    "idp-01": [700, 64],
    "db-01": [700, 244],
  },
};

const TALL: Layout = {
  w: 400,
  h: 690,
  pos: {
    office: [100, 45],
    remote: [300, 45],
    "dns-01": [75, 170],
    "vpn-01": [300, 170],
    "lb-01": [230, 300],
    "crm-app-01": [100, 430],
    "crm-app-02": [300, 430],
    "db-01": [100, 600],
    "idp-01": [300, 600],
  },
};

const NODE_W = 128;
const NODE_H = 48;

const EDGES: [NodeId, NodeId][] = NODES.flatMap((n) => n.dependsOn.map((d) => [n.id, d] as [NodeId, NodeId]));

export type NodeView = Health | "unknown";

function Diagram({
  layout,
  state,
  order,
  focus,
  root,
}: {
  layout: Layout;
  state: Record<NodeId, NodeView>;
  order: Partial<Record<NodeId, number>>;
  focus: NodeId | null;
  root: NodeId | null;
}) {
  return (
    <svg viewBox={`0 0 ${layout.w} ${layout.h}`} className={styles.mapSvg} role="img" aria-label="Network map of the CRM stack">
      {EDGES.map(([a, b]) => {
        const [x1, y1] = layout.pos[a];
        const [x2, y2] = layout.pos[b];
        const hot = state[a] === "fail" || state[b] === "fail";
        return <line key={`${a}-${b}`} x1={x1} y1={y1} x2={x2} y2={y2} className={hot ? styles.edgeHot : styles.edge} />;
      })}
      {NODES.map((n) => {
        const [cx, cy] = layout.pos[n.id];
        const x = cx - NODE_W / 2;
        const y = cy - NODE_H / 2;
        const s = state[n.id];
        const isUsers = n.id === "office" || n.id === "remote";
        return (
          <g key={n.id} className={`${styles.node} ${styles[`n_${s}`]}`}>
            {focus === n.id && (
              <rect x={x - 6} y={y - 6} width={NODE_W + 12} height={NODE_H + 12} rx={isUsers ? 30 : 16} className={styles.focusRing} />
            )}
            <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={isUsers ? 24 : 11} className={styles.nodeBox} />
            <circle cx={x + 16} cy={cy} r={4.5} className={styles.nodeDot} />
            <text x={x + 28} y={n.ip ? cy - 3 : cy + 5} className={styles.nodeLabel}>
              {n.label}
            </text>
            {n.ip && (
              <text x={x + 28} y={cy + 13} className={styles.nodeIp}>
                {n.ip}
              </text>
            )}
            {order[n.id] ? (
              <g>
                <circle cx={x + NODE_W - 2} cy={y + 2} r={10} className={styles.badge} />
                <text x={x + NODE_W - 2} y={y + 6} className={styles.badgeText}>
                  {order[n.id]}
                </text>
              </g>
            ) : null}
            {root === n.id && (
              <g>
                <rect x={cx - 42} y={y - 30} width={84} height={20} rx={10} className={styles.rootTag} />
                <text x={cx} y={y - 16} className={styles.rootText}>
                  Root cause
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function NetworkMap({
  map,
  focus,
  healthy,
  truth,
  root,
}: {
  map: MapState;
  focus: NodeId | null;
  healthy?: boolean;
  truth?: Record<NodeId, Health> | null;
  root?: NodeId | null;
}) {
  const state = Object.fromEntries(
    NODES.map((n) => [n.id, healthy ? "ok" : truth ? truth[n.id] : (map[n.id]?.health ?? "unknown")]),
  ) as Record<NodeId, NodeView>;
  const order = Object.fromEntries(
    NODES.filter((n) => (map[n.id]?.order ?? 0) > 0).map((n) => [n.id, map[n.id]!.order]),
  ) as Partial<Record<NodeId, number>>;
  const showOrder = healthy ? {} : order;

  return (
    <div className={styles.map}>
      <div className={styles.mapWide}>
        <Diagram layout={WIDE} state={state} order={showOrder} focus={truth ? null : focus} root={root ?? null} />
      </div>
      <div className={styles.mapTall}>
        <Diagram layout={TALL} state={state} order={showOrder} focus={truth ? null : focus} root={root ?? null} />
      </div>
      <ul className={styles.legend}>
        <li><span className={`${styles.swatch} ${styles.s_unknown}`} />Not checked yet</li>
        <li><span className={`${styles.swatch} ${styles.s_ok}`} />Healthy</li>
        <li><span className={`${styles.swatch} ${styles.s_warn}`} />Degraded</li>
        <li><span className={`${styles.swatch} ${styles.s_fail}`} />Failing</li>
        {!healthy && !truth && <li><span className={styles.badgeKey}>1</span>Order the agent checked it</li>}
      </ul>
    </div>
  );
}
