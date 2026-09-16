# Pull i kolejność cutów

## Podrole i struktura

- Sloty składu zachowują podrole między podaniami. Primary handler jest opcją resetu i dostaje bonus krótkiego powrotnego podania.
- `assignActiveCutters` rezerwuje 1–4 miejsca według `cutConcurrency` taktyki. Primary i secondary rozpoczynają; continuation dołącza po 1,2 s kontynuacji lub 4,5 s oczekiwania, filler po 6,5 s. Trwająca trasa ma pierwszeństwo do zakończenia; po niej jest 1,8 s odpoczynku.
- Nieaktywni wracają do stałego slotu struktury. Nie są opcjami podania. Podanie ponad 16 m wszerz wymaga rozpoczętego cutu.

## Pull

- Domyślnie pulluje zawodnik linii obrony z najwyższym `throwing.pulling`. Brakujące wartości migrują ze średniej huck/backhand, bez zmiany istniejących umiejętności.
- `planPull` oddziela zamiar od wykonania: hanging/roller, docelowa długość i czas lotu. Pullowanie ogranicza maksymalny dystans i zmniejsza błędy kierunku, dystansu i czasu lotu. Wiatr wpływa na zasięg, błąd i wybór typu.
- Obie siódemki startują na liniach zon. Chwyt w polu natychmiast przekazuje grę do zwykłego silnika, z zachowaniem pozycji i prędkości. Chwyt w swojej zonie wymaga dobiegnięcia do linii zonowej, podczas gdy pozostali kontynuują ruch.
- Podczas odbioru stack ustawia się około 10 m dalej. Przez maksymalnie 8 s po chwycie, dopóki obrońcy są ponad 8 m od dysku, handlerzy oferują krótkie podania do przodu i do środka. Po rzucie handler podąża za akcją. Bezpieczna opcja handlera ma krótszy czas decyzji. Dobicie obrony lub strata kończą tę fazę; liczba podań nie jest wymuszana.
- Po upadku dysku formacja ustawia się względem miejsca wznowienia. Gra rusza po dojściu odbierającego do zatrzymanego dysku. Brick jako jedyny czeka także na ustawienie obu formacji.
- Lądowanie poza boiskiem daje brick na środku, 18 m przed własną zoną. Roller lądujący w boisku, a następnie opuszczający je, daje wznowienie dokładnie na linii w punkcie przecięcia toru rollera z granicą; nie daje bricka.
- Odtwarzanie mapuje zawodników na rzeczywiste drużyny i sloty składu, niezależnie od zamiany stron. Nie dodaje fazy przestawiania do klatek zapisanych przez pełny silnik.
- Pełny silnik przekazuje koszt kondycyjny pulla do gry. Tryb szybki używa tego samego wyniku pulla bez zapisu klatek; oferty handlerów są zachowaniem pełnego silnika ruchowego.

## Walidacja

`node scripts/test-pull-and-active-cutters.mjs`: 120 pulli, obie strony, cztery zakończenia, migracja, wybór najlepszego pullera, 160 porównań wykonania tego samego typu, dokładne przecięcia wszystkich krawędzi, widoczność 14 zawodników po zamianie stron i przy tekstowych ID, brak dodatkowego setupu, głębszy stack, oba silniki i ciągłość pozycji.

Model pulla pozostaje uproszczony: parametryczny tor lotu i hamowanie rollera; bez offsides i osobnego modelu upuszczenia łapanego pulla.

Materiały: [strategia pulla i wiatr](https://ultiworld.com/2015/08/11/tuesday-tips-pulling-strategies-for-any-wind/), [odbiór pulla](https://ultiworld.com/2017/05/31/tuesday-tips-field-pull-matters-presented-spin-ultimate/).
