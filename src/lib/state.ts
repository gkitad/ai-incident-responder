import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import type Anthropic from "@anthropic-ai/sdk";
import type { Infra, NodeId } from "./infra";
import type { Hypothesis, MapState, RunEvent } from "./types";

// The run's full state travels with the browser between requests, so the
// server keeps nothing. It's compressed and encrypted with AES-256-GCM:
// visitors can't read it (Mystery mode keeps its secret) and can't edit it
// (the conversation, the injected fault and the step budget are tamper-proof).

export type Pending = { toolUseId: string; tool: string; input: Record<string, unknown> };

export type RunState = {
  v: 1;
  incidentId: string;
  mystery: boolean;
  startedAt: number;
  infra: Infra;
  messages: Anthropic.MessageParam[];
  events: RunEvent[];
  hypotheses: Hypothesis[];
  map: MapState;
  focus: NodeId | null;
  pending: Pending | null;
  done: boolean;
  steps: number;
  agentMs: number;
  fixesApplied: number;
};

const MAX_AGE_MS = 2 * 60 * 60 * 1000;

function key(): Buffer {
  const base = process.env.STATE_SECRET ?? process.env.ANTHROPIC_API_KEY ?? "local-development-only";
  return createHash("sha256").update(`incident-state:${base}`).digest();
}

export function seal(state: RunState): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(deflateRawSync(Buffer.from(JSON.stringify(state)))), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unseal(token: string): RunState | null {
  try {
    const buf = Buffer.from(token, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const json = inflateRawSync(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()])).toString();
    const state = JSON.parse(json) as RunState;
    if (state.v !== 1 || Date.now() - state.startedAt > MAX_AGE_MS) return null;
    return state;
  } catch {
    return null;
  }
}
