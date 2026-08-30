import { FIELD_DIMENSIONS, clampFieldX, clampFieldY } from '../fieldDimensions.js'
import { subStat } from './statFormulas.js'

/**
 * Mapa WOLNEJ PRZESTRZENI wokół dysku — podstawa decyzji cutterów.
 *
 * Po co to istnieje
 * -----------------
 * Wcześniej rodzaj cutu wybierał `preferredCutKind(attackStyle, stackIndex, rng)`, czyli
 * STYL + rzut kostką, a formacja wpływała na wynik rzutów przez skalary w
 * TACTICS_MODIFIERS (`throwDepthBias` itd.). To jest odwrócenie przyczynowości i dawało
 * wyniki sprzeczne z ultimate: zmierzony udział hucków per styl wychodził ODWROTNIE
 * skorelowany z deklarowanym `throwDepthBias` (vertical stack: bias -0.15, hucki 13.3%;
 * horizontal: bias +0.35, hucki 2.3%; motion i hex: dokładnie 0.0%).
 *
 * W realnym ultimate jest na odwrót: formacja decyduje tylko o tym, GDZIE STOJĄ ZAWODNICY,
 * a to decyduje o tym, GDZIE JEST WOLNA PRZESTRZEŃ. Zawodnicy czytają tę przestrzeń i ją
 * atakują — a wyniki rzutowe wychodzą z tego POŚREDNIO. Płytko stojący cutterzy
 * (horizontal stack) nie są powodem, dla którego hucków ma być mało — przeciwnie,
 * zostawiają puste deep, więc jest gdzie się rozpędzić i wybiec, i huck jest ŁATWIEJSZY.
 * Vertical stack stoi kolumną na środku, więc wolne są boki i gra idzie bardziej w bok.
 * Side stack zwija wszystkich na jedną linię boczną i otwiera środek pod iso.
 *
 * Ta mapa liczy to jawnie, więc każda formacja — także taka, której nikt nie zakodował
 * osobną gałęzią `switch` — daje sensowne zachowanie automatycznie.
 *
 * Układ współrzędnych
 * -------------------
 * Komórki są w układzie WZGLĘDEM DYSKU wzdłuż osi ataku (`ahead`) i w pasmach bocznych
 * liczonych na SZTYWNO wzdłuż szerokości boiska (`lane`) — bo „przestrzeń na boku" to
 * cecha boiska, nie dysku: kolumna vertical stacka stoi na środku boiska niezależnie od
 * tego, gdzie akurat jest dysk.
 */

/**
 * Ćwiartki głębokości względem dysku (metry do przodu wzdłuż ataku).
 *
 * Cztery pasma zamiast trzech, bo trzy zlepiały ze sobą dwie różne sytuacje: krótki
 * under pod dysk i długi under z głębi stacka to inne zagrania o innym kształcie, a
 * lądowały w jednym worku. Przy czterech pasmach horizontal stack zachowuje sensowne
 * undery (płytkie, płaskie), a vertical swoje (dłuższe, bardziej skośne).
 */
/**
 * SIATKA ADAPTACYJNA wokół dysku: blisko drobna, daleko gruba.
 *
 * Poprzednio było 5 pasm głębokości × 4 pasy = 20 komórek o środkach -4, 6.5, 15.5, 25.5
 * i 39.5 m. Trzy z pięciu leżały powyżej 15 m, więc MENU, z którego wybiera cutter, było
 * strukturalnie przechylone w dal — niezależnie od wag. Zmierzone: przy skrajnym
 * przeważeniu wag krótkie rzuty utykały na 24-26% wobec celu 50-60%, a średnie puchły
 * do 68% wobec 30-35%.
 *
 * Jednolita siatka (np. 2x2 m) rozwiązałaby nierówność szerokości, ale wprowadziłaby
 * NOWĄ stronniczość: powierzchnia rośnie z odległością, więc dalekich komórek byłoby
 * WIĘCEJ, a wybór przez maksimum z szumem premiuje region o większej liczbie kandydatów.
 *
 * Stąd siatka o zmiennej rozdzielczości: pierścienie węższe blisko dysku i szersze
 * daleko, z większą liczbą pasów bocznych blisko. Efekt jest podwójny — rozdzielczość
 * odpowiada realnej potrzebie (rzut na 5 m wymaga precyzji 2 m, rzut na 40 m nie), a
 * liczba komórek blisko przewyższa liczbę komórek daleko, więc menu przechyla się ku
 * bliskiej przestrzeni zamiast od niej.
 */
