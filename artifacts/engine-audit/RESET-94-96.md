# Resety 94–96% — kalibracja 2026-09-09

Końcowa walidacja: **94.54%**, 727/769 resetów w 12 pełnych meczach. Wszystkie podania: 93.24%.

Ogólne completion przekracza wcześniejszą górną granicę 93% o 0.24 punktu procentowego. Cel resetów został osiągnięty; poprzednie pasmo wszystkich podań nie zostało ściśle utrzymane w tej próbce.

Fast bez zmiany parametrów: 94.24%, 1423/1510 resetów w 32 meczach (control + fast-validation + defaults).

Pasmo dotyczy agregatu podań sklasyfikowanych jako dump_swing, nie każdego pojedynczego meczu ani wyłącznie zawodników z rolą dump. Klasyfikacji podań nie zmieniono.

| Próba | Tryb | Mecze | Resety udane/próby | Reset completion | Wszystkie podania | Limity punktów |
|---|---|---:|---:|---:|---:|---:|
| control | fast | 8 | 359/375 | 95.73% | 90.78% | 0 |
| control | full | 4 | 210/239 | 87.87% | 90.02% | 0 |
| safe | full | 4 | 259/288 | 89.93% | 90.23% | 0 |
| layout | full | 4 | 270/271 | 99.63% | 93.65% | 0 |
| combined | full | 4 | 242/248 | 97.58% | 95.75% | 0 |
| execution | full | 4 | 215/218 | 98.62% | 94.71% | 0 |
| moderate | full | 4 | 224/230 | 97.39% | 95.45% | 0 |
| errors14 | full | 2 | 137/145 | 94.48% | 92.79% | 0 |
| errors10 | full | 2 | 148/154 | 96.10% | 93.68% | 0 |
| validation | full | 8 | 482/526 | 91.63% | 92.04% | 0 |
| defaults | fast | 8 | 324/349 | 92.84% | 90.74% | 0 |
| defaults | full | 4 | 206/221 | 93.21% | 92.17% | 0 |
| validation-v2 | full | 8 | 470/498 | 94.38% | 93.66% | 0 |
| defaults-v2 | full | 4 | 257/271 | 94.83% | 92.44% | 0 |
| fast-validation | fast | 16 | 740/786 | 94.15% | 91.12% | 0 |

## Diagnoza

W próbie kontrolnej: 239 resetów, 29 strat — 14 bez kontaktu, 7 outów, 5 dropów i 3 bloki. W 11 z 14 minięć odbiorca znajdował się nad ziemią przy niskim dysku przed upływem 1.2 s. Ten wskaźnik jest poszlaką, a nie samodzielnym dowodem przyczyny każdej straty.
Konkretny reset 5.64 m, seed 742459: celowanie bez błędu, świeża obserwacja, odbiorca przewiduje osiągalny chwyt. Mimo to wykonuje layout przy dysku około 1 m nad ziemią; lot ciała utrwala prędkość i odbiorca mija okno chwytu. Stary warunek oceniał odległość do bieżącej pozycji dysku, pomijając możliwość zwykłego dobiegu do nadlatującego podania.

## Zmiana mechaniki

Ofensywny layout wymaga teraz, żeby przewidywany zwykły chwyt był nieosiągalny. Gdy zawodnik przewiduje chwyt w biegu, kontynuuje bieg i może korygować kierunek. Nadal może wykonać ratunkowy layout po pogorszeniu sytuacji; obrońca może atakować dysk przed odbiorcą. Zasięg chwytu, geometria kontaktu i losowanie skuteczności nie zostały powiększone.
Eksperyment safe osobno ograniczał niepewność pamięci odbiorcy, wymagał zapasu prędkości i kontaktu przed planowanym końcem dostarczenia; combined łączył go z poprawką layoutów. Ten dodatkowy filtr nie trafił do końcowego kodu. Po usunięciu zbędnych layoutów sama poprawka dała 99.63% resetów i 93.65% wszystkich podań w kalibracji. Sprawdzono więc większy rozrzut sytuacyjny: execution (próg 12, nachylenie 0.14) oraz moderate (próg 8, nachylenie 0.08). To błąd punktu dostarczenia zależny od marginesu wykonania, nie automatyczne losowanie straty. Wybrane ustawienia są zapisane poniżej i w każdym artefakcie JSON.

Wariant errors14 osiągnął cel w pilocie (94.48%), lecz w 12 kolejnych meczach dał tylko 92.10% resetów. W 46 z 59 strat resetów odnotowano błąd celowania. Nie zaakceptowano tego wyniku; częstotliwość pomyłek obniżono i wykonano walidację v2 na kolejnych, rozłącznych seedach.

Ostatecznie przywrócono próg 12 i nachylenie 0.14 m/punkt oraz skalibrowano sporadyczne błędy wykonania: szansa przy throwing 60 wynosi 9%, przy 80 około 5%, przy 95 około 2%; wielkość pomyłki 1.8–4 m, z zachowaniem limitu 40% długości podania. To szansa pomyłki, nie straty — odbiorca może skorygować bieg i złapać niedokładny rzut. Dotyczy całego geometrycznego silnika, bo poprzednia bardzo łagodna kalibracja częściowo kompensowała wadliwe layouty. Fast nie używa computeMissDistanceM i zachowuje dotychczasową kalibrację.

