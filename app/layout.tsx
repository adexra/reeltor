import type { Metadata } from 'next';
import { Syne, DM_Mono, Inter } from 'next/font/google';
import './globals.css';

const syne = Syne({
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-syne',
  subsets: ['latin'],
});

const dmMono = DM_Mono({
  weight: ['300', '400', '500'],
  variable: '--font-dm-mono',
  subsets: ['latin'],
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Reelator — AI Reel Generator',
  description: 'Generate Instagram Reels and TikTok clips with AI-powered copy.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${dmMono.variable} ${inter.variable} h-full`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}