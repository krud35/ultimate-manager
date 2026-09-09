# Etapy 3–5: populacja, finanse i zarządzanie klubem

## Wdrożenie

### 3. Młodzież i akademia

- Każdy sezon ma wspólny, ograniczony rocznik regionalny. Wysłanie skauta odkrywa istniejących zawodników; nie tworzy nowych. Dwa kluby mogą obserwować ten sam talent, ale podpisać go może tylko jeden.
- Obserwacje wygasają po 60 dniach. Wiek zawodnika jest aktualizowany w rejestrze; kopie raportów nie powiększają populacji. Niepozyskana młodzież opuszcza rejestr w wieku 21 lat; na wolny rynek przechodzą tylko zawodnicy z OVR co najmniej 73.
- Akademia ma `8 + 2 × poziom` miejsc i `3 + floor(poziom / 3)` przyjęć na sezon. Nabór organiczny zajmuje maksymalnie dwa przyjęcia; pozostawia przestrzeń dla skautingu. Przyjęcie zależy również od zainteresowania zawodnika.
- Większość rocznika celuje w OVR 67–72, lepsza grupa w 73–76, wyjątkowi zawodnicy w 78–80. Dolna granica 67 wynika z obowiązującej normalizacji atrybutów; nie zmieniono modelu umiejętności silnika.
- Koszt przyjęcia: 2000 + 200 za punkt potencjału ponad 60. Utrzymanie: 40 tygodniowo za juniora. Kontrakt debiutanta trwa rok i wynosi 85% stawki odpowiadającej jego rzeczywistemu OVR.
- Lekka symulacja aktywności U21 daje minuty i okazje rozwoju bez uruchamiania meczów. AI wymaga od awansowanych juniorów co najmniej 18 lat i gotowości sportowej. Ekran akademii pokazuje miejsca, przyjęcia i minuty U21.

### 4. Rachunek klubu

- Oddzielono gotówkę, tygodniowy limit płac, limit wydatków transferowych i pozostałe zobowiązania. Podpisanie/rozwiązanie kontraktu nie przenosi ani nie tworzy pieniędzy; pensje schodzą z gotówki co tydzień, także przy zadłużeniu.
- Migracja dodaje dawną rezerwę pensji do dawnego salda transferowego dokładnie raz. Zachowuje również ujemne saldo. Roczny przegląd nie resetuje gotówki.
- Nowy kontrakt musi mieścić się w limicie płac i pozostawiać czterotygodniową rezerwę całej listy płac. Dostępny budżet na opłaty transferowe dodatkowo chroni osiem tygodni pensji. Bezpłatne kontrakty nie wymagają dodatniego limitu transferowego.
- Wolnych zawodników można zatrudniać przez cały rok. Limit 32 seniorów obowiązuje przy pozyskaniu; nie blokuje przedłużania umów w starszych, większych kadrach.
- Wypożyczenia dzielą pensje oraz zobowiązania między oba kluby. Księga przepływów umożliwia uzgodnienie salda: saldo początkowe + wpływy − wydatki.
- Właściciel finansuje klub miesięcznymi ratami jawnej rocznej kwoty. Bazę określa profil finansowy przy migracji/utworzeniu klubu; ubytek kadry nie usuwa tej zdolności finansowania. Dodatkowe wsparcie rośnie najwyżej o 5% rocznie, do 150% bazy. Jest to model ekonomii gry, nie odwzorowanie realnych kwot w ultimate.
- Dług pozostaje w bilansie, generuje odsetki 0,15% tygodniowo i może uruchomić istniejące konsekwencje finansowe. Dotacja kryzysowa pozostaje ograniczona do jednej na sezon; bankructwo uwzględnia utrzymywanie się problemu.
- Prognoza obejmuje aktualne koszty oraz stałe wpływy. Płatności sponsorskie otrzymane z góry nie są ponownie dodawane do przyszłej gotówki; ich wartość roczna jest uwzględniana przy ustalaniu limitów.

### 5. Klub i decyzje AI

- Strategie: rozwój młodzieży, równowaga, walka o trofea. Plany kadrowe uwzględniają liczebność, handlerów/cutterów oraz O-line/D-line. Kategorie umiejętności są porównywane względem ich własnych zakresów.
- Sztab: trener młodzieży, główny skaut, fizjoterapeuta i dyrektor sportowy. Poziomy 0–3 mają koszty tygodniowe 0/150/450/1000; poprawa poziomu kosztuje dodatkowo cztery tygodnie pensji. Efekty dotyczą rozwoju, skautingu, regeneracji i treningu.
- Rozbudowa obiektu pobiera koszt raz i trwa `21 + 7 × aktualny poziom` dni. Efekt pojawia się po zakończeniu; jeden klub prowadzi jedną rozbudowę naraz.
- AI odnawia sponsorów, inwestuje w obiekty i sztab, konkuruje o młodzież oraz uzupełnia kadrę wolnymi zawodnikami. Mniejsze kadry mają pierwszeństwo. Rekrutacja i przedłużenia pozostawiają część limitu płac na głębokość składu. Nowe inwestycje AI wymagają co najmniej 24 seniorów: odbudowa kadry ma pierwszeństwo przed zwiększaniem kosztów infrastruktury.
- Cele zarządu obejmują trzy sezony, wynik ligowy, wychowanków i ocenę finansową. Historia zachowuje ocenę zakończonego cyklu. Panel Zarządu pokazuje cele, zaufanie, sztab, potrzeby kadrowe, budowę, przepływy oraz prognozę gotówki.