export const RINGS = [
  { minAhead: -12, maxAhead: -5, lanes: 4 },
  { minAhead: -5, maxAhead: 0, lanes: 5 },
  { minAhead: 0, maxAhead: 4, lanes: 6 },
  { minAhead: 4, maxAhead: 8, lanes: 6 },
  { minAhead: 8, maxAhead: 13, lanes: 6 },
  { minAhead: 13, maxAhead: 19, lanes: 5 },
  { minAhead: 19, maxAhead: 26, lanes: 4 },
  { minAhead: 26, maxAhead: 35, lanes: 4 },
  { minAhead: 35, maxAhead: 48, lanes: 3 },
  // Rzuty naprawdę dalekie. Jeśli mają realnie latać, muszą mieć swoją przestrzeń na
  // mapie — inaczej cutter nie ma dokąd wybiec, a huck powstaje tylko przypadkiem.
  { minAhead: 48, maxAhead: 80, lanes: 3 },
]

/** Etykieta pasma z odległości — zachowana dla konsumentów (reset/deep itd.). */
export function depthIdFor(ahead) {
  if (ahead < 2) return 'reset'
  if (ahead < 11) return 'under'
  if (ahead < 20) return 'mid_under'
  if (ahead < 31) return 'mid_deep'
  return 'deep'
}

/** Zachowane dla diagnostyk i threatCellForMark (maxAhead). */
export const DEPTH_BANDS = [
  { id: 'reset', minAhead: -12, maxAhead: 2 },
  { id: 'under', minAhead: 2, maxAhead: 11 },
  { id: 'mid_under', minAhead: 11, maxAhead: 20 },
  { id: 'mid_deep', minAhead: 20, maxAhead: 31 },
  { id: 'deep', minAhead: 31, maxAhead: 80 },
]

/**
 * Zasięg jądra wygaszania przy liczeniu zajętości. Zawodnik oddalony o tyle metrów od
 * środka komórki już jej praktycznie nie zajmuje. ~9 m to realny promień, na którym
 * cutter/obrońca faktycznie „zabiera" przestrzeń w ultimate.
 */
/**
 * Promień wokół dysku, w którym komórki są DZIELONE na cztery.
 *
 * Blisko dysku rozgrywa się gra na małych dystansach — reset, upline, krótki swing — i
 * metr robi tam realną różnicę, a zawodnik ma więcej sensownych miejsc, w które może się
 * ruszyć. Dalej precyzja tej klasy jest bez znaczenia: rzut na 40 m nie potrzebuje
 * rozdzielczości 2 m. Podział działa PROMIENIOWO, więc obejmuje też przestrzeń za dyskiem
 * i po bokach, i celowo łamie regularność siatki.
 */
const DENSE_RADIUS_M = 10

/**
 * Odniesienie dla wartości terenu. Trzymane na 48 m mimo pierścienia sięgającego 80 m —
 * inaczej dodanie dalekiego pierścienia po cichu przeskalowałoby wszystkie wagi terenu
 * (i w cutterBrain, i w threatCellForMark) o połowę.
 */
export const YARD_REF_M = 48

const OCCUPANCY_RADIUS_M = 9

/** Ile ważniejsza jest obecność OBROŃCY niż kolegi przy ocenie, czy przestrzeń jest wolna.
 *  Kolega zatyka przestrzeń (nie ma gdzie biec), obrońca ją ODBIERA (jest komu bronić). */
