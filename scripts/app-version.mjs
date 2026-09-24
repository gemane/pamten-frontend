// The product version for the web build and the Android build — one number, from
// the git tag. See README "Releases & versions".
//
// A tagged release build passes APP_VERSION (the tag, `v1.2.3` or `1.2.3`); every
// other build — Render's dev deploys, a laptop, the tests — is a development build
// and says so: `0.0.0-dev+<commit>`. Nothing in the repository carries the number
// (package.json stays at 0.0.0), so it cannot drift between the three places that
// used to disagree (API 0.1.0, web 0.2.0, Android 1.0).
//
// CLI, for the workflows and the Gradle build:
//   node scripts/app-version.mjs          → the version
//   node scripts/app-version.mjs --code   → the Android versionCode
//   node scripts/app-version.mjs --check  → exit 1 unless APP_VERSION is a release version
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const DEV_VERSION = '0.0.0-dev'
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

/** `APP_VERSION` without the tag's `v`, if it is a plain major.minor.patch; else null. */
export function releaseVersion(raw) {
  const v = String(raw ?? '').trim().replace(/^v/, '')
  return SEMVER.test(v) ? v : null
}

function gitCommit() {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

/**
 * The version this build is: the release version, or the development version
 * with the commit when one is known (GIT_COMMIT, Render's RENDER_GIT_COMMIT, or
 * git itself). A malformed APP_VERSION counts as no version — the release
 * workflow checks the tag with --check before building, so only hand-made builds
 * get here.
 */
export function resolveAppVersion(env = process.env, commit = gitCommit) {
  const release = releaseVersion(env.APP_VERSION)
  if (release) return release
  const sha = (env.GIT_COMMIT || env.RENDER_GIT_COMMIT || commit() || '').trim()
  return sha ? `${DEV_VERSION}+${sha.slice(0, 7)}` : DEV_VERSION
}

/**
 * Android's versionCode: an integer Google Play requires to grow with every
 * upload. Derived from the version so it cannot be forgotten or reused:
 * major·10000 + minor·100 + patch (1.2.3 → 10203). That caps minor and patch
 * at 99 — refused loudly rather than silently colliding (1.100.0 would equal
 * 2.0.0). A development build is 1: it is never uploaded.
 */
export function androidVersionCode(version) {
  const m = SEMVER.exec(version)
  if (!m) return 1
  const [major, minor, patch] = m.slice(1).map(Number)
  if (minor > 99 || patch > 99) {
    throw new Error(`version ${version}: minor and patch must be ≤ 99 for the Android versionCode`)
  }
  return major * 10000 + minor * 100 + patch
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv[2]
  if (arg === '--check') {
    const v = releaseVersion(process.env.APP_VERSION)
    if (!v) {
      console.error(`APP_VERSION='${process.env.APP_VERSION ?? ''}' is not a release version (expected v1.2.3)`)
      process.exit(1)
    }
    console.log(v)
  } else if (arg === '--code') {
    console.log(androidVersionCode(resolveAppVersion()))
  } else {
    console.log(resolveAppVersion())
  }
}
