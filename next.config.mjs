import { execSync } from 'child_process'

let commitHash = 'dev'
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  // Not in a git repo or git not available
}

const now = new Date()
const buildDate = `${now.getMonth() + 1}${String(now.getDate()).padStart(2, '0')}`

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_HASH: commitHash,
    NEXT_PUBLIC_BUILD_DATE: buildDate,
  },
}

export default nextConfig
