'use client';

import type { Phase1Step, Phase2Step, SSEProgressEvent } from '../schema';

const STEP_LABELS: Record<Phase1Step | Phase2Step, string> = {
  upload:              'Uploading video…',
  generating_hooks:    'Writing 5 hook options…',
  qa_hooks:            'Scoring hooks…',
  ready:               'Pick your hook',
  generating_captions: 'Writing captions for your hook…',
  qa_captions:         'Quality checking captions…',
  captions_ready:      'Pick your caption',
  rendering:           'Rendering video…',
  saving:              'Saving to library…',
  done:                'Done',
  error:               'Something went wrong',
};

interface Props {
  event: SSEProgressEvent | null;
  isRunning: boolean;
}

export function ProgressTracker({ event, isRunning }: Props) {
  if (!isRunning && !event) return null;

  const progress = event?.progress ?? 0;
  const step     = (event?.step ?? 'upload') as Phase1Step | Phase2Step;
  const message  = event?.message ?? STEP_LABELS[step] ?? step;
  const isError  = step === 'error';
  const isDone   = step === 'done' || step === 'ready';

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRunning && !isError && !isDone && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E8FF47] opacity-60" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#E8FF47]" />
            </span>
          )}
          {isDone  && <span className="h-1.5 w-1.5 rounded-full bg-[#E8FF47]" />}
          {isError && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
          <span className={`text-[10px] font-mono uppercase tracking-[0.12em] ${
            isError ? 'text-red-400' : isDone ? 'text-[#E8FF47]' : 'text-[#5A6478]'
          }`}>
            {message}
          </span>
        </div>
        <span className="text-[10px] font-mono text-[#353D4A] tabular-nums">{progress}%</span>
      </div>

      <div className="h-px w-full bg-[#1E2329] rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ease-out ${isError ? 'bg-red-500' : 'bg-[#E8FF47]'}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {isError && event?.error && (
        <p className="text-xs text-red-400 font-mono mt-0.5">{event.error}</p>
      )}
    </div>
  );
}
