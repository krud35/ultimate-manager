# Limit rzutów: reprodukcja punktu 25 w baseline v1

Stan badania: 2026-10-03, przed 06:00. Wyłącznie analiza i osobna instrumentacja; nie zmieniono produkcji ani zamrożonego silnika. Baseline v1 jest diagnostyczny, wykluczony z kalibracji (`INVALID_EXCLUDED`); planowana seria v2 utrzymuje pełne składy przez zastępowanie wyłącznie kontuzjowanych.

## Wniosek

Oba hardErrors są prawdziwe. Punkt zawiera 120 rzeczywistych prób rzutu, po czym silnik przyznaje sztuczny punkt drużynie away, mimo że dysk posiada home. Głównym ujawnionym zaburzeniem warunków doświadczenia jest gra home 4 na 7 po trzech kontuzjach bez zastępstw. Kompaktowanie czterech ocalałych w indeksy formacji dodatkowo zmienia rodziny ich ról: trzech zostaje reset handlerami, czwarty filler cutterem. W takiej konfiguracji home wykonuje serię 105 rzutów, w tym 96 resetów, przesuwając dysk 45 m do tyłu.

To nie uzasadnia zwiększenia limitu ani kalibracji normalnego ataku 7 na 7 na podstawie tej próby. Po przywróceniu pełnych składów należy najpierw sprawdzić, czy problem długich pętli pozostaje. Zachowanie fallbacku jest oddzielnym problemem spójności wyniku: przekroczenie limitu symulacji nie odpowiada zdobyciu punktu na boisku.

## Materiał i deterministyczna reprodukcja

- Job: `directive-00198-neutral-a`, seed `101014058`, równe rostery `development-balanced-0-a/b`.
- Obie strony: horizontal stack / person; badana creativity=0; bez rotacji i adaptacji; wiatr 0 mph, zablokowany.
- Oryginał: `artifacts/engine-audit/tactics-balance-2026-10-03/jobs/directive-00198-neutral-a.json`.
- Izolowany capture: `artifacts/engine-audit/tactics-balance-limit-probe/`.
- Skrót wyniku oryginału i reprodukcji: `9d7d2128b87b5e5527ec87c43886552d8307431fa8c75c7ea6b4a006905532d1`.
- Oba przebiegi: wynik 13:15, 28 punktów, te same dwa hardErrors. Jeden dodatkowy mecz trwał około 35 s; nie dotykano kolejki baseline.

Uruchomienie osobnego capture:

```powershell
node artifacts/engine-audit/tactics-balance-limit-probe/probe-worker.mjs artifacts/engine-audit/tactics-balance-limit-probe/input.json artifacts/engine-audit/tactics-balance-limit-probe
```

`probe-worker.mjs` powstał z zamrożonego workera v1, importuje jego zamrożone źródła przez absolutne ścieżki `file:///C:/Users/marod/ultimate-manager-ufa/artifacts/engine-audit/tactics-balance-2026-10-03/snapshot/`. Baseline pozostaje w tym miejscu. Dodano jedynie zapis po ukończeniu punktu, bez losowań ani zmiany stanu meczu. `point25-events.json` zawiera wszystkie eventy punktu oraz pierwszą/ostatnią klatkę każdej akcji; `point25-final20-traces.json` zawiera co piątą klatkę ostatnich 20 rzutów. `summary.json` zbiera liczby, kontuzje, role i końcową geometrię. Zachowano również input, rostery, wynik, checkpoint i standardowe replaye.

## Kontuzje i brak zastępstw

| Punkt po którym wystąpiła kontuzja | Strona | Zawodnik | Dni urazu |
| --- | --- | --- | --- |
| 2 | away | p4 | 10 |
| 3 | home | p8 | 14 |
| 11 | away | p15 | 10 |
| 18 | home | p3 | 6 |
| 23 | home | p12 | 7 |

Wszystkie puste sloty wynikają z tych urazów; nie z automatycznego usuwania wyczerpanych graczy. Home występuje w niepełnym składzie w 12 punktach (minimum 4 graczy), away w 13 (minimum 5). Punkt 25 zaczyna home D-Line `[null, null, p1, p7, null, p4, p15]`.

Źródło braku zastępstwa: `matchSession.js:355–364` po urazie usuwa kontuzjowanych z obu linii. `preparePointTeams`, linie 167–177, uruchamia zastępstwa jedynie przy włączonym `rotateHome`/`rotateAway`. Worker v1 przekazuje oba jako false. Samo utrzymywanie zdrowych slotów i wyłączenie taktycznych zmian jest sensowne dla izolacji eksperymentu, lecz wymaga osobnej polityki wymiany kontuzjowanych. Nie ma tu dowodu, że produkcyjna automatyczna rotacja jest nieskuteczna: nie była uruchamiana.

Drugie następstwo: `participants.js:140–159` usuwa puste wpisy z listy graczy (`filter(Boolean)`), a `offenseLineSlots.js:8–17` i `ai/actionSimulator.js:660` przypisują role według nowego indeksu w tej krótszej liście. Horizontal stack ma pierwsze trzy sloty handlerów. `playerSubRoles.js:164–178` zachowuje zapis tylko wtedy, gdy pasuje do nowej rodziny slotu. W efekcie faktycznie zarejestrowane role home w punkcie 25 to p1/p4/p7=`reset_handler`, p15=`filler_cutter`; brak primary/secondary cuttera. To bezpośrednio potwierdzona zmiana kompozycji, a nie samo podejrzenie na podstawie nazw zawodników.

