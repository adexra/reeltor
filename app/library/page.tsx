import { LibraryGrid } from '../../components/LibraryGrid';
import Link from 'next/link';

export default function LibraryPage() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border px-8 py-4 flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold text-primary tracking-tight">
          Reel Library
        </h1>
        <Link
          href="/"
          className="text-xs font-mono text-secondary hover:text-primary transition-colors"
        >
          ← Generator
        </Link>
      </header>
      <main className="p-8">
        <LibraryGrid />
      </main>
    </div>
  );
}
