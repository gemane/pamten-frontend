import { describe, it, expect } from 'vitest'
import { dismissKey, NO_UPDATE, safeStoreUrl, shouldCheck, toUpdateState } from './appVersionCheck'

describe('shouldCheck', () => {
  it('asks only from a native app with a real version', () => {
    expect(shouldCheck('android', '1.2.3')).toBe(true)
    expect(shouldCheck('ios', '1.0.0')).toBe(true)
  })
  it('the web app never asks: it always runs the last deploy', () => {
    expect(shouldCheck('web', '1.2.3')).toBe(false)
  })
  it('a development build never asks — it would read as older than any minimum', () => {
    expect(shouldCheck('android', '0.0.0-dev+abc1234')).toBe(false)
    expect(shouldCheck('android', '0.0.0-dev')).toBe(false)
    expect(shouldCheck('android', '')).toBe(false)
    expect(shouldCheck('android', null)).toBe(false)
  })
})

describe('toUpdateState', () => {
  const url = 'https://play.google.com/store/apps/details?id=org.owlgraph.app'
  it('required wins over available', () => {
    expect(toUpdateState({ update_required: true, update_available: true, store_url: url }))
      .toEqual({ kind: 'required', storeUrl: url, message: null })
  })
  it('available carries the offered version for the dismissal', () => {
    expect(toUpdateState({ update_required: false, update_available: true, latest: '1.4.0',
                           store_url: url, message: ' New map view ' }))
      .toEqual({ kind: 'available', storeUrl: url, message: 'New map view', latest: '1.4.0' })
  })
  it('fails open on anything unexpected', () => {
    for (const bad of [null, undefined, 'ok', 42, [], {}, { update_required: 'true' },
                       { update_required: 1 }]) {
      expect(toUpdateState(bad), JSON.stringify(bad)).toEqual(NO_UPDATE)
    }
    expect(toUpdateState({ update_required: false, update_available: false })).toEqual(NO_UPDATE)
  })
})

describe('safeStoreUrl', () => {
  it('lets store and https links through', () => {
    expect(safeStoreUrl('https://play.google.com/x')).toBe('https://play.google.com/x')
    expect(safeStoreUrl('market://details?id=org.owlgraph.app')).toBe('market://details?id=org.owlgraph.app')
    expect(safeStoreUrl('itms-apps://apps.apple.com/app/id1')).toBe('itms-apps://apps.apple.com/app/id1')
  })
  it('never a script, plain http or anything else', () => {
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'http://example.com',
                       'data:text/html,x', '', ' ', null, 7]) {
      expect(safeStoreUrl(bad), String(bad)).toBeNull()
    }
  })
})

it('the dismissal is per offered version', () => {
  expect(dismissKey('1.4.0')).not.toBe(dismissKey('1.5.0'))
})
