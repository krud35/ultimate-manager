# Pull i kolejność cutów

## Podrole i struktura

- Sloty składu zachowują podrole między podaniami. Primary handler jest opcją resetu i dostaje bonus krótkiego powrotnego podania.
- `assignActiveCutters` rezerwuje 1–4 miejsca według `cutConcurrency` taktyki. Otwarcie po pullu ma kolejność primary → secondary → continuation. Przy zwykłym kolejnym chwycie continuation dostaje pierwszeństwo w pierwszych 700 ms. Filler pozostaje ostatnią opcją; nowy cut może zacząć dopiero po 6,5 s. Trwająca trasa ma pierwszeństwo do zakończenia; po niej jest 1,8 s odpoczynku.
- Nieaktywni wracają do stałego slotu struktury. Mogą otrzymać bardzo dobre podanie z niskim priorytetem; filler wymaga szczególnie dobrego okna i separacji. Przygotowanie otwarcia (`PREPARING_CUT`) nie jest jeszcze ofertą do podania.

## Pull

- Domyślnie pulluje zawodnik linii obrony z najwyższym `throwing.pulling`. Odbiera reset handler (przy kilku: najlepiej czytający dysk); bez tej roli pierwszeństwo ma primary handler. Role pochodzą z aktualnych slotów siódemki. Brakujące wartości pulling migrują ze średniej huck/backhand, bez zmiany istniejących umiejętności.
- `planPull` oddziela zamiar od wykonania: hanging/roller, docelowa długość i czas lotu. Pullowanie ogranicza maksymalny dystans i zmniejsza błędy kierunku, dystansu i czasu lotu. Wiatr wpływa na zasięg, błąd i wybór typu.
- Obie siódemki startują na liniach zon. Chwyt w boisku, także we własnej zonie, natychmiast przekazuje grę do zwykłego silnika w miejscu przejęcia dysku. Odbierający ustanawia nieruchomy pivot; pozostali zachowują pozycje i prędkości. Dysk, który upadł i pozostał w boisku, jest podnoszony w miejscu zatrzymania, również we własnej zonie. Nie ma automatycznego przenoszenia dysku do linii zonowej (WFDF 7.9–7.10).
- Podczas odbioru stack ustawia się około 10 m dalej. Primary handler oferuje środkowanie, 5 m przed dyskiem; reset handlerzy zajmują osobne boczne pasy około 7 m przed dyskiem. Pierwsze bezpieczne podanie od reset handlera do primary handlera otrzymuje premię do oceny i uwagi rzucającego (zasięg do 22 m, separacja co najmniej 4 m, okno co najmniej 60/100). Nadal obowiązuje ocena toru i wykonalności podania.
- Od przejęcia pulla cutterzy mogą wybierać cel i lokalnie przygotowywać wyjście; zawodnik z cechą „Cutter ze zwodem” może wykonać zwód przed środkowaniem. Nie biegną jeszcze pełnej trasy odbioru i zostawiają otwarty korytarz podania do PH. Primary może przejść do właściwego cutu w ostatnich 450 ms lotu środkowania albo po chwycie PH. Secondary dostaje sygnał najwcześniej 350 ms po rzeczywistym starcie primary, continuation po secondary; nadal obowiązuje limit równoległych tras formacji. Przygotowanie, cel i zwód są zachowane między podaniami.
- To preferowany schemat otwarcia, z awaryjnym wyjściem przy stallu 4 lub po 5 s bez środkowania. Niedostępny zawodnik (np. kondycja poniżej 40) nie blokuje kolejnych. Sekwencja otwarcia kończy się po uruchomieniu kolejki albo po 5 s fazy ofert; strata kończy ją natychmiast. Jest niezależna od dłuższej fazy rozgrywania handlerów przed dobiegnięciem obrony.
- Po chwycie lub podniesieniu pulla pozostającego w boisku handlerzy wykorzystują krótkie podania do przodu i do środka, dopóki obrona jest ponad 8 m od dysku lub planowanego miejsca kolejnego chwytu. Nie ma limitu ośmiu sekund ani narzuconej liczby podań. Po rzucie handler podąża za akcją; bezpieczna opcja handlera ma krótszy czas decyzji. Dobiegnięcie obrony albo strata kończą tę fazę bez ponownego włączenia przy późniejszym oddaleniu obrońców. Brick i wyjście dysku poza boisko nie uruchamiają tej fazy.
- Po upadku dysku formacja ustawia się względem miejsca wznowienia. Gra rusza po dojściu odbierającego do zatrzymanego dysku. Brick jako jedyny czeka także na ustawienie obu formacji.
- Lądowanie poza boiskiem daje brick na środku, 18 m przed własną zoną. Roller lądujący w boisku, a następnie opuszczający je bez dotknięcia ataku, daje wznowienie w punkcie wyjścia; gdy ten punkt znajduje się we własnej zonie, pivot jest przesuwany do najbliższego miejsca w strefie centralnej (WFDF 7.11). Nie daje bricka.
- Odtwarzanie mapuje zawodników na rzeczywiste drużyny i sloty składu, niezależnie od zamiany stron. Nie dodaje fazy przestawiania do klatek zapisanych przez pełny silnik.
- Pełny silnik przekazuje koszt kondycyjny pulla do gry. Tryb szybki używa tego samego wyniku pulla bez zapisu klatek; oferty handlerów są zachowaniem pełnego silnika ruchowego.

## Walidacja

`node scripts/test-pull-and-active-cutters.mjs`: 120 pulli, obie strony, cztery zakończenia, migracja, wybór najlepszego pullera, 160 porównań wykonania tego samego typu, dokładne przecięcia wszystkich krawędzi, widoczność 14 zawodników po zamianie stron i przy tekstowych ID, brak dodatkowego setupu, głębszy stack, oba silniki i ciągłość pozycji.

`node scripts/test-pull-handler-flow.mjs`: centralna oferta PH i rozdzielone pasy wsparcia przy obu liniach bocznych, faktyczny wybór otwartego PH przez RH, szybkie wypuszczenie oraz zakończenie fazy pod presją. Próba 14 punktów (7 formacji × 2 kierunki), wyniki w `artifacts/pull-handler-flow/points.json`; to mała próba diagnostyczna, bez gwarancji konkretnej sekwencji w każdym punkcie.

`node scripts/test-pull-cut-timing.mjs`: kolejność primary → secondary → continuation, przygotowanie i zwód bez przedwczesnej oferty, sygnał w końcówce środkowania, odstęp między ofertami oraz wyjście awaryjne. Pełne akcje obejmują vertical, horizontal, hex i side stack w obu kierunkach ataku; zapis czasu pierwszych cutów w `artifacts/pull-cut-timing/points.json`.

Model pulla pozostaje uproszczony: parametryczny tor lotu i hamowanie rollera; bez offsides i osobnego modelu upuszczenia łapanego pulla.

Materiały: [WFDF 2025–2028, przepisy 7.9–7.11](https://ultimate.dfsu.dk/wp-content/uploads/2025/01/WFDF-Rules-of-Ultimate-2025-2028-Track-Changes.pdf), [strategia pulla i wiatr](https://ultiworld.com/2015/08/11/tuesday-tips-pulling-strategies-for-any-wind/), [odbiór pulla](https://ultiworld.com/2017/05/31/tuesday-tips-field-pull-matters-presented-spin-ultimate/).
