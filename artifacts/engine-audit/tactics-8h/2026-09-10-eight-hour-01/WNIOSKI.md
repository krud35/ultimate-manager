# Wnioski z audytu taktyk i archetypów

Test zakończony: FINISHED, integralność PASS. Raport gotowy 10.09.2026 o 16:20 czasu polskiego. Łącznie około 7 godz. 37 min aktywnej pracy, z przerwą i wznowieniem po naprawie odczytu wyników. Silnika, rosterów i reguł selekcji przy wznowieniu nie zmieniono.

Podstawa: 7266 zapisanych zadań, 1120 kontrolowanych punktów macierzy 7 × 5, 239 poprawnych pełnych meczów obecnych trenerów i 212 poprawnych pełnych meczów finału. Trzy inne mecze miały sztuczny punkt po limicie akcji/rzutów i zostały wyłączone ze sportowych agregatów. Nie jest to dowód braku innych błędów.

## 1. Główny wniosek: skuteczność podań przestała być wystarczającym kryterium

W finale completion mieściło się w zakresie 92,45–93,87%, ale odsetek posiadań zakończonych punktem wynosił 46,88–67,10%. W kontrolowanej macierzy różnica była jeszcze większa. Problemem części stylów jest produktywność posiadania: wiele skutecznych podań nie daje wystarczającej szansy zdobycia punktu, zanim przydarzy się strata.

To mocny sygnał do zbadania tworzenia przewagi, kontynuacji i progresji. Same agregaty nie ustalają, czy konkretną przyczyną jest clearing, geometria tras, wybór podania czy dojście do strefy. Nie przeprowadzono tutaj wizualnej oceny powtórek, więc nie przedstawiam tych przyczyn jako potwierdzonych.

## 2. Najmocniejszy kandydat: isolation-5

| Profil | Poprawne pełne mecze | Zwycięstwa | Completion | Punkty / posiadania |
|---|---:|---:|---:|---:|
| isolation-5 | 36 | 28 | 93,87% | 67,10% |
| reference-balanced | 36 | 24 | 92,85% | 60,57% |
| pragmatic-4 | 35 | 20 | 93,75% | 60,32% |
| deep-4 | 36 | 20 | 93,11% | 58,55% |
| reference-mastermind | 34 | 16 | 93,11% | 55,87% |
| zone-6 | 35 | 9 | 92,45% | 46,88% |

Przeciwnicy to trzy stałe polityki kontrolne; powyższe zwycięstwa nie pochodzą z bezpośredniej ligi finalistów między sobą. Niewielkie różnice liczebności wynikają z nieukończonej ostatniej rundy pokrycia i wykluczenia dwóch błędnych meczów.

`isolation-5` to creative_iso z creativity 0,25 i breakAppetite 0,4 oraz polityką utrzymania planu: wymaga powtarzającego się problemu i zachowuje co najmniej trzy punkty odstępu między zaakceptowanymi zmianami. Wariant nie otrzymywał bonusów statystyk.

W porównaniu na 18 wspólnych sparowanych blokach przewaga nad balanced wyniosła 6,87 pp skuteczności posiadania, z eksploracyjnym 95% przedziałem bootstrapowym 1,55–12,40 pp. Różnica średnich ważonych posiadaniami w tabeli wynosi 6,53 pp; to inny sposób agregacji. Przedziały nie zostały skorygowane za wiele porównań — kandydat jest obiecujący, nie automatycznie zatwierdzony do wdrożenia.

Isolation osiągał 61,69% konwersji przeciw neutralnemu przeciwnikowi, 65,04% przeciw presji i 75,31% przeciw strefowemu. Przewaga nie ograniczyła się więc do samego eksploatowania strefy. Test całego pakietu nie dowodzi jednak, że odpowiada za nią akurat stabilność, breakAppetite albo konkretna geometria izolacji.

`deep-4` nie wykazał przewagi nad balanced: sparowana różnica −1,98 pp, przedział −8,88 do +4,66 pp. Pragmatic i balanced również pozostają nierozstrzygnięci: +0,19 pp, przedział −5,58 do +5,62 pp. Nie należy tworzyć z tych drobnych różnic twardego rankingu.

## 3. Hex i motion wymagają diagnozy mechaniki ataku

Każdy atak dostał po 160 kontrolowanych punktów: 32 seedy przeciw każdej z pięciu obron, przy jednej zrównoważonej parze rosterów i bez wiatru.

| Atak | Completion | Punkty / posiadania | Próby podania / zdobyty punkt |
|---|---:|---:|---:|
| Split | 95,54% | 64,84% | 12,15 |
| Vertical | 94,45% | 63,59% | 10,32 |
| Zone offense | 94,77% | 60,23% | 12,61 |
| Horizontal | 93,78% | 56,28% | 12,49 |
| Side | 93,64% | 51,61% | 14,73 |
| Motion | 94,42% | 37,50% | 29,85 |
| Hex | 94,29% | 25,91% | 50,06 |

