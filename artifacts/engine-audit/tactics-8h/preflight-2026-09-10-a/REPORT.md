# Audyt taktyk i archetypów AI

Status: FINISHED. Integralność: PASS.
Czas aktywny: 0.25 min. Wyniki zapisane: 8.

## Pokrycie

| Moduł | Zapisane | Ukończone | Zaplanowane |
|---|---:|---:|---:|
| integrity | 4 | 4 | 4 |
| controls | 1 | 1 | 1 |
| matrix | 1 | 1 | 1 |
| coaches | 1 | 1 | 1 |
| adaptation | 1 | 1 | 1 |
| development | 0 | 0 | 0 |
| validation | 0 | 0 | 0 |
| holdout | 0 | 0 | 0 |

## Obecne archetypy — screening

| Trener | Pełne pary | Completion % | Punkty / posiadania % |
|---|---:|---:|---:|
| Cierpliwy kontroler | 0 | — | — |
| Tempo / flow | 0 | — | — |
| Deep gambler | 0 | — | — |
| Architekt strefy | 0 | — | — |
| Kreatywne iso | 0 | — | — |
| Zrównoważony pro | 0 | — | — |
| Grind D-first | 0 | — | — |
| Pułapka i kontra | 0 | — | — |
| Weteran / grinder | 0 | — | — |
| Łowca głębi | 0 | — | — |
| Chaos strefowy | 0 | — | — |
| Cup control | 0 | — | — |
| Prowokator | 0 | — | — |
| Systemowiec | 0 | — | — |
| Geniusz taktyczny | 0 | — | — |

## Finał na odrębnych danych

| Profil | Pełne pary | Completion % | Resety % | Punkty / posiadania % |
|---|---:|---:|---:|---:|

Średnie opisowe obejmują ukończone zadania; przedziały i kontrasty wyłącznie kompletne pary. Nie ogłaszamy zwycięzcy na podstawie samego completion ani nie utożsamiamy braku istotności z brakiem działania.

## Granice wnioskowania

- Automatyczne metryki przestrzeni są wskaźnikami wymagającymi oceny powtórek, nie niezależnym sędzią poprawności decyzji.
- Kontrole i macierz korzystają z produkcyjnych punktów: przejścia i ustalony atak pojawiają się naturalnie. Brak gwarancji 16 niezależnych okazji każdego rodzaju w każdej komórce.
- Kandydaci są ograniczonymi konfiguracjami istniejących mechanik oraz polityką stabilności. Brakujące mechaniki nie otrzymują fikcyjnych wyników.
- Selekcja jest eksploracyjna na podstawie skuteczności posiadania, najgorszego bloku i różnorodności rodzin. Sygnatura intencji wymaga końcowego przeglądu; brak automatycznej promocji.
- Próby syntetycznej adaptacji pokazują reakcję na agregaty. Dobry drop i zła decyzja nie są dziś rozróżniane przez niezależną geometryczną ocenę trenera.
- Kontrola losowej adaptacji ma stałą częstość 25%, nie częstość idealnie dopasowaną do każdego trenera.
- Kontrasty są eksploracyjne, bez automatycznych deklaracji istotności po wielu porównaniach. Nie przeprowadzono zewnętrznej walidacji na danych prawdziwych meczów.
- Brak pełnej serializacji sesji: przerwany mecz wznawiany od tego samego seeda, z archiwizacją próby i zachowaniem zużytego czasu.

Pełne ustawienia wejściowe, użyte taktyki, efektywne dyrektywy, stany adaptacji i geometria są w plikach jobs oraz replays. Raport wymaga końcowej interpretacji i przeglądu powtórek; żaden kandydat nie został wdrożony.
