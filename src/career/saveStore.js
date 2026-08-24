/**
 * Persistencja 3 slotów kariery w localStorage.
 */

import { compressToUTF16, decompressFromUTF16 } from 'lz-string'
import { SAVE_VERSION, SLOT_COUNT, STORAGE_KEY } from './constants.js'
import { careerForStorage, rehydrateCareerWorld } from './worldState.js'

/** Zapisy sprzed kompresji to czysty JSON — ten prefiks odróżnia nowy format. */
const COMPRESSED_PREFIX = 'lzv1:'

/**
 * lz-string'owa kompresja ~1-2 MB zapisu kariery potrafi zająć ~1s (blokuje
 * główny wątek). Wołanie jej synchronicznie przy KAŻDEJ akcji w grze (np.
 * samo kliknięcie wiadomości w skrzynce) powodowało zauważalne zawieszenie
 * UI. Zamiast zapisywać natychmiast, odkładamy właściwy zapis do
 * localStorage o krótką chwilę i łączymy kolejne szybkie akcje w jeden
 * zapis — a przed KAŻDYM odczytem (loadSaveStore) i przy zamknięciu karty
 * odkładany zapis jest natychmiast "spłacany", więc nikt nigdy nie widzi
 * nieaktualnych danych ani nie traci więcej niż ułamek sekundy postępu.
 */
const WRITE_DEBOUNCE_MS = 600

let pendingStore = null
let pendingTimer = null

function emptySlots() {
  return Array.from({ length: SLOT_COUNT }, () => null)
}

function isQuotaExceededError(err) {
  if (!err) return false
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014 ||
    /quota/i.test(err.message ?? '')
  )
}

/**
 * Wszystkie 3 sloty dzielą jeden klucz localStorage — zapis do JEDNEGO slotu
 * wymaga zserializowania WSZYSTKICH trzech naraz. Jeśli inny slot spuchł
 * (długa kariera, dużo historii meczów), można trafić na limit przeglądarki
 * nawet zapisując do pustego slotu. Łapiemy to i rzucamy czytelny błąd
 * zamiast surowego "QuotaExceededError" z przeglądarki.
 */
export class StorageQuotaError extends Error {
  constructor() {
    super(
      'Brak miejsca w pamięci przeglądarki (localStorage). Usuń zapisaną karierę w innym slocie, żeby zwolnić miejsce.',
    )
    this.name = 'StorageQuotaError'
    this.messagePl = this.message
    this.messageEn =
      "Browser storage is full (localStorage quota exceeded). Delete a save in another slot to free up space."
  }
}

function normalizeStore(raw, skipIndex = -1) {
  const slots = emptySlots()
  if (!raw || typeof raw !== 'object') {
    return { version: SAVE_VERSION, slots }
  }
  const incoming = Array.isArray(raw.slots) ? raw.slots : []
  for (let i = 0; i < SLOT_COUNT; i += 1) {
    const slot = incoming[i]
    if (i === skipIndex) {
      // Caller is about to overwrite this slot with an in-memory career it
      // already has — skip the expensive rehydrate pass, it'd be discarded.
      slots[i] = slot ?? null
      continue
    }
    slots[i] = slot && typeof slot === 'object' ? rehydrateCareerWorld(slot) : null
  }
  return { version: SAVE_VERSION, slots }
}

/** Stare zapisy to czysty JSON bez prefiksu — wczytujemy oba formaty. */
function deserializeStoreText(text) {
  if (text.startsWith(COMPRESSED_PREFIX)) {
    const json = decompressFromUTF16(text.slice(COMPRESSED_PREFIX.length))
    if (json == null) throw new Error('Nie udało się zdekompresować zapisu')
    return JSON.parse(json)
  }
  return JSON.parse(text)
}

/** Natychmiastowy, synchroniczny zapis (kosztowna kompresja) — bez odkładania. */
function writeSaveStoreImmediate(store) {
  const slots = emptySlots()
  const incoming = Array.isArray(store?.slots) ? store.slots : []
  for (let i = 0; i < SLOT_COUNT; i += 1) {
    const slot = incoming[i]
    slots[i] = slot && typeof slot === 'object' ? careerForStorage(slot) : null
  }
  const payload = { version: SAVE_VERSION, slots }
  try {
    localStorage.setItem(STORAGE_KEY, COMPRESSED_PREFIX + compressToUTF16(JSON.stringify(payload)))
  } catch (err) {
    if (isQuotaExceededError(err)) throw new StorageQuotaError()
    throw err
  }
  // `store` (the argument) already holds in-memory slot objects equivalent
  // to what was just written — re-deriving the return value by running it
  // back through normalizeStore() would decompress/JSON.parse/rehydrate
  // (re-scan every team's finances/contracts/scouting/academy) all over
  // again purely to build a return value that, today, no caller uses.
  return { version: SAVE_VERSION, slots: incoming }
}

