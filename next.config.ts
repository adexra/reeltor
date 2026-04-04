import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      'canvas',
      'fluent-ffmpeg',
      '@ffmpeg-installer/ffmpeg',
    ],
  },
  serverExternalPackages: [
    'canvas',
    'fluent-ffmpeg',
    '@ffmpeg-installer/ffmpeg',
  ],
};

export default nextConfig;
