# Audyt taktyk i archetypów AI

Status: FINISHED. Integralność: PASS.
Czas aktywny: 455.89 min. Wyniki zapisane: 7266.

## Pokrycie

| Moduł | Zapisane | Ukończone | Zaplanowane |
|---|---:|---:|---:|
| integrity | 4 | 4 | 4 |
| controls | 2150 | 2150 | 6320 |
| matrix | 1120 | 1120 | 1120 |
| coaches | 240 | 239 | 240 |
| adaptation | 968 | 968 | 968 |
| development | 1918 | 1918 | 4096 |
| validation | 652 | 652 | 768 |
| holdout | 214 | 212 | 1536 |

## Obecne archetypy — screening

| Trener | Pełne pary | Completion % | Punkty / posiadania % |
|---|---:|---:|---:|
| Cierpliwy kontroler | 8 | 93.63 | 45.28 |
| Tempo / flow | 7 | 94.00 | 60.06 |
| Deep gambler | 8 | 93.61 | 58.77 |
| Architekt strefy | 8 | 92.62 | 53.80 |
| Kreatywne iso | 8 | 92.87 | 61.82 |
| Zrównoważony pro | 8 | 93.29 | 59.50 |
| Grind D-first | 8 | 94.53 | 50.82 |
| Pułapka i kontra | 8 | 94.12 | 54.22 |
| Weteran / grinder | 8 | 93.48 | 44.01 |
| Łowca głębi | 8 | 93.24 | 56.59 |
| Chaos strefowy | 8 | 94.21 | 50.87 |
| Cup control | 8 | 93.07 | 48.79 |
| Prowokator | 8 | 93.86 | 65.23 |
| Systemowiec | 8 | 94.71 | 52.77 |
| Geniusz taktyczny | 8 | 92.67 | 51.64 |

## Finał na odrębnych danych

| Profil | Pełne pary | Completion % | Resety % | Punkty / posiadania % |
|---|---:|---:|---:|---:|
| deep-4 | 18 | 93.11 | 94.93 | 58.55 |
| isolation-5 | 18 | 93.87 | 96.55 | 67.10 |
| pragmatic-4 | 17 | 93.75 | 95.30 | 60.32 |
| reference-balanced | 18 | 92.85 | 92.91 | 60.57 |
| reference-mastermind | 17 | 93.11 | 94.64 | 55.87 |
| zone-6 | 17 | 92.45 | 93.97 | 46.88 |

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
