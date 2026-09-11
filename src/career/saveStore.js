/**
 * Persistencja 3 slotów kariery w localStorage.
 */

import { compressToUTF16, decompressFromUTF16 } from 'lz-string'
import { SAVE_VERSION, SLOT_COUNT, STORAGE_KEY } from './constants.js'
import { careerForStorage, rehydrateCareerWorld } from './worldState.js'

/** Zapisy sprzed kompresji to czysty JSON — ten prefiks odróżnia nowy format. */
const COMPRESSED_PREFIX = 'lzv1:'

/**
 * lz-string'owa kompresja zapisu kariery jest droga (dla kariery w toku sezonu
 * to potrafi być kilka-kilkanaście MB, ~1-10s liczenia) — zbyt droga, by robić
 * ją synchronicznie na głównym wątku. Dlatego zapis na dysk ma dwa poziomy:
 *
 * 1. `liveStore` — w pamięci, ŻYWE obiekty kariery. Każdy zapis (writeSlot,
 *    saveCareerNow, ...) aktualizuje go NATYCHMIAST i synchronicznie, więc
 *    `loadSaveStore`/`listSlots`/`getSlot` zawsze widzą świeży stan bez
 *    czekania na cokolwiek — to on jest źródłem prawdy w trakcie sesji.
 * 2. Właściwy zapis do localStorage (kompresja + `setItem`) idzie osobno,
 *    w tle na Workerze (patrz `saveCompressionWorker.js`), więc nie blokuje
 *    UI. Szybkie kolejne akcje są łączone w jeden zapis (debounce); jawne
 *    checkpointy (koniec dnia, symulacja do meczu/daty, rozegrany mecz,
 *    zmiana sezonu, wyjście do menu) też idą przez Worker — tylko zamknięcie
 *    karty (`beforeunload`/`visibilitychange`) wymusza zapis synchroniczny,
 *    bo Worker nie ma gwarancji dokończenia po zamknięciu strony.
 */
const WRITE_DEBOUNCE_MS = 600

let liveStore = null
let pendingStore = null
let pendingTimer = null
let worker = null
let writeSeq = 0
let appliedSeq = 0

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

/** Pierwszy odczyt w sesji (na zimno) — potem `liveStore` jest zawsze świeży. */
function ensureLiveStoreLoaded(skipIndex = -1) {
  if (liveStore) return liveStore
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    liveStore = text ? normalizeStore(deserializeStoreText(text), skipIndex) : normalizeStore(null)
  } catch {
    liveStore = normalizeStore(null)
  }
  return liveStore
}

function notifyPersistError(err) {
  const detail = isQuotaExceededError(err) ? new StorageQuotaError() : err
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('career-save-error', { detail }))
  } else {
    console.error('[saveStore] persist failed', detail)
  }
}

function getWorker() {
  if (typeof Worker === 'undefined') return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./saveCompressionWorker.js', import.meta.url), { type: 'module' })
  } catch (err) {
    console.error('[saveStore] failed to start compression worker, falling back to main thread', err)
    worker = null
  }
  return worker
}

/** Ostatni etap zapisu, wspólny dla ścieżki sync i Workera: `seq` odrzuca
 *  spóźnione/nieaktualne wyniki, gdyby nowszy zapis zdążył wylądować wcześniej. */
function writeCompressedToLocalStorage(compressed, seq) {
  if (seq < appliedSeq) return
  appliedSeq = seq
  try {
    localStorage.setItem(STORAGE_KEY, COMPRESSED_PREFIX + compressed)
  } catch (err) {
    notifyPersistError(err)
  }
}

/**
 * Kompresuje i zapisuje `store` do localStorage. `liveStore` (czyli to, co
 * widzą `loadSaveStore`/`listSlots`/`getSlot`) NIE czeka na to wywołanie —
 * jest już zaktualizowany synchronicznie przez wywołującego.
 * `sync: true` wymusza kompresję na głównym wątku (tylko przy zamknięciu
 * karty, gdzie Worker nie ma gwarancji dokończenia).
 */
function persistStore(store, { sync = false } = {}) {
  const seq = ++writeSeq
  const slots = emptySlots()
  const incoming = Array.isArray(store?.slots) ? store.slots : []
  for (let i = 0; i < SLOT_COUNT; i += 1) {
    const slot = incoming[i]
    slots[i] = slot && typeof slot === 'object' ? careerForStorage(slot) : null
  }
  const json = JSON.stringify({ version: SAVE_VERSION, slots })

  const w = sync ? null : getWorker()
  if (!w) {
    writeCompressedToLocalStorage(compressToUTF16(json), seq)
    return
  }
  const handleMessage = (event) => {
    if (event.data?.id !== seq) return
    w.removeEventListener('message', handleMessage)
    writeCompressedToLocalStorage(event.data.compressed, seq)
  }
  w.addEventListener('message', handleMessage)
  w.postMessage({ id: seq, json })
}

function cancelPendingWrite() {
  if (pendingTimer != null) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
  pendingStore = null
}

/** Zapisuje NATYCHMIAST (ale poza głównym wątkiem, patrz `persistStore`) to,
 *  co czekało na odłożony zapis — używane przy zamknięciu karty. */
export function flushPendingWrite() {
  const store = pendingStore
  cancelPendingWrite()
  if (store) persistStore(store, { sync: true })
}

/** Odkłada właściwy zapis na dysk o WRITE_DEBOUNCE_MS; kolejne wywołania
 *  zastępują poprzednie. `liveStore` już ma najnowszy stan — to tylko
 *  planuje kompresję+localStorage.setItem. */
function scheduleWrite(store) {
  cancelPendingWrite()
  pendingStore = store
  pendingTimer = setTimeout(() => {
    const s = pendingStore
    cancelPendingWrite()
    if (s) persistStore(s)
  }, WRITE_DEBOUNCE_MS)
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPendingWrite)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingWrite()
  })
}

export function loadSaveStore(skipIndex = -1) {
  return ensureLiveStoreLoaded(skipIndex)
}

/** Publiczne API: zapisuje od razu (używane np. przy usuwaniu zapisu). */
export function writeSaveStore(store) {
  cancelPendingWrite()
  liveStore = { version: SAVE_VERSION, slots: store.slots }
  persistStore(liveStore)
  return liveStore
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
  const store = ensureLiveStoreLoaded(slotIndex)
  const withMeta = {
    ...career,
    slotIndex,
    updatedAt: new Date().toISOString(),
  }
  store.slots[slotIndex] = withMeta
  scheduleWrite(store)
  return withMeta
}

/**
 * Zapisuje od razu (bez czekania na debounce), z pominięciem blokowania UI —
 * kompresja idzie na Workerze (patrz `persistStore`). Do użycia wyłącznie
 * przy jawnych checkpointach (koniec dnia, symulacja do meczu/daty, rozegrany
 * mecz, zmiana sezonu, wyjście do menu karier). Reszta akcji w grze (np.
 * wiadomości w skrzynce, zmiana taktyki, negocjacje) aktualizuje tylko stan
 * w pamięci i idzie zwykłym, odłożonym zapisem, dopóki gracz nie trafi w
 * jeden z tych checkpointów.
 */
export function saveCareerNow(career) {
  const result = writeSlot(career.slotIndex, career)
  const store = pendingStore
  cancelPendingWrite()
  if (store) persistStore(store)
  return result
}

export function clearSlot(slotIndex) {
  if (slotIndex < 0 || slotIndex >= SLOT_COUNT) {
    throw new Error(`Nieprawidłowy slot: ${slotIndex}`)
  }
  const store = ensureLiveStoreLoaded()
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
