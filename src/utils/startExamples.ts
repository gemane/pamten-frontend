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
//
// The list is international on purpose (2026-11-07): every chip is a group with
// a tree on the rebuilt dev database. A group that came back thin stays a scrape
// target without a chip (Porsche SE: 4 subsidiaries, Volkswagen is not under it
// in GLEIF; Mubadala, Al Jazeera, Nine, CITIC: no tree; Axel Springer: 5).
export const START_EXAMPLES: StartExample[] = [
  // North America
  { label: 'Alphabet',                 id: 'lei:5493006MHB84DD0ZWV18' },
  { label: 'Microsoft',                id: 'lei:INR2EJN1ERAN0W5ZP974' },
  { label: 'Apple',                    id: 'lei:HWUPKR0MPOU8FGXBT394' },
  { label: 'News Corp',                id: 'lei:549300ITS31QK8VRBQ14' },
  { label: 'Berkshire Hathaway',       id: 'lei:5493000C01ZX7D35SD85' },
  { label: 'Tesla',                    id: 'lei:54930043XZGB27CTOV49' },
  { label: 'SpaceX',                   id: 'lei:549300B9WLO96RQCXP87' },   // Space Exploration Technologies Corp.
  { label: 'Constellation Brands',     id: 'lei:5493005GKEG8QCVY7037' },
  // Latin America
  { label: 'Grupo Televisa',           id: 'lei:549300O4AF0C816ILN62' },
  { label: 'Embraer',                  id: 'lei:549300EM51WYXFHUY333' },
  { label: 'MercadoLibre',             id: 'lei:549300DKPDN9M5S8GB14' },
  { label: 'Grupo Bimbo',              id: 'lei:5493000RIXURZEBFEV60' },
  { label: 'América Movil',            id: 'lei:5493000FNR3UCEAONM59' },   // the S.A.B., not América Móvil B.V.
  { label: 'Vale',                     id: 'lei:254900SMTWBX7RU2SR20' },
  { label: 'Petrobras',                id: 'lei:5493000J801JZRCMFE49' },   // Petróleo Brasileiro, not Petrobras Argentina
  // Europe
  { label: 'Anheuser-Busch InBev',     id: 'lei:5493008H3828EMEXB082' },
  { label: 'Heineken',                 id: 'lei:724500K5PTPSST86UQ23' },   // Heineken N.V.
  { label: 'Carlsberg',                id: 'lei:5299001O0WJQYB5GYZ19' },
  { label: 'Nestlé',                   id: 'lei:KY37LUS27QQX7BB93L28' },   // Nestle S.A.
  { label: 'Unilever',                 id: 'gb-coh:00041424' },
  { label: 'Bertelsmann',              id: 'lei:5299001BUUGXAREGE533' },
  { label: 'Barclays',                 id: 'lei:213800LBQA1Y9L22JB70' },
  { label: 'LVMH',                     id: 'lei:IOG4E947OATN0KJYSD45' },
  { label: 'Exor',                     id: 'lei:5493002ENHZ6NYET7405' },
  { label: 'Investor AB',              id: 'lei:549300VEBQPHRZBKUX38' },   // Investor Aktiebolag
  { label: 'Roche',                    id: 'lei:549300U41AUUVOAAOB37' },
  { label: 'Inditex',                  id: 'lei:549300TTCXZOGZM2EY83' },
  { label: 'Bosch',                    id: 'lei:529900F0LT5OP4SV6122' },   // Robert Bosch GmbH
  // Russia — the structure before the sanctions
  { label: 'Lukoil',                   id: 'lei:549300LCJ1UJXHYBWI24' },
  { label: 'Sberbank',                 id: 'lei:549300WE6TAF5EEWQS81' },
  { label: 'Gazprom',                  id: 'lei:213800FD9J2IHTA7YX78' },   // PJSC Gazprom, not Gazprom Neft
  // Middle East
  { label: 'Saudi Aramco',             id: 'lei:5586006WD91QHB7J4X50' },   // Saudi Arabian Oil Company
  { label: 'Qatar Investment Authority', id: 'lei:5493008JZL5CRK3VS565' },   // the GLEIF record, not the 13F filer
  { label: 'e&',                       id: 'lei:529900XDPQPWEQ9BGB80' },   // Emirates Telecommunications Group
  // Asia
  { label: 'SoftBank Group',           id: 'lei:5493003BZYYYCDIO0R13' },
  { label: 'Samsung Electronics',      id: 'lei:9884007ER46L6N7EI764' },
  { label: 'Alibaba Group',            id: 'lei:5493001NTNQJDH60PM02' },
  { label: 'Tata Group',               id: 'lei:335800YLT7FVL71YN622' },   // Tata Sons Private Limited
  { label: 'Toyota',                   id: 'lei:5493006W3QUS5LMH6R84' },
  { label: 'Sony',                     id: 'lei:529900R5WX9N2OI2N910' },
  { label: 'Mitsubishi Corporation',   id: 'lei:KVIPTY4PULAPGC1VVD26' },
  { label: 'TSMC',                     id: 'lei:549300KB6NK5SBD14S87' },
  { label: 'Foxconn',                  id: 'lei:30030004CM3GSZXX7O56' },   // Hon Hai Precision Industry
  { label: 'Infosys',                  id: 'lei:335800TYLGG93MM7PR89' },
  { label: 'Adani',                    id: 'lei:335800OTN96B3M38HC30' },   // Adani Enterprises
  { label: 'Hyundai',                  id: 'lei:9884004RQX8PRBXQ8S60' },   // Hyundai Motor Company
  { label: 'Baidu',                    id: 'lei:254900AL64IANZYI1E02' },
  { label: 'Jardine Matheson',         id: 'lei:2138009KENVUNWOLPK41' },
  // Africa
  { label: 'Naspers',                  id: 'lei:21380044BQ8812EEKT59' },
  { label: 'MTN Group',                id: 'lei:2549009JD6Q6XHZS5E05' },
  { label: 'Dangote Group',            id: 'wd:Q3013553' },
  // Oceania
  { label: 'Wesfarmers',               id: 'lei:5493003L32ZX9557ST85' },
]
