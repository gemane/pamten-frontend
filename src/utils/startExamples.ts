/** A start-page suggestion: the name shown and the group's parent node it opens. */
export interface StartExample {
  label: string
  /** The node's id — the register's key (`lei:` first), which survives a rebuild. */
  id: string
}

// Each chip opens the group's PARENT company by its id. Until 2026-11-07 a chip
// searched its name and opened the first company the ranking returned, which
// was a subsidiary for several: "SoftBank" opened SoftBank Corp. (ソフトバンク株式会社),
// a subsidiary of SoftBank Group; "Saudi Aramco" opened Aramco Trading Singapore;
// "Heineken International" opened Heineken International B.V. under Heineken
// N.V.; "Grupo Bimbo" a Wikidata twin with no holdings instead of the listed
// S.A.B. with 45; "Tata Group" the Wikidata concept instead of Tata Sons. An
// LEI id is never re-keyed (the highest-ranked key), and a merged id forwards
// (`MergedId`), so the id stays right across rebuilds; the name is the label.
// An id that no longer resolves falls back to the old name search (App.tsx).
export const START_EXAMPLES: StartExample[] = [
  { label: 'Anheuser-Busch InBev', id: 'lei:5493008H3828EMEXB082' },
  { label: 'Heineken',             id: 'lei:724500K5PTPSST86UQ23' },   // Heineken N.V.
  { label: 'Carlsberg',            id: 'lei:5299001O0WJQYB5GYZ19' },
  { label: 'Nestlé',               id: 'lei:KY37LUS27QQX7BB93L28' },   // Nestle S.A., not the EDGAR twin
  { label: 'Unilever',             id: 'gb-coh:00041424' },
  { label: 'Bertelsmann',          id: 'lei:5299001BUUGXAREGE533' },
  { label: 'Axel Springer',        id: 'lei:529900PXZU3YHO6HMD80' },
  { label: 'Alphabet',             id: 'lei:5493006MHB84DD0ZWV18' },
  { label: 'Microsoft',            id: 'lei:INR2EJN1ERAN0W5ZP974' },
  { label: 'Apple',                id: 'lei:HWUPKR0MPOU8FGXBT394' },
  { label: 'News Corp',            id: 'lei:549300ITS31QK8VRBQ14' },
  { label: 'Grupo Televisa',       id: 'lei:549300O4AF0C816ILN62' },
  { label: 'Embraer',              id: 'lei:549300EM51WYXFHUY333' },
  { label: 'MercadoLibre',         id: 'lei:549300DKPDN9M5S8GB14' },
  { label: 'Grupo Bimbo',          id: 'lei:5493000RIXURZEBFEV60' },
  { label: 'SoftBank Group',       id: 'lei:5493003BZYYYCDIO0R13' },
  { label: 'Samsung Electronics',  id: 'lei:9884007ER46L6N7EI764' },
  { label: 'Tata Group',           id: 'lei:335800YLT7FVL71YN622' },   // Tata Sons Private Limited
  { label: 'Alibaba Group',        id: 'lei:5493001NTNQJDH60PM02' },
  { label: 'CITIC Group',          id: 'sec:0001389259' },
  { label: 'Saudi Aramco',         id: 'lei:5586006WD91QHB7J4X50' },   // Saudi Arabian Oil Company
  { label: 'Mubadala Investment Company', id: 'wd:Q55645212' },
  { label: 'Al Jazeera Media Network',    id: 'wd:Q4704134' },
  { label: 'Naspers',              id: 'lei:21380044BQ8812EEKT59' },
  { label: 'Dangote Group',        id: 'wd:Q3013553' },
  { label: 'MTN Group',            id: 'lei:2549009JD6Q6XHZS5E05' },
  { label: 'Wesfarmers',           id: 'lei:5493003L32ZX9557ST85' },
  { label: 'Nine Entertainment',   id: 'lei:529900WLXD3X7TFOAI42' },
]
