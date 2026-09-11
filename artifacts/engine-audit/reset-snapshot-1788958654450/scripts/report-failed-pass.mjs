import fs from 'node:fs'
const base = '../artifacts/engine-audit/reset-snapshot-1788957435171/src/'
const { demoHomeTeam } = await import(`${base}data/demoMatchTeams.js`)
const { horizontalReachM, standingReachM } = await import(`${base}matchEngine/ai/statFormulas.js`)
const { firstDiscContact } = await import(`${base}matchEngine/ai/discContact.js`)
const data = JSON.parse(fs.readFileSync('artifacts/engine-audit/failed-pass.json'))
const { event, trace } = data, diagnosis = trace.resolution.diagnosis
const player = demoHomeTeam.players.find(p => p.id === event.receiverId)
const reach = { horizontal: horizontalReachM(player), standing: standingReachM(player) }
const frames = trace.frames.filter(f => f.disc?.state === 'IN_FLIGHT')
const rows = frames.map(f => {
  const p = f.players.find(p => p.id === event.receiverId), disc = f.disc
  const horizontal = Math.hypot(disc.x - p.x, disc.y - p.y)
  const relativeHeight = (disc.z - (p.z ?? 0) - reach.standing / 2) / (reach.standing / 2)
  const availableReach = reach.horizontal * Math.sqrt(Math.max(0, 1 - relativeHeight ** 2))
  return { ms: f.ms - trace.throwMs, receiver: p, disc, horizontal, availableReach, gap: horizontal - availableReach }
})
const nearest = rows.toSorted((a, b) => a.gap - b.gap)[0]
let sweptContacts = 0
for (let i = 1; i < frames.length; i++) {
  const a = frames[i - 1], b = frames[i]
  if (firstDiscContact(a.disc, b.disc, a.players.find(p => p.id === event.receiverId),
    b.players.find(p => p.id === event.receiverId), reach)) sweptContacts++
}
const atRelease = trace.frames.find(f => f.ms === trace.throwMs).players.find(p => p.id === event.receiverId)
const old = diagnosis.receiverObservation
const staleDistance = Math.hypot(atRelease.x - old.x, atRelease.y - old.y)
const evidence = { reach, nearest, sweptContacts, staleDistance, atRelease,
  observationAgeMs: diagnosis.releaseAtMs - diagnosis.observationAtMs,
  timeline: diagnosis.receiverReads.map(r => ({ ms: r.elapsedMs, receiver: r.actualReceiver, disc: r.actualDisc,
    target: { x: r.targetX, y: r.targetY }, predictedAtMs: r.predictedAtMs, reachable: r.reachable })) }
