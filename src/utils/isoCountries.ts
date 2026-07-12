// ISO 3166-1 alpha-2 → numeric mapping
// The world-atlas TopoJSON uses numeric IDs; our DB stores alpha-2 codes.
export const ALPHA2_TO_NUMERIC: Record<string, number> = {
  AF:4,AX:248,AL:8,DZ:12,AS:16,AD:20,AO:24,AI:660,AQ:10,AG:28,AR:32,AM:51,
  AW:533,AU:36,AT:40,AZ:31,BS:44,BH:48,BD:50,BB:52,BY:112,BE:56,BZ:84,
  BJ:204,BM:60,BT:64,BO:68,BQ:535,BA:70,BW:72,BV:74,BR:76,IO:86,BN:96,
  BG:100,BF:854,BI:108,CV:132,KH:116,CM:120,CA:124,KY:136,CF:140,TD:148,
  CL:152,CN:156,CX:162,CC:166,CO:170,KM:174,CG:178,CD:180,CK:184,CR:188,
  CI:384,HR:191,CU:192,CW:531,CY:196,CZ:203,DK:208,DJ:262,DM:212,DO:214,
  EC:218,EG:818,SV:222,GQ:226,ER:232,EE:233,SZ:748,ET:231,FK:238,FO:234,
  FJ:242,FI:246,FR:250,GF:254,PF:258,TF:260,GA:266,GM:270,GE:268,DE:276,
  GH:288,GI:292,GR:300,GL:304,GD:308,GP:312,GU:316,GT:320,GG:831,GN:324,
  GW:624,GY:328,HT:332,HM:334,VA:336,HN:340,HK:344,HU:348,IS:352,IN:356,
  ID:360,IR:364,IQ:368,IE:372,IM:833,IL:376,IT:380,JM:388,JP:392,JE:832,
  JO:400,KZ:398,KE:404,KI:296,KP:408,KR:410,KW:414,KG:417,LA:418,LV:428,
  LB:422,LS:426,LR:430,LY:434,LI:438,LT:440,LU:442,MO:446,MG:450,MW:454,
  MY:458,MV:462,ML:466,MT:470,MH:584,MQ:474,MR:478,MU:480,YT:175,MX:484,
  FM:583,MD:498,MC:492,MN:496,ME:499,MS:500,MA:504,MZ:508,MM:104,NA:516,
  NR:520,NP:524,NL:528,NC:540,NZ:554,NI:558,NE:562,NG:566,NU:570,NF:574,
  MK:807,MP:580,NO:578,OM:512,PK:586,PW:585,PS:275,PA:591,PG:598,PY:600,
  PE:604,PH:608,PN:612,PL:616,PT:620,PR:630,QA:634,RE:638,RO:642,RU:643,
  RW:646,BL:652,SH:654,KN:659,LC:662,MF:663,PM:666,VC:670,WS:882,SM:674,
  ST:678,SA:682,SN:686,RS:688,SC:690,SL:694,SG:702,SX:534,SK:703,SI:705,
  SB:90,SO:706,ZA:710,GS:239,SS:728,ES:724,LK:144,SD:729,SR:740,SJ:744,
  SE:752,CH:756,SY:760,TW:158,TJ:762,TZ:834,TH:764,TL:626,TG:768,TK:772,
  TO:776,TT:780,TN:788,TR:792,TM:795,TC:796,TV:798,UG:800,UA:804,AE:784,
  GB:826,US:840,UM:581,UY:858,UZ:860,VU:548,VE:862,VN:704,VG:92,VI:850,
  WF:876,EH:732,YE:887,ZM:894,ZW:716,
}

// Reverse map for tooltip labels
export const NUMERIC_TO_ALPHA2: Record<number, string> = Object.fromEntries(
  Object.entries(ALPHA2_TO_NUMERIC).map(([a2, num]) => [num, a2])
)