function cancelPendingWrite() {
  if (pendingTimer != null) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
  pendingStore = null
}

/** Zapisuje natychmiast, pomijając odłożony (debounced) zapis w toku. */
export function flushPendingWrite() {
  const store = pendingStore
  cancelPendingWrite()
  if (store) writeSaveStoreImmediate(store)
}

/** Odkłada zapis o WRITE_DEBOUNCE_MS; kolejne wywołania zastępują poprzednie. */
function scheduleWrite(store) {
  cancelPendingWrite()
  pendingStore = store
  pendingTimer = setTimeout(flushPendingWrite, WRITE_DEBOUNCE_MS)
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPendingWrite)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingWrite()
  })
}

export function loadSaveStore(skipIndex = -1) {
  // Gwarantuje spójność: nikt nie odczyta stanu starszego niż to, co
  // aplikacja "w pamięci" już uznaje za zapisane.
  flushPendingWrite()
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    if (!text) return normalizeStore(null)
    return normalizeStore(deserializeStoreText(text), skipIndex)
  } catch {
    return normalizeStore(null)
  }
}

/** Publiczne API: zapisuje od razu (używane np. przy usuwaniu zapisu). */
export function writeSaveStore(store) {
  // Jeśli był odłożony zapis dla innego stanu, ten nowy i tak go zastępuje.
  cancelPendingWrite()
  return writeSaveStoreImmediate(store)
}

export function listSlots() {
  return loadSaveStore().slots
}

export function getSlot(slotIndex) {
  if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return null
  return loadSaveStore().slots[slotIndex] ?? null
}

export function writeSlot(slotIndex, career) {
  if (slotIndex < 0 || slotIndex >= SLOT_COUNT) {
    throw new Error(`Nieprawidłowy slot: ${slotIndex}`)
  }
  // `career` is already a live, rehydrated in-memory object — no need to
  // round-trip it through decompress/JSON.parse/rehydrate just to read it
  // back. And if a write is already pending (rapid consecutive actions,
  // e.g. clicking through several inbox messages), that pending store
  // already reflects the latest known state of every slot — reuse it
  // in-memory instead of flushing it and re-reading from localStorage,
  // otherwise every click in a quick burst would still pay the full
  // decompress+recompress cost the debounce was meant to avoid.
  const store = pendingStore ?? loadSaveStore(slotIndex)
  const withMeta = {
    ...career,
    slotIndex,
    updatedAt: new Date().toISOString(),
  }
  store.slots[slotIndex] = withMeta
  // Kosztowna kompresja+zapis idzie do localStorage z niewielkim opóźnieniem
  // (patrz WRITE_DEBOUNCE_MS) zamiast blokować wątek w trakcie kliknięcia.
  scheduleWrite(store)
  return withMeta
}

/**
 * Zapisuje NATYCHMIAST, z pominięciem opóźnienia — do użycia wyłącznie przy
 * jawnych checkpointach (koniec dnia, symulacja do meczu/daty, rozegrany
 * mecz, zmiana sezonu, wyjście do menu karier). Reszta akcji w grze (np.
 * wiadomości w skrzynce, zmiana taktyki, negocjacje) aktualizuje tylko stan
 * w pamięci i NIE zapisuje na dysk, dopóki gracz nie trafi w jeden z tych
 * checkpointów.
 */
export function saveCareerNow(career) {
  const result = writeSlot(career.slotIndex, career)
  flushPendingWrite()
  return result
}

export function clearSlot(slotIndex) {
  if (slotIndex < 0 || slotIndex >= SLOT_COUNT) {
    throw new Error(`Nieprawidłowy slot: ${slotIndex}`)
  }
  const store = loadSaveStore()
  store.slots[slotIndex] = null
  writeSaveStore(store)
  return store.slots
}

export function slotSummary(career) {
  if (!career) return null
  const standing = career.league?.standings?.[career.playerTeamId]
  const team =
    career.world?.teamsById?.[career.playerTeamId] ?? null
  return {
    slotIndex: career.slotIndex,
    managerName: career.managerName,
    playerTeamId: career.playerTeamId,
    teamName: team?.name ?? null,
    teamColor: team?.primaryColor ?? null,
    seasonYear: career.seasonYear,
    seasonIndex: career.seasonIndex,
    seasonLabel: career.league?.seasonLabel ?? `UFA ${career.seasonYear}`,
    phase: career.phase,
    wins: standing?.wins ?? 0,
    losses: standing?.losses ?? 0,
    seasonsPlayed: career.seasonHistory?.length ?? 0,
    rosterCount: team?.players?.length ?? null,
    updatedAt: career.updatedAt,
    createdAt: career.createdAt,
  }
}
