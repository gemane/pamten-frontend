import { describe, it, expect } from 'vitest'
// @ts-expect-error — plain .mjs shared with the Android workflow, no types
import { androidVersionCode, DEV_VERSION, releaseVersion, resolveAppVersion } from './app-version.mjs'

const noGit = () => ''

describe('resolveAppVersion', () => {
  it('a release build reports the tag version, with or without its v', () => {
    expect(resolveAppVersion({ APP_VERSION: '1.2.3' }, noGit)).toBe('1.2.3')
    expect(resolveAppVersion({ APP_VERSION: 'v1.2.3' }, noGit)).toBe('1.2.3')
    expect(resolveAppVersion({ APP_VERSION: ' 2.0.10\n' }, noGit)).toBe('2.0.10')
  })

  it('anything else is a development build, with its commit when known', () => {
    expect(resolveAppVersion({}, noGit)).toBe(DEV_VERSION)
    expect(resolveAppVersion({ GIT_COMMIT: '0123456789abcdef' }, noGit)).toBe('0.0.0-dev+0123456')
    expect(resolveAppVersion({ RENDER_GIT_COMMIT: 'fedcba9876543210' }, noGit)).toBe('0.0.0-dev+fedcba9')
    expect(resolveAppVersion({}, () => 'abcdef0123')).toBe('0.0.0-dev+abcdef0')
  })

  it('a malformed version is not mistaken for a release', () => {
    for (const bad of ['1.2', '1.2.3.4', '01.2.3', '1.2.3-rc1', 'latest', 'v', '1.2.x']) {
      expect(releaseVersion(bad), bad).toBeNull()
      expect(resolveAppVersion({ APP_VERSION: bad }, noGit), bad).toBe(DEV_VERSION)
    }
  })
})

describe('androidVersionCode', () => {
  it('grows with every version: major·10000 + minor·100 + patch', () => {
    expect(androidVersionCode('1.0.0')).toBe(10000)
    expect(androidVersionCode('1.2.3')).toBe(10203)
    expect(androidVersionCode('1.2.10')).toBeGreaterThan(androidVersionCode('1.2.9'))
    expect(androidVersionCode('1.10.0')).toBeGreaterThan(androidVersionCode('1.9.99'))
    expect(androidVersionCode('2.0.0')).toBeGreaterThan(androidVersionCode('1.99.99'))
  })

  it('refuses a minor or patch above 99 rather than colliding', () => {
    expect(() => androidVersionCode('1.100.0')).toThrow(/≤ 99/)
    expect(() => androidVersionCode('1.0.100')).toThrow(/≤ 99/)
  })

  it('a development build is code 1 — never uploaded', () => {
    expect(androidVersionCode('0.0.0-dev+abc1234')).toBe(1)
  })
})

describe('versionMetaPlugin', () => {
  it('writes the version into index.html as <meta name="app-version">', async () => {
    const { versionMetaPlugin } = await import('../vite.config')
    const plugin = versionMetaPlugin('1.2.3') as { transformIndexHtml: () => unknown }
    expect(plugin.transformIndexHtml()).toEqual([
      { tag: 'meta', attrs: { name: 'app-version', content: '1.2.3' }, injectTo: 'head' },
    ])
  })
})
