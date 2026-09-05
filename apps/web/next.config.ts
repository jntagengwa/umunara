import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const appDirectory = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(appDirectory, '../..'),
}

export default nextConfig
