# Pull i kolejność cutów

- Sloty składu zachowują podrole między podaniami. Primary handler jest opcją resetu i dostaje bonus krótkiego powrotnego podania.
- `assignActiveCutters` rezerwuje 1–4 miejsca według `cutConcurrency` taktyki. Primary i secondary rozpoczynają; continuation dołącza po 1,2 s kontynuacji lub 4,5 s oczekiwania, filler po 6,5 s. Trwająca trasa ma pierwszeństwo do zakończenia; po niej jest 1,8 s odpoczynku.
- Nieaktywni wracają do stałego slotu struktury. Nie są opcjami podania. Podanie ponad 16 m wszerz wymaga rozpoczętego cutu.
- Pull wybiera najlepszego pullera z linii obrony. Nowe `throwing.pulling` migruje ze średniej huck/backhand, zachowując istniejące wartości umiejętności.
- Obie linie startują na liniach zon. Zasięg, czas lotu i błąd uwzględniają pullowanie oraz wiatr. Są wysokie pulle i rollery. Odbierający próbuje chwycić opadający dysk; po upadku podnosi go po zatrzymaniu. Pull lądujący poza boiskiem daje brick na środku, 18 m przed własną zoną. Dysk w swojej zonie jest wprowadzany z linii zonowej. Offsides nie są modelowane.
- Pełny silnik zapisuje fazę pulla do odtwarzania i przekazuje końcowe pozycje oraz koszt kondycyjny do gry. Tryb szybki używa tego samego wyniku pulla bez zapisu klatek.

Walidacja: `node scripts/test-pull-and-active-cutters.mjs` (120 pulli, obie strony, wpływ umiejętności, trzy zakończenia, migracja, limit cutterów, oczekiwanie w strukturze, oba silniki i ciągłość pozycji).

Model pulla jest uproszczony: parametryczny tor lotu i hamowanie rollera; bez offsides i osobnego modelu upuszczenia łapanego pulla.

Materiały: [strategia pulla i wiatr](https://ultiworld.com/2015/08/11/tuesday-tips-pulling-strategies-for-any-wind/), [odbiór pulla](https://ultiworld.com/2017/05/31/tuesday-tips-field-pull-matters-presented-spin-ultimate/).
