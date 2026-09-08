import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const appDirectory = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(appDirectory, '../..'),
  async redirects() {
    return [
      { source: '/calendar', destination: '/events', permanent: true },
      { source: '/donate', destination: '/give', permanent: true },
    ]
  },
}

export default nextConfig