## Weryfikacja

Polecenia:

```text
node --import ./scripts/register-world-tests.mjs scripts/test-world-lifecycle.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-world-economy.mjs
node --import ./scripts/register-world-tests.mjs scripts/bench-world-market.mjs
node --import ./scripts/register-world-tests.mjs scripts/check-world-balance.mjs
npm run build
```

- 14 testów cyklu świata oraz 13 testów finansów i zarządzania. Pokrywają m.in. migrację, zachowanie gotówki, wynagrodzenia i wypożyczenia, rejestr młodzieży, przyjęcia, budowę, sztab, odnawianie sponsorów, kontrakty bez opłaty transferowej i idempotencję przetwarzania miesiąca.
- Kontrola ESLint zmienianych modułów gospodarki i paneli: bez błędów.
- Build produkcyjny przechodzi. Pozostaje ostrzeżenie Vite o rozmiarze głównego pakietu przekraczającym 500 kB.

Ostatni pomiar samego rynku, 30 prób na wariant; nie jest to czas całego dnia ani meczu:

| Kluby | Wariant | Mediana | p95 |
|---|---|---:|---:|
| 16 | Okno zamknięte | 0,04 ms | 0,16 ms |
| 16 | Okno otwarte | 4,61 ms | 9,19 ms |
| 16 | Mało gotówki | 2,09 ms | 4,09 ms |
| 48 | Okno zamknięte | 0,03 ms | 0,08 ms |
| 48 | Okno otwarte | 7,72 ms | 16,68 ms |
| 48 | Mało gotówki | 3,24 ms | 5,56 ms |

## Zakres kalibracji wieloletniej

Skrypt zapisuje wyniki do `world-stage-3-5-balance.json`: dwa rozmiary świata, dwa ziarna i dziesięć lat. Kontroluje własność każdego zawodnika, pojemność akademii i zgodność bilansu pieniędzy we wszystkich klubach.

Wszystkie 40 rocznych kontroli przeszły. Wyniki po dziesiątym roku:

| Kluby / ziarno | Seniorzy | Najmniejsza kadra | Akademie | Wolni zawodnicy | Mediana gotówki |
|---|---:|---:|---:|---:|---:|
| 16 / 17 | 484 | 26 | 220 | 363 | 4 651 771 |
| 16 / 71 | 483 | 28 | 223 | 367 | 5 638 583 |
| 48 / 17 | 1205 | 8 | 498 | 1000 | 543 729 |
| 48 / 71 | 1182 | 10 | 515 | 995 | 509 294 |

**Balans nie jest jeszcze zamknięty.** Łączna populacja seniorów nie zanika, ale słabsze kluby w świecie 48 zespołów miewają zbyt małe kadry; minimum w całej próbie wyniosło sześciu seniorów po sezonie. Rośnie pula wolnych zawodników, a kluby UFA akumulują znaczne nadwyżki gotówki. Kolejna kalibracja powinna objąć rozkład liczebności poszczególnych kadr, tempo odpływu z wolnego rynku oraz zależność wsparcia właściciela od wieloletnich nadwyżek. Sam brak bankructw w tym teście nie dowodzi zdrowego balansu.

Po pomiarze wieloletnim zoptymalizowano jeszcze przegląd wolnych zawodników: oceny, sumy umiejętności kadry, listę dostępności i fundusz płac liczy się raz, a następnie aktualizuje po podpisaniu umowy. Ta zmiana nie zmienia kolejności kandydatów ani reguł wyboru; objęły ją końcowe testy regresji i build.

To test warstwy zarządzania: obejmuje codzienny rynek, płace, sponsorów, TV, właścicieli, koszty klubu, starzenie, emerytury, roczniki i rozwój między sezonami. Nie rozgrywa meczów ani nie uwzględnia ich wyników, przychodów, podróży i pełnego treningu dziennego. Roczne pomiary kadr wykonuje po emeryturach i przed kolejną miesięczną rekrutacją. Nie stanowi dowodu pełnego balansu gotowej kariery z meczami.

Prognoza w interfejsie rozkłada aktualne stałe strumienie liniowo; nie jest harmonogramem rzeczywistych dat każdej wpłaty. Cele zarządu i minuty U21 są lekkim modelem, bez osobnego kalendarza ligi juniorów ani negocjowania kontraktów członków sztabu.
