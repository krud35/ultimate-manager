import { pickDict, UI_LANG } from '../locale'

const pl = {
  title: 'Kompendium taktyk',
  introBefore:
    'Opisy formacji ofensywnych i defensywnych, ich wpływ na decyzje zawodników oraz sugerowane zestawy. To osobna encyklopedia —',
  introEngineNote: 'nie zmienia silnika meczu',
  introAfter: '. Ustawienia używane w meczu nadal są w zakładce „Taktyka”.',
  inGameBadge: 'W grze',
  descBadge: 'Opis',
  emptyDetail:
    'Wybierz taktykę z listy, żeby zobaczyć opis, wpływ na mecz i sugerowane wybory.',
  howItWorks: 'Jak działa',
  playerBehaviors: 'Wpływ na decyzje i zachowania zawodników',
  matchImpact: 'Wpływ na mecz',
  pros: 'Zalety',
  cons: 'Wady',
  suggestedWhen: 'Kiedy wybierać',
  avoidWhen: 'Kiedy unikać',
  pairsWell: 'Dobrze łączy się z',
  conflicts: 'Konflikt / słabe vs',
  engineStatus: 'Status względem silnika',
  sources: 'Źródła',
  catalog: 'Katalog',
  loadouts: 'Sugerowane zestawy',
  coverageBadge: (a, d, f) => `W grze: ${a} ataki · ${d} obrony · ${f} force`,
  encyclopediaBadge: (n) => `W kompendium: ${n} wpisów`,
  loadoutsIntro:
    'Gotowe kombinacje atak + obrona + force na typowe sytuacje meczowe. Możesz je później przenieść ręcznie do zakładki „Taktyka” (tylko style obecne w silniku zadziałają w meczu).',
  sourcesTitle: 'Źródła wiedzy',
  sourcesIntro:
    'Synteza materiałów taktycznych. Opisy są parafrazą i uogólnieniem — nie zastępują oryginalnych artykułów treningowych.',
  sourcesFooter:
    'Z Some Flow i Ultiworld wybrano przede wszystkim teksty o formacjach, force, zone, turnoverach i filozofii obrony. Artykuły o technice rzutu, S&C czy culture wykorzystano jako kontekst sportu, bez osobnych kart w katalogu.',
}

const en = {
  title: 'Tactics Compendium',
  introBefore:
    'Descriptions of offensive and defensive formations, how they shape player decisions, and suggested loadouts. This is a separate encyclopedia —',
  introEngineNote: 'it does not change the match engine',
  introAfter: '. Match settings still live under the “Tactics” tab.',
  inGameBadge: 'In game',
  descBadge: 'Guide only',
  emptyDetail:
    'Pick a tactic from the list to see its description, match impact, and suggested choices.',
  howItWorks: 'How it works',
  playerBehaviors: 'Impact on decisions and player behavior',
  matchImpact: 'Match impact',
  pros: 'Pros',
  cons: 'Cons',
  suggestedWhen: 'When to pick',
  avoidWhen: 'When to avoid',
  pairsWell: 'Pairs well with',
  conflicts: 'Conflicts / weak vs',
  engineStatus: 'Engine status',
  sources: 'Sources',
  catalog: 'Catalog',
  loadouts: 'Suggested loadouts',
  coverageBadge: (a, d, f) => `In game: ${a} offense · ${d} defense · ${f} force`,
  encyclopediaBadge: (n) => `In compendium: ${n} entries`,
  loadoutsIntro:
    'Ready-made attack + defense + force combinations for typical match situations. You can later copy them manually into the “Tactics” tab (only styles present in the engine will affect matches).',
  sourcesTitle: 'Knowledge sources',
  sourcesIntro:
    'A synthesis of tactics material. Descriptions are paraphrased and generalized — they do not replace the original coaching articles.',
  sourcesFooter:
    'From Some Flow and Ultiworld we mainly used pieces on formations, force, zone, turnovers, and defensive philosophy. Articles on throwing technique, S&C, or culture are background context only — no separate catalog cards.',
}

export function getTacticsGuideStrings(lang = UI_LANG.PL) {
  return pickDict({ [UI_LANG.PL]: pl, [UI_LANG.EN]: en }, lang)
}
