'use client';

import { useState } from 'react';
import type { ReelJob } from '../schema';

interface Props {
  job: ReelJob;
}

export function ReelCard({ job }: Props) {
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const { aiContent, jobId } = job;
  if (!aiContent) return null;

  const fullCaption = [aiContent.caption, '', aiContent.hashtags.join(' ')].join('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullCaption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const createdAt = new Date(job.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="bg-surface border border-border rounded overflow-hidden flex flex-col">
      {/* Video */}
      <div className="relative bg-black aspect-[9/16] w-full overflow-hidden">
        <video
          src={job.outputPath ?? `/api/library/${jobId}/download`}
          className="w-full h-full object-cover"
          controls
          muted
          loop
          playsInline
          autoPlay
        />
      </div>

      {/* Content */}
      <div className="flex flex-col gap-3 p-4 flex-1">
        {/* Hook */}
        <h3 className="font-mono font-bold text-primary text-base leading-tight">
          {aiContent.hook}
        </h3>

        {/* Date */}
        <span className="text-xs text-secondary font-mono">{createdAt}</span>

        {/* Caption */}
        <div className="text-sm text-secondary leading-relaxed">
          {captionExpanded ? (
            <p className="whitespace-pre-line">{aiContent.caption}</p>
          ) : (
            <p className="line-clamp-3 whitespace-pre-line">{aiContent.caption}</p>
          )}
          <button
            onClick={() => setCaptionExpanded((v) => !v)}
            className="text-xs text-accent mt-1 hover:underline"
          >
            {captionExpanded ? 'Show less' : 'Show more'}
          </button>
        </div>

        {/* Hashtags */}
        <div className="flex flex-wrap gap-1">
          {aiContent.hashtags.map((tag) => (
            <span
              key={tag}
              className="text-xs font-mono bg-border text-secondary px-2 py-0.5 rounded"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-auto pt-2">
          <button
            onClick={handleCopy}
            className={`flex-1 py-2 text-xs font-mono rounded border transition-colors ${
              copied
                ? 'border-accent text-accent'
                : 'border-border text-secondary hover:border-accent/50 hover:text-primary'
            }`}
          >
            {copied ? 'Copied!' : 'Copy Caption'}
          </button>
          <a
            href={`/api/library/${jobId}/download`}
            download={`reel-${jobId}.mp4`}
            className="flex-1 py-2 text-xs font-mono rounded border border-border text-secondary hover:border-accent/50 hover:text-primary transition-colors text-center"
          >
            Download MP4
          </a>
        </div>
      </div>
    </div>
  );
}
