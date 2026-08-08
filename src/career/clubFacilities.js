/**
 * Struktury klubu (poziomy 1–10) — lekkie modyfikatory + ulepszenia za budżet.
 * Poziomy 1–4: negatywny wpływ (poza sklepikiem), 5 = baseline, 6–10: rosnący plus.
 */

import { createRng } from '../matchEngine/rng.js'
import { adjustTransferBudget, formatUsd, getTransferBudget } from './transfers/clubFinances.js'
import { getTeamReputation, ensureTeamReputation } from '../models/teamReputation.js'
import { getPlayerForm } from '../models/playerForm.js'
import {
  ensureTeamFans,
  getFanSize,
  getFanMood,
  getFanTraits,
} from '../models/teamFans.js'

export const FACILITY_LEVEL_MIN = 1
export const FACILITY_LEVEL_MAX = 10
export const FACILITY_BASELINE_LEVEL = 5
export const FACILITIES_GEN_VERSION = 1

/** @typedef {'stadium'|'trainingCenter'|'medicalCenter'|'chillRoom'|'fanShop'} FacilityId */

/**
 * @typedef {object} FacilityDef
 * @property {FacilityId} id
 * @property {string} namePl
 * @property {string} nameEn
 * @property {string} effectPl
 * @property {string} effectEn
 * @property {boolean} alwaysPositive — sklepik: zawsze ≥0
 * @property {Record<number, { pl: string, en: string }>} levelBlurbs
 */

