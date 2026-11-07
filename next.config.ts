import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ['ffmpeg-static'],
  outputFileTracingIncludes: {
    '/api/analyze': ['./node_modules/ffmpeg-static/ffmpeg*'],
  },
};

export default nextConfig;