Ostatnia kolumna obejmuje wszystkie próby, także nieudane posiadania. Nie oznacza długości typowego skutecznego posiadania.

Hex przeciw cup i wall osiągał tylko 16,67% konwersji w każdej z tych komórek. Motion miał 32,5–45,9% zależnie od obrony. W tej próbie wysokie completion maskuje problem ataku, a nie go rozwiązuje.

Rekomendacja: najpierw porównać wybrane posiadania hex/motion z vertical przy podobnej sytuacji. Zmierzyć moment pierwszej przewagi, dostępność kolejnej opcji, clearing oraz odbudowę kształtu po swingach. Dopiero po naprawieniu mechanizmu budować wokół niego silnego „systemowca”. Ten test nie dowodzi, że hex lub motion są nieskuteczne w prawdziwym ultimate albo w każdym składzie silnika.

## 4. Potwierdzony problem adaptacji: trwały efekt paniki

W syntetycznym scenariuszu pięciu przegranych punktów, a następnie czterech wygranych:

- Wszystkie 15 profili wracało do panicLevel = 0.
- U 13 profili huckAppetite pozostawało na 1,0 we wszystkich 128 powtórzeniach.
- U patient_controller i veteran_grinder także pozostawało blisko maksimum; próba obejmowała różne wartości kryzysu sezonowego.
- Tempo_pusher i motion_system zachowywały również maksymalne possessionTempo we wszystkich tych powtórzeniach.

To konkretny rozjazd między stanem trenera a jego ustawieniami: formalnie odzyskał spokój, ale nie odzyskał bazowej polityki. Długie mecze mogą przez to zacierać różnice między archetypami.

Po pojedynczym zwykłym holdzie przeciwnika następowała zmiana głównej obrony w 244 z 1920 prób (12,71%). Sama zmiana nie jest automatycznie błędem, ale reguła powinna wymagać dowodu problemu, a nie utożsamiać normalnego punktu rywala z nieskutecznością planu.

Rekomendacja: zachować niezmienną bazę profilu, a presję wyniku nakładać jako odwracalny, ograniczony modyfikator. Dodać wygaszanie po poprawie sytuacji, minimalny czas utrzymania planu i ocenę przyczyn utraty punktu. Nie kumulować suwaków bez odniesienia do bazy.

## 5. Profil trenera może pogarszać grę, ale dobór zawodników wnosi wartość

W krótkich próbach izolowania składników, po 120 zadań na wariant:

| Wariant | Completion | Punkty / posiadania |
|---|---:|---:|
| Pełny profil | 94,00% | 52,12% |
| Bez preferencji stylów | 94,64% | 60,44% |
| Bez biasów dyrektyw | 94,12% | 58,88% |
| Bez instrukcji | 94,27% | 54,52% |
| Bez adaptacji | 94,56% | 54,66% |
| Uproszczony skład / podrole | 93,43% | 47,45% |

To wskazuje na konflikt części preferencji i biasów z możliwościami silnika, nie na konieczność usunięcia charakteru trenerów. Przy wyłączeniu preferencji poprawa samej konwersji nie przełożyła się na więcej wygranych trzy-punktowych prób: 62 zamiast 63. Ataku nie wolno optymalizować bez równoczesnej oceny obrony.

Próba uproszczonego składu zmienia też podrole i zachowanie rotacji, więc nie izoluje samej jakości rankingu zawodników. Wskazuje wartość całego pakietu doboru i zarządzania liniami.

Nie ma wystarczających podstaw, aby uznać każde obecne dostosowanie za szkodliwe albo hurtowo wyłączyć instrukcje. Wariant pragmatic-4 poprawił się względem mastermind, ale zmieniał równocześnie utrzymanie planu i nadpisywanie dwóch dyrektyw; nie jest czystym dowodem przewagi jednej poprawki adaptacji.

## 6. Ruch i rozkazy rzutowe nie zawsze tworzą spójny plan

W niewielkiej wspólnej próbie kontrolnej, po 20 kontekstów na poziom:

- `cut_deep`: udział hucków 3,17% → 11,22%.
- `cut_under`: udział hucków 3,17% → 0,67%.
- `throw_hucks`: udział hucków 3,17% → 0%.
- Zwiększenie huckAppetite z −1 do +1 nie dawało monotonicznego wzrostu hucków: 5,74% → 1,60%.
- Tempo −1 → +1 skracało średni czas do rzutu z 3,11 do 2,58 s.

Ruch odbiorców daje tu czytelniejszy sygnał niż sam rozkaz szukania dalekiego podania. Hipoteza: trener musi organizować dostępność deep i ciąg dalszy akcji, a nie tylko zmieniać preferencję rzucającego. Próba hucków jest mała; nie dowodzi odwróconego znaku suwaka ani globalnie niedziałającej instrukcji.