/** @type {Record<FacilityId, FacilityDef>} */
export const FACILITY_DEFS = {
  stadium: {
    id: 'stadium',
    namePl: 'Stadion',
    nameEn: 'Stadium',
    effectPl: 'Przewaga własnego boiska',
    effectEn: 'Home-field advantage',
    alwaysPositive: false,
    levelBlurbs: {
      1: {
        pl: 'Dziurawa murawa z pachołkami zamiast linii. Kibice siedzą na składanych krzesełkach z Ikei.',
        en: 'Pothole turf with traffic cones for lines. Fans sit on folding Ikea chairs.',
      },
      2: {
        pl: 'Jedna trybuna, dwie latarnie i boisko, które po deszczu zamienia się w kałużę olimpijską.',
        en: 'One stand, two floodlights, and a pitch that becomes an Olympic puddle after rain.',
      },
      3: {
        pl: 'Linie są już farbą, ale sędzia nadal czasem myli end zone z parkingiem.',
        en: 'Lines are paint now, but the ref still mistakes the end zone for the parking lot.',
      },
      4: {
        pl: 'Prawie normalny obiekt — tylko wiatr wieje prosto w twarz gospodarzom. Zawsze.',
        en: 'Almost a real venue — except the wind always blows straight into the hosts’ faces.',
      },
      5: {
        pl: 'Solidny stadion ligowy. Ani wstyd, ani wow — dokładnie tak, jak lubi liga.',
        en: 'A solid league stadium. Neither shame nor wow — exactly how the league likes it.',
      },
      6: {
        pl: 'Nowe ławki, równa trawa i kibice, którzy faktycznie słychać z drugiej strony pola.',
        en: 'New benches, even grass, and fans you can actually hear from the far sideline.',
      },
      7: {
        pl: 'Nagłośnienie działa, linie świecą, a przeciwnik pyta „czy to na pewno nasze wyjazdowe?”.',
        en: 'PA works, lines glow, and opponents ask “are we sure this is our away day?”.',
      },
      8: {
        pl: 'Trybuny mają klimat, boisko trzyma piłkę… dysk… no, trzyma dysk. Atmosfera rośnie.',
        en: 'The stands have vibe, the field holds the disc. Atmosphere is climbing.',
      },
      9: {
        pl: 'Prawie arena: strefa VIP z kawą, która smakuje jak kawa, nie jak herbata z torby treningowej.',
        en: 'Nearly an arena: VIP coffee that tastes like coffee, not training-bag tea.',
      },
      10: {
        pl: 'Katedra ultimate. Nawet wiatr wydaje się kibicować gospodarzom (lub przynajmniej nie przeszkadza).',
        en: 'An ultimate cathedral. Even the wind seems to cheer for the hosts (or at least stays out of the way).',
      },
    },
  },
  trainingCenter: {
    id: 'trainingCenter',
    namePl: 'Centrum treningowe',
    nameEn: 'Training center',
    effectPl: 'Jakość treningów',
    effectEn: 'Training quality',
    alwaysPositive: false,
    levelBlurbs: {
      1: {
        pl: 'Parking, dwa pachołki i siatka na dyski zszyta taśmą klejącą. „Metoda naturalna”.',
        en: 'A parking lot, two cones, and a disc net held together with duct tape. “Natural method.”',
      },
      2: {
        pl: 'Sala jest, ale lustra pokazują tylko, jak bardzo wszyscy są zmęczeni.',
        en: 'There’s a room, but the mirrors mostly show how tired everyone is.',
      },
      3: {
        pl: 'Jedna ścianka do rzutów i rower stacjonarny, który skrzypi jak horror z lat 90.',
        en: 'One throwing wall and a stationary bike that squeaks like a ’90s horror flick.',
      },
      4: {
        pl: 'Prawie OK — tylko szatnia pachnie jak wieczny wilgotny ręcznik.',
        en: 'Almost fine — except the locker room smells like a permanently damp towel.',
      },
      5: {
        pl: 'Standardowy obiekt: boisko, siłownia, tablica taktyczna z trzema kolorami markerów.',
        en: 'Standard facility: field, gym, whiteboard with three marker colors.',
      },
      6: {
        pl: 'Nowe maty, kamera do analizy i trenerzy, którzy nie muszą krzyczeć przez wiatr.',
        en: 'New mats, an analysis camera, and coaches who don’t have to yell through the wind.',
      },
      7: {
        pl: 'Strefa recovery + rzutnia indoor. Sesje zaczynają wyglądać jak plan, nie jak improwizacja.',
        en: 'Recovery zone + indoor throwing lane. Sessions look like a plan, not improv.',
      },
      8: {
        pl: 'Laboratorium ruchu: GPS, wideo, i kawałek boiska, na którym trawa nie jest „opcjonalna”.',
        en: 'A movement lab: GPS, video, and a patch of field where grass isn’t “optional.”',
      },
      9: {
        pl: 'Prawie akademia. Juniorzy zaglądają przez płot z zazdrością godną Ultiworlda.',
        en: 'Almost an academy. Juniors peek through the fence with Ultiworld-worthy envy.',
      },
      10: {
        pl: 'Centrum, w którym nawet „lekki trening” wygląda profesjonalnie. Skille rosną ciszej, ale pewniej.',
        en: 'A center where even a “light session” looks pro. Skills grow quieter — and surer.',
      },
    },
  },
  medicalCenter: {
    id: 'medicalCenter',
    namePl: 'Centrum medyczne',
    nameEn: 'Medical center',
    effectPl: 'Ryzyko kontuzji',
    effectEn: 'Injury risk',
    alwaysPositive: false,
    levelBlurbs: {
      1: {
        pl: 'Apteczka z plasterkami z 2012 i lód z zamrażarki na kiełbasę. „Chodź, przejdzie”.',
        en: 'A first-aid kit with 2012 band-aids and sausage-freezer ice. “Walk it off.”',
      },
      2: {
        pl: 'Fizjo przychodzi „jak zdąży”. Masaż to zwykle klepnięcie po plecach i życzenia zdrowia.',
        en: 'Physio shows up “if free.” Massage is usually a back pat and best wishes.',
      },
      3: {
        pl: 'Jest stół do masażu, ale jedna noga jest podparta książką taktyczną.',
        en: 'There’s a massage table — one leg propped up by a tactics book.',
      },
      4: {
        pl: 'Podstawowy sprzęt recovery. Kontuzje nadal lubią ten klub, ale już nie aż tak.',
        en: 'Basic recovery gear. Injuries still like this club — just a little less.',
      },
      5: {
        pl: 'Standard ligowy: diagnostyka, taśmy, i ktoś, kto wie, gdzie jest ibuprofen.',
        en: 'League standard: diagnostics, tape, and someone who knows where the ibuprofen is.',
      },
      6: {
        pl: 'Prawdziwy fizjo na etacie. Zawodnicy wracają szybciej niż plotki o transferach.',
        en: 'A real full-time physio. Players return faster than transfer rumors.',
      },
      7: {
        pl: 'Cryo, USG i plan prehab. Nawet „naciągnięcie” dostaje nazwę naukową.',
        en: 'Cryo, ultrasound, and a prehab plan. Even a “strain” gets a scientific name.',
      },
      8: {
        pl: 'Zespół medyczny, który przewiduje urazy zanim zawodnik zdąży powiedzieć „chyba coś czuję”.',
        en: 'A medical team that spots injuries before a player can say “I think I feel something.”',
      },
      9: {
        pl: 'Klinika klubowa. Rywale żartują, że u was kontuzja to wybór stylu życia.',
        en: 'A club clinic. Rivals joke that injuries here are a lifestyle choice.',
      },
      10: {
        pl: 'Medyczna forteca. Szansa na uraz spada, a powroty wyglądają jak z folderu sponsorskiego.',
        en: 'A medical fortress. Injury odds drop, and returns look like a sponsor brochure.',
      },
    },
  },
  chillRoom: {
    id: 'chillRoom',
    namePl: 'Chill room',
    nameEn: 'Chill room',
    effectPl: 'Morale szatni',
    effectEn: 'Squad morale',
    alwaysPositive: false,
    levelBlurbs: {
      1: {
        pl: 'Kanapa z dziurą i konsola, która ładuje się tylko gdy ktoś trzyma kabel pod odpowiednim kątem.',
        en: 'A sofa with a hole and a console that charges only if someone holds the cable at the right angle.',
      },
      2: {
        pl: 'Herbata w papierowych kubkach i playlista, której nikt nie lubi, ale wszyscy znają na pamięć.',
        en: 'Tea in paper cups and a playlist nobody likes but everyone knows by heart.',
      },
      3: {
        pl: 'Jest foosball, ale jedna figurka nie ma głowy. Atmosfera: „trudne czasy, trzymajmy się”.',
        en: 'There’s foosball, but one figure is headless. Vibe: “tough times, stick together.”',
      },
      4: {
        pl: 'Prawie przytulnie — tylko klimatyzacja wieje albo za mocno, albo wcale.',
        en: 'Almost cozy — except the AC either blasts or does nothing.',
      },
      5: {
        pl: 'Neutralna strefa chillu: sofa, TV, przekąski. Nikogo nie irytuje i nikogo nie zachwyca.',
        en: 'A neutral chill zone: sofa, TV, snacks. Annoys no one, thrills no one.',
      },
      6: {
        pl: 'Wygodne fotele, dobra kawa i zakaz rozmów o tabeli przed 10:00. Morale idzie w górę.',
        en: 'Comfy chairs, decent coffee, and a ban on standings talk before 10 a.m. Morale ticks up.',
      },
      7: {
        pl: 'Karaoke po przegranej (opcjonalne) i ściana z memami z sezonu. Szatnia oddycha.',
        en: 'Optional post-loss karaoke and a wall of season memes. The locker room can breathe.',
      },
      8: {
        pl: 'Strefa snu + gry kooperacyjne. Nawet kapitan czasem się uśmiecha bez powodu.',
        en: 'A nap zone + co-op games. Even the captain sometimes smiles for no reason.',
      },
      9: {
        pl: 'Prawie spa dla ultimate. Po sesji wszyscy wyglądają jak ludzie, nie jak checklista zmęczenia.',
        en: 'Almost an ultimate spa. After sessions everyone looks like people, not a fatigue checklist.',
      },
      10: {
        pl: 'Legendarny chill room. Plotka mówi, że sam fakt wejścia podnosi morale o pół uśmiechu.',
        en: 'A legendary chill room. Rumor says just walking in raises morale by half a smile.',
      },
    },
  },
  fanShop: {
    id: 'fanShop',
    namePl: 'Sklep dla kibiców',
    nameEn: 'Fan shop',
    effectPl: 'Sprzedaż merchu po meczach',
    effectEn: 'Post-match merch sales',
    alwaysPositive: true,
    levelBlurbs: {
      1: {
        pl: 'Stolik campingowy i trzy koszulki w rozmiarze XL. Kasjer to woźny z drugim etatem.',
        en: 'A camping table and three XL shirts. The cashier is the groundskeeper on a side hustle.',
      },
      2: {
        pl: 'Budka z napisem „MERCH?”. Czasem jest czapka. Czasem tylko entuzjazm.',
        en: 'A booth labeled “MERCH?”. Sometimes there’s a cap. Sometimes just enthusiasm.',
      },
      3: {
        pl: 'Półka, kod QR i nadzieja. Sprzedaż rośnie, gdy ktoś wygra i kupi szalik „dla żony”.',
        en: 'A shelf, a QR code, and hope. Sales rise when someone wins and buys a scarf “for their partner.”',
      },
      4: {
        pl: 'Mały sklepik z prawdziwymi godzinami otwarcia. Kibice wiedzą, gdzie szukać gadżetów.',
        en: 'A small shop with real opening hours. Fans know where to find the gear.',
      },
      5: {
        pl: 'Porządny club shop: koszulki, czapki, breloczki w kształcie dysku.',
        en: 'A proper club shop: shirts, caps, disc-shaped keychains.',
      },
      6: {
        pl: 'Nowa witryna i limitowane dropy po derbach. Kasa dzwoni ciszej niż stadion, ale dzwoni.',
        en: 'A new storefront and limited derby drops. The till rings quieter than the stadium — but it rings.',
      },
      7: {
        pl: 'Online + stacjonarnie. Fani z innych miast zamawiają bluzy „bo klimat”.',
        en: 'Online + in-store. Out-of-town fans order hoodies “for the vibe.”',
      },
      8: {
        pl: 'Strefa autografów i półka „retro fail” z historycznymi kitami. Merch ma osobowość.',
        en: 'An autograph corner and a “retro fail” shelf of historic kits. Merch has personality.',
      },
      9: {
        pl: 'Prawie boutique. Nawet festywale klubowe kończą się pustymi półkami (w dobrym sensie).',
        en: 'Almost a boutique. Even club festivals end with empty shelves (in a good way).',
      },
      10: {
        pl: 'Flagowy sklep. Po meczu kolejka po koszulki wygląda jak kolejka po bilety — tylko krótsza i szczęśliwsza.',
        en: 'A flagship shop. Post-match jersey lines look like ticket lines — just shorter and happier.',
      },
    },
  },
}

