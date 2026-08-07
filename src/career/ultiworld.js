/**
 * Portal Ultiworld — krótkie newsy o lidze UFA, pucharze i wydarzeniach świata.
 * Część artykułów to czysty feature; część aplikuje efekty (kontuzje AI, budżet, przełożenia).
 */

import { getPlayerFullName } from '../data/mockPlayers.js'
import { getOverallRating } from '../models/playerStats.js'
import { ensurePlayerMorale } from '../models/playerMorale.js'
import { ensurePlayerForm } from '../models/playerForm.js'
import { noteLoyaltyFromTreatment } from '../models/playerLoyalty.js'
import { injurePlayer, pickInjuryLabel, rollInjuryDays, injuryLabelEn } from '../models/playerInjury.js'
import { addDays, formatISODate, parseISODate } from '../league/seasonCalendar.js'
import { fixturesForRound, isRoundComplete, teamNameMap } from '../league/leagueState.js'
import { detectSeasonPhase } from '../league/dayEngine.js'
import { worldTeamById, worldTeamsList } from './worldState.js'
import { adjustTransferBudget, formatUsd, getTransferBudget } from './transfers/index.js'

const ARTICLES_MAX = 80
const WORLD_EVENT_CHANCE = 0.28
/** Dodatkowa szansa na czystą ciekawostkę / felieton (bez wpływu na gameplay). */
const CURIOSITY_CHANCE = 0.38
/** Max relacji z pojedynczych meczów na tick (dzień / FF). */
const MAX_MATCH_ARTICLES_PER_TICK = 1

const MATCH_ANGLE_SCORE = {
  upset: 10,
  shootout: 9,
  thriller: 8,
  cup_edge: 8,
  blowout: 6,
  draw: 5,
  chess: 3,
  solid: 1,
}

function newId(prefix = 'uw') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < String(str).length; i += 1) {
    h ^= String(str).charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function pick(arr, rng) {
  if (!arr?.length) return null
  return arr[Math.floor(rng() * arr.length)]
}

function monthKey(iso) {
  return String(iso ?? '').slice(0, 7)
}

function monthLabelPl(iso) {
  try {
    return new Date(`${String(iso).slice(0, 7)}-15T12:00:00`).toLocaleDateString('pl-PL', {
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return monthKey(iso)
  }
}

function monthLabelEn(iso) {
  try {
    return new Date(`${String(iso).slice(0, 7)}-15T12:00:00`).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return monthKey(iso)
  }
}

function scoreRow(row) {
  return (row.goals ?? 0) * 3 + (row.assists ?? 0) * 2 + (row.blocks ?? 0) * 2.5
}

function playerDisplay(row, names) {
  const name =
    `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() ||
    getPlayerFullName(row) ||
    'Zawodnik'
  const team = names?.[row.teamId] ?? ''
  return team ? `${name} (${team})` : name
}

function topRoundPlayers(roundStats, limit = 7) {
  return Object.values(roundStats ?? {})
    .filter((r) => scoreRow(r) > 0)
    .sort((a, b) => scoreRow(b) - scoreRow(a) || (b.goals ?? 0) - (a.goals ?? 0))
    .slice(0, limit)
}

export function ensureUltiworld(career) {
  if (!career) return { articles: [], lastRoundCovered: 0, lastPomMonth: null, coveredFixtureIds: [] }
  if (!career.ultiworld || typeof career.ultiworld !== 'object') {
    career.ultiworld = {
      articles: [],
      lastRoundCovered: 0,
      lastPomMonth: null,
      coveredFixtureIds: [],
      seeded: false,
    }
  }
  const u = career.ultiworld
  if (!Array.isArray(u.articles)) u.articles = []
  if (!Array.isArray(u.coveredFixtureIds)) u.coveredFixtureIds = []
  if (typeof u.lastRoundCovered !== 'number') u.lastRoundCovered = 0
  if (u.lastPomMonth === undefined) u.lastPomMonth = null
  return u
}

export function unreadUltiworldCount(career) {
  return ensureUltiworld(career).articles.filter((a) => !a.read).length
}

export function markUltiworldRead(ultiworld, articleId) {
  return {
    ...ultiworld,
    articles: (ultiworld.articles ?? []).map((a) =>
      a.id === articleId ? { ...a, read: true } : a,
    ),
  }
}

export function markAllUltiworldRead(ultiworld) {
  return {
    ...ultiworld,
    articles: (ultiworld.articles ?? []).map((a) => (a.read ? a : { ...a, read: true })),
  }
}

function makeArticle({
  category,
  headline,
  dek,
  body,
  headlineEn = null,
  dekEn = null,
  bodyEn = null,
  date,
  career,
  tags = [],
  relatedTeamIds = [],
  relatedPlayerIds = [],
  effectsSummary = null,
  effectsSummaryEn = null,
  impact = false,
}) {
  return {
    id: newId('uw'),
    createdAt: new Date().toISOString(),
    date,
    seasonIndex: career?.seasonIndex ?? null,
    seasonYear: career?.seasonYear ?? null,
    category,
    headline,
    dek,
    body,
    ...(headlineEn ? { headlineEn } : {}),
    ...(dekEn ? { dekEn } : {}),
    ...(bodyEn ? { bodyEn } : {}),
    tags,
    relatedTeamIds,
    relatedPlayerIds,
    effectsSummary,
    ...(effectsSummaryEn ? { effectsSummaryEn } : {}),
    impact: !!impact,
    read: false,
    source: 'Ultiworld',
  }
}

function prependArticles(ultiworld, articles) {
  if (!articles?.length) return ultiworld
  return {
    ...ultiworld,
    articles: [...articles, ...(ultiworld.articles ?? [])].slice(0, ARTICLES_MAX),
  }
}

function standingsPlace(league, teamId) {
  const rows = Object.values(league?.standings ?? {})
  const sorted = [...rows].sort((a, b) => {
    if ((b.wins ?? 0) !== (a.wins ?? 0)) return (b.wins ?? 0) - (a.wins ?? 0)
    const diffA = (a.pointsFor ?? 0) - (a.pointsAgainst ?? 0)
    const diffB = (b.pointsFor ?? 0) - (b.pointsAgainst ?? 0)
    return diffB - diffA
  })
  const idx = sorted.findIndex((r) => r.teamId === teamId)
  return idx >= 0 ? idx + 1 : null
}

function interestingMatchArticle(career, league, fixture, names, rng) {
  const home = names[fixture.homeTeamId] ?? fixture.homeTeamId
  const away = names[fixture.awayTeamId] ?? fixture.awayTeamId
  const hs = fixture.homeScore ?? 0
  const as_ = fixture.awayScore ?? 0
  const total = hs + as_
  const margin = Math.abs(hs - as_)
  const homePlace = standingsPlace(league, fixture.homeTeamId)
  const awayPlace = standingsPlace(league, fixture.awayTeamId)
  const isCup = fixture.competition === 'cup'
  const winner = hs > as_ ? home : as_ > hs ? away : null
  const loser = hs > as_ ? away : as_ > hs ? home : null

  let angle = 'solid'
  if (total >= 28) angle = 'shootout'
  else if (margin >= 8) angle = 'blowout'
  else if (
    homePlace &&
    awayPlace &&
    ((homePlace <= 4 && awayPlace >= 10 && as_ > hs) ||
      (awayPlace <= 4 && homePlace >= 10 && hs > as_))
  ) {
    angle = 'upset'
  } else if (margin <= 1 && total >= 18) angle = 'thriller'
  else if (margin <= 2 && total >= 22) angle = 'chess'
  else if (hs === as_) angle = 'draw'
  else if (isCup && margin <= 3) angle = 'cup_edge'

  const pool = {
    shootout: [
      {
        headline: isCup
          ? `Pucharowy fajerwerk: ${home} ${hs}–${as_} ${away}`
          : `Deszcz goli: ${home} ${hs}–${as_} ${away}`,
        dek: `Razem ${total} punktów — Ultiworld potrzebowało drugiej kartki.`,
        body: `Ofensywa nie brała jeńców. „Każdy pull wyglądał jak zaproszenie do highlightu” — mówi obserwator z trybun. Sztaby będą oglądać to video z mieszaniną dumy i strachu.`,
      },
      {
        headline: `${home} i ${away} urządzili sobie strzelaninę (${hs}–${as_})`,
        dek: 'Obrona? Była, ale głównie w opowieściach po meczu.',
        body: `Tempo jak na turnieju plażowym, stawka ligowa. ${total} punktów później kibice wychodzili z chrypką, a analitycy z pełnymi notatnikami o cutach i dumpach.`,
      },
    ],
    blowout: [
      {
        headline: `Demolka: ${home} ${hs}–${as_} ${away}`,
        dek: `Różnica ${margin} — jeden rytm, druga bezradność.`,
        body: `Po przerwie wynik wyglądał jak komunikat prasowy. ${winner} dyktował tempo; ${loser} szukał resetu, którego nie było. Takie wieczory budują pewność… albo kryzys tożsamości.`,
      },
      {
        headline: `${winner} nie zostawił złudzeń (${hs}–${as_})`,
        dek: `Margin ${margin} punktów. Ultiworld: „kliniczna skuteczność”.`,
        body: `${loser} miał momenty, ale każdy błąd był karany. W szatni przegranych panowała cisza głośniejsza niż doping. Liga zapamiętuje takie wyniki dłużej niż chcecie.`,
      },
    ],
    upset: [
      {
        headline: `Sensacja! ${winner} przewraca stolik`,
        dek: `${home} ${hs}–${as_} ${away} — faworyt wziął lekcję pokory.`,
        body: `Na papierze układ sił był inny. Na boisku wygrała agresja i zimna krew w endzone. „Czasem wystarczy wierzyć dłużej” — skomentował sztab ${winner}. Datę zapisujemy grubym flamastrem.`,
      },
      {
        headline: `Underdog day: ${home} ${hs}–${as_} ${away}`,
        dek: 'Tabela dostała zawrotu głowy, Twitter — paliwa na tydzień.',
        body: `${winner} zagrał jak ekipa bez kompleksów. ${loser} będzie oglądał powtórki z zamkniętymi oczami. Ultiworld kocha takie historie — i nie przeprasza za clickbait.`,
      },
    ],
    thriller: [
      {
        headline: `Do ostatniego pulla: ${home} ${hs}–${as_} ${away}`,
        dek: 'Serce wraca do normy dopiero na parkingu.',
        body: `Każda wymiana wyglądała na decydującą. Przy ${hs}–${as_} obie strony miały szanse zamknąć mecz wcześniej — i obie je wypuściły. Idealny materiał na loop.`,
      },
      {
        headline: `Nerwy ze stali: ${home} ${hs}–${as_} ${away}`,
        dek: 'Jeden punkt różnicy, sto emocji.',
        body: `Trybuny stały. Ławki klęczały. ${winner ?? 'Remisująca atmosfera'}… właściwie cała arena. Ultiworld: jeśli ktoś szukał reklamy ligi, właśnie ją dostał.`,
      },
    ],
    chess: [
      {
        headline: `Szachy na trawie: ${home} ${hs}–${as_} ${away}`,
        dek: 'Mało miejsca na błąd, dużo na cierpliwość.',
        body: `To nie był mecz „rzuć i biegaj”. Handlerzy grali tempo jak metronom, defensywa czytała cuty z opóźnieniem pół taktu. Wynik ${hs}–${as_} oddaje charakter spotkania lepiej niż jakikolwiek highlight.`,
      },
      {
        headline: `Takieczne arcydzieło: ${home} ${hs}–${as_} ${away}`,
        dek: 'Zero chaosu, maksimum decyzji.',
        body: `Obserwatorzy liczyli reset'y, nie dunk'i. ${winner ?? 'Obie strony'} wygrywał(y) detale przy sideline'ach. Ultiworld: mecz dla koneserów — i dla tych, co lubią box score bez fajerwerków.`,
      },
    ],
    draw: [
      {
        headline: `Remis jak thriller: ${home} ${hs}–${as_} ${away}`,
        dek: 'Nikt nie wygrał — obaj wyszli z pytaniami.',
        body: `Po ostatnim gongu oba sztaby mówiły o „straconych okazjach”. Remis ${hs}–${as_} smakuje inaczej w zależności od tabeli. Ultiworld wystawia ocenę: widowisko 8/10, satysfakcja 5/10.`,
      },
      {
        headline: `${home} ${hs}–${as_} ${away}: punkty podzielone`,
        dek: 'Fair, frustrujące, godne powtórki w tygodniu.',
        body: `Obie drużyny miały swój moment dominacji i obie go oddały. W ultimate remis to rzadki gość — tym bardziej smakuje jak niedopowiedzenie.`,
      },
      {
        headline: `Remisowa lekcja pokory: ${home} ${hs}–${as_} ${away}`,
        dek: 'Tabela dostała kropkę, nie wykrzyknik.',
        body: `Gdy wynik kończy się remisem, narracja sezonu robi pauzę. Ultiworld: ${hs}–${as_} to zaproszenie do rewanżu w kolejnej kolejce — i do dłuższej rozmowy o finishach.`,
      },
    ],
    cup_edge: [
      {
        headline: `Puchar nie wybacza: ${home} ${hs}–${as_} ${away}`,
        dek: 'Jeden mecz, zero „odbijemy się w rewanżu”.',
        body: `Drabinka lubi dramat. ${winner} przechodzi dalej, ${loser} pakuje się wcześniej niż chciał. Ultiworld: w pucharze historia pisze się grubą kreską.`,
      },
      {
        headline: `Na krawędzi drabinki: ${home} ${hs}–${as_} ${away}`,
        dek: 'Pucharowy thriller w skrócie.',
        body: `${winner} wychodzi z uśmiechem i siniakami mentalnymi. ${loser} zostaje z „co jeśli”. Takie mecze budują legendy klubowe szybciej niż trzy spokojne wygrane w lidze.`,
      },
    ],
    solid: [
      {
        headline: `${home} ${hs}–${as_} ${away}`,
        dek: isCup ? 'Relacja z drabinki.' : 'Relacja z weekendu ligowego.',
        body: `Solidne spotkanie bez zbędnego chaosu. ${winner ?? home} kontrolował kluczowe pointy, ${loser ?? away} szukał odpowiedzi przez handlere. Wynik zasłużony — dyskusja o formie otwarta.`,
      },
      {
        headline: `Raport z boiska: ${home} pokonał ${away} ${hs}–${as_}`,
        dek: 'Bez fajerwerków, z konkretami.',
        body: `${winner} wygrał detale: mniej turnowerów, lepsze wejścia w endzone. ${loser} miał momenty — za mało, by odwrócić losy. Ultiworld ocenia: rzemiosło 7/10.`,
      },
      {
        headline: `${home} ${hs}–${as_} ${away} — trzy rzeczy, które zapamiętamy`,
        dek: 'Krótki debrief zamiast powieści.',
        body: `1) Tempo po pierwszym pullu. 2) Skuteczność w strefie. 3) Reakcja na turnovery. Reszta to już robota sztabów na filmie. Wynik końcowy: ${hs}–${as_}.`,
      },
    ],
  }

  const variants = pool[angle] ?? pool.solid
  const t = pick(variants, rng)
  const score = MATCH_ANGLE_SCORE[angle] ?? 1

  // Tylko naprawdę ciekawe mecze trafiają do feedu — solid/chess prawie nigdy.
  if (angle === 'solid') return null
  if (angle === 'chess' && rng() > 0.12) return null
  if (angle === 'blowout' && rng() > 0.45) return null
  if (angle === 'draw' && rng() > 0.4) return null
  if (score < 8 && rng() > 0.55) return null

  return {
    score,
    article: makeArticle({
      category: isCup ? 'cup' : 'match',
      headline: t.headline,
      dek: t.dek,
      body: t.body,
      headlineEn:
        t.headlineEn ??
        (isCup
          ? `Cup: ${home} ${hs}–${as_} ${away}`
          : `${home} ${hs}–${as_} ${away}`),
      dekEn: t.dekEn ?? t.dek,
      bodyEn:
        t.bodyEn ??
        `${winner ?? home} took the result ${hs}–${as_} against ${loser ?? away}. Ultiworld will keep digging into the film.`,
      date: fixture.date ?? career.league?.currentDate,
      career,
      tags: isCup ? ['puchar', angle] : ['liga', angle],
      relatedTeamIds: [fixture.homeTeamId, fixture.awayTeamId],
    }),
  }
}

