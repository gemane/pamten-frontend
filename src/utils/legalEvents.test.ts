import { describe, it, expect } from 'vitest'
import { currentState, parseLegalEvent } from './legalEvents'

describe('the proceedings of a living company (item 85d)', () => {
  it('parses the stored entry, the recorded day beside the effective one', () => {
    expect(parseLegalEvent('LIQUIDATION|IN_PROGRESS|2025-04-28|2025-04-28')).toEqual(
      { event: 'liquidation', status: 'in_progress', effective: '2025-04-28', recorded: '2025-04-28' })
    expect(parseLegalEvent('INSOLVENCY|IN_PROGRESS||2026-10-12')).toEqual(
      { event: 'insolvency', status: 'in_progress', effective: null, recorded: '2026-10-12' })
    expect(parseLegalEvent('DISSOLUTION|COMPLETED|2020-01-01|')).toBeNull()     // an end is not a state
    expect(parseLegalEvent('LIQUIDATION|PENDING|2020-01-01|')).toBeNull()
    expect(parseLegalEvent('garbage')).toBeNull()
    expect(parseLegalEvent(null)).toBeNull()
  })

  it('the current state is a type whose latest entry is in progress', () => {
    // Diamond Transmission: in liquidation since 2025-04-28
    expect(currentState(['LIQUIDATION|IN_PROGRESS|2025-04-28|2025-04-28'])).toEqual({ event: 'liquidation', since: '2025-04-28' })
    // Petrotel: an insolvency the register dates only by its own recording
    expect(currentState(['INSOLVENCY|IN_PROGRESS||2026-10-12'])).toEqual({ event: 'insolvency', since: '2026-10-12' })
    // a liquidation called off is no state; a completed arrangement neither
    expect(currentState(['LIQUIDATION|IN_PROGRESS|2021-01-01|2021-01-02', 'LIQUIDATION|WITHDRAWN_CANCELLED|2022-05-01|2022-05-03'])).toBeNull()
    expect(currentState(['VOLUNTARY_ARRANGEMENT|COMPLETED|2024-06-20|2025-05-28'])).toBeNull()
    // two proceedings in progress: the one that began last
    expect(currentState(['LIQUIDATION|IN_PROGRESS|2021-01-01|', 'BANKRUPTCY|IN_PROGRESS|2023-03-03|'])).toEqual({ event: 'bankruptcy', since: '2023-03-03' })
    expect(currentState([])).toBeNull()
    expect(currentState(undefined)).toBeNull()
  })
})
