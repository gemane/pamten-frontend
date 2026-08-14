/**
 * Going back from a subsidiary on the map.
 *
 * Reported: open MICROSOFT CORPORATION, switch to the map, click a subsidiary in
 * the panel (LINKEDIN IRELAND UNLIMITED COMPANY), press Back — and you land on
 * the *graph* tab, showing Microsoft's graph, while the panel still shows
 * LinkedIn. Expected: back to the map, listing Microsoft's subsidiaries again.
 *
 * The cause was that the URL carried the tab, the centred graph node and the
 * selected country, but not the map's context node. Selecting a subsidiary
 * therefore pushed no history entry at all, so Back popped the entry *before*
 * the map. These tests drive the real flow through App's history handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { Entity, FullProfile, NodeData, OwnsRelationship } from './types'

vi.mock('./components/Graph', () => ({ default: () => <div data-testid="graph" /> }))
vi.mock('./components/MapView', () => ({ default: () => <div data-testid="map" /> }))
vi.mock('./components/GraphLegend', () => ({ default: () => null }))
vi.mock('./components/ScraperPanel', () => ({ default: () => null }))
vi.mock('./components/SettingsPanel', () => ({ default: () => null }))
vi.mock('./components/AuthModal', () => ({ default: () => null }))
vi.mock('./components/ModeratorQueue', () => ({ default: () => null }))
vi.mock('./components/NodePanel', () => ({ default: () => <div data-testid="node-panel" /> }))

/** A panel that shows whose subsidiary list it is, and lets a test click one. */
vi.mock('./components/MapPanel', () => ({
  default: ({ contextNode, contextSubsidiaries = [], onSelectSubsidiary }: {
    contextNode?: NodeData | null
    contextSubsidiaries?: NodeData[]
    onSelectSubsidiary?: (n: NodeData) => void
  }) => (
    <div data-testid="map-panel" data-context={contextNode?.label ?? 'none'}>
      {contextSubsidiaries.map(s => (
        <button key={s.id} onClick={() => onSelectSubsidiary?.(s)}>{s.label}</button>
      ))}
    </div>
  ),
}))

vi.mock('./context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({ user: null, logout: vi.fn() }),
}))

vi.mock('./services/api', () => ({
  search: vi.fn(), ensureScrape: vi.fn(), getFullProfile: vi.fn(), getPersonProfile: vi.fn(),
  getEntitiesByCountry: vi.fn(), getCountryEntities: vi.fn(), getEntitiesWithoutCountry: vi.fn(),
  getEntitiesBySubdivision: vi.fn(), getSubdivisionEntities: vi.fn(), getCountries: vi.fn(),
  setUnauthorizedHandler: vi.fn(), authVerifyEmail: vi.fn(),
}))

import App from './App'
import { search, getFullProfile, getCountries, getEntitiesByCountry,
         getEntitiesBySubdivision, getCountryEntities,
         getEntitiesWithoutCountry } from './services/api'

const ent = (id: string, name: string): Entity =>
  ({ id, name, type: 'company', verified: false, country: 'US' } as Entity)

const microsoft: FullProfile = {
  entity: ent('e-msft', 'MICROSOFT CORPORATION'),
  owners: [],
  subsidiaries: [{
    entity: ent('e-li', 'LINKEDIN IRELAND UNLIMITED COMPANY'),
    relationship: { ownership_type: 'full', stake_percent: 100 } as OwnsRelationship,
  }],
  executives: [],
}