function roundReviewArticles(career, league, round, names, rng) {
  const fixtures = fixturesForRound(league, round).filter((f) => f.status === 'completed')
  if (!fixtures.length) return []

  const out = []
  const roundStats = league.roundPlayerStats?.[String(round)] ?? {}
  const top7 = topRoundPlayers(roundStats, 7)

  // Match of the round
  let best = null
  let bestScore = -1
  for (const f of fixtures) {
    const total = (f.homeScore ?? 0) + (f.awayScore ?? 0)
    const margin = Math.abs((f.homeScore ?? 0) - (f.awayScore ?? 0))
    const score = total + (margin <= 2 ? 4 : 0)
    if (score > bestScore) {
      bestScore = score
      best = f
    }
  }
  if (best) {
    const home = names[best.homeTeamId]
    const away = names[best.awayTeamId]
    out.push(
      makeArticle({
        category: 'round',
        headline: `Kolejka ${round}: mecz wieczoru — ${home} ${best.homeScore}–${best.awayScore} ${away}`,
        headlineEn: `Round ${round}: match of the night — ${home} ${best.homeScore}–${best.awayScore} ${away}`,
        dek: 'Redakcja Ultiworld wybiera hit weekendu ligowego.',
        dekEn: 'Ultiworld editors pick the league weekend’s highlight.',
        body: `Spośród ${fixtures.length} spotkań kolejki ${round} to właśnie ten pojedynek najbardziej rozgrzał komentatorów. Tempo, emocje i wynik ${best.homeScore}–${best.awayScore} — przepis na materiał, który będzie krążył w feedach do środy.`,
        bodyEn: `Among ${fixtures.length} fixtures in round ${round}, this was the one that lit up the desks. Pace, emotion and a ${best.homeScore}–${best.awayScore} scoreline — feed fuel through Wednesday.`,
        date: best.date ?? career.league?.currentDate,
        career,
        tags: ['kolejka', `runda-${round}`, 'mecz-wieczoru'],
        relatedTeamIds: [best.homeTeamId, best.awayTeamId],
      }),
    )
  }

  if (top7.length >= 3) {
    const lines = top7
      .map(
        (r, i) =>
          `${i + 1}. ${playerDisplay(r, names)} — ${r.goals ?? 0}G / ${r.assists ?? 0}A / ${r.blocks ?? 0}B`,
      )
      .join('\n')
    out.push(
      makeArticle({
        category: 'awards',
        headline: `Siódemka kolejki ${round} według Ultiworld`,
        headlineEn: `Round ${round} seven according to Ultiworld`,
        dek: 'Siedmiu zawodników, którzy zdominowali statystyki weekendu.',
        dekEn: 'Seven players who owned the weekend’s box score.',
        body: `Nasz algorytm (i odrobina redakcyjnego czucia) wyłonił formę kolejki:\n\n${lines}\n\n„Liczby nie kłamią, ale czasem kłamią mniej” — żartuje nasz analityk. Lista nie jest rankingiem OVR; to zdjęcie z konkretnego weekendu.`,
        bodyEn: `Our algorithm (plus a dash of editorial feel) picked the form of the round:\n\n${lines}\n\n“Numbers don’t lie — they just fib less,” jokes our analyst. Not an OVR ranking; a snapshot of one weekend.`,
        date: career.league?.currentDate,
        career,
        tags: ['top7', `runda-${round}`, 'liderzy'],
        relatedPlayerIds: top7.map((r) => r.playerId),
        relatedTeamIds: [...new Set(top7.map((r) => r.teamId).filter(Boolean))],
      }),
    )
  }

  const leader = Object.values(league.standings ?? {}).sort((a, b) => {
    if ((b.wins ?? 0) !== (a.wins ?? 0)) return (b.wins ?? 0) - (a.wins ?? 0)
    return (
      (b.pointsFor ?? 0) -
      (b.pointsAgainst ?? 0) -
      ((a.pointsFor ?? 0) - (a.pointsAgainst ?? 0))
    )
  })[0]
  const leaderName = leader ? names[leader.teamId] : null
  const blurbs = [
    `Po ${round}. kolejce tabela zaczyna mówić ludzkim głosem. ${leaderName ? `Na czele ${leaderName}.` : ''} Ultiworld przypomina: w UFA sezon jest maratonem, nie sprintem po jednym weekendu.`,
    `Kolejka ${round} w liczbach: ${fixtures.length} meczów, masa turnowerów i kilka historii, które jeszcze wrócą w playoffowych podsumowaniach.`,
    `Z perspektywy szatni: ktoś złapał rytm, ktoś zgubił timing. ${leaderName ? `${leaderName} zbiera punkty systematycznie.` : ''} My zbieramy cytaty.`,
    `Weekend nr ${round} zostawił po sobie trzy smaki: euforię, niedosyt i „co jeśli”. Ultiworld tipuje, że najciekawsze historie dopiero się rozkręcają.`,
    `Gdyby kolejka ${round} była playlistą: połowa tracków to bangers, reszta — deep cuty dla prawdziwych fanów. ${leaderName ? `Na topie charts: ${leaderName}.` : ''}`,
    `Analitycy mówią o „kontroli tempa”, zawodnicy o „flow”, trenerzy o „detalach”. My mówimy: kolejka ${round} dostarczyła materiału na tydzień felietonów.`,
    `W ${fixtures.length} meczach zmieniło się więcej niż tylko kolumny W-L. Relacje w szatniach, pewność handlerów, spokój w strefe — to też wynik.`,
  ]
  const reviewHeadlines = [
    `Przegląd kolejki ${round}: co zostaje w pamięci`,
    `Kolejka ${round} okiem Ultiworld`,
    `Po weekendzie #${round}: szybki debrief`,
    `Felieton po kolejce ${round}`,
  ]
  out.push(
    makeArticle({
      category: 'round',
      headline: pick(reviewHeadlines, rng),
      dek: pick(
        [
          'Krótki felieton zamiast długiego box score.',
          'Trzy akapity, zero lania wody.',
          'Dla tych, co nie obejrzeli wszystkich meczów.',
        ],
        rng,
      ),
      body: pick(blurbs, rng),
      date: career.league?.currentDate,
      career,
      tags: ['przegląd', `runda-${round}`],
    }),
  )

  if (rng() < 0.55 && fixtures.length >= 3) {
    const blowouts = fixtures.filter(
      (f) => Math.abs((f.homeScore ?? 0) - (f.awayScore ?? 0)) >= 7,
    )
    const nailbiters = fixtures.filter(
      (f) => Math.abs((f.homeScore ?? 0) - (f.awayScore ?? 0)) <= 1,
    )
    if (blowouts.length && rng() < 0.5) {
      const f = pick(blowouts, rng)
      out.push(
        makeArticle({
          category: 'feature',
          headline: `Statystyczny koszmar weekendu: ${names[f.homeTeamId]} ${f.homeScore}–${f.awayScore} ${names[f.awayTeamId]}`,
          dek: 'Gdy różnica robi się dwucyfrowa, Twitter robi się bezlitosny.',
          body: `Nie każdy mecz musi być thrillerem. Czasem liga serwuje lekcję pokory w formie wyniku ${f.homeScore}–${f.awayScore}. Ultiworld nie kopie leżących — tylko delikatnie przypomina o resetie w tygodniu.`,
          date: f.date ?? career.league?.currentDate,
          career,
          tags: ['statystyka', `runda-${round}`],
          relatedTeamIds: [f.homeTeamId, f.awayTeamId],
        }),
      )
    } else if (nailbiters.length) {
      out.push(
        makeArticle({
          category: 'feature',
          headline: `Kolejka ${round} kochała nerwy: ${nailbiters.length} mecz(e/y) zdecydowane „o włos”`,
          dek: 'Małe marginesy, duże historie.',
          body: `Gdy wynik waży się do końca, ultimate pokazuje najlepszą twarz. W kolejce ${round} mieliśmy ${nailbiters.length} takich starć. Kibice dziękują. Fizjoterapeuci — mniej.`,
          date: career.league?.currentDate,
          career,
          tags: ['nerwy', `runda-${round}`],
        }),
      )
    }
  }

  return out
}

function playerOfMonthArticle(career, league, names, monthIso, rng) {
  const stats = league?.playerStats ?? {}
  const rows = Object.values(stats)
  if (rows.length < 3) return null

  // Przybliżenie POM: liderzy sezonu ważeni formą z rostera jeśli dostępna.
  const scored = rows
    .map((r) => {
      const team = worldTeamById(career.world, r.teamId)
      const player = team?.players?.find((p) => String(p.id) === String(r.playerId))
      const form = player?.form ?? 72
      const ovr = player ? getOverallRating(player.skills) : 70
      const production =
        (r.goals ?? 0) * 3 + (r.assists ?? 0) * 2 + (r.blocks ?? 0) * 2 + (r.games ?? 0) * 0.3
      const score = production * (0.7 + form / 200) * (0.85 + ovr / 400)
      return { r, score, form, ovr }
    })
    .sort((a, b) => b.score - a.score)

  const top = scored.slice(0, 5)
  if (!top.length) return null
  // Lekka losowość wśród top 3, by nie zawsze brać sezonowego lidera.
  const winner = pick(top.slice(0, Math.min(3, top.length)), rng)
  const p = winner.r
  const name = playerDisplay(p, names)

  return makeArticle({
    category: 'awards',
    headline: `Zawodnik miesiąca (${monthLabelPl(monthIso)}): ${name}`,
    headlineEn: `Player of the month (${monthLabelEn(monthIso)}): ${name}`,
    dek: 'Ultiworld wręcza wirtualny dysk miesiąca.',
    dekEn: 'Ultiworld hands out the virtual disc of the month.',
    body: `${name} zbiera ${p.goals ?? 0} goli, ${p.assists ?? 0} asyst i ${p.blocks ?? 0} bloków w tym sezonie — a w ${monthLabelPl(monthIso)} jego wpływ był najbardziej widoczny. Formularz redakcji: produkcja + momenty „wow” + głosowanie redaktorów (tak, mamy dwóch). Gratulacje!`,
    bodyEn: `${name} has ${p.goals ?? 0} goals, ${p.assists ?? 0} assists and ${p.blocks ?? 0} blocks this season — and in ${monthLabelEn(monthIso)} the impact was loudest. Editorial sheet: production + wow moments + editors’ vote (yes, we have two). Congrats!`,
    date: career.league?.currentDate,
    career,
    tags: ['pom', 'nagroda', monthKey(monthIso)],
    relatedPlayerIds: [p.playerId],
    relatedTeamIds: p.teamId ? [p.teamId] : [],
  })
}

