# Przerywanie cutów po resecie — diagnoza i poprawka

Status próby balansu: **zaliczona — bez awaryjnych limitów w 16 meczach nowej wersji**. Nie jest to stwierdzenie pełnej kalibracji całej ligi.

## Przyczyna i zmiana

Gałąź postResetClearout w cutterBrain działała przed obsługą ACTIVE_CUT, INITIATING_CUT i CLEARING. W każdym kroku 20 ms ponownie losowała kierunek i długość trasy oraz zerowała stateMs. Nie tylko przerywała plan biegu: omijała też normalną ocenę cutu, nawrót, zakończenie i zwalnianie miejsca. Działała również mimo zajętego limitu aktywnych cutterów.

Reset uruchamia teraz tę gałąź wyłącznie dla zawodnika WAITING, który może rozpocząć cut według istniejącej reguły canStartCut. Nowa próba przechodzi przez INITIATING_CUT, więc korzysta z czasu reakcji zawodnika. Aktywny bieg utrzymuje cel do zwykłej oceny; clearing może się skończyć. Nie zmieniono celności, chwytu, kary za reset, progów wyboru podań ani limitu 120 akcji.

Test check-reset-cuts odtwarza stary błąd za pomocą przełącznika procesu. Sprawdza zachowanie celu i zegara, etap inicjacji, clearing, ograniczenie przy zajętych slotach oraz możliwość zakończenia aktywnego cutu mimo utrzymywanego sygnału resetu.

## Diagnostyka decyzji

THROW_SCAN_DIAGNOSTICS.observe jest opcjonalnym odbiornikiem danych; bez niego nie przechowujemy skanów. Zapis obejmuje widziane lub pamiętane pozycje, stany i cele odbiorców, wybrane ID, oceny opcji oraz powody wybranych odrzuceń. Diagnostyka nie losuje i nie modyfikuje opcji.

Seed 105437, 20 mph / 90°, aktualne źródła: najdłuższy punkt 38 → 55 podań. W skanach przy requireForwardPass zegar aktywnego cuttera był równy zero w 90/93 obserwacji przed poprawką i 3/770 po niej. Liczba tych skanów: 37 → 428. Są to obserwacje, nie unikalne cuty ani niezależne próby.

W tym końcowym odtworzeniu punkt nie skrócił się: po usunięciu restartowania tras zmieniła się dynamika całego meczu. Naprawę uzasadnia prawidłowe działanie stanów ruchu i ich zegarów, nie obietnica zmniejszenia liczby resetów w każdym meczu. Wcześniejszy pomiar 64 → 29 podań dotyczył innej wersji źródeł i nie jest końcowym wynikiem. Wynik i liczba rzutów w obu próbach z włączonym obserwatorem skanów są identyczne z odpowiednimi meczami bez obserwatora.

Najczęściej rejestrowane odrzucenia dotyczą separacji oraz zejścia z linii podania. Sam licznik odrzuceń nie dowodzi, że należało wykonać odrzucony rzut. Potwierdzonym błędem jest restart stanu ruchu; nie uzasadnia on globalnego łagodzenia wymagań wobec podań.

Poprzedni raport ROUTE-BALANCE opisywał 120 podań na tym seedzie. Od tamtej próby zmieniły się również inne pliki silnika i traitów w workspace. Nie przywracano tych zmian. Kontrola w tym raporcie wyłącza tylko naprawę restartowania cutów na bieżącym kodzie; historyczne 120 podań nie jest jej wynikiem.

## Próby

Kontrola i poprawka: po 8 pełnych meczów, te same seedy (offset 94437), wiatr 20 mph / 90°, standardowa adaptacja AI i rotacja. Walidacja: 8 rozłącznych seedów (offset 182451), standardowo generowana pogoda. Hashe plików silnika, modeli i danych składów zgadzają się między seriami; źródła nie zmieniły się podczas symulacji. Pomiary wykonano z odizolowanej kopii artifacts/engine-audit/reset-snapshot-1788957435171, z manifestem hashy. Równoległe zmiany w głównym workspace nie wchodzą w zakres tej walidacji. Wcześniejsze reset-control/final/validation wykryły zmianę źródeł podczas pomiaru i nie są podstawą końcowych wniosków.

