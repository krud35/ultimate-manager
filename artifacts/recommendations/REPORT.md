# Rekomendacje 1–7 — wdrożenie i granice modelu

Stan: 9 września 2026. Ten dokument opisuje zmiany względem rekomendacji z `artifacts/disc-flight/COMPLETE.md`. Poprzednie wyniki kalibracji nie opisują już obecnego kodu.

## 1. Wykonanie, odbiór i diagnostyka

Pełny silnik wywołuje `resolveThrow` w trybie `executionOnly`. Zmęczenie odbiorcy nie obniża celności rzucającego. Wykonanie zależy od rzeczywistego marka i jego odległości, a nie umiejętności obrońcy przypisanego do odbiorcy. Dobieg, kontakt i chwyt są rozstrzygane na torze dysku. Fast zachowuje statystyczne rozstrzygnięcie obrony.

Ocena opcji zapisuje przewidywane spóźnienie odbiorcy. Przed stallem 7 odrzuca ofertę, do której według dostępnej informacji brakuje ponad 150 ms. Przy wysokim stallu dopuszcza trudną próbę. To próg modelu, wymagający kalibracji, a nie prawo sportowe.

`throwDiagnosis.js` rozróżnia ukończone podanie, aut, blok, drop oraz prawdopodobne: spóźnienie, nieosiągalny wybór, błąd wykonania i presję przy wypuszczeniu. Zapisuje błąd celu, spóźnienie planu, presję i dotknięcia. Wnioskowane przyczyny mają `inference: true`: duży błąd celu nie dowodzi sam w sobie jednej przyczyny straty.

`engine-realism.mjs` zbiera segmenty wiatru, dystansu i umiejętności rzucającego. Podział po backhandzie jest technicznym przekrojem próby, nie odpowiednikiem poziomu ligi. `calibration-reference.mjs` przyjmuje dane obserwacyjne z adresem źródła, sezonem, zawodami i dywizją; nieznanego wiatru nie zamienia na ciszę. Nie ustawia automatycznie współczynników gry.

