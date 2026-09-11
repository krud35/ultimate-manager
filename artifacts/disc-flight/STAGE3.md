# Etap 3 — dobieg do miejsca przechwytu

2026-09-09. Pełny silnik wybiera teraz osiągalny punkt na przewidywanym torze dysku. Obejmuje to odbiorcę, głównego obrońcę i obrońców decydujących o przechwycie poza własnym kryciem.

## Zachowanie

- Zawodnik rozpatruje przyszłe punkty toru, zamiast zawsze zmierzać do końcowego celu podania. Wybiera najwcześniejszy punkt, do którego według jego oceny może dobiec. Jeżeli żaden nie jest osiągalny, podejmuje próbę o najmniejszym przewidywanym spóźnieniu.
- Czas dobiegu uwzględnia obecną prędkość, jej kierunek, przyspieszenie i koszt skrętu. Parametry przyspieszenia i skrętu pochodzą z istniejącego modelu ruchu. Chwyt nie wymaga zatrzymania w miejscu.
- Ocena pionowego zasięgu jest zachowawcza: nie zakłada idealnego przyszłego skoku. Wybrany punkt nie gwarantuje chwytu — ruch i kontakt są nadal rozstrzygane przez dotychczasowy integrator oraz detektor kontaktu.
- Cel jest aktualizowany co 200 ms lub po upływie wybranego terminu przechwytu. Zawodnik początkowo kieruje się planowanym torem, potem stopniowo rozpoznaje błąd wykonania. Reakcje sterują opóźnieniem, a widzenie gry tempem tego odczytu.
- Decyzja o porzuceniu krycia porównuje osiągalne terminy kontaktu obrońcy i odbiorcy. Nie porównuje już tylko odległości obu graczy od końcowego celu podania. Dotychczasowa szansa zauważenia okazji pozostaje aktywna.

## Wyniki

Ta sama próba: 8 meczów fast, 4 pełne; offset seedów 7400, wiatr 20 mph / 0°, zablokowana pogoda, stała taktyka i normalne rotacje. [Przed](stage3-before.json), [po](stage3-after.json).

| Pełny silnik | Przed | Po |
|---|---:|---:|
| Celne podania | 73,63% | 80,95% |
| Straty na punkt | 2,323 | 1,874 |
| Bloki na mecz | 8,25 | 11,25 |
| Dropy na mecz | 5,50 | 5,50 |
| Niecelne podania na mecz | 40,25 | 31,50 |
| Czas obliczeń na mecz | 5,16 s | 6,64 s |

Nowe planowanie poprawiło skuteczność w tej próbie, ale pozostało wiele strat bez kontaktu. Jest to mała próba, nie ostateczna kalibracja realizmu. Zmieniony przebieg i długość meczów nie pozwalają przypisać całego wzrostu czasu samemu kosztowi planowania. Fast zachował agregaty wynikowe próby.

## Kontrole

`scripts/check-disc-intercept.mjs` sprawdza koszt nawrotu, wpływ przyspieszenia, wcześniejszy przechwyt zamiast dobiegu do końca toru, symetrię po obrocie boiska, punkty poza zasięgiem oraz brak natychmiastowej wiedzy o błędzie rzutu i częstotliwość odczytu. Przeszły też kontrole dotychczasowych regresji silnika, ESLint zmienionych plików oraz budowanie aplikacji z weryfikacją eksportów. Kontrola śladów 4 pełnych meczów przeszła: 716 chwytów i 221 strat, bez naruszeń sprawdzanej ciągłości ruchu oraz zgodności kontaktów i zdarzeń.

## Ograniczenia

- Czas dobiegu jest przybliżeniem analitycznym; nie symuluje wszystkich przyszłych kroków, przeszkód i kontaktów między zawodnikami. Próbkowanie kandydatów co 120 ms może pominąć krótkie okno przechwytu.
- Odczyt lotu to nadal interpolacja między planem a rzeczywistym torem, nie pełny model obserwacji. Gracze nie mają osobnych błędów oceny wiatru ani modelu kierunku patrzenia.
- Przyszły wyskok, poziomy layout, chwyt przez innego atakującego i ponowne zagranie po zbiciu pozostają do opracowania. Nie rozszerzano koperty chwytu w celu podbicia skuteczności.
- Pozostają wcześniejsze zależności prędkości pościgu od roli i statystyk, a także mnożnik prędkości obrońcy od abstrakcyjnej separacji. Wymagają odrębnego uporządkowania przy przebudowie zachowania i atrybutów.
- Wiatr nadal korzysta z modelu dryfu z etapu 1. Następnym etapem geometrii dysku jest odpowiedź na prędkość powietrza względem dysku i kontynuacja lotu po minięciu punktu dostarczenia. Nie wdrożono jeszcze pełnej aerodynamiki ani przebudowy atrybutów.
