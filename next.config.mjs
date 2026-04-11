import { execSync } from 'child_process'

let commitHash = 'dev'
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  // Not in a git repo or git not available
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_HASH: commitHash,
  },
}

export default nextConfig