export const FACILITY_IDS = /** @type {FacilityId[]} */ (Object.keys(FACILITY_DEFS))

function hashString(str) {
  let h = 2166136261
  const s = String(str)
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function clampLevel(n) {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return FACILITY_BASELINE_LEVEL
  return Math.max(FACILITY_LEVEL_MIN, Math.min(FACILITY_LEVEL_MAX, v))
}

/** Odchylenie od baseline: −4…+5 */
export function facilityLevelDelta(level) {
  return clampLevel(level) - FACILITY_BASELINE_LEVEL
}

/**
 * Koszt ulepszenia z `level` → `level+1` (USD).
 * Lekko drożej na wyższych poziomach.
 */
export function facilityUpgradeCost(facilityId, level) {
  const lv = clampLevel(level)
  if (lv >= FACILITY_LEVEL_MAX) return null
  const tier = {
    stadium: 1.15,
    trainingCenter: 1.05,
    medicalCenter: 1.1,
    chillRoom: 0.85,
    fanShop: 0.95,
  }[facilityId] ?? 1
  const raw = 16_000 * tier * 1.52 ** (lv - 1)
  return Math.round(raw / 1000) * 1000
}

export function rollFacilityLevel(rng, { bias = 0 } = {}) {
  // Lekki skew w stronę 3–5; rzadko 8+.
  const roll = rng.float()
  let base
  if (roll < 0.12) base = 1 + Math.floor(rng.float() * 2) // 1–2
  else if (roll < 0.55) base = 3 + Math.floor(rng.float() * 2) // 3–4
  else if (roll < 0.82) base = 5
  else if (roll < 0.95) base = 6 + Math.floor(rng.float() * 2) // 6–7
  else base = 8 + Math.floor(rng.float() * 2) // 8–9
  return clampLevel(base + bias)
}

/**
 * @param {object} team
 * @param {{ seed?: number|string, force?: boolean }} [options]
 */
export function seedTeamFacilities(team, options = {}) {
  if (!team) return team
  const force = !!options.force
  if (
    !force &&
    team.facilities &&
    typeof team.facilities === 'object' &&
    team.facilities.facilitiesGen === FACILITIES_GEN_VERSION &&
    FACILITY_IDS.every((id) => typeof team.facilities[id] === 'number')
  ) {
    for (const id of FACILITY_IDS) {
      team.facilities[id] = clampLevel(team.facilities[id])
    }
    return team
  }

  const rng = createRng(hashString(`facilities|${options.seed ?? 0}|${team.id ?? team.name}`))
  const levels = {}
  for (const id of FACILITY_IDS) {
    levels[id] = rollFacilityLevel(rng)
  }
  team.facilities = {
    facilitiesGen: FACILITIES_GEN_VERSION,
    ...levels,
  }
  return team
}

export function ensureTeamFacilities(team, options = {}) {
  if (!team) return team
  if (
    !team.facilities ||
    typeof team.facilities !== 'object' ||
    team.facilities.facilitiesGen !== FACILITIES_GEN_VERSION
  ) {
    return seedTeamFacilities(team, options)
  }
  for (const id of FACILITY_IDS) {
    if (typeof team.facilities[id] !== 'number') {
      team.facilities[id] = FACILITY_BASELINE_LEVEL
    } else {
      team.facilities[id] = clampLevel(team.facilities[id])
    }
  }
  team.facilities.facilitiesGen = FACILITIES_GEN_VERSION
  return team
}

export function ensureWorldFacilities(world, options = {}) {
  if (!world?.teamsById) return world
  const ids = world.teamIds ?? Object.keys(world.teamsById)
  const seed = options.seed ?? world.templateSeasonYear ?? 2025
  for (const id of ids) {
    const team = world.teamsById[id]
    if (team) ensureTeamFacilities(team, { seed, force: !!options.force })
  }
  return world
}

export function getFacilityLevel(team, facilityId) {
  ensureTeamFacilities(team)
  return clampLevel(team?.facilities?.[facilityId] ?? FACILITY_BASELINE_LEVEL)
}

export function facilityName(facilityId, lang = 'pl') {
  const def = FACILITY_DEFS[facilityId]
  if (!def) return facilityId
  return lang === 'en' ? def.nameEn : def.namePl
}

export function facilityEffectLabel(facilityId, lang = 'pl') {
  const def = FACILITY_DEFS[facilityId]
  if (!def) return ''
  return lang === 'en' ? def.effectEn : def.effectPl
}

export function facilityLevelBlurb(facilityId, level, lang = 'pl') {
  const def = FACILITY_DEFS[facilityId]
  const blurb = def?.levelBlurbs?.[clampLevel(level)]
  if (!blurb) return ''
  return lang === 'en' ? blurb.en : blurb.pl
}

export function facilityToneClass(facilityId, level) {
  const def = FACILITY_DEFS[facilityId]
  const lv = clampLevel(level)
  if (def?.alwaysPositive) {
    if (lv >= 8) return 'text-emerald-400'
    if (lv >= 5) return 'text-ufa-gold'
    return 'text-ufa-muted'
  }
  if (lv >= 8) return 'text-emerald-400'
  if (lv >= 6) return 'text-ufa-accent'
  if (lv === 5) return 'text-ufa-gold'
  if (lv >= 3) return 'text-amber-400'
  return 'text-red-400'
}

/** Mnożnik ratingów gospodarza (lekki). Baseline ~1.04. */
export function stadiumHomeRatingMult(team) {
  const delta = facilityLevelDelta(getFacilityLevel(team, 'stadium'))
  return 1.04 + delta * 0.005
}

/** Mnożnik jakości sesji treningowej. */
export function trainingCenterQualityMult(team) {
  const delta = facilityLevelDelta(getFacilityLevel(team, 'trainingCenter'))
  return 1 + delta * 0.028
}

/** Mnożnik szansy kontuzji (1 = baseline; wyższy poziom → mniejsza szansa). */
export function medicalInjuryChanceMult(team) {
  const delta = facilityLevelDelta(getFacilityLevel(team, 'medicalCenter'))
  return Math.max(0.72, Math.min(1.28, 1 - delta * 0.045))
}

/** Lekka zmiana morale po treningu (dla obecnych). */
export function chillRoomMoraleDelta(team) {
  const delta = facilityLevelDelta(getFacilityLevel(team, 'chillRoom'))
  if (delta === 0) return 0
  // −0.6 … +0.75 za sesję (zaokrąglane przy aplikacji)
  return delta * 0.15
}

/**
 * Szacowany / rzeczywisty zysk ze sklepiku po meczu (USD). Nie kosmiczne kwoty.
 * @returns {{ amount: number, breakdown: object }}
 */
export function computeFanShopMatchRevenue(team, { won = false, isHome = true } = {}) {
  ensureTeamFacilities(team)
  ensureTeamFans(team)
  ensureTeamReputation(team)

  const level = getFacilityLevel(team, 'fanShop')
  const size = getFanSize(team)
  const mood = getFanMood(team)
  const rep = getTeamReputation(team)
  const traits = getFanTraits(team)

  const players = team?.players ?? []
  let formSum = 0
  let formN = 0
  for (const p of players) {
    formSum += getPlayerForm(p)
    formN += 1
  }
  const avgForm = formN ? formSum / formN : 70

  // Bazowo ~$120–$900 zależnie od poziomu sklepu.
  let amount = 90 + level * 70
  amount *= 0.55 + Math.min(1.35, size / 9_000)
  amount *= 0.7 + (avgForm / 100) * 0.55
  amount *= 0.72 + (rep / 100) * 0.5
  amount *= 0.85 + (mood / 100) * 0.35
  if (won) amount *= 1.18
  else amount *= 0.82
  if (isHome) amount *= 1.22
  else amount *= 0.55

  if (traits.includes('festive')) amount *= 1.12
  if (traits.includes('family')) amount *= 1.08
  if (traits.includes('traditional')) amount *= 1.05
  if (traits.includes('ultras')) amount *= 1.06
  if (traits.includes('fickle')) amount *= 0.92
  if (traits.includes('critical') && !won) amount *= 0.88

  amount = Math.max(40, Math.round(amount / 10) * 10)
  // Cap — „nie kosmiczne”
  amount = Math.min(amount, 4_500)

  return {
    amount,
    breakdown: { level, size, mood, rep, avgForm: Math.round(avgForm), won, isHome },
  }
}

/**
 * Po meczu: dolicza merch do budżetu transferowego.
 * @returns {{ amount: number } | null}
 */
export function applyFanShopAfterMatch(team, options = {}) {
  if (!team) return null
  const { amount } = computeFanShopMatchRevenue(team, options)
  if (amount <= 0) return null
  adjustTransferBudget(team, amount)
  if (!team.facilities) ensureTeamFacilities(team)
  team.facilities.lastMerchAmount = amount
  team.facilities.lastMerchAt = Date.now()
  return { amount }
}

/**
 * Koszt wyjazdu / pucharu: liczba zawodników × losowy koszt 100–500$.
 * Ciche odjęcie od budżetu transferowego (bez inbox).
 * @returns {{ amount: number } | null}
 */
export function applyTravelCostAfterMatch(team, { rng = Math.random } = {}) {
  if (!team) return null
  const rosterSize = Math.max(1, (team.players ?? []).length)
  const perPlayer = 100 + Math.floor((typeof rng === 'function' ? rng() : Math.random()) * 401)
  const amount = rosterSize * perPlayer
  if (amount <= 0) return null
  adjustTransferBudget(team, -amount)
  if (!team.facilities) ensureTeamFacilities(team)
  team.facilities.lastTravelCost = amount
  team.facilities.lastTravelAt = Date.now()
  return { amount }
}

/**
 * Po meczu: merch + ewentualny koszt wyjazdu (away liga / obie strony w pucharze).
 */
export function applyPostMatchFinances(homeTeam, awayTeam, { isCup = false, homeWon = false, awayWon = false, rng = Math.random } = {}) {
  if (homeTeam) {
    applyFanShopAfterMatch(homeTeam, { won: homeWon, isHome: true })
    if (isCup) applyTravelCostAfterMatch(homeTeam, { rng })
  }
  if (awayTeam) {
    applyFanShopAfterMatch(awayTeam, { won: awayWon, isHome: false })
    applyTravelCostAfterMatch(awayTeam, { rng })
  }
}

/**
 * Ulepsza strukturę o 1 poziom za pieniądze.
 * @returns {{ ok: boolean, error?: string, level?: number, cost?: number, remainingBudget?: number }}
 */
export function upgradeFacility(team, facilityId) {
  if (!team || !FACILITY_DEFS[facilityId]) {
    return { ok: false, error: 'unknown_facility' }
  }
  ensureTeamFacilities(team)
  const level = getFacilityLevel(team, facilityId)
  if (level >= FACILITY_LEVEL_MAX) {
    return { ok: false, error: 'max_level', level }
  }
  const cost = facilityUpgradeCost(facilityId, level)
  const budget = getTransferBudget(team)
  if (cost == null || budget < cost) {
    return { ok: false, error: 'insufficient_funds', cost, level, remainingBudget: budget }
  }
  adjustTransferBudget(team, -cost)
  team.facilities[facilityId] = level + 1
  return {
    ok: true,
    level: team.facilities[facilityId],
    cost,
    remainingBudget: getTransferBudget(team),
  }
}

/** Krótki opis efektu liczbowego do UI. */
export function facilityEffectSummary(facilityId, level, lang = 'pl') {
  const lv = clampLevel(level)
  const delta = facilityLevelDelta(lv)
  const def = FACILITY_DEFS[facilityId]
  if (!def) return ''

  if (facilityId === 'stadium') {
    const mult = (1.04 + delta * 0.005).toFixed(3)
    return lang === 'en'
      ? `Home rating ×${mult}`
      : `Rating gospodarza ×${mult}`
  }
  if (facilityId === 'trainingCenter') {
    const pct = Math.round(delta * 2.8)
    const sign = pct > 0 ? '+' : ''
    return lang === 'en'
      ? `Training quality ${sign}${pct}%`
      : `Jakość treningu ${sign}${pct}%`
  }
  if (facilityId === 'medicalCenter') {
    const pct = Math.round(-delta * 4.5)
    const sign = pct > 0 ? '+' : ''
    return lang === 'en'
      ? `Injury risk ${sign}${pct}%`
      : `Ryzyko kontuzji ${sign}${pct}%`
  }
  if (facilityId === 'chillRoom') {
    if (delta === 0) {
      return lang === 'en' ? 'Morale: neutral' : 'Morale: neutralne'
    }
    const sign = delta > 0 ? '+' : ''
    return lang === 'en'
      ? `Morale after training ${sign}${(delta * 0.15).toFixed(1)}`
      : `Morale po treningu ${sign}${(delta * 0.15).toFixed(1)}`
  }
  if (facilityId === 'fanShop') {
    const est = 90 + lv * 70
    return lang === 'en'
      ? `Merch ~$${est}+ / match (fans/form/rep)`
      : `Merch ~$${est}+ / mecz (kibice/forma/rep)`
  }
  return ''
}

export function formatFacilityUpgradeCost(cost, lang = 'pl') {
  if (cost == null) return lang === 'en' ? 'Max level' : 'Maks. poziom'
  return formatUsd(cost)
}