Obronnych rozkazów nie oceniamy tylko po statystykach ataku strony kontrolowanej. W pojedynczym punkcie mogło być niewiele okazji do ich wykonania. Niewielka różnica wyniku nie wystarcza do uznania poach/help za martwe.

## 7. Obrony strefowe trzeba rozdzielić

W macierzy konwersja przeciwnika wynosiła 57,36% przeciw cup, 52,12% przeciw person, 49,40% przeciw clam, 48,33% przeciw wall i 48,05% przeciw all_person. Mniej oznacza tu skuteczniejsze ograniczenie ataku.

Cup wypada słabo jako ogólna obrona w tej kohorcie. Wall zachowuje się wyraźnie inaczej — nie ma podstaw do uznania wszystkich stref za jednakowo nieskuteczne. Słaby wynik zone-6 obejmuje też jego atak, instrukcje i adaptację; nie wolno przypisać całej różnicy samemu cup.

Rekomendacja: osobne zasady dla cup i wall, z pomiarem odsłanianych korytarzy, odpowiedzi na swing i odbudowy po minięciu pierwszej linii. Trener strefowy powinien wiedzieć, kiedy zmienić obronę, oraz mieć działający atak po odzyskaniu dysku.

## 8. Kierunek przebudowy archetypów

1. **Izolacja / tworzenie przewagi** — pierwszy kandydat do dopracowania. Zachować creative_iso jako podstawę; porównać z bait_switch, który miał najlepszą konwersję obecnych profili w screeningu (65,23%, 11/16 zwycięstw). Nie był osobnym finalistą, więc jego przewaga pozostaje wstępna.
2. **Zrównoważony trener** — zachować jako stabilny punkt odniesienia. „Mastermind” nie wykazał nadrzędności nad nim.
3. **Selektywna głębia** — rozwijać jako współpracę rzucającego i odbiorców, z odpowiedzią under/reset na zabraną głębię. Obecny deep-4 nie ma potwierdzonej przewagi ogólnej.
4. **Kontrola posiadania** — przebudować wokół cierpliwego tworzenia przewagi, nie samego unikania strat. Patient_controller i veteran_grinder osiągnęli około 44–45% konwersji i tylko 4/16 oraz 3/16 zwycięstw. Rozważyć wspólną rodzinę z różnymi progami ryzyka.
5. **Flow / system** — uzależnić rozwój archetypu od naprawy produktywności motion/hex. Sam szybszy zegar decyzji nie zapewnia kontynuacji.
6. **Strefa / presja / hybryda** — budować jako odrębne polityki obrony z własną odpowiedzią po odzyskaniu, nie zamienne pakiety kilku suwaków.

Kolejność prac: odwracalna adaptacja i usunięcie sztucznych punktów → diagnoza hex/motion → spójność ruchu i wyboru rzutu → osobna diagnoza cup/wall → przebudowa profili → ponowny niezależny finał.

## Ograniczenia, które wpływają na decyzję

- Moduł kontroli wykonał 2150 z 6320 zaplanowanych zadań. Rejestry dyrektyw i instrukcji dostały próbki, ale liczba powtórzeń była ograniczona; późniejsze próby morale, energii, znajomości systemu i szczegółowych atrybutów nie weszły do tej ukończonej części. Ten audyt nie rozstrzyga ich wpływu.
- Macierz była kompletnie pokryta w swoim wąskim układzie: jeden roster, brak wiatru, start punktu w ataku. Finał obejmował więcej rodzin i warunków, lecz nie każdy potencjalny matchup.
- W rewanżach zamieniano strony boiska, ale badany trener nadal rozpoczynał pierwszy punkt w ataku. Nie było pełnego zrównoważenia pierwszej linii O/D.
- Selekcja promowała konwersję i odporność na najgorszy blok, a nie potwierdzoną ekspercko sygnaturę zachowania. Czterej finaliści mieli politykę stable; nie dowodzi to automatycznie, że jest lepsza dla każdej rodziny.
- Nie wykonano wizualnego przeglądu powtórek ani walidacji na danych prawdziwych meczów. Wyniki wskazują, gdzie mechanika lub polityka wymagają pracy; nie certyfikują realistycznego rozumienia przestrzeni.
- Żaden profil nie został wdrożony, a completion nie było ponownie strojone na tych danych. Reset balanced w finale wyniósł 92,91%, więc wcześniejszy cel 94–96% nie jest osiągany jednakowo przez wszystkie konfiguracje.

Źródła lokalne: REPORT.md, holdout-results.json, coach-cards.json, failures.json, INTERPRETATION-DATA.json oraz surowe jobs/*.json. Dodatkowe obliczenia: scripts/analyze-tactics-audit.mjs. Wszystkie procenty mają jawne mianowniki w danych źródłowych.