/** Wydarzenia świata — część z efektem gameplayowym. */
const WORLD_EVENTS = [
  {
    id: 'rival_injury',
    weight: 1.2,
    impact: true,
    canSpawn: (career) => worldTeamsList(career.world).some((t) => t.id !== career.playerTeamId),
    run(career, league, rng) {
      const rivals = worldTeamsList(career.world).filter((t) => t.id !== career.playerTeamId)
      const team = pick(rivals, rng)
      const candidates = (team.players ?? [])
        .filter((p) => !p.injury)
        .sort((a, b) => getOverallRating(b.skills) - getOverallRating(a.skills))
        .slice(0, 6)
      const player = pick(candidates, rng)
      if (!player) return null
      const days = rollInjuryDays(() => rng(), 'match_ai')
      const label = pickInjuryLabel(() => rng())
      const labelEn = injuryLabelEn(label)
      injurePlayer(player, { days, label, source: 'match' })
      const name = getPlayerFullName(player)
      const ovr = getOverallRating(player.skills)
      const dayWordPl = days === 1 ? 'dzień' : 'dni'
      const dayWordEn = days === 1 ? 'day' : 'days'
      return {
        article: {
          category: 'breaking',
          headline: `Alarm w ${team.name}: ${name} kontuzjowany`,
          headlineEn: `Alert at ${team.name}: ${name} injured`,
          dek: `Ultiworld: ${label}, pauza ok. ${days} ${dayWordPl}.`,
          dekEn: `Ultiworld: ${labelEn}, out ~${days} ${dayWordEn}.`,
          body: `Według źródeł szatniowych ${name} (OVR ${ovr}) nabawił się urazu (${label}) i wypadnie na około ${days} ${dayWordPl}. To cios w rotację ${team.name} — a okazja dla rywali, by naciskać w najbliższych meczach.`,
          bodyEn: `Locker-room sources say ${name} (OVR ${ovr}) suffered a ${labelEn} and will miss about ${days} ${dayWordEn}. A blow to ${team.name}'s rotation — and a chance for rivals to press in upcoming games.`,
          tags: ['breaking', 'kontuzja'],
          relatedTeamIds: [team.id],
          relatedPlayerIds: [player.id],
          effectsSummary: `${name} (${team.name}) out ~${days} ${dayWordPl}`,
          effectsSummaryEn: `${name} (${team.name}) out ~${days} ${dayWordEn}`,
          impact: true,
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'postponed_match',
    weight: 0.9,
    impact: true,
    canSpawn: (career, league) =>
      (league.fixtures ?? []).some(
        (f) =>
          (f.status === 'scheduled' || f.status === 'pending') &&
          f.date &&
          f.date >= league.currentDate &&
          f.homeTeamId &&
          f.awayTeamId,
      ),
    run(career, league, rng) {
      const upcoming = (league.fixtures ?? []).filter(
        (f) =>
          (f.status === 'scheduled' || f.status === 'pending') &&
          f.date &&
          f.date >= league.currentDate &&
          f.homeTeamId &&
          f.awayTeamId,
      )
      const fixture = pick(upcoming.slice(0, 12), rng)
      if (!fixture) return null
      const names = teamNameMap(league)
      const delay = 3 + Math.floor(rng() * 5)
      const oldDate = fixture.date
      fixture.date = formatISODate(addDays(parseISODate(oldDate), delay))
      fixture.postponed = true
      const involvesPlayer =
        fixture.homeTeamId === career.playerTeamId ||
        fixture.awayTeamId === career.playerTeamId
      const home = names[fixture.homeTeamId]
      const away = names[fixture.awayTeamId]
      return {
        article: {
          category: 'breaking',
          headline: `Przełożony mecz: ${home} – ${away}`,
          headlineEn: `Postponed match: ${home} – ${away}`,
          dek: `Z ${oldDate} na ${fixture.date}. Powód: logistyka / pogoda / „siła wyższa”.`,
          dekEn: `From ${oldDate} to ${fixture.date}. Reason: logistics / weather / force majeure.`,
          body: `UFA i Ultiworld potwierdzają: spotkanie ${home} vs ${away} nie odbędzie się w terminie. Nowa data: ${fixture.date} (+${delay} dni). Sztaby dostały czas na regenerację — kalendarz dostał migrenę.`,
          bodyEn: `The league and Ultiworld confirm: ${home} vs ${away} will not be played on schedule. New date: ${fixture.date} (+${delay} days). Staffs get recovery time — the calendar gets a migraine.`,
          tags: ['przełożenie', 'kalendarz'],
          relatedTeamIds: [fixture.homeTeamId, fixture.awayTeamId],
          effectsSummary: `Mecz przesunięty o ${delay} dni`,
          effectsSummaryEn: `Match postponed by ${delay} days`,
          impact: true,
        },
        affectPlayer: involvesPlayer,
        inboxHint: involvesPlayer
          ? `Twój mecz został przełożony na ${fixture.date}.`
          : null,
        inboxHintEn: involvesPlayer
          ? `Your match was postponed to ${fixture.date}.`
          : null,
      }
    },
  },
  {
    id: 'cash_injection',
    weight: 0.85,
    impact: true,
    canSpawn: () => true,
    run(career, _league, rng) {
      const team = worldTeamById(career.world, career.playerTeamId)
      if (!team) return null
      const amount = (12 + Math.floor(rng() * 19)) * 1000
      adjustTransferBudget(team, amount)
      const sponsors = [
        {
          pl: 'lokalny producent dysków',
          en: 'a local disc manufacturer',
        },
        {
          pl: 'sieć siłowni Chain Reaction',
          en: 'Chain Reaction gym chain',
        },
        {
          pl: 'fundusz miasta',
          en: 'the city fund',
        },
        {
          pl: 'sponsor technologiczny FlickTech',
          en: 'tech sponsor FlickTech',
        },
      ]
      const who = pick(sponsors, rng)
      return {
        article: {
          category: 'feature',
          headline: `Zastrzyk gotówki dla ${team.name}`,
          headlineEn: `Cash injection for ${team.name}`,
          dek: `${formatUsd(amount)} od: ${who.pl}.`,
          dekEn: `${formatUsd(amount)} from: ${who.en}.`,
          body: `Ultiworld Exclusive: ${who.pl} dokłada ${formatUsd(amount)} do budżetu transferowego ${team.name}. Oficjalnie „inwestycja w rozwój ultimate”. Nieoficjalnie — ktoś mocno wierzy w ten sezon. Dyrektor sportowy uśmiecha się szerzej niż po buzzer-beaterze.`,
          bodyEn: `Ultiworld Exclusive: ${who.en} adds ${formatUsd(amount)} to ${team.name}'s transfer budget. Officially “an investment in ultimate.” Unofficially — someone really believes in this season. The sporting director smiles wider than after a buzzer-beater.`,
          tags: ['finanse', 'sponsor'],
          relatedTeamIds: [team.id],
          effectsSummary: `Budżet +${formatUsd(amount)}`,
          effectsSummaryEn: `Budget +${formatUsd(amount)}`,
          impact: true,
        },
        affectPlayer: true,
        inboxHint: `Sponsor (${who.pl}): +${formatUsd(amount)} do budżetu transferowego.`,
        inboxHintEn: `Sponsor (${who.en}): +${formatUsd(amount)} to the transfer budget.`,
      }
    },
  },
  {
    id: 'rival_war_chest',
    weight: 0.7,
    impact: true,
    canSpawn: (career) => worldTeamsList(career.world).some((t) => t.id !== career.playerTeamId),
    run(career, _league, rng) {
      const rivals = worldTeamsList(career.world).filter((t) => t.id !== career.playerTeamId)
      const team = pick(rivals, rng)
      if (!team) return null
      const amount = (15 + Math.floor(rng() * 25)) * 1000
      adjustTransferBudget(team, amount)
      return {
        article: {
          category: 'breaking',
          headline: `${team.name} zasilone kasą — rynek się trzęsie`,
          headlineEn: `${team.name} flush with cash — the market shakes`,
          dek: `+${formatUsd(amount)} w budżecie transferowym rywala.`,
          dekEn: `+${formatUsd(amount)} in a rival's transfer budget.`,
          body: `Źródła Ultiworld: ${team.name} dostało zastrzyk płynności. To oznacza agresywniejsze oferty w oknie i więcej nerwów u dyrektorów pozostałych klubów. „Pieniądze nie grają w ultimate — ale kupują czas i spokój” — komentuje nasz transferowy plotkarz.`,
          bodyEn: `Ultiworld sources: ${team.name} just got a liquidity shot. Expect sharper bids in the window and more stress for other GMs. “Money doesn’t play ultimate — but it buys time and calm,” says our transfer gossip columnist.`,
          tags: ['transfery', 'rynek'],
          relatedTeamIds: [team.id],
          effectsSummary: `${team.name} budżet +${formatUsd(amount)}`,
          effectsSummaryEn: `${team.name} budget +${formatUsd(amount)}`,
          impact: true,
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'team_morale_wave',
    weight: 0.8,
    impact: true,
    canSpawn: () => true,
    run(career, _league, rng) {
      const team = worldTeamById(career.world, career.playerTeamId)
      if (!team?.players?.length) return null
      const up = rng() > 0.4
      const delta = up ? 2 + Math.floor(rng() * 3) : -(2 + Math.floor(rng() * 3))
      for (const p of team.players) {
        ensurePlayerMorale(p)
        p.morale = Math.max(25, Math.min(99, p.morale + delta))
        noteLoyaltyFromTreatment(p, delta)
      }
      return {
        article: {
          category: 'feature',
          headline: up
            ? `Szatnia ${team.name} w euforii`
            : `Chmury nad szatnią ${team.name}`,
          headlineEn: up
            ? `${team.name} locker room buzzing`
            : `Clouds over the ${team.name} locker room`,
          dek: up
            ? 'Wspólny wyjazd / zwycięstwo / pizza po treningu — morale w górę.'
            : 'Plotki, zmęczenie i ciężki tydzień — morale w dół.',
          dekEn: up
            ? 'Team trip / win / pizza after practice — morale up.'
            : 'Rumors, fatigue and a rough week — morale down.',
          body: up
            ? `Ultiworld zagląda za kulisy: w ${team.name} atmosfera gęstnieje od dobrych wibe'ów. Morale drużyny +${delta}. Czasem wystarczy jeden wspólny rytuał, by boisko poczuło się lżejsze.`
            : `Redakcja słyszy o napięciach w ${team.name}. Morale drużyny ${delta}. Nie panikujcie — ultimate leczy się dobrym pull'em i szczerą rozmową na filmie.`,
          bodyEn: up
            ? `Ultiworld goes behind the scenes: ${team.name} is thick with good vibes. Team morale +${delta}. Sometimes one shared ritual makes the field feel lighter.`
            : `The desk hears about tension at ${team.name}. Team morale ${delta}. Don’t panic — ultimate heals with a clean pull and an honest film session.`,
          tags: ['morale', 'szatnia'],
          relatedTeamIds: [team.id],
          effectsSummary: `Morale drużyny ${delta >= 0 ? '+' : ''}${delta}`,
          effectsSummaryEn: `Team morale ${delta >= 0 ? '+' : ''}${delta}`,
          impact: true,
        },
        affectPlayer: true,
        inboxHint: `Ultiworld: morale drużyny ${delta >= 0 ? '+' : ''}${delta}.`,
        inboxHintEn: `Ultiworld: team morale ${delta >= 0 ? '+' : ''}${delta}.`,
      }
    },
  },
  {
    id: 'form_clinic',
    weight: 0.75,
    impact: true,
    canSpawn: () => true,
    run(career, _league, rng) {
      const team = worldTeamById(career.world, career.playerTeamId)
      if (!team?.players?.length) return null
      const sorted = [...team.players].sort(
        (a, b) => getOverallRating(b.skills) - getOverallRating(a.skills),
      )
      const picks = sorted.slice(0, 3 + Math.floor(rng() * 3))
      for (const p of picks) {
        ensurePlayerForm(p)
        p.form = Math.max(25, Math.min(99, p.form + 3))
      }
      const names = picks.map((p) => getPlayerFullName(p)).join(', ')
      return {
        article: {
          category: 'feature',
          headline: `Mikro-cykl formy w ${team.name}`,
          headlineEn: `Form micro-cycle at ${team.name}`,
          dek: 'Krótki sharpening camp — kilku zawodników łapie timing.',
          dekEn: 'A short sharpening camp — a few players catch their timing.',
          body: `Po intensywnym mikrocyklu (bez oficjalnego komunikatu UFA) forma rośnie u: ${names}. Ultiworld lubi takie historie — ciche przygotowania, głośne skutki w kolejce.`,
          bodyEn: `After an intense micro-cycle (no official league memo) form rises for: ${names}. Ultiworld loves these stories — quiet prep, loud results next round.`,
          tags: ['forma', 'trening'],
          relatedTeamIds: [team.id],
          relatedPlayerIds: picks.map((p) => p.id),
          effectsSummary: `Forma +3: ${names}`,
          effectsSummaryEn: `Form +3: ${names}`,
          impact: true,
        },
        affectPlayer: true,
        inboxHint: `Po mikrocyklu forma ↑ u: ${names}.`,
        inboxHintEn: `After the micro-cycle, form ↑ for: ${names}.`,
      }
    },
  },
  // Flavor — bez wpływu
  {
    id: 'all_ufa_ballot',
    weight: 1.25,
    impact: false,
    canSpawn: (c, league) => (league?.currentRound ?? 0) >= 4,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const leaders = Object.values(league.playerStats ?? {})
        .sort(
          (a, b) =>
            (b.goals ?? 0) + (b.assists ?? 0) - ((a.goals ?? 0) + (a.assists ?? 0)),
        )
        .slice(0, 5)
      if (leaders.length < 3) return null
      const list = leaders
        .map((r, i) => `${i + 1}. ${playerDisplay(r, names)}`)
        .join('\n')
      return {
        article: {
          category: 'awards',
          headline: 'Wczesna karta All-UFA — kto jest na radarze?',
          headlineEn: 'Early All-League ballot — who’s on the radar?',
          dek: 'Ultiworld publikuje spekulacyjną piątkę sezonu (nieoficjalną).',
          dekEn: 'Ultiworld publishes a speculative season five (unofficial).',
          body: `Jeszcze długo do finałów, ale redakcja nie umie się powstrzymać:\n\n${list}\n\nTo nie ranking ostateczny — to paliwo do kłótni na Discordzie. Napiszcie do nas, kogo pomijamy (i tak was zignorujemy, ale miło poczytać).`,
          bodyEn: `Finals are still far away, but the desk can’t help itself:\n\n${list}\n\nNot a final ranking — fuel for Discord arguments. Tell us who we’re missing (we’ll ignore you anyway, but it’s nice to read).`,
          tags: ['all-ufa', 'spekulacje'],
          relatedPlayerIds: leaders.map((r) => r.playerId),
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'coach_quote',
    weight: 1.2,
    impact: false,
    canSpawn: () => true,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const teams = worldTeamsList(career.world)
      const team = pick(teams, rng)
      const quotes = [
        {
          pl: '„Ultimate wygrywa się w środę, nie w niedzielę.”',
          en: '“Ultimate is won on Wednesday, not Sunday.”',
        },
        {
          pl: '„Nie boję się rywala. Boję się naszych turnowerów.”',
          en: '“I’m not afraid of the opponent. I’m afraid of our turnovers.”',
        },
        {
          pl: '„Jeśli pull jest zły, reszta to już tylko literatura.”',
          en: '“If the pull is bad, the rest is just literature.”',
        },
        {
          pl: '„Chcemy grać ładnie. Ale bardziej chcemy wygrywać brzydko.”',
          en: '“We want to play pretty. But we want to win ugly more.”',
        },
      ]
      const q = pick(quotes, rng)
      const teamLabel = names[team.id] ?? team.name
      return {
        article: {
          category: 'feature',
          headline: `Cytat tygodnia: sztab ${teamLabel}`,
          headlineEn: `Quote of the week: ${teamLabel} staff`,
          dek: q.pl,
          dekEn: q.en,
          body: `Na konferencji prasowej (czyli przy stoliku z izotonikiem) padło zdanie, które Ultiworld zapisuje w notesie. ${teamLabel} buduje narrację sezonu — my budujemy clickbaity, ale z szacunkiem.`,
          bodyEn: `At the presser (read: the table with sports drink) came a line Ultiworld writes down. ${teamLabel} builds a season narrative — we build clickbait, respectfully.`,
          tags: ['cytat', 'media'],
          relatedTeamIds: [team.id],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'fan_culture',
    weight: 1.15,
    impact: false,
    canSpawn: () => true,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const team = pick(worldTeamsList(career.world), rng)
      const bits = [
        {
          pl: 'nowy chant na sektorze',
          en: 'a new chant in the stands',
        },
        {
          pl: 'gigantyczna flaga z nadrukiem dysku',
          en: 'a giant flag with a disc print',
        },
        {
          pl: 'kolekcja vintage jerseyów z 2019',
          en: 'a vintage jersey collection from 2019',
        },
        {
          pl: 'flashmob z fake pullami przed halą',
          en: 'a flashmob of fake pulls outside the hall',
        },
      ]
      const bit = pick(bits, rng)
      const teamLabel = names[team.id] ?? team.name
      return {
        article: {
          category: 'feature',
          headline: `Kultura kibicowska: ${teamLabel}`,
          headlineEn: `Fan culture: ${teamLabel}`,
          dek: bit.pl,
          dekEn: bit.en,
          body: `Ultimate to nie tylko box score. Ultiworld odwiedza społeczność wokół ${teamLabel} i znajduje dokładnie to, czego szukaliśmy: pasję, memy i kogoś, kto zna lineup przeciwnika lepiej niż ich własny trener.`,
          bodyEn: `Ultimate isn’t just the box score. Ultiworld visits the community around ${teamLabel} and finds exactly what we wanted: passion, memes, and someone who knows the opponent’s lineup better than their own coach.`,
          tags: ['kibice', 'kultura'],
          relatedTeamIds: [team.id],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'cup_preview',
    weight: 0.9,
    impact: false,
    canSpawn: (c, league) => detectSeasonPhase(league) === 'cup' || league?.cup,
    run(career, league, rng) {
      const cup = league.cup
      const pending = (cup?.matches ?? []).filter(
        (m) => m.status !== 'completed' && m.homeTeamId && m.awayTeamId,
      )
      const m = pick(pending, rng)
      const names = teamNameMap(league)
      if (m) {
        return {
          article: {
            category: 'cup',
            headline: `Pucharowy podgląd: ${names[m.homeTeamId]} vs ${names[m.awayTeamId]}`,
            headlineEn: `Cup preview: ${names[m.homeTeamId]} vs ${names[m.awayTeamId]}`,
            dek: 'Jeden mecz, zero miejsca na „jeszcze się odbijemy w rewanżu”.',
            dekEn: 'One game, no “we’ll bounce back in the return leg.”',
            body: `Drabinka nie wybacza. Ultiworld zapowiada starcie ${names[m.homeTeamId]} – ${names[m.awayTeamId]}: kto ogarnie nerwy przy stalle, ten idzie dalej. Historia pucharu lubi niespodzianki — i my też.`,
            bodyEn: `The bracket doesn’t forgive. Ultiworld previews ${names[m.homeTeamId]} – ${names[m.awayTeamId]}: whoever owns the nerves on stall count advances. Cup history loves upsets — and so do we.`,
            tags: ['puchar', 'preview'],
            relatedTeamIds: [m.homeTeamId, m.awayTeamId],
          },
          affectPlayer: false,
        }
      }
      return {
        article: {
          category: 'cup',
          headline: 'Styczeń pucharowy: narracja sezonu nabiera ostrości',
          headlineEn: 'Cup January: the season story sharpens',
          dek: 'Liga odpoczywa, drabinka pracuje.',
          dekEn: 'The league rests; the bracket works.',
          body: 'Ultiworld kocha puchar za dramaturgię. Nie ma „średniej z sezonu” — jest tu i teraz. Trenerzy mówią o rotacji, zawodnicy o snach, my o nagłówkach.',
          bodyEn: 'Ultiworld loves the cup for drama. No “season average” — only here and now. Coaches talk rotation, players talk dreams, we talk headlines.',
          tags: ['puchar'],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'rules_corner',
    weight: 1.1,
    impact: false,
    canSpawn: () => true,
    run(career, _league, rng) {
      const topics = [
        {
          h: 'Kącik przepisów: stall i spory',
          hEn: 'Rules corner: stall and disputes',
          b: 'Ultiworld przypomina: komunikacja na boisku to skill. Najlepsze ekipy wygrywają dyskusje ciszą i jasnością — nie krzykiem.',
          bEn: 'Ultiworld reminder: on-field communication is a skill. The best teams win arguments with calm clarity — not volume.',
        },
        {
          h: 'Pick vs kontynuacja: co mówią sędziowie… których nie ma',
          hEn: 'Pick vs continuation: what the refs say… who aren’t there',
          b: 'Self-officiating działa, gdy obie strony chcą fair. Nasz felieton: uczciwość jest meta.',
          bEn: 'Self-officiating works when both sides want fair. Our column: honesty is the meta.',
        },
        {
          h: 'Travel w zwolnionym tempie',
          hEn: 'Travel in slow motion',
          b: 'Kamera ultra-slow pokazuje rzeczy, których oko nie łapie. Czasem lepiej nie oglądać powtórek przed snem.',
          bEn: 'Ultra-slow cameras show what the eye misses. Sometimes it’s better not to watch replays before bed.',
        },
      ]
      const t = pick(topics, rng)
      return {
        article: {
          category: 'feature',
          headline: t.h,
          headlineEn: t.hEn,
          dek: 'Edukacja zamiast hejtu — seria Ultiworld.',
          dekEn: 'Education over hate — an Ultiworld series.',
          body: t.b,
          bodyEn: t.bEn,
          tags: ['przepisy', 'edukacja'],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'season_narrative',
    weight: 0.85,
    impact: false,
    canSpawn: (c, league) => (league?.currentRound ?? 0) >= 8,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const table = Object.values(league.standings ?? {}).sort(
        (a, b) => (b.wins ?? 0) - (a.wins ?? 0),
      )
      const top = table[0]
      const bottom = table[table.length - 1]
      return {
        article: {
          category: 'feature',
          headline: 'Narracja sezonu: kto pisze rozdział playoffowy?',
          headlineEn: 'Season narrative: who’s writing the playoff chapter?',
          dek: top
            ? `Liderzy: ${names[top.teamId]}. Dołek: ${bottom ? names[bottom.teamId] : '—'}.`
            : 'Tabela wciąż w ruchu.',
          dekEn: top
            ? `Leaders: ${names[top.teamId]}. Bottom: ${bottom ? names[bottom.teamId] : '—'}.`
            : 'The table is still moving.',
          body: `W połowie drogi Ultiworld lubi wielkie pytania. Czy ${top ? names[top.teamId] : 'lider'} utrzyma tempo? Czy ktoś z środka tabeli zrobi run jak z filmu? Odpowiedź poznamy na boisku — a my damy temu atrakcyjny nagłówek.`,
          bodyEn: `Halfway through, Ultiworld loves big questions. Can ${top ? names[top.teamId] : 'the leader'} keep the pace? Will someone from mid-table go on a movie run? We’ll find out on the field — and we’ll give it a catchy headline.`,
          tags: ['sezon', 'narracja'],
          relatedTeamIds: [top?.teamId, bottom?.teamId].filter(Boolean),
        },
        affectPlayer: false,
      }
    },
  },
  // --- dodatkowe impact ---
  {
    id: 'rival_form_dip',
    weight: 0.85,
    impact: true,
    canSpawn: (career) => worldTeamsList(career.world).some((t) => t.id !== career.playerTeamId),
    run(career, _league, rng) {
      const rivals = worldTeamsList(career.world).filter((t) => t.id !== career.playerTeamId)
      const team = pick(rivals, rng)
      const stars = [...(team?.players ?? [])]
        .filter((p) => !p.injury)
        .sort((a, b) => getOverallRating(b.skills) - getOverallRating(a.skills))
        .slice(0, 4)
      const player = pick(stars, rng)
      if (!player) return null
      ensurePlayerForm(player)
      const dip = 4 + Math.floor(rng() * 4)
      player.form = Math.max(25, Math.min(99, player.form - dip))
      const name = getPlayerFullName(player)
      return {
        article: {
          category: 'breaking',
          headline: `${name} w dołku formy — problem ${team.name}`,
          headlineEn: `${name} in a form slump — trouble for ${team.name}`,
          dek: `Forma −${dip}. Ultiworld wyczuwa przeciążenie.`,
          dekEn: `Form −${dip}. Ultiworld smells overload.`,
          body: `Źródła szatniowe: ${name} wygląda ciężko na treningach. Nie ma oficjalnej kontuzji, jest za to spadek tempa i decyzji. Rywale ${team.name} właśnie dostali prezent — pytanie, czy zdążą z niego skorzystać.`,
          bodyEn: `Locker-room sources: ${name} looks heavy in practice. No official injury — just slower pace and decisions. Rivals of ${team.name} just got a gift — can they cash it in?`,
          tags: ['forma', 'breaking'],
          relatedTeamIds: [team.id],
          relatedPlayerIds: [player.id],
          effectsSummary: `${name} (${team.name}) forma −${dip}`,
          effectsSummaryEn: `${name} (${team.name}) form −${dip}`,
          impact: true,
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'youth_breakthrough',
    weight: 0.8,
    impact: true,
    canSpawn: () => true,
    run(career, _league, rng) {
      const team = worldTeamById(career.world, career.playerTeamId)
      const young = [...(team?.players ?? [])]
        .filter((p) => (p.age ?? 99) <= 23 && !p.injury)
        .sort((a, b) => (b.potential ?? 0) - (a.potential ?? 0))
      const player = pick(young.slice(0, 5), rng) ?? pick(team?.players ?? [], rng)
      if (!player) return null
      ensurePlayerMorale(player)
      ensurePlayerForm(player)
      player.morale = Math.max(25, Math.min(99, player.morale + 5))
      player.form = Math.max(25, Math.min(99, player.form + 4))
      noteLoyaltyFromTreatment(player, 5)
      const name = getPlayerFullName(player)
      return {
        article: {
          category: 'feature',
          headline: `Przełom młodego: ${name} łapie flow`,
          headlineEn: `Youth breakthrough: ${name} finds flow`,
          dek: 'Ultiworld Exclusive — talent łapie moment.',
          dekEn: 'Ultiworld Exclusive — a talent seizes the moment.',
          body: `${name} wygląda jak ktoś, kto właśnie zrozumiał grę o poziom wyżej. Morale i forma w górę. Sztab ${team.name} uśmiecha się dyskretnie; my już piszemy nagłówek o „przyszłości klubu”.`,
          bodyEn: `${name} looks like someone who just understood the game a level higher. Morale and form up. ${team.name} staff smile quietly; we’re already drafting the “future of the club” headline.`,
          tags: ['młodzież', 'forma'],
          relatedTeamIds: [team.id],
          relatedPlayerIds: [player.id],
          effectsSummary: `${name}: morale +5, forma +4`,
          effectsSummaryEn: `${name}: morale +5, form +4`,
          impact: true,
        },
        affectPlayer: true,
        inboxHint: `${name} łapie formę: morale +5, forma +4.`,
        inboxHintEn: `${name} finds form: morale +5, form +4.`,
      }
    },
  },
  {
    id: 'unexpected_fine',
    weight: 0.65,
    impact: true,
    canSpawn: () => true,
    run(career, _league, rng) {
      const team = worldTeamById(career.world, career.playerTeamId)
      if (!team) return null
      const amount = (4 + Math.floor(rng() * 7)) * 1000
      const budget = getTransferBudget(team)
      const take = Math.min(amount, Math.max(0, budget))
      if (take <= 0) return null
      adjustTransferBudget(team, -take)
      const reasons = [
        {
          pl: 'opóźniony raport medyczny',
          en: 'late medical report',
        },
        {
          pl: 'nieregulaminowy nadruk na koszulkach',
          en: 'non-compliant jersey print',
        },
        {
          pl: 'hałas na obozie poza godzinami',
          en: 'noise at camp after hours',
        },
        {
          pl: 'sporny protest po meczu',
          en: 'disputed post-match protest',
        },
      ]
      const why = pick(reasons, rng)
      return {
        article: {
          category: 'breaking',
          headline: `Mandat UFA dla ${team.name}`,
          headlineEn: `League fine for ${team.name}`,
          dek: `${formatUsd(take)} — powód: ${why.pl}.`,
          dekEn: `${formatUsd(take)} — reason: ${why.en}.`,
          body: `Biuro ligi nie żartuje. ${team.name} dostaje finansową „lekcję”. Ultiworld: drobiazg w skali sezonu, ale w budżecie transferowym boli jak zły dump pod pressem.`,
          bodyEn: `The league office isn’t joking. ${team.name} gets a financial “lesson.” Ultiworld: small in season scale, but in the transfer budget it hurts like a bad dump under pressure.`,
          tags: ['finanse', 'ufa'],
          relatedTeamIds: [team.id],
          effectsSummary: `Budżet −${formatUsd(take)}`,
          effectsSummaryEn: `Budget −${formatUsd(take)}`,
          impact: true,
        },
        affectPlayer: true,
        inboxHint: `Mandat ligi (${why.pl}): −${formatUsd(take)}.`,
        inboxHintEn: `League fine (${why.en}): −${formatUsd(take)}.`,
      }
    },
  },
  {
    id: 'physio_miracle',
    weight: 0.7,
    impact: true,
    canSpawn: (career) => {
      const team = worldTeamById(career.world, career.playerTeamId)
      return (team?.players ?? []).some((p) => p.injury && (p.injury.daysRemaining ?? 0) >= 3)
    },
    run(career, _league, rng) {
      const team = worldTeamById(career.world, career.playerTeamId)
      const injured = (team?.players ?? []).filter(
        (p) => p.injury && (p.injury.daysRemaining ?? 0) >= 3,
      )
      const player = pick(injured, rng)
      if (!player?.injury) return null
      const cut = 2 + Math.floor(rng() * 3)
      player.injury.daysRemaining = Math.max(1, (player.injury.daysRemaining ?? cut) - cut)
      const name = getPlayerFullName(player)
      return {
        article: {
          category: 'feature',
          headline: `Fizjo działa: ${name} wraca szybciej`,
          headlineEn: `Physio works: ${name} returns sooner`,
          dek: `Szacunkowa pauza skrócona o ~${cut} dni.`,
          dekEn: `Estimated absence cut by ~${cut} days.`,
          body: `Nowoczesne protokoły + odrobina szczęścia. ${name} robi postępy szybciej niż zakładano. Ultiworld lubi happy endy medyczne — zwłaszcza gdy nie kończą się nawrotem w playoffach.`,
          bodyEn: `Modern protocols + a bit of luck. ${name} progresses faster than expected. Ultiworld loves medical happy endings — especially when they don’t end in a playoff setback.`,
          tags: ['kontuzja', 'medycyna'],
          relatedTeamIds: [team.id],
          relatedPlayerIds: [player.id],
          effectsSummary: `${name}: powrót szybciej (~${cut} dni)`,
          effectsSummaryEn: `${name}: back sooner (~${cut} days)`,
          impact: true,
        },
        affectPlayer: true,
        inboxHint: `Fizjo: ${name} bliżej powrotu (−${cut} dni pauzy).`,
        inboxHintEn: `Physio: ${name} closer to return (−${cut} days out).`,
      }
    },
  },
  {
    id: 'rival_morale_crash',
    weight: 0.75,
    impact: true,
    canSpawn: (career) => worldTeamsList(career.world).some((t) => t.id !== career.playerTeamId),
    run(career, _league, rng) {
      const rivals = worldTeamsList(career.world).filter((t) => t.id !== career.playerTeamId)
      const team = pick(rivals, rng)
      if (!team?.players?.length) return null
      const delta = -(3 + Math.floor(rng() * 3))
      for (const p of team.players) {
        ensurePlayerMorale(p)
        p.morale = Math.max(25, Math.min(99, p.morale + delta))
        noteLoyaltyFromTreatment(p, delta)
      }
      const causes = [
        {
          pl: 'przegrany sparing w tygodniu',
          en: 'a midweek scrimmage loss',
        },
        {
          pl: 'wewnętrzny spór o minuty',
          en: 'an internal dispute over minutes',
        },
        {
          pl: 'plotka transferowa bez potwierdzenia',
          en: 'an unconfirmed transfer rumor',
        },
        {
          pl: 'ciężki wyjazd i opóźniony autobus',
          en: 'a rough road trip and a late bus',
        },
      ]
      const cause = pick(causes, rng)
      return {
        article: {
          category: 'breaking',
          headline: `Kryzys atmosfery w ${team.name}`,
          headlineEn: `Atmosphere crisis at ${team.name}`,
          dek: cause.pl,
          dekEn: cause.en,
          body: `Ultiworld słyszy o napięciach: ${cause.pl}. Morale w ${team.name} ${delta}. To nie wyrok — ale w kolejce każdy błąd będzie smakował ostrzej.`,
          bodyEn: `Ultiworld hears about tension: ${cause.en}. Morale at ${team.name} ${delta}. Not a sentence — but every mistake next round will sting sharper.`,
          tags: ['morale', 'breaking'],
          relatedTeamIds: [team.id],
          effectsSummary: `${team.name} morale ${delta}`,
          effectsSummaryEn: `${team.name} morale ${delta}`,
          impact: true,
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'midweek_boost',
    weight: 0.7,
    impact: true,
    canSpawn: () => true,
    run(career, _league, rng) {
      const team = worldTeamById(career.world, career.playerTeamId)
      if (!team?.players?.length) return null
      const delta = 2 + Math.floor(rng() * 2)
      for (const p of team.players) {
        ensurePlayerForm(p)
        p.form = Math.max(25, Math.min(99, p.form + delta))
      }
      return {
        article: {
          category: 'feature',
          headline: `Sparing midweek: ${team.name} złapało timing`,
          headlineEn: `Midweek scrimmage: ${team.name} found timing`,
          dek: `Forma drużyny +${delta}.`,
          dekEn: `Team form +${delta}.`,
          body: `Nieoficjalny scrimmage, oficjalny efekt. ${team.name} wraca z treningu z lekkimi nogami i ciężkimi notatnikami. Ultiworld: czasem midweek robi więcej niż trzy prezentacje PowerPoint.`,
          bodyEn: `Unofficial scrimmage, official effect. ${team.name} returns from practice with light legs and heavy notebooks. Ultiworld: sometimes midweek does more than three PowerPoints.`,
          tags: ['forma', 'trening'],
          relatedTeamIds: [team.id],
          effectsSummary: `Forma drużyny +${delta}`,
          effectsSummaryEn: `Team form +${delta}`,
          impact: true,
        },
        affectPlayer: true,
        inboxHint: `Po sparingu midweek forma drużyny +${delta}.`,
        inboxHintEn: `After the midweek scrimmage, team form +${delta}.`,
      }
    },
  },
  {
    id: 'sponsor_photo_day',
    weight: 0.6,
    impact: true,
    canSpawn: () => true,
    run(career, _league, rng) {
      const team = worldTeamById(career.world, career.playerTeamId)
      if (!team?.players?.length) return null
      const amount = (5 + Math.floor(rng() * 8)) * 1000
      adjustTransferBudget(team, amount)
      const picks = [...team.players]
        .sort((a, b) => getOverallRating(b.skills) - getOverallRating(a.skills))
        .slice(0, 4)
      for (const p of picks) {
        ensurePlayerMorale(p)
        p.morale = Math.max(25, Math.min(99, p.morale - 2))
        noteLoyaltyFromTreatment(p, -2)
      }
      return {
        article: {
          category: 'feature',
          headline: `Dzień zdjęciowy ${team.name}: uśmiech za kasę`,
          headlineEn: `${team.name} photo day: smiles for cash`,
          dek: `+${formatUsd(amount)}, lekkie zmęczenie PR-em.`,
          dekEn: `+${formatUsd(amount)}, slight PR fatigue.`,
          body: `Sponsor ustawił lampy, zawodnicy ustawili miny. Ultiworld: ${formatUsd(amount)} w budżecie, minus dwa punkty morale u frontmanów kampanii. Marketing wygrywa — szatnia lekko przewraca oczami.`,
          bodyEn: `The sponsor set the lights; the players set their faces. Ultiworld: ${formatUsd(amount)} in the budget, minus two morale for the campaign frontmen. Marketing wins — the locker room rolls its eyes.`,
          tags: ['sponsor', 'finanse'],
          relatedTeamIds: [team.id],
          relatedPlayerIds: picks.map((p) => p.id),
          effectsSummary: `+${formatUsd(amount)}, morale gwiazd −2`,
          effectsSummaryEn: `+${formatUsd(amount)}, star morale −2`,
          impact: true,
        },
        affectPlayer: true,
        inboxHint: `Sesja sponsorska: +${formatUsd(amount)}, gwiazdy lekko zmęczone PR-em.`,
        inboxHintEn: `Sponsor shoot: +${formatUsd(amount)}, stars slightly PR-fatigued.`,
      }
    },
  },
  // --- dodatkowe flavor ---
  {
    id: 'viral_highlight',
    weight: 1.05,
    impact: false,
    canSpawn: () => true,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const stats = Object.values(league.playerStats ?? {})
      const star = pick(
        stats.sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0)).slice(0, 8),
        rng,
      )
      const who = star ? playerDisplay(star, names) : pick(worldTeamsList(career.world), rng)?.name
      const clips = [
        { pl: 'layout w pełnym sprincie', en: 'a full-sprint layout' },
        { pl: 'hammer przez potrójny mark', en: 'a hammer through a triple mark' },
        { pl: 'callahan z linii bocznej', en: 'a callahan from the sideline' },
        { pl: 'dump-swing-score w 4 sekundy', en: 'dump-swing-score in 4 seconds' },
      ]
      const clip = pick(clips, rng)
      return {
        article: {
          category: 'feature',
          headline: `Viral tygodnia: ${who} i ${clip.pl}`,
          headlineEn: `Viral of the week: ${who} and ${clip.en}`,
          dek: 'Milion wyświetleń, zero kontekstu, pełen szum.',
          dekEn: 'A million views, zero context, full noise.',
          body: `Internet nie pyta o tabelę. Internet pyta: „da się to jeszcze raz?”. Ultiworld wrzuca klip ${who} (${clip.pl}) i przypomina, że ultimate sprzedaje się emocją — nie tylko box score.`,
          bodyEn: `The internet doesn’t ask about the table. It asks: “can they do it again?” Ultiworld drops the clip of ${who} (${clip.en}) and reminds you ultimate sells emotion — not just the box score.`,
          tags: ['viral', 'media'],
          relatedPlayerIds: star?.playerId ? [star.playerId] : [],
          relatedTeamIds: star?.teamId ? [star.teamId] : [],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'disc_tech_column',
    weight: 1.15,
    impact: false,
    canSpawn: () => true,
    run(_career, _league, rng) {
      const topics = [
        {
          h: 'Jaki dysk na wiatr? Felieton sprzętowy',
          hEn: 'Which disc for wind? Gear column',
          b: 'Ultiworld testuje trzy modele w bocznym wietrze. Wniosek: ręka ważniejsza niż marketing — ale marketing ładniej wygląda na Instagramie.',
          bEn: 'Ultiworld tests three models in a crosswind. Verdict: the hand matters more than marketing — but marketing looks better on Instagram.',
        },
        {
          h: 'Grip tape: religia czy placebo?',
          hEn: 'Grip tape: religion or placebo?',
          b: 'Jedni przysięgają, drudzy mówią „wystarczy sucha dłoń”. My mówimy: jeśli wierzysz, to działa. Nauka ultimate bywa mistyczna.',
          bEn: 'Some swear by it; others say “a dry hand is enough.” We say: if you believe, it works. Ultimate science can get mystical.',
        },
        {
          h: 'Kolor dysku a pewność siebie',
          hEn: 'Disc color and confidence',
          b: 'Czysto spekulacyjny felieton. Tak, wiemy. Czytajcie dalej.',
          bEn: 'A purely speculative column. Yes, we know. Keep reading.',
        },
      ]
      const t = pick(topics, rng)
      return {
        article: {
          category: 'feature',
          headline: t.h,
          headlineEn: t.hEn,
          dek: 'Kącik geeków Ultiworld.',
          dekEn: 'Ultiworld geek corner.',
          body: t.b,
          bodyEn: t.bEn,
          tags: ['sprzęt', 'felieton'],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'alumni_night',
    weight: 0.9,
    impact: false,
    canSpawn: () => true,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const team = pick(worldTeamsList(career.world), rng)
      const teamLabel = names[team.id] ?? team.name
      return {
        article: {
          category: 'feature',
          headline: `Noc absolwentów: ${teamLabel}`,
          headlineEn: `Alumni night: ${teamLabel}`,
          dek: 'Stare jersey, nowe memy, zero minut na boisku.',
          dekEn: 'Old jerseys, new memes, zero minutes on the field.',
          body: `Byli zawodnicy wrócili na trybuny, opowiedzieli trzy historie i jedną legendę. Ultiworld: kluby żyją dłużej niż kontrakty — i to właśnie widać, gdy ktoś wyciąga koszulkę z 2016.`,
          bodyEn: `Former players returned to the stands, told three stories and one legend. Ultiworld: clubs outlive contracts — and you see it when someone pulls out a 2016 jersey.`,
          tags: ['społeczność', 'historia'],
          relatedTeamIds: [team.id],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'fantasy_column',
    weight: 0.8,
    impact: false,
    canSpawn: (c, league) => (league?.currentRound ?? 0) >= 3,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const leaders = Object.values(league.playerStats ?? {})
        .sort(
          (a, b) =>
            (b.goals ?? 0) + (b.assists ?? 0) - ((a.goals ?? 0) + (a.assists ?? 0)),
        )
        .slice(0, 3)
      if (leaders.length < 2) return null
      const tips = leaders.map((r) => playerDisplay(r, names)).join(', ')
      return {
        article: {
          category: 'feature',
          headline: 'Fantasy UFA: kogo brać w tej kolejce?',
          headlineEn: 'Fantasy league: who to start this round?',
          dek: 'Nieoficjalne tipy Ultiworld (grajcie na własną odpowiedzialność).',
          dekEn: 'Unofficial Ultiworld tips (play at your own risk).',
          body: `Nasze „must-starty” brzmią znajomo: ${tips}. Reszta to streamery z dołu tabeli i nadzieja, że underdog zrobi 3 gole. Powodzenia — i nie kłóćcie się na Discordzie o dumpy.`,
          bodyEn: `Our “must-starts” sound familiar: ${tips}. The rest are deep-table streamers and hope an underdog drops 3 goals. Good luck — and don’t fight on Discord about dumps.`,
          tags: ['fantasy', 'statystyka'],
          relatedPlayerIds: leaders.map((r) => r.playerId),
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'weather_diary',
    weight: 0.9,
    impact: false,
    canSpawn: () => true,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const team = pick(worldTeamsList(career.world), rng)
      const teamLabel = names[team.id] ?? team.name
      const weathers = [
        {
          pl: 'boczny wiatr jak z tutoriala o hammerach',
          en: 'a crosswind straight out of a hammer tutorial',
        },
        {
          pl: 'upalny weekend — hydratacja to meta',
          en: 'a scorching weekend — hydration is the meta',
        },
        {
          pl: 'mżawka, śliskie dyski, mokre ego',
          en: 'drizzle, slippery discs, wet egos',
        },
        {
          pl: 'idealny wieczór: zero wiatru, pełnia dramaturgii',
          en: 'a perfect evening: zero wind, full drama',
        },
      ]
      const w = pick(weathers, rng)
      return {
        article: {
          category: 'feature',
          headline: `Pogodowy debrief: ${teamLabel}`,
          headlineEn: `Weather debrief: ${teamLabel}`,
          dek: w.pl,
          dekEn: w.en,
          body: `Warunki dyktują styl. Przy ${w.pl} sztaby ${teamLabel} mają inne priorytety niż w hali. Ultiworld: ultimate to sport, w którym prognoza jest częścią taktyki.`,
          bodyEn: `Conditions dictate style. With ${w.en}, ${teamLabel} staff have different priorities than indoors. Ultiworld: ultimate is a sport where the forecast is part of the tactics.`,
          tags: ['pogoda', 'felieton'],
          relatedTeamIds: [team.id],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'historic_flashback',
    weight: 0.75,
    impact: false,
    canSpawn: () => true,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const team = pick(worldTeamsList(career.world), rng)
      const teamLabel = names[team.id] ?? team.name
      const years = [2018, 2019, 2021, 2022, 2023]
      const y = pick(years, rng)
      return {
        article: {
          category: 'feature',
          headline: `Flashback ${y}: jak ${teamLabel} pisało historię`,
          headlineEn: `Flashback ${y}: how ${teamLabel} wrote history`,
          dek: 'Archiwum Ultiworld — kurz, nostalgia, lekcje.',
          dekEn: 'Ultiworld archive — dust, nostalgia, lessons.',
          body: `W ${y} wszystko wyglądało inaczej: inne jersey, inne lineupy, ten sam głód. Porównujemy tamten run z dzisiejszą ${teamLabel}. Wniosek redakcji: nostalgia nie wygrywa meczów — ale świetnie klika.`,
          bodyEn: `In ${y} everything looked different: other jerseys, other lineups, the same hunger. We compare that run with today’s ${teamLabel}. Desk verdict: nostalgia doesn’t win games — but it clicks brilliantly.`,
          tags: ['historia', 'archiwum'],
          relatedTeamIds: [team.id],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'international_rumor',
    weight: 0.7,
    impact: false,
    canSpawn: (c, league) => (league?.currentRound ?? 0) >= 6,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const stats = Object.values(league.playerStats ?? {})
        .sort((a, b) => (b.blocks ?? 0) + (b.goals ?? 0) - ((a.blocks ?? 0) + (a.goals ?? 0)))
        .slice(0, 10)
      const p = pick(stats, rng)
      if (!p) return null
      const who = playerDisplay(p, names)
      return {
        article: {
          category: 'breaking',
          headline: `Plotka: ${who} na radarze kadry`,
          headlineEn: `Rumor: ${who} on the national team radar`,
          dek: 'Nieoficjalnie. Ale głośno.',
          dekEn: 'Unofficial. But loud.',
          body: `Źródła Ultiworld (czytaj: ktoś na Discordzie) spekulują o powołaniu. Klub milczy, zawodnik uśmiecha się dyplomatycznie. My publikujemy, bo ultimate lubi wielkie sceny — nawet te jeszcze niepotwierdzone.`,
          bodyEn: `Ultiworld sources (read: someone on Discord) speculate about a call-up. The club stays quiet; the player smiles diplomatically. We publish because ultimate loves big stages — even the unconfirmed ones.`,
          tags: ['kadra', 'plotka'],
          relatedPlayerIds: [p.playerId],
          relatedTeamIds: p.teamId ? [p.teamId] : [],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'stadium_food',
    weight: 0.65,
    impact: false,
    canSpawn: () => true,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const team = pick(worldTeamsList(career.world), rng)
      const teamLabel = names[team.id] ?? team.name
      const foods = [
        { pl: 'nachos z „sosem spirit”', en: 'nachos with “spirit sauce”' },
        { pl: 'hot-dog nazwany jak throw', en: 'a hot dog named after a throw' },
        {
          pl: 'kawa o smaku izotonika (nie polecamy)',
          en: 'isotonic-flavored coffee (not recommended)',
        },
        { pl: 'wege wrap „Callahan Club”', en: 'the “Callahan Club” veggie wrap' },
      ]
      const food = pick(foods, rng)
      return {
        article: {
          category: 'feature',
          headline: `Przewodnik kulinarny: ${teamLabel}`,
          headlineEn: `Food guide: ${teamLabel}`,
          dek: food.pl,
          dekEn: food.en,
          body: `Tak, to też dziennikarstwo sportowe. Ultiworld ocenia strefę gastronomiczną przy ${teamLabel}. Werdykt: jedzenie nie wygrywa meczów, ale potrafi uratować połowę.`,
          bodyEn: `Yes, this is sports journalism too. Ultiworld rates the food zone at ${teamLabel}. Verdict: food doesn’t win games, but it can save a half.`,
          tags: ['kultura', 'lekki'],
          relatedTeamIds: [team.id],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'coach_carousel',
    weight: 0.7,
    impact: false,
    canSpawn: () => true,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const team = pick(
        worldTeamsList(career.world).filter((t) => t.id !== career.playerTeamId),
        rng,
      )
      if (!team) return null
      const teamLabel = names[team.id] ?? team.name
      return {
        article: {
          category: 'breaking',
          headline: `Plotki o sztabie: ${teamLabel} na radarze zmian?`,
          headlineEn: `Staff rumors: ${teamLabel} on the change radar?`,
          dek: 'Karuzela trenerska kręci się ciszej niż w piłce — ale kręci.',
          dekEn: 'The coaching carousel spins quieter than in soccer — but it spins.',
          body: `Ultiworld nie potwierdza zwolnień. Potwierdza natomiast, że w ${teamLabel} rośnie ciśnienie narracyjne. Jedna zła seria i hashtag „#timeforchange” pisze się sam.`,
          bodyEn: `Ultiworld doesn’t confirm firings. It does confirm narrative pressure is rising at ${teamLabel}. One bad run and the “#timeforchange” hashtag writes itself.`,
          tags: ['sztab', 'plotka'],
          relatedTeamIds: [team.id],
        },
        affectPlayer: false,
      }
    },
  },
  // --- ciekawostki / felietony ---
  {
    id: 'did_you_know',
    weight: 1.35,
    impact: false,
    canSpawn: () => true,
    run(_career, _league, rng) {
      const facts = [
        {
          h: 'Ciekawostka: skąd wzięła się nazwa „ultimate”?',
          hEn: 'Did you know: where did “ultimate” come from?',
          b: 'Krótka wersja Ultiworld: w latach 60. ktoś nazwał grę „ultimate” bo brzmiało to cooler niż „frisbee football”. Dłuższa wersja zajmuje trzy podcasty i jedną kłótnię na Redditcie.',
          bEn: 'Ultiworld short version: in the ’60s someone called it “ultimate” because it sounded cooler than “frisbee football.” The long version takes three podcasts and one Reddit fight.',
        },
        {
          h: 'Czy wiesz, że stall count ma kulturę lokalną?',
          hEn: 'Did you know stall count has local culture?',
          b: 'W jednych ligach „stalling” brzmi jak mantra, w innych jak policjant ruchu. Ultiworld: tempo liczenia to niedoceniany skill społecznościowy.',
          bEn: 'In some leagues “stalling” sounds like a mantra; in others like a traffic cop. Ultiworld: counting pace is an underrated social skill.',
        },
        {
          h: 'Ciekawostka sprzętowa: dysk też ma „osobowość”',
          hEn: 'Gear fact: discs have “personality” too',
          b: 'Ten sam model w różnym wietrze zachowuje się jak inny zawodnik. Dlatego stare ekipy mają szufladę „świętych dysków” — i nie, nie pożyczysz.',
          bEn: 'The same mold in different wind behaves like a different player. That’s why old crews keep a drawer of “holy discs” — and no, you can’t borrow one.',
        },
        {
          h: 'Mało kto pamięta: callahan to bohater z imienia i nazwiska',
          hEn: 'Few remember: Callahan is a real name',
          b: 'Ultiworld przypomina historię za nazwą. Spoiler: to nie marketingowy neologizm z 2024.',
          bEn: 'Ultiworld recalls the story behind the name. Spoiler: it’s not a 2024 marketing neologism.',
        },
        {
          h: 'Ciekawostka: endzone ma dokładnie tyle samo dramaturgii co mało miejsca',
          hEn: 'Fun fact: the end zone has as much drama as it has little space',
          b: 'Im mniejszy margines błędu, tym lepsze cytaty po meczu. Nauka? Nie. Felieton? Absolutnie.',
          bEn: 'The smaller the margin for error, the better the post-match quotes. Science? No. Column? Absolutely.',
        },
      ]
      const t = pick(facts, rng)
      return {
        article: {
          category: 'feature',
          headline: t.h,
          headlineEn: t.hEn,
          dek: 'Seria „Ciekawostki Ultiworld” — zero box score, maksimum klimatu.',
          dekEn: '“Ultiworld curiosities” — zero box score, maximum vibe.',
          body: t.b,
          bodyEn: t.bEn,
          tags: ['ciekawostka', 'edukacja'],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'glossary_corner',
    weight: 1.2,
    impact: false,
    canSpawn: () => true,
    run(_career, _league, rng) {
      const terms = [
        {
          h: 'Słowniczek: co to właściwie „huck”?',
          hEn: 'Glossary: what is a “huck,” really?',
          b: 'Długi rzut w dół boiska. Brzmi prosto, kończy się albo highlightem, albo turnowerem i trzech trenerów jednocześnie robi facepalm.',
          bEn: 'A long throw downfield. Sounds simple; ends as either a highlight or a turnover and three coaches facepalming at once.',
        },
        {
          h: 'Słowniczek: „dump” nie jest obelgą',
          hEn: 'Glossary: “dump” is not an insult',
          b: 'To bezpieczny reset do tyłu/boku. Ultiworld: najlepsze ataki zaczynają się od pokory, nie od heroizmu.',
          bEn: 'A safe reset backwards/sideways. Ultiworld: the best offenses start with humility, not heroics.',
        },
        {
          h: 'Słowniczek: „poach” w obronie',
          hEn: 'Glossary: “poach” on defense',
          b: 'Opuszczenie swojego człowieka, by przeczytać grę. Geniusz albo chaos — zależnie od wyniku pointa.',
          bEn: 'Leaving your person to read the play. Genius or chaos — depending on how the point ends.',
        },
        {
          h: 'Słowniczek: „spirit” to nie tylko hasło na koszulce',
          hEn: 'Glossary: “spirit” isn’t just a jersey slogan',
          b: 'Fair-play wpisane w DNA dyscypliny. Seria Ultiworld tłumaczy nowym kibicom, czemu po sporze ludzie nadal podają sobie ręce.',
          bEn: 'Fair play written into the sport’s DNA. Ultiworld explains to new fans why people still shake hands after a dispute.',
        },
      ]
      const t = pick(terms, rng)
      return {
        article: {
          category: 'feature',
          headline: t.h,
          headlineEn: t.hEn,
          dek: 'Dla kibiców, którzy przychodzą z innych sportów.',
          dekEn: 'For fans coming from other sports.',
          body: t.b,
          bodyEn: t.bEn,
          tags: ['ciekawostka', 'słownik'],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'superstition_feature',
    weight: 1.15,
    impact: false,
    canSpawn: () => true,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const team = pick(worldTeamsList(career.world), rng)
      const teamLabel = names[team.id] ?? team.name
      const bits = [
        {
          pl: 'ten sam sock pattern od trzech sezonów',
          en: 'the same sock pattern for three seasons',
        },
        {
          pl: 'zakaz mówienia „łatwy point” przed pull’em',
          en: 'a ban on saying “easy point” before the pull',
        },
        {
          pl: 'kapitan musi zjeść banana dokładnie 41 minut przed startem',
          en: 'the captain must eat a banana exactly 41 minutes before start',
        },
        {
          pl: 'dysk pechowy zamknięty w osobnym pokrowcu',
          en: 'an unlucky disc locked in its own sleeve',
        },
      ]
      const bit = pick(bits, rng)
      return {
        article: {
          category: 'feature',
          headline: `Przesądy szatni: ${teamLabel}`,
          headlineEn: `Locker-room superstitions: ${teamLabel}`,
          dek: bit.pl,
          dekEn: bit.en,
          body: `Ultimate jest racjonalny… do momentu, gdy ktoś zmieni rytuał. Ultiworld zbiera przesądy z ${teamLabel}. Nauka milczy. Wyniki — czasem też.`,
          bodyEn: `Ultimate is rational… until someone changes a ritual. Ultiworld collects superstitions from ${teamLabel}. Science stays quiet. Results — sometimes too.`,
          tags: ['ciekawostka', 'szatnia'],
          relatedTeamIds: [team.id],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'odd_stat_blurb',
    weight: 1.25,
    impact: false,
    canSpawn: (c, league) => Object.keys(league?.playerStats ?? {}).length >= 5,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const rows = Object.values(league.playerStats ?? {})
      const angle = Math.floor(rng() * 4)
      if (angle === 0) {
        const p = [...rows].sort((a, b) => (b.blocks ?? 0) - (a.blocks ?? 0))[0]
        const who = playerDisplay(p, names)
        return {
          article: {
            category: 'feature',
            headline: `Statystyczna ciekawostka: król bloków to ${who}`,
            headlineEn: `Stat curiosity: block king is ${who}`,
            dek: `${p.blocks ?? 0} bloków — cichy zabójca ataków.`,
            dekEn: `${p.blocks ?? 0} blocks — a quiet attack killer.`,
            body: `Nie każdy highlight ląduje w TikToku. Ultiworld wyciąga z tabeli kogoś, kto psuje rytm rywalom: ${who}. Obrona też sprzedaje bilety — tylko ciszej.`,
            bodyEn: `Not every highlight lands on TikTok. Ultiworld pulls from the table someone who ruins opponents’ rhythm: ${who}. Defense sells tickets too — just quieter.`,
            tags: ['ciekawostka', 'statystyka'],
            relatedPlayerIds: [p.playerId],
            relatedTeamIds: p.teamId ? [p.teamId] : [],
          },
          affectPlayer: false,
        }
      }
      if (angle === 1) {
        const p = [...rows].sort((a, b) => (b.assists ?? 0) - (a.assists ?? 0))[0]
        const who = playerDisplay(p, names)
        return {
          article: {
            category: 'feature',
            headline: `Playmaker radar: ${who} rozdaje asysty`,
            headlineEn: `Playmaker radar: ${who} deals assists`,
            dek: `${p.assists ?? 0} A — dysk lubi jego ręce.`,
            dekEn: `${p.assists ?? 0} A — the disc likes those hands.`,
            body: `Gole dostają oklaski, asysty dostają szacunek szatni. ${who} jest w drugiej kategorii — i Ultiworld to zauważa.`,
            bodyEn: `Goals get applause; assists get locker-room respect. ${who} is in the second category — and Ultiworld notices.`,
            tags: ['ciekawostka', 'statystyka'],
            relatedPlayerIds: [p.playerId],
            relatedTeamIds: p.teamId ? [p.teamId] : [],
          },
          affectPlayer: false,
        }
      }
      if (angle === 2) {
        const p = [...rows]
          .filter((r) => (r.games ?? 0) >= 2)
          .sort(
            (a, b) =>
              (b.goals ?? 0) / Math.max(1, b.games ?? 1) -
              (a.goals ?? 0) / Math.max(1, a.games ?? 1),
          )[0]
        if (!p) return null
        const avg = ((p.goals ?? 0) / Math.max(1, p.games ?? 1)).toFixed(2)
        const who = playerDisplay(p, names)
        return {
          article: {
            category: 'feature',
            headline: `Efficiency watch: ${who} @ ${avg} gola/mecz`,
            headlineEn: `Efficiency watch: ${who} @ ${avg} goals/game`,
            dek: 'Mała próbka, duży sygnał.',
            dekEn: 'Small sample, big signal.',
            body: `Ultiworld lubi liczby per game, bo sezon bywa długi, a narracje krótkie. ${who} wygląda jak ktoś, kogo skauci mają w notesie na czerwono.`,
            bodyEn: `Ultiworld likes per-game numbers because seasons are long and narratives are short. ${who} looks like someone scouts have circled in red.`,
            tags: ['ciekawostka', 'statystyka'],
            relatedPlayerIds: [p.playerId],
            relatedTeamIds: p.teamId ? [p.teamId] : [],
          },
          affectPlayer: false,
        }
      }
      const teamIds = [...new Set(rows.map((r) => r.teamId).filter(Boolean))]
      const tid = pick(teamIds, rng)
      const teamGoals = rows
        .filter((r) => r.teamId === tid)
        .reduce((s, r) => s + (r.goals ?? 0), 0)
      const teamLabel = names[tid] ?? tid
      return {
        article: {
          category: 'feature',
          headline: `Fun fact tabelaryczny: ${teamLabel} ma już ${teamGoals} goli w statystykach indywidualnych`,
          headlineEn: `Table fun fact: ${teamLabel} already has ${teamGoals} goals in individual stats`,
          dek: 'Tak, sumujemy box score dla przyjemności.',
          dekEn: 'Yes, we sum the box score for fun.',
          body: `Nie jest to oficjalna metryka UFA. Jest to natomiast pretekst, by napisać o ${teamLabel} bez kolejnej relacji meczowej. Ultiworld: czasem ciekawostka wystarczy.`,
          bodyEn: `Not an official league metric. It is, however, an excuse to write about ${teamLabel} without another match report. Ultiworld: sometimes a curiosity is enough.`,
          tags: ['ciekawostka', 'statystyka'],
          relatedTeamIds: [tid],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'player_hobby',
    weight: 1.1,
    impact: false,
    canSpawn: () => true,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const team = pick(worldTeamsList(career.world), rng)
      const player = pick(team?.players ?? [], rng)
      if (!player) return null
      const hobbies = [
        {
          pl: 'piecze sourdough między kolejkami',
          en: 'bakes sourdough between rounds',
        },
        {
          pl: 'kolekcjonuje stare dyski jak winyle',
          en: 'collects old discs like vinyl',
        },
        {
          pl: 'gra w szachy blitz na wyjazdach',
          en: 'plays blitz chess on road trips',
        },
        {
          pl: 'prowadzi anonimowy account z memami o stallu',
          en: 'runs an anonymous stall-meme account',
        },
        {
          pl: 'uczy się japońskiego „dla hucków w Tokio”',
          en: 'is learning Japanese “for hucks in Tokyo”',
        },
      ]
      const hobby = pick(hobbies, rng)
      const name = getPlayerFullName(player)
      const teamLabel = names[team.id] ?? team.name
      return {
        article: {
          category: 'feature',
          headline: `Poza boiskiem: ${name} ${hobby.pl}`,
          headlineEn: `Off the field: ${name} ${hobby.en}`,
          dek: 'Ludzie, nie tylko OVR.',
          dekEn: 'People, not just OVR.',
          body: `Ultiworld zagląda za kurtynę ${teamLabel}. ${name} — ${hobby.pl}. Bo ultimate wygrywa się nogami, a szatnię skleja się historiami.`,
          bodyEn: `Ultiworld peeks behind the curtain at ${teamLabel}. ${name} — ${hobby.en}. Because ultimate is won with legs, and locker rooms stick together with stories.`,
          tags: ['ciekawostka', 'ludzie'],
          relatedTeamIds: [team.id],
          relatedPlayerIds: [player.id],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'nickname_origin',
    weight: 1.05,
    impact: false,
    canSpawn: () => true,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const team = pick(worldTeamsList(career.world), rng)
      const player = pick(
        [...(team?.players ?? [])].sort(
          (a, b) => getOverallRating(b.skills) - getOverallRating(a.skills),
        ).slice(0, 6),
        rng,
      )
      if (!player) return null
      const nicks = [
        {
          pl: '„Laser” — po serii flatów, które przecinały mark jak masło',
          en: '“Laser” — after a run of flats that sliced the mark like butter',
        },
        {
          pl: '„Gps” — zawsze wie, gdzie będzie dump',
          en: '“Gps” — always knows where the dump will be',
        },
        {
          pl: '„Cicho” — zero trash talku, maksimum layoutów',
          en: '“Quiet” — zero trash talk, maximum layouts',
        },
        {
          pl: '„Burza” — bo po jego wejściu na linię robi się głośno',
          en: '“Storm” — because it gets loud when they step on the line',
        },
      ]
      const nick = pick(nicks, rng)
      const name = getPlayerFullName(player)
      const teamLabel = names[team.id] ?? team.name
      return {
        article: {
          category: 'feature',
          headline: `Skąd nick ${name}?`,
          headlineEn: `Where did ${name}’s nickname come from?`,
          dek: nick.pl,
          dekEn: nick.en,
          body: `W ${teamLabel} legendy powstają szybciej niż kontrakty. Ultiworld odtwarza genealogię przezwiska — z trzema wersjami i jedną oficjalną, której nikt nie uznaje.`,
          bodyEn: `At ${teamLabel}, legends form faster than contracts. Ultiworld reconstructs the nickname’s genealogy — three versions and one official story nobody accepts.`,
          tags: ['ciekawostka', 'ludzie'],
          relatedTeamIds: [team.id],
          relatedPlayerIds: [player.id],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'rule_myth',
    weight: 1.15,
    impact: false,
    canSpawn: () => true,
    run(_career, _league, rng) {
      const myths = [
        {
          h: 'Mit: „jak nie ma sędziego, to wolno wszystko”',
          hEn: 'Myth: “no refs means anything goes”',
          b: 'Nie. Self-officiating to więcej odpowiedzialności, nie mniej. Ultiworld bustuje mit tygodnia.',
          bEn: 'No. Self-officiating means more responsibility, not less. Ultiworld busts the myth of the week.',
        },
        {
          h: 'Mit: „długi huck zawsze jest dobrą decyzją przy wietrze”',
          hEn: 'Myth: “a long huck is always smart in wind”',
          b: 'Tylko jeśli lubisz karmić obronę. Czasem najlepszy highlight to dump, którego nikt nie sfilmował.',
          bEn: 'Only if you like feeding the defense. Sometimes the best highlight is a dump nobody filmed.',
        },
        {
          h: 'Mit: „spirit przegrywa z agresją”',
          hEn: 'Myth: “spirit loses to aggression”',
          b: 'Najlepsze drużyny łączą obie rzeczy. Ultiworld: agresja bez fair-play to tylko hałas.',
          bEn: 'The best teams combine both. Ultiworld: aggression without fair play is just noise.',
        },
      ]
      const t = pick(myths, rng)
      return {
        article: {
          category: 'feature',
          headline: t.h,
          headlineEn: t.hEn,
          dek: 'Mit vs rzeczywistość — cykl edukacyjny.',
          dekEn: 'Myth vs reality — an education series.',
          body: t.b,
          bodyEn: t.bEn,
          tags: ['ciekawostka', 'przepisy'],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'travel_diary',
    weight: 1,
    impact: false,
    canSpawn: () => true,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const team = pick(worldTeamsList(career.world), rng)
      const teamLabel = names[team.id] ?? team.name
      const bits = [
        {
          pl: 'playlista busowa ma 147 utworów i zero ballad',
          en: 'the bus playlist has 147 tracks and zero ballads',
        },
        {
          pl: 'najlepszy kebab „po meczu” jest zawsze 400 m od hotelu w złą stronę',
          en: 'the best post-game kebab is always 400 m the wrong way from the hotel',
        },
        {
          pl: 'ktoś zawsze zapomina opaski na kostkę',
          en: 'someone always forgets the ankle brace',
        },
        {
          pl: 'wojna o ładowarki zaczyna się na parkingu',
          en: 'the charger war starts in the parking lot',
        },
      ]
      const bit = pick(bits, rng)
      return {
        article: {
          category: 'feature',
          headline: `Dziennik wyjazdowy: ${teamLabel}`,
          headlineEn: `Travel diary: ${teamLabel}`,
          dek: bit.pl,
          dekEn: bit.en,
          body: `Liga to nie tylko wynik — to kilometry, kanapki i półsenne taktyczne. Ultiworld jeździ (wyobraźnią) z ${teamLabel} i wraca z notatkami, których nie ma w box score.`,
          bodyEn: `The league isn’t just the result — it’s kilometers, sandwiches and half-asleep tactics talk. Ultiworld rides (in imagination) with ${teamLabel} and comes back with notes you won’t find in the box score.`,
          tags: ['ciekawostka', 'wyjazdy'],
          relatedTeamIds: [team.id],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'jersey_lore',
    weight: 1.05,
    impact: false,
    canSpawn: () => true,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const team = pick(worldTeamsList(career.world), rng)
      const teamLabel = names[team.id] ?? team.name
      const lore = [
        {
          pl: 'numer 7 jest „przeklęty” od turnieju w 2019',
          en: 'number 7 has been “cursed” since a 2019 tournament',
        },
        {
          pl: 'alternatywny komplet powstał przez pomyłkę drukarni — i został kultowy',
          en: 'the alternate kit was a print-shop mistake — and became cult',
        },
        {
          pl: 'kapitanowie od dekad biorą ten sam zakres numerów',
          en: 'captains have taken the same number range for decades',
        },
        {
          pl: 'sponsor chciał neon, szatnia wywalczyła klasykę',
          en: 'the sponsor wanted neon; the locker room won classic',
        },
      ]
      const bit = pick(lore, rng)
      return {
        article: {
          category: 'feature',
          headline: `Historia koszulek: ${teamLabel}`,
          headlineEn: `Jersey lore: ${teamLabel}`,
          dek: bit.pl,
          dekEn: bit.en,
          body: `Ultiworld kocha lore strojów. W ${teamLabel} każdy numer ma plotkę, a każda plotka ma świadka. To nie transfer window — to antropologia szatni.`,
          bodyEn: `Ultiworld loves kit lore. At ${teamLabel} every number has a rumor, and every rumor has a witness. Not the transfer window — locker-room anthropology.`,
          tags: ['ciekawostka', 'klub'],
          relatedTeamIds: [team.id],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'scout_notebook',
    weight: 1.1,
    impact: false,
    canSpawn: () => true,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const team = pick(worldTeamsList(career.world), rng)
      const teamLabel = names[team.id] ?? team.name
      const notes = [
        {
          pl: '„Lubią zaczynać od side stacku — czytelne, ale przewidywalne po 3 poinach.”',
          en: '“They like to start from a side stack — readable, but predictable after 3 points.”',
        },
        {
          pl: '„Handler #2 nie lubi pressure z przodu — warto testować.”',
          en: '“Handler #2 hates front pressure — worth testing.”',
        },
        {
          pl: '„Świetni w strefie, gubią się przy scramble.”',
          en: '“Great in zone, lost in scramble.”',
        },
        {
          pl: '„Kapitan mówi mało, decyduje dużo.”',
          en: '“The captain talks little, decides a lot.”',
        },
      ]
      const note = pick(notes, rng)
      return {
        article: {
          category: 'feature',
          headline: `Z notesu skauta: ${teamLabel}`,
          headlineEn: `From a scout’s notebook: ${teamLabel}`,
          dek: 'Anonimowe zapiski, które „przypadkiem” trafiły do redakcji.',
          dekEn: 'Anonymous notes that “accidentally” reached the desk.',
          body: `${note.pl}\n\nUltiworld publikuje fragment bez nazwisk. Bo ciekawostka taktyczna smakuje lepiej niż kolejny suchy raport z wyniku.`,
          bodyEn: `${note.en}\n\nUltiworld publishes a fragment without names. Because a tactical curiosity tastes better than another dry score report.`,
          tags: ['ciekawostka', 'taktyka'],
          relatedTeamIds: [team.id],
        },
        affectPlayer: false,
      }
    },
  },
  {
    id: 'mascot_or_symbol',
    weight: 0.95,
    impact: false,
    canSpawn: () => true,
    run(career, league, rng) {
      const names = teamNameMap(league)
      const team = pick(worldTeamsList(career.world), rng)
      const teamLabel = names[team.id] ?? team.name
      const symbols = [
        {
          pl: 'pluszowy dysk „na szczęście” wożony w torbie kapitana',
          en: 'a lucky plush disc carried in the captain’s bag',
        },
        {
          pl: 'flaga, która przeżyła trzy deszcze i jeden protest',
          en: 'a flag that survived three rains and one protest',
        },
        {
          pl: 'emoji drużynowe, którego nie rozumie nikt po 30',
          en: 'a team emoji nobody over 30 understands',
        },
        {
          pl: 'okrzyk przed pull’em starszy niż połowa składu',
          en: 'a pre-pull chant older than half the roster',
        },
      ]
      const symbol = pick(symbols, rng)
      return {
        article: {
          category: 'feature',
          headline: `Symbolika klubu: ${teamLabel}`,
          headlineEn: `Club symbols: ${teamLabel}`,
          dek: symbol.pl,
          dekEn: symbol.en,
          body: `Nie każdy klub ma maskotkę. Każdy ma rytuał. Ultiworld kataloguje drobiazgi, które trzymają ${teamLabel} razem, gdy tabela boli.`,
          bodyEn: `Not every club has a mascot. Every club has a ritual. Ultiworld catalogs the little things that hold ${teamLabel} together when the table hurts.`,
          tags: ['ciekawostka', 'kultura'],
          relatedTeamIds: [team.id],
        },
        affectPlayer: false,
      }
    },
  },
]

function pickWorldEvent(career, league, rng, { flavorOnly = false, excludeIds = null } = {}) {
  const pool = WORLD_EVENTS.filter((e) => {
    if (flavorOnly && e.impact) return false
    if (excludeIds?.has?.(e.id)) return false
    try {
      return !e.canSpawn || e.canSpawn(career, league)
    } catch {
      return false
    }
  })
  if (!pool.length) return null
  const total = pool.reduce((s, e) => s + (e.weight ?? 1), 0)
  let roll = rng() * total
  for (const e of pool) {
    roll -= e.weight ?? 1
    if (roll <= 0) return e
  }
  return pool[pool.length - 1]
}

function runWorldEventArticle(event, career, world, league, simDate, rng, inboxMessages) {
  if (!event) return { world, league, article: null }
  const needsClone = event.impact
  let nextWorld = world
  let nextLeague = league
  if (needsClone) {
    nextWorld = structuredClone(world)
    nextLeague = structuredClone(league)
    if (nextLeague && nextWorld?.teamsById) nextLeague.teamsById = nextWorld.teamsById
  }
  const liveCareer = { ...career, world: nextWorld, league: nextLeague }
  const result = event.run(liveCareer, nextLeague, rng)
  if (!result?.article) return { world: nextWorld, league: nextLeague, article: null }
  const art = makeArticle({
    ...result.article,
    date: simDate,
    career,
  })
  if (event.id) {
    art.worldEventId = event.id
  }
  if (result.affectPlayer && result.inboxHint) {
    inboxMessages.push({
      id: newId('msg-uw'),
      type: 'random_event',
      createdAt: new Date().toISOString(),
      date: simDate,
      seasonIndex: career.seasonIndex,
      seasonYear: career.seasonYear,
      read: false,
      title: `Ultiworld · ${result.article.headline}`,
      ...(result.article.headlineEn
        ? { titleEn: `Ultiworld · ${result.article.headlineEn}` }
        : {}),
      body: result.inboxHint,
      ...(result.inboxHintEn ? { bodyEn: result.inboxHintEn } : {}),
      payload: {
        kind: 'ultiworld_notice',
        status: 'resolved',
        articleId: art.id,
      },
    })
  }
  return { world: nextWorld, league: nextLeague, article: art }
}

/**
 * Generuje artykuły Ultiworld po dniu / FF.
 * Może mutować world + league (efekty wydarzeń).
 *
 * @returns {{
 *   ultiworld: object,
 *   world: object,
 *   league: object,
 *   inboxMessages: object[],
 *   newArticles: object[],
 * }}
 */
export function processUltiworldTick(career, { date = null } = {}) {
  const simDate = date ?? career?.league?.currentDate
  const baseUw = ensureUltiworld(career)
  let ultiworld = {
    ...baseUw,
    articles: [...(baseUw.articles ?? [])],
    coveredFixtureIds: [...(baseUw.coveredFixtureIds ?? [])],
  }
  let world = career.world
  let league = career.league
  const inboxMessages = []
  const newArticles = []

  if (!career?.world || !league || !simDate) {
    return { ultiworld, world, league, inboxMessages, newArticles }
  }

  const rng = mulberry32(
    hashSeed(
      `${career.id}|${career.seasonIndex}|${simDate}|ultiworld|${ultiworld.articles.length}`,
    ),
  )
  const names = teamNameMap(league)
  const covered = new Set(ultiworld.coveredFixtureIds)

  // Pierwsze uruchomienie na istniejącej karierze — nie zalewaj historii artykułami.
  if (!ultiworld.seeded) {
    for (const f of league.fixtures ?? []) {
      if (f.status === 'completed' && f.id) covered.add(f.id)
    }
    let maxDone = 0
    const maxRound = league.totalRounds ?? 30
    for (let r = 1; r <= maxRound; r += 1) {
      if (isRoundComplete(league, r)) maxDone = r
      else break
    }
    ultiworld.lastRoundCovered = Math.max(ultiworld.lastRoundCovered ?? 0, maxDone)
    ultiworld.lastPomMonth = ultiworld.lastPomMonth ?? monthKey(simDate)
    ultiworld.seeded = true
    ultiworld.coveredFixtureIds = [...covered].slice(-400)
    // Kontynuuj tick tylko dla bieżącego dnia (światowe eventy / nowe mecze po seedzie).
  }

  // 1) Nowe zakończone mecze → co najwyżej 1–2 naprawdę ciekawe relacje
  const freshFixtures = (league.fixtures ?? []).filter(
    (f) => f.status === 'completed' && f.id && !covered.has(f.id),
  )
  const matchCandidates = []
  for (const f of freshFixtures) {
    covered.add(f.id)
    const hit = interestingMatchArticle(career, league, f, names, rng)
    if (hit?.article) matchCandidates.push(hit)
  }
  matchCandidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const matchCap =
    matchCandidates[0]?.score >= 9 ? Math.min(2, MAX_MATCH_ARTICLES_PER_TICK + 1) : MAX_MATCH_ARTICLES_PER_TICK
  for (const hit of matchCandidates.slice(0, matchCap)) {
    newArticles.push(hit.article)
  }
  ultiworld.coveredFixtureIds = [...covered].slice(-400)

  // 2) Zamknięte kolejki → przegląd + top 7
  const maxRound = league.totalRounds ?? 30
  let lastCovered = ultiworld.lastRoundCovered ?? 0
  for (let r = lastCovered + 1; r <= maxRound; r += 1) {
    if (!isRoundComplete(league, r)) break
    // Nie generuj przyszłości względem currentRound zbyt agresywnie — tylko domknięte.
    newArticles.push(...roundReviewArticles(career, league, r, names, rng))
    lastCovered = r
  }
  ultiworld.lastRoundCovered = lastCovered

  // 3) Zawodnik miesiąca — przy zmianie miesiąca
  const prevMonth = ultiworld.lastPomMonth
  const curMonth = monthKey(simDate)
  if (curMonth && prevMonth && prevMonth !== curMonth) {
    const pom = playerOfMonthArticle(career, league, names, prevMonth, rng)
    if (pom) newArticles.push(pom)
    ultiworld.lastPomMonth = curMonth
  } else if (curMonth && !prevMonth) {
    ultiworld.lastPomMonth = curMonth
  }

  // 4) Losowe wydarzenie świata (+ osobna szansa na ciekawostkę)
  const usedEventIds = new Set()
  if (rng() < WORLD_EVENT_CHANCE) {
    const event = pickWorldEvent({ ...career, world, league }, league, rng)
    if (event) usedEventIds.add(event.id)
    const ran = runWorldEventArticle(event, { ...career, world, league }, world, league, simDate, rng, inboxMessages)
    world = ran.world
    league = ran.league
    if (ran.article) newArticles.push(ran.article)
  }
  if (rng() < CURIOSITY_CHANCE) {
    const curiosity = pickWorldEvent({ ...career, world, league }, league, rng, {
      flavorOnly: true,
      excludeIds: usedEventIds,
    })
    const ran = runWorldEventArticle(
      curiosity,
      { ...career, world, league },
      world,
      league,
      simDate,
      rng,
      inboxMessages,
    )
    world = ran.world
    league = ran.league
    if (ran.article) newArticles.push(ran.article)
  }

  // Cup champion flash
  if (league.cup?.championTeamId && !ultiworld.cupChampionCovered) {
    const champ = names[league.cup.championTeamId] ?? league.cup.championTeamId
    newArticles.push(
      makeArticle({
        category: 'cup',
        headline: `Puchar zdobyty! ${champ} na tronie`,
        dek: 'Ultiworld składa gratulacje i przygotowuje winietkę sezonu.',
        body: `${champ} przechodzi drabinkę i zapisuje się w historii. Szampan (bezalkoholowy, bo regeneracja) leje się strumieniami. Liga wraca do codzienności — legenda zostaje.`,
        date: simDate,
        career,
        tags: ['puchar', 'mistrz'],
        relatedTeamIds: [league.cup.championTeamId],
      }),
    )
    ultiworld.cupChampionCovered = true
  }

  ultiworld = prependArticles(ultiworld, newArticles)
  return { ultiworld, world, league, inboxMessages, newArticles }
}
