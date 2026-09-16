# Model nowych składów UltiLeague

## Zakres

Nowe kariery UltiLeague oraz lig krajowych korzystają z archetypów, zmiennej hierarchii składu i
indywidualnego talentu. Istniejące kariery nie otrzymują nowych archetypów ani
nowych zawodników podczas ładowania. Historyczne i losowe UFA zachowują swój generator.

## Generowanie

1. Nazwiska i numery z danych klubowych. Składy krótsze niż 16 osób są uzupełniane
   wygenerowanymi zawodnikami oznaczonymi `generatedReserve`. Podgląd i kariera
   używają tej samej funkcji oraz tego samego seeda. Dotychczasowe ID pozostają stałe.
   Przy braku rosteru liczba zawodników jest losowana równomiernie z zakresu 16–29.
   Ligi krajowe również uzupełniają istniejące rostery do 16, a nowe losują w zakresie
   16–29. Większe rzeczywiste rostery nie są przycinane. Zapisane składy nie są zmniejszane.
2. Około 25% handlerów, 32% cutterów i 25% obrońców; reszta uniwersalna. Osiem
   archetypów obejmuje trzy rodzaje handlerów, dwa cutterów, dwóch obrońców i uniwersalny.
   To predyspozycje umiejętności, bez narzucania pozycji w taktyce.
3. Wiek 18–36 w UltiLeague powstaje przed końcowym dopasowaniem umiejętności. Ligi
   krajowe zachowują wiek 19–35 dla importowanych nazwisk i 18–35 dla uzupełnień.
   Młodzi mają średnio
   lepszą fizyczność i braki techniczno-decyzyjne; doświadczeni mają odwrotny profil.
   Niezależny szum zachowuje indywidualne różnice.
4. Osiem struktur jakości z wagami zależnymi od ligi (tabela poniżej).
   Kandydatów różnicuje talent, etap kariery i osobny rzut losowy.
   Kompletność losowana jest niezależnie: pełna obsada 75/50/25%, jedna luka
   22/40/50%, wiele luk 3/10/25% (kolejno ligi 1/2/3). Luka pozostawia dwóch
   specjalistów danej rodziny, a nadwyżkę przenosi do innej. Kompletny skład
   obsadza pierwsze dwa pasma po siedem miejsc co najmniej dwoma handlerami,
   cutterami i obrońcami; zaokrąglone OVR sąsiednich miejsc mogą się pokrywać.
5. Wspólny model `applyClubOvrDistribution`: poziom klubu, profil jakości, a następnie
   niezależne losowanie wyjątkowej klasy każdego zawodnika. Bazowy poziom UltiLeague
   wynosi 81/76/71 z korektą wyników ±2,5 i szumem ±0,5. Dla lig krajowych to
   `78 + (siła kraju - 55)/10 - 5*(poziom ligi - 1)`, ograniczone do 67–83,
   z korektą klubową ±2,5 (jeśli istnieje) i szumem ±1.
   Profil określa względne różnice (60% krzywej jakości); centrowanie wynosi najwyżej
   ±1,5. Nie wymuszamy dokładnej średniej po uwzględnieniu ograniczeń atrybutów.
   Zwykłe oceny powyżej 86 są płynnie spłaszczane w kierunku 89.
   Tylko osobne losowanie daje startowe OVR 90–95: przy bazie 81 lub wyższej i
   pierwszym poziomie 1,65% na 90–92 oraz 0,15% na 93–95. Mnożnik szans to
   `clamp((poziom klubu - 71)/10, 0.15, 1) * 0.55^(poziom ligi - 1)`.
   Żaden klub ani profil nie ma gwarantowanej gwiazdy. `generationClass` zapisuje
   wynik losowania (`regular`, `world_class`, `generational`), nie limit rozwoju.
6. Indywidualny sufit talentu 74–95, z niewielką zmianą rozkładu zależną od ligi.
   Aktualna siła jest dolną granicą sufitu. Pozostały rozwój zależy od wieku i talentu,
   a nie od jednolitego cofania kary ligowej. Sufit pozostaje zapisany między sezonami.
7. Jedna–trzy cechy charakteru (25/50/25%) i 1–6 stylów gry zależnie od wieku (all-rounder: 3–6, równomiernie między kategoriami). Ukryty typ
   osobowości faworyzuje cechy charakteru; archetyp faworyzuje wyłącznie styl.
   Obie nazwy są ukryte w profilu, a konkretne cechy pozostają widoczne.

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
narzuca wieku, charakteru ani stylu taktycznego. Elitarna siódemka jest mocna względem
klubu; nie oznacza siedmiu graczy światowej klasy. Dolny limit OVR spłaszcza ławkę
szczególnie w lidze 3. Rzadki wyjątkowy zawodnik może zmienić układ wylosowanego profilu.
Konfiguracja: src/data/rosterStructures.js. Metadane rosterShape i rosterCoverage
są zapisywane z klubem. Zmiana dotyczy tylko nowych karier.

## Weryfikacja obecnych struktur

Po zmianie modelu: 30 seedów, 29 910 profili UltiLeague. Całość to średnia zawodników; TOP 7, TOP 14 i ławka
(miejsca od 15.) są średnimi odpowiednich średnich klubowych.

| Liga | Całość | TOP 7 | TOP 14 | Ławka | OVR ≥90 |
|---|---:|---:|---:|---:|---:|
| 1 | 81,21 | 84,38 | 82,52 | 78,98 | 1,64% |
| 2 | 76,03 | 79,07 | 77,10 | 73,67 | 0,54% |
| 3 | 70,83 | 73,73 | 71,63 | 68,31 | 0,06% |

OVR ≥93: odpowiednio 0,15%, 0,01%, 0%. Są to wyniki inicjalizacji;
rozwój i transfery podczas kariery mogą zmienić udziały.

Ligi krajowe, seed 871234: 602 kluby i 13 477 zawodników. Udział OVR ≥90
na poziomach 1/2/3 wynosi 1,35% / 0,28% / 0%; OVR ≥93: 0,05% / 0% / 0%.
To jedna pełna populacja świata, nie gwarantowane kwoty dla każdego seeda.

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
node --import ./scripts/register-world-tests.mjs scripts/test-club-strength-model.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-roster-sizes.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-roster-generation.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-archetype-rosters.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-player-traits.mjs
node --import ./scripts/register-world-tests.mjs scripts/audit-roster-matches.mjs
node --import ./scripts/register-world-tests.mjs scripts/audit-roster-matchups.mjs
```
