# Rozwój stylów gry — pomiary i cykl kariery

Same pomiary są pasywne: bez RNG i bez zmiany cech podczas meczu.
`boxScore[playerId].styleEvidence` przenosi dane do wyniku meczu. Przy zatwierdzeniu
wyniku `recordPlayingStyleMatch` zapisuje maksymalnie 12 ostatnich obserwowanych
meczów w `player.playingStyleMatches`. Historia jest częścią zawodnika, przechodzi
przez JSON save/load i pozostaje przy nim po transferze. Powtórne zatwierdzenie
tego samego zachowanego meczu nie dopisuje danych. Walkowery i stare wyniki bez
pomiarów ani udziału zawodnika niczego nie generują.

## Dostępność i jednostki

Każdy tryb ma osobny zestaw `observed`. Brak trybu lub metryki na tej liście
znaczy „nieobserwowane”, nigdy „zawodnik tego nie robi”. Brak licznika metryki
wymienionej na liście znaczy zero. Mieszany mecz zachowuje oba tryby oddzielnie.

| Pomiar | Pełny | Szybki | Znaczenie |
|---|---|---|---|
| throws / throwResults | Tak | Tak | Próby i ukończone podania wg typu/techniki; pełny także wybrana krzywizna |
| Błąd wykonania toru | Tak | Nie | Liczba próbek i suma bezwzględnego błędu zakrzywienia oraz łuku; sukces chwytu osobno |
| cutStarts / underCuts / deepCuts | Tak | Nie | Początek cutu lub jego kolejnej części po zmianie rodzaju; także bez otrzymania dysku |
| cutMeters / directionChanges | Tak | Nie | Dystans w aktywnym cucie i zmiany deep–under; nie każdy ruch kierownicy jest osobnym cutem |
| doubleMoves / feintMeters | Tak | Nie | Rozpoczęcia zwodu cuttera i dystans przygotowania podczas inicjacji |
| offenseSeconds / defenseSeconds | Tak | Nie | Czas obserwowanego ruchu w roli, nie całkowity czas meczu |
| holdSeconds / throwWindowSeconds | Tak | Nie | Obserwowany czas z dyskiem i czas z dostępną opcją zaakceptowaną przez skan |
| fakeWindows / fakeActions | Tak | Nie | Dostępne okna mechaniki zwodów i rzeczywiście rozpoczęte zwody |
| sidelineSeconds | Tak | Nie | Obserwowany czas w ataku w odległości do 5 m od linii |
| highDiscSeconds / jumpAttempts | Tak | Nie | Wysoki dysk powyżej 2 m w odległości do 5 m oraz rozpoczęte skoki |
| transitionSeconds / recoverySeconds | Tak | Nie | Czas po zmianie posiadania i ruch w stronę chronionej głębi poza rolą marka |

Okazje geometryczne są wskaźnikami ekspozycji, nie gwarancją wykonalnego zagrania.
Wysoki dysk w pobliżu nie musi być osiągalny. Czas przy linii nie oznacza próby
chwytu. Mianownik dla preferencji under/deep to obserwowane cuty, nie minuty gry.
Nie zapisujemy nieistniejących cutów szybkiego silnika na podstawie archetypu.

## Instrukcje

Liczniki są rozdzielone na ekspozycję na indywidualne instrukcje i system drużyny.
Do ośmiu różnych snapshotów zapisuje rzeczywiste ustawienia trenera, indywidualne
instrukcje i rolę; nadmiar oznaczany `instructionsTruncated`. To kontekst, nie dowód,
że instrukcja wymusiła daną akcję. Snapshot wskazuje linię ze startu punktu,
więc zmiana posiadania nie przełącza instrukcji O-Line/D-Line.
Polecenie bezpośrednio promujące oceniane zachowanie zmniejsza tempo nauki
maksymalnie o 30%, proporcjonalnie do ekspozycji na instrukcje. Inne polecenia
nie obniżają oceny. Jest to przybliżenie kontekstu, nie rozpoznawanie intencji.

## Weryfikacja

`node --import ./scripts/register-world-tests.mjs scripts/test-style-evidence.mjs`

Test porównuje symulację z pomiarem i bez pomiaru przy takim samym box score:
wynik, liczba podań i końcowy stan RNG. Sprawdza zgodność prób z oficjalnym box score,
brak fikcyjnych danych szybkiego trybu, under bez podania, idempotencję, limit historii,
walkowery, zapis JSON i brak zmiany cech.

## Fazy 3–6 — ocena, nabywanie, utrata i zapis

Ocena odbywa się najwyżej raz na tydzień kalendarzowy dla wszystkich seniorów
w świecie kariery. Korzysta z maksymalnie 10 ostatnich meczów, nie starszych niż
84 dni, i wymaga świeżego występu. Każdy kwalifikujący mecz ma równą wagę.
Same minuty gry, OVR, pozycja ani archetyp nie tworzą dowodu zachowania.