## Rzeczywista pętla resetów

Eventy punktu: 120 `throw_attempt`, 117 `throw_success`, 3 `throw_fail`, 3 `turnover`, jeden `score` z `reason=throw_limit`. Brak stalloutu. Suma czasu trzymania dysku poniżej nie obejmuje lotu dysku ani wszystkich przerw.

| Numery rzutów | Posiadanie | Rzuty | Resety | Suma trzymania dysku | X pierwszego/ostatniego rzucającego |
| --- | --- | ---: | ---: | ---: | --- |
| 1–6 | away | 6 | 2 | 3,04 s | 90,86 → 78,86 |
| 7–111 | home | 105 | 96 | 372,16 s | 70,22 → 25,22 |
| 112 | away | 1 | 0 | 2,14 s | 19,01 → 19,01 |
| 113–120 | home | 8 | 7 | 30,34 s | 4,38 → 19,38 |

W całym punkcie home rzuca 113 razy, w tym 103 resety. Wymiany par: p4↔p7 74 razy; p1↔p4 19; p1↔p7 17; p15↔p7 2; p1↔p15 1. To nie są puste iteracje guardu ani zawieszenie zegara. Silnik konsekwentnie wybiera bardzo krótkie podania między handlerami w zdekompletowanym ataku.

Ostatnia zarejestrowana geometria ataku zawiera trzech graczy skupionych przy dysku: p4 (19,38;34,29), p1 (18,50;24,02), p7 (17,34;35,13), oraz jednego cuttera p15 (31,82;5,19). Obrona nadal ma siedmiu graczy. Ostatni prawdziwy chwyt: home, (17,3414;35,1340), poza polem punktowym. Metryka `discPosition` wynosi 17,38498.

## Skąd nieprawidłowy punkt

`point.js:399` ogranicza pętlę przez `MATCH_CONFIG.maxThrowsPerPoint`, obecnie 120 (`config.js:40`). Po wyjściu bez prawdziwego gola `point.js:1137–1145` wykonuje:

```js
scoringTeam = discPosition >= 50 ? possession : possession === 'home' ? 'away' : 'home'
```

Przy home posiadającym dysk i `discPosition=17,38498` daje to away. Event 1255 przy `captureAction=120` przyznaje away punkt z `reason=throw_limit`; event 1256 kończy punkt po 120 rzutach. Wynik zmienia się z 12:12 na 12:13. Oba alarmy harnessu trafnie identyfikują ten sam fallback, nie dwa niezależne zdarzenia. Raport już poprawnie wyklucza błędny mecz i jego parę z wniosków balansu.

## Oddzielna kwestia realizmu urazów i zmęczenia

Pięć urazów skutkujących 6–14 dniami przerwy w jednym meczu to podejrzany obraz realizmu, ale pojedynczy seed nie wystarcza do wniosku o źle skalibrowanej częstości. Bazowa szansa (`models/playerInjury.js:68–74,324–331`) wynosi 0,0008 na gracza po każdym punkcie, z mnożnikami 1,5 poniżej staminy 60, 2,5 poniżej 45 i 4 poniżej 30, dalej modyfikowanymi cechami i opieką medyczną. Brak rotacji zwiększa ekspozycję na niską staminę, a nieuzupełnione urazy dodatkowo destabilizują długość punktów. W starcie punktu 25 czterej home mają staminę około 10–11; na jego końcu 100. Ten nietypowy wzrost podczas bardzo długiego punktu warto osobno zweryfikować w modelu regeneracji, ale nie został tu uznany za przyczynę urazów ani naprawiony.

V2 powinno osobno raportować urazy na 1000 graczopunktów, rozkład dni przerwy i ekspozycję w przedziałach staminy, wraz ze zmianami wymuszonymi urazami. Wyników z v1 nie należy łączyć z v2 dla estymacji efektów taktyk. Powiązanie z warunkami meczu i realne założenia modelu urazów wymagają oddzielnej walidacji; nie należy obniżać szansy urazów tylko po to, aby testy taktyczne przeszły.

## Decyzje do podjęcia po 06:00

1. Najpierw ocenić częstość guardów i długich sekwencji w poprawnym v2 7 na 7. Oddzielnie przeanalizować 95./99. percentyl rzutów na posiadanie, udział resetów i zmianę X; sprawdzić kompletność oraz rzeczywiste role przy każdym przypadku skrajnym.
2. Jeżeli pozostają pętle w pełnym składzie, uchwycić konkretną decyzję rzucającego i brak aktywnego cuttera przy tych samych stanach, zanim zmieni się wagi taktyk.
3. Zabezpieczenie czasu pracy silnika powinno pozostać ograniczone. Sposób reprezentacji przerwanej symulacji należy rozstrzygnąć osobno od logiki prawdziwego gola; nie maskować problemu przez podniesienie limitu.
4. Kompaktowanie slotów w niepełnej linii jest odrębnym przypadkiem poprawności do późniejszej decyzji produktowej/testów. Badanie balansu 7 na 7 nie powinno zależeć od niego.

Wnioski o zachowaniu typowego ataku, częstości urazów i priorytecie poprawek mogą zmienić się po wynikach v2. Pewne już teraz są: prawdziwe przekroczenie guardu, sztuczny punkt, niepełny skład i zmiana rzeczywistych ról w uchwyconym punkcie.
