# Nieudane podanie: Conor Belfield → Derek Mourad

Mecz seed 105437, punkt 4, zdarzenie 101. Pierwsza chronologicznie strata poniżej 10 m z diagnozą unknown_no_contact; w tym meczu znaleziono 10 takich strat. Analiza zamrożonego kodu reset-snapshot-1788957435171, nie późniejszych zmian workspace.

Backhand, 9.18 m, odbiorca oceniony jako otwarty, wiatr boczny 20 mph / 90°. Dysk wypuszczono po 1460 ms przygotowania. Ślad posługuje się współrzędnymi lokalnymi akcji; wewnętrzne home/away nie są tu nazwami klubów.

## Fakty

Plan miał status reachable i zapas czasu około 58.53 ms. Obserwacja odbiorcy pochodziła sprzed 680 ms. Zapamiętany punkt: (55.50, 26.22), rzeczywisty w chwili wyrzutu: (55.55, 27.65), różnica 1.43 m. Zapamiętana prędkość 2.22 m/s, rzeczywista 5.11 m/s.

Wykonanie przesunęło punkt zadany o 1.38 m. Diagnostyka zapisuje wpływ wiatru i błąd łuku; kara za zmęczenie wykonania oraz presja marka wynosiły zero. Nie wolno przypisać całego odchylenia samemu wiatrowi bez kontrfaktycznego odtworzenia wykonania.

| Czas od wyrzutu | Odbiorca x, y | Dysk x, y, z | Przewidywany czas kontaktu | Osiągalny według odbiorcy |
|---|---|---|---|---|
| 0 ms | 55.55, 27.65 | 64.76, 30.41, 1.10 | 580 ms | tak |
| 200 ms | 55.66, 28.73 | 61.33, 29.32, 1.56 | 580 ms | tak |
| 400 ms | 55.92, 29.83 | 58.37, 29.30, 1.70 | 580 ms | tak |
| 580 ms | 56.14, 30.54 | 56.16, 29.07, 1.56 | 3706 ms | nie |
| 3180 ms | 46.24, 25.72 | 41.11, 23.71, 0.05 | 3200 ms | nie |
| 3220 ms | 45.99, 25.62 | 41.04, 23.73, 0.00 | 3240 ms | nie |

Najbliższa próbka geometrii kontaktu: 560 ms po wyrzucie. Odległość pozioma dysk–środek zawodnika 1.38 m, zasięg poziomy na tej wysokości 1.01 m, brakujące 0.37 m. Zasięg obliczono tą samą elipsoidą co w silniku. Ponowne sprawdzenie ciągłych odcinków między klatkami funkcją firstDiscContact: 0 kontaktów. Nie jest to przeoczenie kontaktu pomiędzy dwoma tickami.

Brak dotknięć dysku, brak bloków i prób utrzymania chwytu, bodyAvoidanceTicks=0. Przy około 580 ms dysk minął odbiorcę; ten pobiegł za dalszym lotem. Tor kończący się przy x≈41 m jest kontynuacją lotu po minięciu okna chwytu, nie dowodem błędu celowania o ponad 20 m.

## Interpretacja kodu

Rzucający ponownie skanuje przed wypuszczeniem, ale skan może zwrócić starą obserwację z pamięci. actionSimulator wybiera option.agent przed bieżącym agentem. Stąd reachable dotyczy stanu percepcyjnego, a nie gwarancji fizycznego dobiegu. Sam brak wszechwiedzy jest poprawny; ryzyko starej obserwacji nie powinno znikać z oceny krótkiego okna chwytu.

Odbiorca widzi dysk w zapisanych odczytach. Do 400 ms planer nadal uznaje kontakt w 580 ms za osiągalny, choć zawodnik biegnie w kierunku rosnącego y i następnie mija linię lotu. interceptTravelSec zwraca zero, gdy cel znajduje się już w zasięgu, zanim uwzględni bieżącą prędkość. Poza zasięgiem przybliża dobieg, lecz nie symuluje wyhamowania w oknie chwytu. Integrator faktycznego ruchu zachowuje bezwładność i ograniczone hamowanie. To zidentyfikowana rozbieżność planera i wykonania, wymagająca odrębnej próby poprawki.

## Wniosek i kierunek poprawki

Potwierdzone zakończenie: dysk minął zasięg odbiorcy, bez udziału obrońcy w kontakcie. Współwystępują stara obserwacja rzucającego, odchylenie wykonania i przeszacowane okno przechwytu przy ruchu odbiorcy. Ten zapis nie rozstrzyga procentowego udziału każdego czynnika ani nie dowodzi, że idealne wykonanie gwarantowałoby chwyt.

Najpierw należy sprawdzić dynamiczny zasięg przechwytu: czy przy aktualnej prędkości zawodnik może wyhamować lub przeciąć tor w konkretnym oknie czasowym. Następnie uwzględnić wiek obserwacji przy akceptacji krótkiego podania. Nie uzasadnia to zwiększenia promienia chwytu ani globalnego obniżenia losowości. W tym zadaniu nie zmieniano mechaniki silnika.

Odtwarzanie: node scripts/analyze-failed-pass.mjs, następnie node scripts/report-failed-pass.mjs. failed-pass.json zawiera pełne klatki, a failed-pass-evidence.json obliczenia geometrii.