const DEFENDER_WEIGHT = 1.35

/** Wkład jednego zawodnika w zajętość komórki — liniowe wygaszanie do OCCUPANCY_RADIUS_M. */
function occupancyContribution(px, py, cx, cy) {
  const d = Math.hypot(px - cx, py - cy)
  if (d >= OCCUPANCY_RADIUS_M) return 0
  return 1 - d / OCCUPANCY_RADIUS_M
}

/**
 * Buduje mapę przestrzeni wokół dysku.
 *
 * @param {object} args
 * @param {{x:number,y:number}} args.disc
 * @param {1|-1} args.attackSign kierunek ataku wzdłuż osi X
 * @param {Array<{x:number,y:number,id?:any}>} args.teammates pozycje ATAKU
 * @param {Array<{x:number,y:number,id?:any}>} args.defenders pozycje OBRONY
 * @param {any} [args.ignoreId] zawodnik, którego pomijamy (sam siebie nie zatyka)
 * @returns {Array<{depth:string,lane:number,x:number,y:number,ahead:number,
 *   teamOccupancy:number,defPressure:number,freeness:number}>}
 */
/** Ile waży NAJGROŹNIEJSZY z pozostałych obrońców — kontekst i pomoc, nie krycie. */
/** Ile tłok waży przy ocenie, czy da się tam WBIEC (przy podaniu waży więcej). */
const CROWD_MOVE_WEIGHT = 0.45

/**
 * CIEŃ obrońcy — jego ZAANGAŻOWANIE w daną przestrzeń.
 *
 * Obrońca kryjący zawodnika biegnie razem z nim, więc „kto dobiegnie pierwszy" niczego
 * nie różnicuje: przy obrońcy przyklejonym do cuttera wychodziło ~1.0 na każdą komórkę
 * (zmierzone w teście izolowanym). Właściwy model to BUDŻET KRYCIA: obrońca może
 * zaangażować się w jedną przestrzeń i oddać przeciwną, albo stać pomiędzy i dać po pół.
 *
 * Miarą zaangażowania jest rzut wektora „obrońca minus kryty" na kierunek do komórki:
 *   - obrońca dokładnie między cutterem a przestrzenią  -> cień 1.0 (zabiera ją)
 *   - obrońca po przeciwnej stronie                      -> cień 0.0 (oddaje ją)
 *   - obrońca z boku, neutralnie                         -> cień 0.5 na obie strony
 *
 * Test izolowany (jedna para, zero instrukcji) ma dawać 0.5 na under i 0.5 na deep —
 * bo domyślnie obrońca nie oddaje ani nie zabiera żadnej z tych przestrzeni z góry, to
 * atakujący musi sobie okazję wypracować.
 */
/** Przesunięcie obrońcy (m), przy którym zaangażowanie jest pełne. */
const COMMIT_REF_M = 3

