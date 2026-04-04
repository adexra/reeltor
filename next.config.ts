import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  api: {
    bodyParser: {
      sizeLimit: '100mb', // Allow large video uploads
    },
  },
  serverExternalPackages: [
    'canvas',
    'fluent-ffmpeg',
    '@ffmpeg-installer/ffmpeg',
  ],
};

export default nextConfig;
