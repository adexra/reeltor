'use client';

import { useEffect, useState } from 'react';
import type { ReelJob } from '../schema';
import { ReelCard } from './ReelCard';

export function LibraryGrid() {
  const [jobs, setJobs] = useState<ReelJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/library')
      .then((r) => r.json())
      .then((data: ReelJob[]) => {
        setJobs(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-secondary font-mono text-sm">
        Loading library…
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <p className="text-secondary font-mono text-sm">No reels generated yet.</p>
        <a
          href="/"
          className="px-4 py-2 bg-accent text-white text-sm font-mono rounded hover:bg-blue-500 transition-colors"
        >
          Generate your first reel →
        </a>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {jobs.map((job) => (
        <ReelCard key={job.jobId} job={job} />
      ))}
    </div>
  );
}