Nie zakończono kalibracji do rzeczywistych rozgrywek. [Strona USA Ultimate Club Championships 2024](https://play.usaultimate.org/events/2024-USA-Ultimate-Club-Championships/) nie dostarczyła podczas przeglądu obserwacji każdego podania z pogodą. [Box scores Ultiworld](https://ultiworld.com/2024/11/08/club-championships-2024-final-box-scores/) są materiałem subskrypcyjnym. Nie zaimportowano ani nie odtworzono tych danych. Zakresów 90–93% completion czy 70–85% hold nie traktujemy jako potwierdzonych norm.

## 2. Percepcja i niepełna informacja

`playerPerception.js` wprowadza kierunek spojrzenia, ograniczoną prędkość skanowania, widzenie peryferyjne, zasłonięcie oraz wygasającą pamięć. Rzucający ocenia zaobserwowane pozycje; stare obserwacje tracą wartość. Vision odpowiada za widoczność i pamięć, anticipation za krótką ekstrapolację i kontynuację, discReading za korektę przewidywania lotu, decisionMaking za ocenę ryzyka.

Dobieg nie odczytuje przyszłej rzeczywistej pozycji dysku. Koryguje plan na podstawie ostatnio dostrzeżonej pozycji i prędkości; po zbiciu przewiduje przybliżony lot swobodny. Ponowne dotknięcie unieważnia wcześniejszy cel dobiegu.

Ograniczenia: zasłanianie jest poziomą geometrią odcinków, więc model nie rozróżnia jeszcze widoku nad głową od widoku przez sylwetkę. Śledzenie dysku otrzymuje kierunek zainteresowania z jego pozycji, choć informacja o torze nadal podlega widoczności. Lokalna nawigacja cutterów i część obrony korzystają z pozycji świata; nie jest to jeszcze pełna symulacja niepewnej wiedzy wszystkich 14 graczy. Pamięć resetuje się na początku akcji.

## 3. Kontynuacja i współpraca

Rzucający wycenia możliwość następnego podania z miejsca chwytu, na podstawie dostępnych obserwacji i krótkiej prognozy ruchu. Cutterzy ustępują na przewidywanych przecięciach bliskich torów zamiast teleportować się z kolizji. W person defense dwaj pobliscy obrońcy mogą zamienić krycie, jeśli obaj potrafią je odczytać, a łączny dobieg wyraźnie się skraca. Przekazanie zachowuje jednoznaczne przypisania, chroni aktualnego marka i ma 1,2 s przerwy przed kolejną zmianą.

To lokalna koordynacja. Nie dodano fizycznych zderzeń, fauli, picków, ustalonej komunikacji głosowej ani wspólnego planowania sekwencji kilku cutów. Ocena kontynuacji szuka najlepszej bliskiej opcji, nie rozgrywa następnego posiadania w osobnej symulacji.

## 4. Nazwy i konkretne zastosowania atrybutów

| Stare pole | Pole kanoniczne | Zastosowanie |
|---|---|---|
| cutterMovement | routeCraft | geometria i kąt cutu |
| handlerMovement | resetMovement | przydatność do zaoferowania resetu |
| defensiveCutterMovement | matchupReading | reakcja na krycie cuttera i przekazywanie krycia |
| defensiveHandlerMovement | resetDefense | czas reakcji przy kryciu resetu |

Migracja zachowuje poprawne wartości; stare nazwy pozostają aliasami odczytu. Gdy są obie wersje, poprawna wartość kanoniczna ma pierwszeństwo. Deterministyczne generowanie nadal używa starych nazw w ziarnie, żeby sama zmiana nazwy nie losowała innych zawodników. Zestaw pozostaje przy 33 atrybutach, bez dublowania pól w średniej kategorii. Nowe nazwy mają opisy w modelu i profilu.

Nie dodano osobnego śledzenia bioder czy stopy podporowej. Matchup reading obecnie skraca/zwalnia interpretację ruchu i wspiera przekazanie, a nie odczytuje animowanej pozycji ciała.

## 5. Budowa ciała poza umiejętnościami

`playerBody.js` oddziela wzrost, zasięg stojąc, rozpiętość ramion, masę i szerokość barków od trenowalnych umiejętności. Zasięg wpływa na kontakt, masa na ustępowanie przy zbliżeniu, szerokość na uproszczone punkty podparcia. Brak pomiaru oznacza wspólną wartość zastępczą, nie losową przewagę zawodnika. Profil pokazuje tylko dostępne pomiary, bez prezentowania wartości zastępczych jako rzeczywistych danych.

Nie dodano dekoracyjnych breakThrow, pivotFootwork czy communication. Masa nie jest jeszcze składnikiem pełnej biomechaniki sprintu lub zderzeń; nie należy interpretować obecnego ustępowania jako symulacji pędu ciała.

## 6. Cechy jako styl

Usunięto wybrane bezpośrednie premie/kary celności, rozrzutu i ryzyka bloku z cech preferencji oraz temperamentu: huck_lover, dump_guy, safe_hands, creative_thrower, hammer_happy, glory_hunter, showboat, force_happy, composed, clutch, nervous i hot_headed. Zachowano wybór rodzaju podania, progi ryzyka i szum decyzji. Cechy technicznych specjalistów nadal mogą zmieniać wykonanie.

`measure-player-styles.mjs` zawiera porównania wszystkich 82 cech z brakiem cechy, każdej przy trzech rozkazach dotyczących hucków. Zapisuje typy, odbiorców i dystans wyborów. Próby mają te same umiejętności i seedy. Nie mierzą wartości cech dla całego sezonu.

W pośrednim `trait-probes.json` przy neutralnym rozkazie na 256 decyzji fast: bez cechy było 54 hucków i 26 dumpów, huck_lover — 79 i 18, dump_guy — 30 i 48. Zmiana rozkazu od ostrożnego do agresywnego dała bez cechy 47/54/60 hucków. To dowód kierunku wybranych preferencji, nie skuteczności całego katalogu. Ówczesne scenariusze przestrzenne słabo różnicowały typ rzutu; plik poprzedza dodanie szczegółowych metryk odbiorcy/dystansu i ostatnie usunięcie premii force_happy. Nie przedstawiamy go jako walidacji finalnego stanu wszystkich 82 cech.

## 7. Dotknięcia, layout, linie i orientacja dysku

Nieudany chwyt lub zbicie zmienia prędkość dysku i pozwala na kolejną próbę, również innego zawodnika. Obowiązuje 160 ms odstępu dla tego samego gracza i budżet ośmiu kontaktów na rzut. Poziomy layout ma ruch ciała, wybicie, lądowanie i kierunkową bryłę zasięgu. Nie jest wyłącznie większym pionowym zasięgiem ręki.

Chwyt w powietrzu zachowuje status miejsca wybicia; pierwsze lądowanie rozstrzyga granicę i punkt. Złapanie ręką nad endzone nie daje punktu przy podparciu poza strefą. Kontrola może zostać utracona przy lądowaniu. Podstawą kierunku zmian są reguły 11, 12 i 14 [WFDF 2025–2028](https://rules.wfdf.sport/wp-content/uploads/2025/03/WFDF-Rules-of-Ultimate-2025-2028-Pocket-Format.pdf).

Legalność wykorzystuje dwa przybliżone punkty stóp, a nie pełną sylwetkę: dłonie, kolana i kontakt ciała w layoutach nie mają kompletnego modelu podparcia. To częściowe odwzorowanie reguł, nie pełna zgodność sędziowska. Obrona nadal głównie zbija zamiast wybierać chwyt przechwytujący.

`discAttitude.js` opisuje zanik spinu oraz zmianę bank/pitch. Orientacja wpływa na siły w swobodnej końcówce i po zbiciu; podstawowy tor planowanego podania pozostaje kinematyczny. Nie ma solvera bryły 6DOF ani dopasowania parametrów do pomiarów aerodynamicznych. Współczynniki odbicia, utraty spinu i utrzymania chwytu są jawnie przybliżone.

## Weryfikacja i wydajność

Końcowa kontrola statyczna ESLint modułów AI, resolution, stall, point, modeli atrybutów/ciała/cech, profilu i nowych skryptów przeszła. Build przeszedł: 286 plików w kontroli importów/eksportów, 332 moduły w Vite. Pozostało ostrzeżenie o wielkości głównego pakietu. Nie uruchamiano ponownie testów mechaniki podczas końcowego przeglądu; wcześniejsze wyniki dotyczą wcześniejszych stanów kodu. Nie wykonano oceny wizualnej meczu.

Pomiary w tym katalogu są próbami pośrednimi. `windy-initial.json` i `windy-after-reading.json` obejmują po cztery mecze pełne przy wietrze 20 mph. Completion zmieniło się z 75,53% na 83,62%, ale nie jest to dowód osiągnięcia realnego poziomu sportowego. Końcowy profil jednego meczu przed ostatnią drobną optymalizacją aliasów: 81,92% completion, 33,33% hold, 2,37 straty/punkt, 25 odzyskań po dotknięciu; 17,21 s i 71 336 klatek. Profilowanie samo dodaje narzut.

Koszt pełnego silnika jest istotnym ograniczeniem. Wcześniejszy pomiar około 5,25 s/mecz z poprzedniego raportu nie może być przenoszony na ten model. Profil wskazuje głównie pętlę akcji, ruch, mapę przestrzeni, staminę i alokacje; sama orientacja dysku nie jest dominującym kosztem. Usunięto wielokrotne budowanie odwrotnej mapy aliasów przy odczycie statystyk. Nie deklarujemy końcowego przyspieszenia bez porównywalnego pomiaru.

Scenariusze kontrolne zapisano w `scripts/check-recommendations.mjs`; są materiałem do dalszej weryfikacji, nie substytutem oglądania gry i danych referencyjnych. Sumy plików oraz zakres końcowej kontroli znajdują się w `validation-manifest.json`.
