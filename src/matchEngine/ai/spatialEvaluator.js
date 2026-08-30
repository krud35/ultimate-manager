import { clampFieldX, clampFieldY, fieldCenterY, attackDirectionX } from '../fieldDimensions.js'
import { FORCE_SIDES } from '../tacticsModifiers.js'
import { forceMarkLayoutSide, normalizeForceMark } from '../throwTechnique.js'
import { isCloggingThrowLane } from './offenseReorganization.js'
import { subStat } from './statFormulas.js'
import { getTraitMods } from '../../models/playerTraits.js'

function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay)
}

/** Sufit horyzontu, na jaki rzucający czyta grę (s). */
const MAX_LEAD_PROJECTION_SEC = 2.5


/**
 * @param {object} player — zawodnik ofensywny
 * @param {object} ctx
 * @param {number} ctx.x
 * @param {number} ctx.y
 * @param {Array<{ player, x, y }>} ctx.offensePositions
 * @param {Array<{ player, x, y, vx?, vy? }>} ctx.defensePositions — vx/vy pozwalają
 *   przesunąć obrońcę na ten sam horyzont czasowy co punkt chwytu
 * @param {{ x: number, y: number }} ctx.disc
 * @param {string} ctx.forceSide
 * @param {string} ctx.possessionTeam
 * @param {number} [ctx.vx] — prędkość ocenianego odbiorcy
 * @param {number} [ctx.vy]
 */
