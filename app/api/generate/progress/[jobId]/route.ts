import { NextRequest } from 'next/server';
import { registerEmitter, unregisterEmitter } from '../../../../../lib/jobStore';
import type { SSEProgressEvent } from '../../../../../schema';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const emitter = (event: SSEProgressEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));

        if (event.step === 'done' || event.step === 'error') {
          unregisterEmitter(jobId, emitter);
          controller.close();
        }
      };

      registerEmitter(jobId, emitter);

      // Send keep-alive comment immediately
      controller.enqueue(encoder.encode(': keep-alive\n\n'));

      // Heartbeat every 15s to prevent proxy timeouts
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        unregisterEmitter(jobId, emitter);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