function shadowFor(defender, cell, viewer) {
  const dx = cell.x - viewer.x
  const dy = cell.y - viewer.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return 1
  const ox = defender.x - viewer.x
  const oy = defender.y - viewer.y
  // Rzut przesunięcia obrońcy na kierunek do tej przestrzeni.
  const proj = (ox * dx + oy * dy) / len
  const commit = 0.5 + (proj / COMMIT_REF_M) * 0.5
  return Math.max(0, Math.min(1, commit))
}
export function buildSpaceMap({ disc, attackSign, teammates = [], defenders = [], ignoreId = null, viewer = null }) {
  const cells = []
  if (!disc) return cells

  // Obrońca stojący najbliżej oceniającego = jego kryjący. Wyznaczany po odległości, bo
  // to jest dokładnie ten, „który stoi przy nim" — niezależnie od formalnego przydziału.
  let ownDefender = null
  if (viewer && defenders.length) {
    let bestD = Infinity
    for (const dfn of defenders) {
      const d2 = Math.hypot(dfn.x - viewer.x, dfn.y - viewer.y)
      if (d2 < bestD) { bestD = d2; ownDefender = dfn }
    }
  }

  const x = (a) => disc.x + attackSign * a
  for (const ring of RINGS) {
    const ahead = (ring.minAhead + ring.maxAhead) / 2
    const cx = clampFieldX(disc.x + attackSign * ahead)
    const depth = depthIdFor(ahead)
    for (let lane = 0; lane < ring.lanes; lane += 1) {
      const cy = clampFieldY(((lane + 0.5) / ring.lanes) * FIELD_DIMENSIONS.widthM)

      const cw = (x(ring.maxAhead) - x(ring.minAhead)) || 1
      const ch = FIELD_DIMENSIONS.widthM / ring.lanes
      const near = Math.hypot(cx - disc.x, cy - disc.y) <= DENSE_RADIUS_M
      const parts = near
        ? [
            [-0.25, -0.25],
            [0.25, -0.25],
            [-0.25, 0.25],
            [0.25, 0.25],
          ]
        : [[0, 0]]
      for (const [fx, fy] of parts) {
        const px = clampFieldX(cx + fx * cw * attackSign)
        const py = clampFieldY(cy + fy * ch)

        let crowd = 0
        for (const t of teammates) {
          if (ignoreId != null && (t.id ?? t.player?.id) === ignoreId) continue
          crowd += occupancyContribution(t.x, t.y, px, py)
        }
        for (const dfn of defenders) {
          if (dfn === ownDefender) continue
          crowd += occupancyContribution(dfn.x, dfn.y, px, py)
        }
        const teamOccupancy = crowd
        const shadow = viewer && ownDefender ? shadowFor(ownDefender, { x: px, y: py }, viewer) : 0
        const defPressure = viewer
          ? shadow
          : defenders.reduce((acc2, dfn) => acc2 + occupancyContribution(dfn.x, dfn.y, px, py), 0)
        const load = shadow + crowd * CROWD_MOVE_WEIGHT
        const freeness = viewer
          ? 1 / (1 + load)
          : 1 / (1 + teamOccupancy + defPressure * DEFENDER_WEIGHT)
        cells.push({
          depth,
          lane,
          laneId: String(lane),
          x: px,
          y: py,
          ahead: ahead + fx * (ring.maxAhead - ring.minAhead),
          dense: near,
          teamOccupancy,
          defPressure,
          shadow,
          crowd,
          freeness,
        })
      }
    }
  }
  return cells
}


/**
 * Waga metrów w ocenie zagrożenia. Obrona nie broni „przestrzeni w ogóle" — deep kosztuje
 * 40 m i często punkt, under 8 m i nowy stall, więc groźba musi rosnąć z głębokością.
 */
const THREAT_YARD_WEIGHT = 1
/** Stała bazowa, żeby płytkie przestrzenie nie schodziły do zera. */
const THREAT_BASE = 0.4

/**
 * Najgroźniejsza przestrzeń dla KONKRETNEGO atakującego — czyli to, czego jego obrońca
 * powinien bronić w pierwszej kolejności.
 *
 * Symetria z `pickCutTarget` w cutterBrain jest celowa: atakujący i broniący czytają tę
 * SAMĄ mapę, tylko z przeciwnymi znakami — jeden szuka miejsca, które da się zająć,
 * drugi miejsca, które trzeba zabrać. Dzięki temu „shade deep u ostatniego w vertical
 * stacku" nie jest regułą wpisaną w kod, tylko wynikiem: ten zawodnik ma deep tuż obok
 * siebie i wolne, więc deep jest dla niego najgroźniejsze; zawodnik z przodu stacka ma
 * deep 30 m od siebie, więc jego obrońca stoi bardziej neutralnie.
 *
 * @param {{x:number,y:number}} mark pozycja krytego zawodnika
 * @param {Array} cells wynik buildSpaceMap
 * @param {{speed?:number}} [opts] prędkość krytego zawodnika (m/s)
 */
