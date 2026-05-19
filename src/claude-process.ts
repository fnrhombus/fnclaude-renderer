/**
 * STUB — Slice A contract.
 *
 * Slice A owns `subscribeToClaude` and `sendUserTurn`. Until that slice
 * lands on `main`, this file provides a fixture-driven stub that yields
 * the canned event sequence from `src/__fixtures__/events.ts`. The
 * integration step (post-merge of all slices) replaces this stub with the
 * real implementation backed by the `claude` subprocess.
 *
 * The exported signatures here are the contract — slice A must match.
 */

import { fixtureSession } from "./__fixtures__/events.ts";
import type { ClaudeEvent } from "./types/events.ts";

export interface SubscribeArgs {
  /** Working directory passed to `claude --cwd`. Defaults to process.cwd(). */
  cwd?: string;
  /** Additional flags forwarded to the `claude` CLI. */
  extraArgs?: string[];
}

/**
 * Async iterable of typed `ClaudeEvent`s. Real impl reads stream-json
 * from claude's stdout; stub yields fixtures synchronously with a tiny
 * delay so an Ink consumer sees them as separate ticks.
 */
export async function* subscribeToClaude(_args: SubscribeArgs = {}): AsyncIterable<ClaudeEvent> {
  for (const event of fixtureSession) {
    // Yield each event on a new microtask so the renderer can paint.
    await Promise.resolve();
    yield event;
  }
}

/**
 * Forward a typed user turn to claude's stdin. Stub is a no-op; the real
 * impl writes `{"type":"user", ...}\n` to the subprocess.
 */
export function sendUserTurn(_text: string): void {
  // Stub. Slice A wires the actual stdin write.
}
