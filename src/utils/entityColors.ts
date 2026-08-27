/**
 * The one palette for node types.
 *
 * These colours were duplicated in five places — the cytoscape selectors in
 * Graph.tsx, the inline styles in GraphLegend.tsx, the `.node-type-badge--*`
 * rules in index.css, and partial three-entry copies in ScraperPanel.tsx and
 * MapPanel.tsx. The partial ones were already wrong: they knew about company,
 * brand and holding, so funds, foundations, governments and nonprofits rendered
 * neutral grey.
 *
 * Values are taken verbatim from Graph.tsx, which was the de-facto source of
 * truth. The `border` is the darker outline the graph draws around each node.
 *
 * Not covered here on purpose: the `.node-type-badge--*` CSS. Those sit on a
 * translucent background and one of them is deliberately off-palette —
 * `--fund` uses #8a7009 rather than #B7950B because the lighter gold does not
 * carry enough contrast as text. Colour-as-text is a different problem from
 * colour-as-fill; leave those in CSS.
 */

export interface NodeColor {
  fill: string
  border: string
}

/** Neutral for a type we do not recognise — matches the existing fallbacks. */
export const NEUTRAL: NodeColor = { fill: '#8892a4', border: '#6b7688' }

export const ENTITY_COLORS: Record<string, NodeColor> = {
  company:    { fill: '#4A90D9', border: '#2d6aa8' },
  brand:      { fill: '#E67E22', border: '#b05a0d' },
  holding:    { fill: '#8E44AD', border: '#622d7a' },
  government: { fill: '#B03A2E', border: '#7a2820' },
  foundation: { fill: '#16A085', border: '#0e6b59' },
  fund:       { fill: '#B7950B', border: '#7d6608' },
  nonprofit:  { fill: '#C0398B', border: '#84265f' },
  // Not an organisation but an agreement between them: a set of parties
  // filing one SEC Schedule 13D. Amber, to read as a construct rather than
  // another firm.
  voting_group: { fill: '#b7791f', border: '#ecc94b' },
  person:     { fill: '#27AE60', border: '#1a7a42' },
}

/**
 * Entity subtypes that get their own style, i.e. everything except the two the
 * graph handles with dedicated rules: `company` is the base entity style that
 * an unrecognised subtype falls back to, and `person` is not an entity subtype
 * at all.
 */
export const ENTITY_SUBTYPES = [
  'brand', 'holding', 'government', 'foundation', 'fund', 'nonprofit',
] as const

/**
 * The colour for a node, from the same two fields the graph styles on.
 *
 * `nodeType` is checked first: a person is a person regardless of what any
 * stray `entitySubtype` says, which mirrors the cytoscape rule order where the
 * person selector comes last and wins.
 */
export function colorFor(nodeType?: string | null, entitySubtype?: string | null): NodeColor {
  if (nodeType === 'person') return ENTITY_COLORS.person
  if (entitySubtype && ENTITY_COLORS[entitySubtype]) return ENTITY_COLORS[entitySubtype]
  if (nodeType === 'entity') return ENTITY_COLORS.company   // the graph's default entity style
  return NEUTRAL
}

/**
 * The i18n key naming a type, for a tooltip or screen-reader label.
 *
 * Shares the `legend.*` namespace with GraphLegend, so the marker and the
 * legend always call a fund the same thing.
 */
export function typeLabelKey(nodeType?: string | null, entitySubtype?: string | null): string {
  if (nodeType === 'person') return 'legend.person'
  if (entitySubtype && ENTITY_COLORS[entitySubtype]) return `legend.${entitySubtype}`
  return 'legend.company'
}