| Wskaźnik | Kontrola | Poprawka | Inne seedy/pogoda |
|---|---:|---:|---:|
| Celne podania (%) | 84.43 | 84.13 | 83.61 |
| Dumpy/swingi wśród prób (%) | 27.30 | 31.99 | 27.34 |
| Straty/punkt | 1.72 | 1.75 | 1.68 |
| Podania/punkt | 11.03 | 11.06 | 10.26 |
| Klatki lotu z nakładaniem sylwetek (%) | 9.83 | 10.01 | 10.25 |
| Bloki/mecz | 18.00 | 17.00 | 14.50 |
| Stall-out/mecz | 0.00 | 0.00 | 0.00 |
| Awaryjne limity | 0.00 | 0.00 | 0.00 |

17 kontrolowanych sytuacji × 2 warstwy × 128 seedów × 2 warianty = 8704 przebiegi. Wyniki chwytów i przyczyny zakończenia są identyczne dla każdej sparowanej próby. Te sytuacje zaczynają się przy wypuszczeniu dysku, więc sprawdzają brak regresji wykonania; błąd przygotowania ataku pokrywają test stanów i pełne mecze.

W zamrożonej kopii przeszły check-reset-cuts, check-player-behavior (33 atrybuty), check-engine-realism (8 meczów fast) i check-disc-flight (4 pełne mecze: 1022 chwyty i 193 straty, w tym kontrola kontaktu i ciągłości pozycji). Targetowany ESLint przeszedł. Produkcyjny build w głównym workspace również przeszedł; nadal ostrzega o dużym bundle.

Nakładanie sylwetek oznacza odsetek klatek IN_FLIGHT z choć jedną nakładającą się parą obrysów, nie faule ani liczbę kolizji. Pomiar nie obejmuje przygotowania rzutu. Czasy pełnych serii uruchamianych równolegle nie służą do porównania wydajności.

## Ograniczenia

canStartCut wykorzystuje liczbę aktywnych cutterów ze wspólnego początku kroku; nie jest ścisłą rezerwacją slotów między kilkoma równocześnie ruszającymi zawodnikami. Pozostaje lokalne omijanie zamiast twardych kolizji oraz uproszczone przewidywanie przeciwników. Brak limitów w próbie nie gwarantuje ich braku dla wszystkich składów i seedów.

## Odtwarzanie

```powershell
Set-Location C:/Users/marod/ultimate-manager-ufa/artifacts/engine-audit/reset-snapshot-1788957435171
node scripts/check-reset-cuts.mjs
node scripts/diagnose-route-limit.mjs --legacy-reset-cuts --scans --output C:/Users/marod/ultimate-manager-ufa/artifacts/engine-audit/reset-locked-before.json
node scripts/diagnose-route-limit.mjs --scans --output C:/Users/marod/ultimate-manager-ufa/artifacts/engine-audit/reset-locked-after.json
node scripts/balance-engine.mjs --fast 0 --full 8 --offset 94437 --wind 20 --direction 90 --legacy-reset-cuts --output C:/Users/marod/ultimate-manager-ufa/artifacts/engine-audit/reset-locked-control.json
node scripts/balance-engine.mjs --fast 0 --full 8 --offset 94437 --wind 20 --direction 90 --output C:/Users/marod/ultimate-manager-ufa/artifacts/engine-audit/reset-locked-final.json
node scripts/balance-engine.mjs --fast 0 --full 8 --offset 182451 --output C:/Users/marod/ultimate-manager-ufa/artifacts/engine-audit/reset-locked-validation.json
node scripts/balance-engine.mjs --situations --n 128 --legacy-reset-cuts --output C:/Users/marod/ultimate-manager-ufa/artifacts/scenarios/reset-locked-control.json
node scripts/balance-engine.mjs --situations --n 128 --output C:/Users/marod/ultimate-manager-ufa/artifacts/scenarios/reset-locked-final.json
Set-Location C:/Users/marod/ultimate-manager-ufa
node scripts/report-reset-balance.mjs
```