// Human-readable country names (full ISO 3166-1 coverage — must include
// every code the scrapers can store, or lists render raw codes)
export const COUNTRY_NAMES: Record<string, string> = {
  AD:'Andorra', AE:'UAE', AF:'Afghanistan', AG:'Antigua and Barbuda',
  AI:'Anguilla', AL:'Albania', AM:'Armenia', AO:'Angola',
  AQ:'Antarctica', AR:'Argentina', AS:'American Samoa', AT:'Austria',
  AU:'Australia', AW:'Aruba', AX:'Åland Islands', AZ:'Azerbaijan',
  BA:'Bosnia and Herzegovina', BB:'Barbados', BD:'Bangladesh', BE:'Belgium',
  BF:'Burkina Faso', BG:'Bulgaria', BH:'Bahrain', BI:'Burundi',
  BJ:'Benin', BL:'Saint Barthélemy', BM:'Bermuda', BN:'Brunei',
  BO:'Bolivia', BQ:'Bonaire, Sint Eustatius and Saba', BR:'Brazil', BS:'Bahamas',
  BT:'Bhutan', BV:'Bouvet Island', BW:'Botswana', BY:'Belarus',
  BZ:'Belize', CA:'Canada', CC:'Cocos (Keeling) Islands', CD:'Congo, Democratic Republic',
  CF:'Central African Republic', CG:'Congo', CH:'Switzerland', CI:'Côte d\'Ivoire',
  CK:'Cook Islands', CL:'Chile', CM:'Cameroon', CN:'China',
  CO:'Colombia', CR:'Costa Rica', CU:'Cuba', CV:'Cabo Verde',
  CW:'Curaçao', CX:'Christmas Island', CY:'Cyprus', CZ:'Czech Republic',
  DE:'Germany', DJ:'Djibouti', DK:'Denmark', DM:'Dominica',
  DO:'Dominican Republic', DZ:'Algeria', EC:'Ecuador', EE:'Estonia',
  EG:'Egypt', EH:'Western Sahara', ER:'Eritrea', ES:'Spain',
  ET:'Ethiopia', FI:'Finland', FJ:'Fiji', FK:'Falkland Islands',
  FM:'Micronesia', FO:'Faroe Islands', FR:'France', GA:'Gabon',
  GB:'United Kingdom', GD:'Grenada', GE:'Georgia', GF:'French Guiana',
  GG:'Guernsey', GH:'Ghana', GI:'Gibraltar', GL:'Greenland',
  GM:'Gambia', GN:'Guinea', GP:'Guadeloupe', GQ:'Equatorial Guinea',
  GR:'Greece', GS:'South Georgia and the South Sandwich Islands', GT:'Guatemala', GU:'Guam',
  GW:'Guinea-Bissau', GY:'Guyana', HK:'Hong Kong', HM:'Heard Island and McDonald Islands',
  HN:'Honduras', HR:'Croatia', HT:'Haiti', HU:'Hungary',
  ID:'Indonesia', IE:'Ireland', IL:'Israel', IM:'Isle of Man',
  IN:'India', IO:'British Indian Ocean Territory', IQ:'Iraq', IR:'Iran',
  IS:'Iceland', IT:'Italy', JE:'Jersey', JM:'Jamaica',
  JO:'Jordan', JP:'Japan', KE:'Kenya', KG:'Kyrgyzstan',
  KH:'Cambodia', KI:'Kiribati', KM:'Comoros', KN:'Saint Kitts and Nevis',
  KP:'Korea, North', KR:'South Korea', KW:'Kuwait', KY:'Cayman Islands',
  KZ:'Kazakhstan', LA:'Laos', LB:'Lebanon', LC:'Saint Lucia',
  LI:'Liechtenstein', LK:'Sri Lanka', LR:'Liberia', LS:'Lesotho',
  LT:'Lithuania', LU:'Luxembourg', LV:'Latvia', LY:'Libya',
  MA:'Morocco', MC:'Monaco', MD:'Moldova', ME:'Montenegro',
  MF:'Saint Martin', MG:'Madagascar', MH:'Marshall Islands', MK:'North Macedonia',
  ML:'Mali', MM:'Myanmar', MN:'Mongolia', MO:'Macao',
  MP:'Northern Mariana Islands', MQ:'Martinique', MR:'Mauritania', MS:'Montserrat',
  MT:'Malta', MU:'Mauritius', MV:'Maldives', MW:'Malawi',
  MX:'Mexico', MY:'Malaysia', MZ:'Mozambique', NA:'Namibia',
  NC:'New Caledonia', NE:'Niger', NF:'Norfolk Island', NG:'Nigeria',
  NI:'Nicaragua', NL:'Netherlands', NO:'Norway', NP:'Nepal',
  NR:'Nauru', NU:'Niue', NZ:'New Zealand', OM:'Oman',
  PA:'Panama', PE:'Peru', PF:'French Polynesia', PG:'Papua New Guinea',
  PH:'Philippines', PK:'Pakistan', PL:'Poland', PM:'Saint Pierre and Miquelon',
  PN:'Pitcairn', PR:'Puerto Rico', PS:'Palestine', PT:'Portugal',
  PW:'Palau', PY:'Paraguay', QA:'Qatar', RE:'Réunion',
  RO:'Romania', RS:'Serbia', RU:'Russia', RW:'Rwanda',
  SA:'Saudi Arabia', SB:'Solomon Islands', SC:'Seychelles', SD:'Sudan',
  SE:'Sweden', SG:'Singapore', SH:'Saint Helena', SI:'Slovenia',
  SJ:'Svalbard and Jan Mayen', SK:'Slovakia', SL:'Sierra Leone', SM:'San Marino',
  SN:'Senegal', SO:'Somalia', SR:'Suriname', SS:'South Sudan',
  ST:'Sao Tome and Principe', SV:'El Salvador', SX:'Sint Maarten', SY:'Syria',
  SZ:'Eswatini', TC:'Turks and Caicos Islands', TD:'Chad', TF:'French Southern Territories',
  TG:'Togo', TH:'Thailand', TJ:'Tajikistan', TK:'Tokelau',
  TL:'Timor-Leste', TM:'Turkmenistan', TN:'Tunisia', TO:'Tonga',
  TR:'Turkey', TT:'Trinidad and Tobago', TV:'Tuvalu', TW:'Taiwan',
  TZ:'Tanzania', UA:'Ukraine', UG:'Uganda', UM:'United States Minor Outlying Islands',
  US:'United States', UY:'Uruguay', UZ:'Uzbekistan', VA:'Holy See',
  VC:'Saint Vincent and the Grenadines', VE:'Venezuela', VG:'Virgin Islands, British', VI:'Virgin Islands, U.S.',
  VN:'Vietnam', VU:'Vanuatu', WF:'Wallis and Futuna', WS:'Samoa',
  XI:'International', XK:'Kosovo', YE:'Yemen', YT:'Mayotte',
  ZA:'South Africa', ZM:'Zambia', ZW:'Zimbabwe',
}

export const countryName = (alpha2: string): string =>
  COUNTRY_NAMES[alpha2] || alpha2

// Reverse map: full country name → alpha-2 (covers BODS full-name storage)
export const COUNTRY_NAME_TO_ALPHA2: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRY_NAMES).map(([a2, name]) => [name, a2])
)

// Resolve a country string (alpha-2 code OR full name) to alpha-2, or null
export function toAlpha2(country: string | undefined): string | null {
  if (!country) return null
  const upper = country.toUpperCase()
  if (upper.length === 2 && ALPHA2_TO_NUMERIC[upper] !== undefined) return upper
  return COUNTRY_NAME_TO_ALPHA2[country] ?? null
}