export function threatCellForMark(mark, cells, { speed = 7 } = {}) {
  if (!mark || !cells?.length) return null
  const maxAhead = YARD_REF_M
  let best = null
  let bestThreat = -Infinity
  for (const cell of cells) {
    // Ile sekund zajmie mu tam dobiegnięcie — przestrzeń, do której nie zdąży, nie jest
    // groźna, choćby była zupełnie pusta.
    const t = Math.hypot(cell.x - mark.x, cell.y - mark.y) / Math.max(3, speed)
    const reach = 1 / (1 + t)
    const value = THREAT_BASE + (cell.ahead / maxAhead) * THREAT_YARD_WEIGHT
    const threat = cell.freeness * reach * value
    if (threat > bestThreat) {
      bestThreat = threat
      best = cell
    }
  }
  return best ? { ...best, threat: bestThreat } : null
}

/**
 * Jak zawodnik WIDZI mapę przestrzeni — nikt nie widzi jej prawdziwej.
 *
 * Do tej pory atak czytał zajętość boiska bezbłędnie i trafiał w idealne miejsca, podczas
 * gdy obrona miała realne opóźnienie reakcji (reactionDelayMs). To była asymetria na
 * korzyść ataku, wpisana w architekturę, a nie w statystyki: ofensywa była PERFEKCYJNA.
 *
 * Teraz `freeness` jest zaszumiane odwrotnie proporcjonalnie do umiejętności czytania
 * gry. Słaby zawodnik bierze zatkaną przestrzeń za wolną i biegnie w tłok, dobry widzi
 * boisko takim, jakie jest. Kanał jest wspólny dla obu stron, ale karmiony innym statem:
 * atak czyta `vision` + `offensiveSystemsKnowledge`, obrona `vision` +
 * `defensiveSystemsKnowledge` — bo rozpoznanie, która przestrzeń jest realnie groźna,
 * to znajomość systemu, nie sama bystrość.
 */
const PERCEPTION_NOISE = 0.5

export function perceiveSpaceMap(cells, player, role = 'offense', rng = null) {
  if (!cells?.length || !player || !rng?.float) return cells
  const systems =
    role === 'defense'
      ? subStat(player, 'defensive', 'defensiveSystemsKnowledge')
      : subStat(player, 'offensive', 'offensiveSystemsKnowledge')
  const read = subStat(player, 'mental', 'vision') * 0.5 + systems * 0.5
  const err = Math.max(0, Math.min(1, 1 - (read - 50) / 45))
  if (err < 0.02) return cells
  return cells.map((c) => ({
    ...c,
    freeness: Math.max(0, Math.min(1, c.freeness + (rng.float() - 0.5) * PERCEPTION_NOISE * err)),
  }))
}

/**
 * Gdzie warto pójść na POACH — przestrzeń groźna, ale nieobsadzona.
 *
 * Nie chodzi o „stań przed dyskiem", tylko o realną pomoc: miejsce, w które atak biegnie
 * (wysoka obecność ofensywna), a obrona go nie pilnuje (niska presja), tym cenniejsze im
 * głębiej — bo deep help ratuje punkt, a pomoc na 5 m ratuje pięć metrów.
 *
 * Liczone na mapie ZBIORCZEJ (bez viewera), bo poacher ocenia układ boiska, a nie własne
 * krycie — jego własny zawodnik jest w tym momencie tym, co zostawia.
 */
export function poachTargetCell(cells, from, { maxRunM = 34 } = {}) {
  if (!cells?.length || !from) return null
  let best = null
  let bestVal = 0
  for (const c of cells) {
    if (c.teamOccupancy < 0.15) continue
    const run = Math.hypot(c.x - from.x, c.y - from.y)
    if (run > maxRunM) continue
    const uncovered = 1 / (1 + c.defPressure)
    const value = 0.4 + Math.max(0, c.ahead) / YARD_REF_M
    const v = c.teamOccupancy * uncovered * value
    if (v > bestVal) {
      bestVal = v
      best = c
    }
  }
  return best ? { ...best, poachValue: bestVal } : null
}