beforeEach(() => {
  // Reset the URL without assigning to location.hash: in jsdom that counts as a
  // navigation and fires popstate, which App reads as "a restore is in flight"
  // and then suppresses every later pushState.
  window.history.replaceState(null, '', '/')
  vi.mocked(getCountries).mockResolvedValue({ data: [] } as never)
  vi.mocked(getEntitiesByCountry).mockResolvedValue({ data: [] } as never)
  // Every api call the map tab makes must resolve: an unmocked vi.fn() returns
  // undefined, and `.then` on it throws inside handleTabChange — which aborts
  // applyView before it restores anything, silently.
  vi.mocked(getEntitiesBySubdivision).mockResolvedValue({ data: [] } as never)
  vi.mocked(getCountryEntities).mockResolvedValue({ data: [] } as never)
  vi.mocked(getEntitiesWithoutCountry).mockResolvedValue({ data: [] } as never)
  vi.mocked(getFullProfile).mockResolvedValue({ data: microsoft } as never)
  vi.mocked(search).mockResolvedValue({ data: [
    { type: 'Entity', score: 1, node: ent('e-msft', 'MICROSOFT CORPORATION') },
  ] } as never)
})

/** Open Microsoft in the graph, then switch to the map tab. */
async function openMicrosoftOnTheMap() {
  render(<App />)
  const input = screen.getByPlaceholderText(/Search companies/i)
  await userEvent.type(input, 'microsoft', { delay: null })
  await userEvent.click(await screen.findByText('MICROSOFT CORPORATION'))
  await waitFor(() => expect(window.location.hash).toBe('#graph/e/e-msft'))

  await userEvent.click(screen.getByRole('button', { name: /^Map$/i }))
  await screen.findByTestId('map-panel')
}

const panelContext = () => screen.getByTestId('map-panel').getAttribute('data-context')

/** Press Back.
 *
 * Not `history.back()`: jsdom shares one history stack across every test in a
 * file, so it pops entries an earlier test pushed and the flow under test stops
 * being the flow. This does what the browser does on a back — put the previous
 * URL in place and dispatch popstate — which is exactly the path App handles. */
function pressBack(toHash: string) {
  window.history.replaceState(null, '', toHash)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

describe('back from a subsidiary on the map', () => {
  it('records the company the map is showing in the URL', async () => {
    await openMicrosoftOnTheMap()
    // Previously just '#map', which is why selecting a subsidiary changed nothing.
    await waitFor(() => expect(window.location.hash).toBe('#map/n/e-msft'))
  })

  it('pushes an entry when a subsidiary is selected', async () => {
    await openMicrosoftOnTheMap()
    await userEvent.click(await screen.findByRole('button',
      { name: /LINKEDIN IRELAND UNLIMITED COMPANY/i }))

    await waitFor(() => expect(window.location.hash).toBe('#map/n/e-li'))
    expect(panelContext()).toBe('LINKEDIN IRELAND UNLIMITED COMPANY')
  })

  it('goes back to the list it came from, still on the map', async () => {
    // The bug, stated as a test: Back landed on the graph tab showing Microsoft
    // while the panel still showed LinkedIn.
    await openMicrosoftOnTheMap()
    await userEvent.click(await screen.findByRole('button',
      { name: /LINKEDIN IRELAND UNLIMITED COMPANY/i }))
    await waitFor(() => expect(panelContext()).toBe('LINKEDIN IRELAND UNLIMITED COMPANY'))

    pressBack('#map/n/e-msft')

    await waitFor(() => expect(panelContext()).toBe('MICROSOFT CORPORATION'))
    expect(screen.getByTestId('map-panel')).toBeInTheDocument()      // still the map
    expect(screen.queryByTestId('graph')).toBeNull()                 // NOT the graph tab
  })

  it('only leaves the map on the next back', async () => {
    await openMicrosoftOnTheMap()
    await userEvent.click(await screen.findByRole('button',
      { name: /LINKEDIN IRELAND UNLIMITED COMPANY/i }))
    await waitFor(() => expect(panelContext()).toBe('LINKEDIN IRELAND UNLIMITED COMPANY'))

    pressBack('#map/n/e-msft')
    await waitFor(() => expect(panelContext()).toBe('MICROSOFT CORPORATION'))

    pressBack('#graph/e/e-msft')
    await waitFor(() => expect(screen.getByTestId('graph')).toBeInTheDocument())
    expect(screen.queryByTestId('map-panel')).toBeNull()
  })
})
