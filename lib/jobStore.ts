// Global singleton store for SSE — must survive across Next.js route handler instances.
// Uses globalThis so the same Map is shared between the POST (pipeline) and GET (SSE) routes.

import type { SSEProgressEvent } from '../schema';

type Emitter = (event: SSEProgressEvent) => void;

declare global {
  // eslint-disable-next-line no-var
  var __reelator_emitters: Map<string, Emitter[]> | undefined;
  // eslint-disable-next-line no-var
  var __reelator_buffer: Map<string, SSEProgressEvent[]> | undefined;
}

function getEmitters(): Map<string, Emitter[]> {
  if (!globalThis.__reelator_emitters) {
    globalThis.__reelator_emitters = new Map();
  }
  return globalThis.__reelator_emitters;
}

function getBuffer(): Map<string, SSEProgressEvent[]> {
  if (!globalThis.__reelator_buffer) {
    globalThis.__reelator_buffer = new Map();
  }
  return globalThis.__reelator_buffer;
}

export function registerEmitter(jobId: string, emitter: Emitter): void {
  const emitters = getEmitters();
  if (!emitters.has(jobId)) emitters.set(jobId, []);
  emitters.get(jobId)!.push(emitter);

  // Flush buffered events to this new listener immediately
  const buffer = getBuffer();
  const buffered = buffer.get(jobId);
  if (buffered && buffered.length > 0) {
    for (const event of buffered) {
      emitter(event);
    }
    buffer.delete(jobId);
  }
}

export function unregisterEmitter(jobId: string, emitter: Emitter): void {
  const emitters = getEmitters();
  const list = emitters.get(jobId);
  if (!list) return;
  const idx = list.indexOf(emitter);
  if (idx !== -1) list.splice(idx, 1);
  if (list.length === 0) emitters.delete(jobId);
}

export function emitProgress(jobId: string, event: SSEProgressEvent): void {
  const emitters = getEmitters();
  const list = emitters.get(jobId);
  if (list && list.length > 0) {
    for (const fn of list) fn(event);
  } else {
    // No SSE client connected yet — buffer the event
    const buffer = getBuffer();
    if (!buffer.has(jobId)) buffer.set(jobId, []);
    buffer.get(jobId)!.push(event);
  }
}
