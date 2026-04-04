import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  api: {
    bodyParser: {
      sizeLimit: '500mb', // Allow large video uploads up to 500MB
    },
  },
  serverExternalPackages: [
    'canvas',
    'fluent-ffmpeg',
    '@ffmpeg-installer/ffmpeg',
  ],
};

export default nextConfig;
