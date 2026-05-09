import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to demo-saas/ so Next.js doesn't latch onto the
  // parent helix lockfile. Silences "multiple lockfiles" warning.
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
};

export default nextConfig;
