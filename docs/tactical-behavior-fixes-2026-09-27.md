# Poprawki ról i zachowania meczowego

Wprowadzone po audycie z 27.09.2026:

Poniższa próba opisuje etap przed poprawką ciągłości cutów. Kolejny pomiar i szczegóły poprawki: [Primary handler i oferty cutterów](primary-handler-and-cutter-offers-2026-09-27.md).

- Podrole są rozwiązywane dla faktycznej siódemki i formacji na początku punktu. Pełny oraz uproszczony silnik, rejestr modyfikatorów i decyzje korzystają z tej samej mapy. Zapisane preferencje zawodnika nie są nadpisywane.
- Nieaktywny cutter może być odbiorcą bardzo dobrego podania. Filler potrzebuje przed wysokim stallem co najmniej 6,5 m separacji i okna 78/100; dostaje karę 22 punktów do oceny i zauważalności. Przy stallu 8–9 wymagania i kara maleją. Ograniczenia inicjowania cutów oraz liczba miejsc pozostają bez zmian.
- Handlery mają osobne cele boczne, dostosowane do horizontal/motion/zone. Przy dysku u cuttera trzeci handler daje centralną opcję z tyłu. Rozdzielone są także cele resetu w dwuhandlerowych ustawieniach i oferty po pullu.
- W uproszczonym silniku presja stallu zmienia wagi bazowe; modyfikatory formacji, dyrektyw i instrukcji nakładają się przed wspólnym losowaniem również przy stallu 5–9 i błędnej decyzji zawodnika.

Końcowa próba: 14 meczów do 5 punktów, 7 formacji × seedy 92701/92702, 1849 prób rzutu. Porównanie z tymi samymi seedami poprzedniego audytu. Składy demonstracyjne, obrona person, bez adaptacji AI i rotacji. Udziały odnoszą się do odbiorców zdarzeń rzutowych i nie są normalizowane przez czas gry.

| Formacja | Filler przed % | Filler po % | Primary cutter po % | Secondary cutter po % | Rzuty po |
|---|---:|---:|---:|---:|---:|
| vertical_stack | 0.0 | 6.8 | 18.5 | 21.2 | 222 |
| horizontal_stack | 1.1 | 2.0 | 19.2 | 20.7 | 203 |
| split_stack | 0.7 | 8.3 | 16.2 | 17.5 | 303 |
| side_stack | 0.0 | 2.8 | 24.0 | 18.9 | 254 |
| motion_offense | 1.9 | 3.9 | 9.6 | 18.4 | 282 |
| hex_offense | 2.8 | 4.3 | 21.7 | 11.8 | 397 |
| zone_offense | 0.7 | 6.4 | 17.0 | 16.0 | 188 |

W każdej badanej formacji filler pozostał mniej częstym odbiorcą niż primary i secondary cutter. To kontrola regresji na niewielkiej próbie, nie gwarancja rozkładu dla wszystkich składów i sytuacji.

Walidacja: `scripts/test-tactical-behavior-fixes.mjs` sprawdza zgodność ról, instrukcje D-Line po zmianie posiadania, zachowanie zapisu, cele handlerów przy liniach bocznych i po pullu, rzeczywistą decyzję podania do wolnego fillera oraz przeciwne instrukcje przy stallu 1/5/6/7/8/9. `scripts/test-full-no-replay.mjs` sprawdza zgodność wyników z zapisem animacji i bez niego, także przy silnym wietrze. Kompilacja produkcyjna i kontrola zmienionych modułów przeszły. Historyczny skrypt `probe-behavior-gaps-2026-09-27.mjs` opisuje reprodukcje sprzed poprawek; aktualnym testem regresji jest `test-tactical-behavior-fixes.mjs`.
