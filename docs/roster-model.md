# Model nowych składów UltiLeague

## Zakres

Nowe kariery UltiLeague korzystają z archetypów, zmiennej hierarchii składu i
indywidualnego talentu. Istniejące kariery nie otrzymują nowych archetypów ani
nowych zawodników podczas ładowania. Historyczne i losowe UFA zachowują swój generator.

## Generowanie

1. Nazwiska i numery z danych klubowych. Składy krótsze niż 21 osób są uzupełniane
   wygenerowanymi zawodnikami oznaczonymi `generatedReserve`. Podgląd i kariera
   używają tej samej funkcji oraz tego samego seeda. Dotychczasowe ID pozostają stałe.
2. Około 25% handlerów, 32% cutterów i 25% obrońców; reszta uniwersalna. Osiem
   archetypów obejmuje trzy rodzaje handlerów, dwa cutterów, dwóch obrońców i uniwersalny.
   To predyspozycje umiejętności, bez narzucania pozycji w taktyce.
3. Wiek 18–36 powstaje przed końcowym dopasowaniem umiejętności. Młodzi mają średnio
   lepszą fizyczność i braki techniczno-decyzyjne; doświadczeni mają odwrotny profil.
   Niezależny szum zachowuje indywidualne różnice.
4. Osiem struktur jakości z wagami zależnymi od ligi (tabela poniżej).
   Kandydatów różnicuje talent, etap kariery i osobny rzut losowy.
   Kompletność losowana jest niezależnie: pełna obsada 75/50/25%, jedna luka
   22/40/50%, wiele luk 3/10/25% (kolejno ligi 1/2/3). Luka pozostawia dwóch
   specjalistów danej rodziny, a nadwyżkę przenosi do innej. Kompletny skład
   obsadza pierwsze dwa pasma po siedem miejsc co najmniej dwoma handlerami,
   cutterami i obrońcami; zaokrąglone OVR sąsiednich miejsc mogą się pokrywać.
5. Wspólne ograniczenia atrybutów i dopasowanie do średniej ligi oraz korekty klubu.
   Slot elity jest względny: nie musi oznaczać OVR 90 w niższej lidze.
6. Indywidualny sufit talentu 74–95, z niewielką zmianą rozkładu zależną od ligi.
   Aktualna siła jest dolną granicą sufitu. Pozostały rozwój zależy od wieku i talentu,
   a nie od jednolitego cofania kary ligowej. Sufit pozostaje zapisany między sezonami.
7. Dwie cechy charakteru i jedna–dwie cechy stylu. Archetyp faworyzuje wyłącznie styl.

Definicje: `src/models/playerArchetypes.js`, `src/data/eucsRosterBalance.js` oraz
`src/models/traitDesign.js`.

## Struktury i wagi

| Struktura | Liga 1 | Liga 2 | Liga 3 | Rozkład jakości |
|---|---:|---:|---:|---|
| Wyrównany kolektyw | 15% | 15% | 15% | Małe różnice w całym składzie |
| Jeden lider | 5% | 15% | 25% | Jeden wyraźny lider, czterech wspierających |
| Duet liderów | 10% | 15% | 15% | Dwóch liderów, czterech wspierających |
| Mocny trzon | 20% | 20% | 15% | Pięciu mocnych zawodników |
| Elitarna siódemka | 15% | 10% | 10% | Siedmiu mocnych, wyraźnie słabsza ławka |
| Dwie solidne linie | 20% | 12% | 5% | Czternastu dobrych, niewielka różnica między liniami |
| Szeroka rotacja | 12% | 8% | 3% | Podobna jakość przez co najmniej 18 miejsc i około 85% kadry |
| Nierówny skład | 3% | 5% | 12% | Dwa szczyty, krótsza grupa wsparcia, liczna słaba ławka |

To prawdopodobieństwa pojedynczego losowania, nie obowiązkowe kwoty. Struktura nie
narzuca wieku, charakteru ani stylu taktycznego. Dopasowanie średniej zachowuje budżet
siły klubu; dolny limit OVR spłaszcza ławkę szczególnie w lidze 3.
Konfiguracja: src/data/rosterStructures.js. Metadane rosterShape i rosterCoverage
są zapisywane z klubem. Zmiana dotyczy tylko nowych karier.

## Weryfikacja obecnych struktur

30 seedów, 32 250 profili. Całość to średnia zawodników; TOP 7, TOP 14 i ławka
(miejsca od 15.) są średnimi odpowiednich średnich klubowych.

| Liga | Całość | TOP 7 | TOP 14 | Ławka | OVR ≥90 |
|---|---:|---:|---:|---:|---:|
| 1 | 81,07 | 85,40 | 82,94 | 78,24 | 5,32% |
| 2 | 75,97 | 80,99 | 77,90 | 72,55 | 1,70% |
| 3 | 70,83 | 75,56 | 72,35 | 67,95 | 0,01% |

Testy obejmują dokładne wagi, osiem różnych krzywych jakości, obsadę rodzin ról,
limity atrybutów, stabilność inicjalizacji i zapisu/odczytu oraz pięć okresów rozwoju.

## Poprzedni audyt meczowy — przed rozszerzeniem do ośmiu struktur

Poniższe wyniki dotyczą poprzednich trzech struktur. Nie stanowią pomiaru obecnego
rozkładu; ponowny audyt meczowy pozostaje potrzebny do strojenia silnika.

Mecze parami ze zmianą gospodarza, bez wiatru:

| Tryb | Porównanie | Wygrane wyższej ligi |
|---|---|---:|
| szybki | 1–2 | 5/8 |
| szybki | 2–3 | 7/8 |
| szybki | 1–3 | 6/8 |
| pełny | 1–2 | 2/2 |
| pełny | 2–3 | 2/2 |
| pełny | 1–3 | 2/2 |

Wyniki szczegółowe: `artifacts/roster-model/matches.json`. To mała próba diagnostyczna,
nie estymacja prawdopodobieństw wygranej. Pełny silnik dał większe przewagi niż szybki.
Dodatkowo rozegrano 20 meczów drużyn granicznych oraz 32 mecze archetypów przy OVR 81,
neutralnych cechach i bez adaptacji AI. Łącznie końcowy audyt obejmuje 82 mecze.
W parach granicznych słaby klub ligi 1 wygrał ze silnym ligi 2 cztery z ośmiu meczów
szybkich i jeden z dwóch pełnych; słaby klub ligi 2 wygrał ze silnym ligi 3 sześć
z ośmiu szybkich i zero z dwóch pełnych. To wskazuje na zależność wyniku od składu
oraz istotne różnice między trybami, a nie na gwarantowane zwycięstwo wyższego poziomu.

W stresowym porównaniu jednorodnych składów o OVR 81 większość archetypów wygrała
2–3 z 4 meczów przeciw uniwersalnym. Control handler wygrał 4/4 — to sygnał do obserwacji
przy większej próbie, nie podstawa do automatycznego osłabiania profilu.
Szczegóły: `artifacts/roster-model/matchups.json`. Dalsze strojenie powinno korzystać
z większej próby i rzeczywistych mieszanych linii; jednorodne drużyny są tylko testem skrajnym.

## Uruchomienie

```text
node scripts/test-roster-structures.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-roster-generation.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-archetype-rosters.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-player-traits.mjs
node --import ./scripts/register-world-tests.mjs scripts/audit-roster-matches.mjs
node --import ./scripts/register-world-tests.mjs scripts/audit-roster-matchups.mjs
```