```json
{
  "block": {
    "spatialPressure": true,
    "selectContact": true,
    "deflectionReaction": true,
    "interceptions": true,
    "baseChance": 0.05,
    "skillSpan": 0.14,
    "edgePenalty": 0.65,
    "hardSpeedMps": 21,
    "easySpeedMps": 8
  },
  "deflection": {
    "controlledSwat": true
  },
  "fatigue": {
    "singleExecution": true,
    "maximumPenalty": 24,
    "exponent": 1.5
  },
  "approach": {
    "enabled": true,
    "arrivalLeadSec": 0.15,
    "stopBufferM": 0.08,
    "readDelayScale": 1,
    "interceptJumpClock": true,
    "readIntervalMs": 80,
    "readBlendScale": 0.5,
    "purposefulLayout": true
  },
  "bodyTraffic": {
    "enabled": true,
    "planning": true,
    "offBall": true,
    "clearanceM": 0.12,
    "lookAheadSec": 0.5
  },
  "resetCuts": {
    "stable": true
  },
  "arrival": {
    "kinematics": true,
    "observationRisk": true,
    "horizonSec": 0.8,
    "maxUncertaintyM": 0.5
  },
  "miss": {
    "cleanMargin": 12,
    "missPerMarginPoint": 0.14,
    "maxMissM": 15,
    "missDistanceFractionCap": 0.4,
    "missChanceAtPivot": 0.09,
    "minMissChance": 0.015,
    "skillMissPivot": 60,
    "skillMissSpan": 45,
    "errorMissMinM": 1.8,
    "errorMissSpanM": 2.2
  },
  "fast": {
    "skillMult": 1,
    "gapOffset": -6,
    "advanceMult": 0.8,
    "windMult": 1,
    "windSkillSlope": 0,
    "windSkillRef": 83,
    "lateralFrac": 0.45
  }
}
```

## Pozostałe typy podań

| Typ | Udane/próby | Completion |
|---|---:|---:|
| standard | 1952/2078 | 93.94% |
| dump_swing | 727/769 | 94.54% |
| huck | 228/270 | 84.44% |
| over_the_top | 18/20 | 90.00% |

Rozpoznania strat resetów w walidacji: {"completed":727,"unknown_no_contact":29,"boundary":7,"block":6}. unknown_no_contact nie przesądza o przyczynie.

## Metoda i ograniczenia

Osobne seedy kalibracyjne i walidacyjne, zamrożone kopie źródeł, pełne mecze z rotacjami i adaptacją taktyki. Każdy artefakt przechowuje konfigurację, hashe kodu, argumenty i pustą listę changedDuringRun. Defaults sprawdza ustawienia domyślne bez flag strojących.
Kontrolowane 17 sytuacji ×2 warstwy ×128 losowań. Poniżej warstwa wykonania dla końcowej kalibracji. Spadek skuteczności względem samej poprawki layoutu wynika z przywróconych błędów wykonania, szczególnie u zmęczonego rzucającego. Test regresji odtwarza niepotrzebny layout, potwierdza bieg do osiągalnego podania oraz dostępność ratunkowego i obronnego layoutu. Test błędu rzutu sprawdza narastanie przesunięcia przy gorszym marginesie, limit odchylenia oraz malejącą częstość pomyłek dla wyższego throwing.

Sprawdzenie geometrii 4 dodatkowych meczów dla wariantu błędów 0.14: 1090 chwytów i 85 strat; poprawne kontakty, ciągłość ruchu i brak sztucznych zakończeń punktów. Końcowa korekta 0.14 →0.09 zmienia tylko częstość pomyłek celowania. Sprawdzenia dobiegu, percepcji, omijania, resetów, 33 atrybutów i realizmu oraz ESLint: OK. Produkcyjny build: OK, z ostrzeżeniem o dużych chunkach.

| Sytuacja | Udane/próby |
|---|---:|
| incut | 126/128 |
| reset | 125/128 |
| turn_toward | 127/128 |
| turn_away | 126/128 |
| double_coverage | 114/128 |
| deep_open | 127/128 |
| sideline | 127/128 |
| returning_arc | 128/128 |
| outside | 0/128 |
| toe_in | 128/128 |
| toe_out | 0/128 |
| tip_recovery | 128/128 |
| wind_0 | 128/128 |
| wind_90 | 125/128 |
| wind_180 | 127/128 |
| aim_error_reset | 127/128 |
| fatigued_incut | 117/128 |

Cel jest parametrem projektu. Próbka dotyczy drużyn demonstracyjnych i nie potwierdza całego rozkładu skuteczności we wszystkich ligach, ustawieniach i poziomach umiejętności.

Odtworzenie raportu: `node scripts/report-reset95.mjs`. Dokładne polecenia symulacji znajdują się w balance.args plików reset95-*.json.