| Styl | Miernik | Minimum w meczu | Poziom pełnej praktyki |
|---|---|---:|---:|
| Huck lover | hucki / podania | 8 podań | 30% |
| Dump guy | dump/swing / podania | 8 podań | 40% |
| Hammer happy | over-the-top / podania | 8 podań | 20% |
| Good insides | IO / obserwowane forehandy i backhandy | 8 podań | 12% + jakość wykonania |
| Good arounds | OI / obserwowane forehandy i backhandy | 8 podań | 25% + jakość wykonania |
| Under cutter | under / rozpoczęte odcinki cutów | 6 odcinków | 65% |
| Deep threat | deep / rozpoczęte odcinki cutów | 6 odcinków | 65% |
| Long cuts | metry / odcinki cutów | 6 odcinków | 16 m |
| Quick cuts | metry / odcinki cutów | 6 odcinków | ≤7 m, spadek do zera przy 14 m |
| Double-move cutter | zwody / odcinki cutów | 6 odcinków | 35% |
| Fakes a lot | zwody / okna zwodu | 4 okna | 60% |
| Sideline receiver | czas przy linii / czas ataku | 60 s ataku | 40% |
| Attacks the disc high | skoki / ekspozycja na wysoki dysk | 8 s ekspozycji | 0,12/s |
| Recovery defense | bieg powrotny / czas przejścia do obrony | 12 s przejścia | 45% |

Są to wskaźniki praktyki, a nie oceny skuteczności. Dla IO/OI dodatkowo potrzeba
minimum 3 próbek wykonania właściwej krzywizny; siłę praktyki mnoży
`clamp(1 − średni bezwzględny błąd krzywizny / 0,12, 0, 1)`.
Chwyt odbiorcy nie zastępuje oceny jakości rzutu. IO i OI mogą współistnieć.

**Dostępność:** pełny silnik obsługuje powyższe 14 stylów. Szybki — pierwsze 3.
Pozostałe 22 style nadal działają i są losowane, ale ich organiczny rozwój i utrata
są wstrzymane do czasu uzyskania wiarygodnych pomiarów. Nie mają zastępczych
liczników opartych na pozycji. Mieszane tryby uwzględniają tylko obserwowane dane.

Nauka wymaga siły praktyki ≥0,6 w historii i ≥0,5 w świeżych meczach.
Tygodniowy przyrost to `6 × tempo wieku × siła × samodzielność / szerokość`,
gdzie szerokość to `1 + 0,15 × max(0, liczba stylów − 2)`.
Tempo wieku: do 19 lat 1,4; 20–22: 1,2; 23–26: 1; 27–30: 0,65; 31+: 0,4.
Przyznanie wymaga 100 postępu, co najmniej 6 kwalifikujących występów i 42 dni
praktyki. Limit to 2 nowe style w sezonie do 22 lat, później 1, z odstępem 42 dni.
Nie ma wyboru rozwijanego stylu w interfejsie. Kandydat czekający na wolne miejsce
musi nadal wykonywać dane zachowanie w momencie przyznania.

Utrwalony styl zaczyna z poziomem 100 i ma 42 dni ochrony. Wygaszanie wymaga
świeżej praktyki <0,2, historii <0,25, minimum 8 słabych tygodni i 6 meczów
z obserwowanymi okazjami. Późniejszy spadek wynosi 7 × tempo wieku tygodniowo;
dla technik IO/OI tylko 2 × tempo wieku. Trening kategorii `throwing` chroni
te techniki przed spadkiem, ale ich nie nadaje. Powrót do praktyki ≥0,35 odbudowuje
utrwalenie i zmniejsza liczniki zaniedbania. Brak gry, kontuzja i brak pomiarów
nie powodują wygaszania.

Ostrzeżenie pojawia się przy poziomie ≤40. Utrata wymaga poziomu 0 i przynajmniej
12 słabych tygodni (techniki: 26). Ostatni styl pozostaje do czasu zastąpienia lub
uzyskania innego: zawodnik zachowuje minimum 1. Przeciwieństwo może zastąpić styl
dopiero przy jego utrwaleniu ≤20. Maksimum wynosi 6. Utracony lub zastąpiony styl
pozostaje w pamięci i startuje przy ponownej nauce z 40 postępu. Mentalne cechy
nie podlegają tym zmianom. Zmiana listy cech odświeża cache modyfikatorów silnika.

`player.playingStyleDevelopment` przechowuje wersję, ostatni tydzień, wykorzystane
mecze, utrwalenie, kandydatów, pamięć i limity sezonu. Istniejące zapisy inicjalizują
go leniwie, bez ponownego losowania cech. Transfer przenosi ten stan z zawodnikiem.
Zapis kariery zachowuje całość; ponowny odczyt nie powtarza przyznania. Skrzynka
informuje wyłącznie o zmianach własnego zespołu, po polsku i angielsku. Liczniki,
osobowość i główny archetyp pozostają ukryte.

## Faza 7 — weryfikacja i kalibracja

- `node scripts/test-playing-style-development.mjs`: nauka, brak gry, kontuzja,
  wygaszanie, przeciwieństwa, limit 1–6, tempo wieku, powrót nawyku, limit sezonu,
  instrukcje, ochrona techniki, cache modyfikatorów i trzy lata zmiany zachowania.
- `node --import ./scripts/register-world-tests.mjs scripts/test-playing-style-save.mjs`:
  prawdziwa kariera, krok kalendarza, skrzynka i skompresowany zapis/odczyt.
- Test pomiarów opisany wyżej sprawdza oba silniki i neutralność względem RNG.
- `node scripts/test-playing-style-generation.mjs`: początkowe rozkłady ról i wieku.

Kontrolowana praktyka under co tydzień, początkowo jeden inny styl, bez instrukcji:
nauka po 11 / 13 / 16 / 25 / 41 tygodniach dla wieku 18 / 22 / 26 / 30 / 35.
W trzyletnim scenariuszu under → deep → under każda z pięciu grup wieku
przeprowadza dwie zmiany, zachowuje mentalne cechy i nie przekracza limitu.
To kalibracja syntetycznej praktyki, nie pomiar częstości zmian w całej lidze.
