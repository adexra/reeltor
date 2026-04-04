import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  api: {
    bodyParser: {
      sizeLimit: '2gb', // Allow very large video uploads up to 2GB
    },
  },
  serverExternalPackages: [
    'canvas',
    'fluent-ffmpeg',
    '@ffmpeg-installer/ffmpeg',
  ],
};

export default nextConfig;