fs.writeFileSync('artifacts/engine-audit/failed-pass-evidence.json', JSON.stringify(evidence, null, 2))
const f = n => Number(n).toFixed(2)
const timeline = evidence.timeline.filter(r => [0, 200, 400, 580, 3180, 3220].includes(r.ms))
const lines = ['# Nieudane podanie: Conor Belfield → Derek Mourad', '',
  `Mecz seed 105437, punkt ${data.point}, zdarzenie ${event.id}. Pierwsza chronologicznie strata poniżej 10 m z diagnozą unknown_no_contact; w tym meczu znaleziono ${data.candidates.length} takich strat. Analiza zamrożonego kodu reset-snapshot-1788957435171, nie późniejszych zmian workspace.`, '',
  `Backhand, ${f(event.throwDistanceM)} m, odbiorca oceniony jako otwarty, wiatr boczny 20 mph / 90°. Dysk wypuszczono po ${trace.throwMs} ms przygotowania. Ślad posługuje się współrzędnymi lokalnymi akcji; wewnętrzne home/away nie są tu nazwami klubów.`, '',
  '## Fakty', '',
  `Plan miał status reachable i zapas czasu około ${f(-diagnosis.plannedLateness * 1000)} ms. Obserwacja odbiorcy pochodziła sprzed ${evidence.observationAgeMs} ms. Zapamiętany punkt: (${f(old.x)}, ${f(old.y)}), rzeczywisty w chwili wyrzutu: (${f(atRelease.x)}, ${f(atRelease.y)}), różnica ${f(staleDistance)} m. Zapamiętana prędkość ${f(Math.hypot(old.vx, old.vy))} m/s, rzeczywista ${f(Math.hypot(atRelease.vx, atRelease.vy))} m/s.`, '',
  `Wykonanie przesunęło punkt zadany o ${f(diagnosis.missM)} m. Diagnostyka zapisuje wpływ wiatru i błąd łuku; kara za zmęczenie wykonania oraz presja marka wynosiły zero. Nie wolno przypisać całego odchylenia samemu wiatrowi bez kontrfaktycznego odtworzenia wykonania.`, '',
  '| Czas od wyrzutu | Odbiorca x, y | Dysk x, y, z | Przewidywany czas kontaktu | Osiągalny według odbiorcy |',
  '|---|---|---|---|---|',
  ...timeline.map(r => `| ${r.ms} ms | ${f(r.receiver.x)}, ${f(r.receiver.y)} | ${f(r.disc.x)}, ${f(r.disc.y)}, ${f(r.disc.z)} | ${r.predictedAtMs} ms | ${r.reachable ? 'tak' : 'nie'} |`), '',
  `Najbliższa próbka geometrii kontaktu: ${nearest.ms} ms po wyrzucie. Odległość pozioma dysk–środek zawodnika ${f(nearest.horizontal)} m, zasięg poziomy na tej wysokości ${f(nearest.availableReach)} m, brakujące ${f(nearest.gap)} m. Zasięg obliczono tą samą elipsoidą co w silniku. Ponowne sprawdzenie ciągłych odcinków między klatkami funkcją firstDiscContact: ${sweptContacts} kontaktów. Nie jest to przeoczenie kontaktu pomiędzy dwoma tickami.`, '',
  `Brak dotknięć dysku, brak bloków i prób utrzymania chwytu, bodyAvoidanceTicks=${diagnosis.bodyAvoidanceTicks}. Przy około 580 ms dysk minął odbiorcę; ten pobiegł za dalszym lotem. Tor kończący się przy x≈41 m jest kontynuacją lotu po minięciu okna chwytu, nie dowodem błędu celowania o ponad 20 m.`, '',
  '## Interpretacja kodu', '',
  'Rzucający ponownie skanuje przed wypuszczeniem, ale skan może zwrócić starą obserwację z pamięci. actionSimulator wybiera option.agent przed bieżącym agentem. Stąd reachable dotyczy stanu percepcyjnego, a nie gwarancji fizycznego dobiegu. Sam brak wszechwiedzy jest poprawny; ryzyko starej obserwacji nie powinno znikać z oceny krótkiego okna chwytu.', '',
  'Odbiorca widzi dysk w zapisanych odczytach. Do 400 ms planer nadal uznaje kontakt w 580 ms za osiągalny, choć zawodnik biegnie w kierunku rosnącego y i następnie mija linię lotu. interceptTravelSec zwraca zero, gdy cel znajduje się już w zasięgu, zanim uwzględni bieżącą prędkość. Poza zasięgiem przybliża dobieg, lecz nie symuluje wyhamowania w oknie chwytu. Integrator faktycznego ruchu zachowuje bezwładność i ograniczone hamowanie. To zidentyfikowana rozbieżność planera i wykonania, wymagająca odrębnej próby poprawki.', '',
  '## Wniosek i kierunek poprawki', '',
  'Potwierdzone zakończenie: dysk minął zasięg odbiorcy, bez udziału obrońcy w kontakcie. Współwystępują stara obserwacja rzucającego, odchylenie wykonania i przeszacowane okno przechwytu przy ruchu odbiorcy. Ten zapis nie rozstrzyga procentowego udziału każdego czynnika ani nie dowodzi, że idealne wykonanie gwarantowałoby chwyt.', '',
  'Najpierw należy sprawdzić dynamiczny zasięg przechwytu: czy przy aktualnej prędkości zawodnik może wyhamować lub przeciąć tor w konkretnym oknie czasowym. Następnie uwzględnić wiek obserwacji przy akceptacji krótkiego podania. Nie uzasadnia to zwiększenia promienia chwytu ani globalnego obniżenia losowości. W tym zadaniu nie zmieniano mechaniki silnika.', '',
  'Odtwarzanie: node scripts/analyze-failed-pass.mjs, następnie node scripts/report-failed-pass.mjs. failed-pass.json zawiera pełne klatki, a failed-pass-evidence.json obliczenia geometrii.', '']
fs.writeFileSync('artifacts/engine-audit/FAILED-PASS.md', lines.join('\n'))
console.log(JSON.stringify({ nearest, reach, sweptContacts, staleDistance, observationAgeMs: evidence.observationAgeMs }))