export function evaluatePlayerSituation(player, ctx) {
  const {
    x,
    y,
    /** Ile sekund zajmie odbiorcy dotarcie do ocenianego punktu (x, y) — o tyle samo
     *  przesuwani są obrońcy, żeby porównanie było spójne w czasie. */
    leadTimeSec = 0,
    offensePositions = [],
    defensePositions = [],
    disc,
    forceSide = FORCE_SIDES.FORCE_FOREHAND,
    possessionTeam = 'home',
    throwerPos = null,
  } = ctx

  // Separacja = czysta geometria, ale liczona SPÓJNIE W CZASIE. Rzucający nie zna
  // statystyk obrońcy — ocenia pozycje i bieżące prędkości obu zawodników. Jakość i
  // instrukcje obrońcy (cushion, shade deep/under) wpływają na separację POŚREDNIO,
  // przez to, gdzie obrońca realnie się znajdzie (defenderBrain.js).
  //
  // Wcześniej był tu realny błąd: (x, y) to często PRZYSZŁY punkt chwytu odbiorcy
  // (lead point z predictReceiverCatchPoint), a obrońcy byli brani z pozycji BIEŻĄCEJ.
  // Odbiorca był więc ekstrapolowany w czasie, a obrońca nie — separacja wychodziła
  // sztucznie zawyżona (mediana 4.7 m przy realnym dystansie obrońca->mark 2.0 m) i
  // praktycznie nie reagowała na jakość obrony. Teraz obrońca jest przesuwany na ten
  // sam horyzont czasowy: obrońca biegnący z cutterem zostaje przy nim, a realnie
  // pokonany zostaje w tyle.
  // Nie ekstrapolujemy obrońcy liniowo po jego wektorze — przy 2 s horyzontu szybki
  // obrońca „przestrzeliwał" punkt chwytu i wychodził DALEJ niż wolny, co odwracało
  // sens (lepsza obrona = więcej separacji). Zamiast tego pytamy o rzecz fizyczną i
  // odporną: ile z tej luki obrońca zdąży pokonać, zanim dysk doleci. Bieżąca prędkość
  // biegu jest informacją jawną (widać, kto jak szybko biegnie), więc rzucający ma
  // prawo ją czytać — a szybszy/lepiej ustawiony obrońca realnie zjada więcej luki.
  // Punkt chwytu (x, y) jest NIERUCHOMY, więc liczy się prędkość obrońcy BEZWZGLĘDNA w
  // jego stronę — nie względem odbiorcy. Wcześniej użyłem tu prędkości względnej: dla
  // obrońcy przyklejonego do cuttera wychodziła ~0, więc taki obrońca nie dostawał
  // żadnego kredytu. Potem zastąpiłem to ryczałtem (|v| * 0.55), co dawało jeszcze gorszy
  // błąd systematyczny: przyklejony obrońca ma lukę ≈ leadDist + cushion i pokonuje w tym
  // czasie ≈ leadDist, więc po odjęciu tylko 55% zostawało 0.45 * leadDist + cushion.
  // Przy leadDist 6 m i cushionie 1.5 m dawało to 4.2 m „separacji" mimo perfekcyjnego
  // krycia — czyli KAŻDY cut czytał się jako otwarty proporcjonalnie do długości leadu i
  // obrona nie mogła zabrać żadnej opcji. Rzut składowej wektora prędkości na kierunek do
  // punktu chwytu jest wprost tym, co widać: obrońca biegnący tam, gdzie poleci dysk,
  // realnie zamyka lukę; obrońca odcięty biegiem w drugą stronę nie zamyka jej wcale.
  const lead = Math.max(0, Math.min(MAX_LEAD_PROJECTION_SEC, leadTimeSec ?? 0))
  let minDefDist = Infinity
  for (const d of defensePositions) {
    const gap = dist(x, y, d.x, d.y)
    const ux = (x - d.x) / (gap || 1)
    const uy = (y - d.y) / (gap || 1)
    const towardsMps = (d.vx ?? 0) * ux + (d.vy ?? 0) * uy
    const effective = Math.max(0, gap - Math.max(0, towardsMps) * lead)
    if (effective < minDefDist) minDefDist = effective
  }
  if (!Number.isFinite(minDefDist)) minDefDist = 12
  const separation = minDefDist

  const forceMark = normalizeForceMark(forceSide)
  const layout = forceMarkLayoutSide(forceMark, throwerPos?.y ?? y)
  const cy = fieldCenterY()
  let isOpenSide = true
  if (forceMark === FORCE_SIDES.FORCE_STRAIGHT) {
    // Straight-up: obie strony „otwarte” na short — deep trudniejszy.
    isOpenSide = true
  } else if (layout === 'middle') {
    isOpenSide = Math.abs(y - cy) >= 2.2
  } else if (layout === 'home') {
    isOpenSide = y >= cy + 0.8
  } else if (layout === 'away') {
    isOpenSide = y <= cy - 0.8
  }

  const inThrowLane = isCloggingThrowLane(x, y, disc, throwerPos, possessionTeam)

  let cloggingLevel = 0
  for (const o of offensePositions) {
    if (o.player.id === player.id) continue
    if (dist(x, y, o.x, o.y) < 7) cloggingLevel += 1
  }
  if (inThrowLane) cloggingLevel += 2
  const traitMods = getTraitMods(player)
  if ((traitMods.clogChanceMult ?? 1) > 1.1 && inThrowLane) cloggingLevel += 1
  if ((traitMods.clogChanceMult ?? 1) < 0.7 && cloggingLevel > 0) {
    cloggingLevel = Math.max(0, cloggingLevel - 1)
  }

  const discDist = disc ? dist(x, y, disc.x, disc.y) : 15
  const attackSign = attackDirectionX(possessionTeam)
  const aheadOfDisc = (x - disc.x) * attackSign
  const angleQuality = aheadOfDisc > -2 ? 1 : 0.55
  const sepScore = Math.min(1, separation / 10)
  const distScore = discDist >= 6 && discDist <= 22 ? 1 : discDist < 6 ? 0.65 : 0.75
  const openBonus = isOpenSide ? 0.15 : -0.12
  const clogPenalty = cloggingLevel * 0.08

  const throwWindowScore = Math.max(
    0,
    Math.min(
      100,
      sepScore * 42 +
        distScore * 28 +
        angleQuality * 18 +
        openBonus * 20 -
        clogPenalty * 25 +
        ((subStat(player, 'physical', 'speed') - 50) * 0.12 +
          (subStat(player, 'offensive', 'offensiveSystemsKnowledge') - 50) * 0.06),
    ),
  )

  return {
    /** Wolna przestrzeń w punkcie chwytu, licząc obrońcę na tym samym horyzoncie czasu. */
    separation,
    isOpenSide,
    cloggingLevel,
    inThrowLane,
    throwWindowScore,
    discDist,
    aheadOfDisc,
  }
}

export function clampAgentPosition(x, y) {
  return { x: clampFieldX(x), y: clampFieldY(y) }
}
