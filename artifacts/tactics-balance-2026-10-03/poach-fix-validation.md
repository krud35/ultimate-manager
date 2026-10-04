# Naprawa reset-poachu i no_poach — 2026-10-03

Wdrożona po zakończeniu pomiaru bazowego o 06:00 Europe/Warsaw. Nie zmieniono snapshotu ani wyników bazowych. Zmiany naprawiają działanie instrukcji, bez bonusów do wyników lub zmian wag taktyk na podstawie winrate.

## Zmiana zachowania

- `defenderBrain`: rozpoczęcie reset-poachu przechodzi natychmiast przez aktywną ścieżkę ruchu. Wcześniej stan ustawiano poniżej tej ścieżki, po czym zwrot normalnego krycia kasował timer i flagę. Czas wynika z dotychczasowego okna 2–4 s, zagrożenia lane, stalla i compliance; po jego upływie wraca normalne krycie. Flaga raz na posiadanie przetrwa powrót do krycia.
- `actionSimulator`: snapshot przenosi `resetPoachDone` do kolejnej akcji, jeżeli zawodnik nadal broni. Turnover zmienia rolę i kasuje flagę. Timer aktywnego wypadu nie jest przenoszony przez podanie — nowe położenie dysku kończy dotychczasowe okno, a flaga zapobiega ponownemu porzucaniu krycia po każdym podaniu tej samej drużyny.
- `coachDirectives`: osobiste `no_poach` usuwa zachętę drużyny, ale zachowuje jej istniejący zakaz wraz z progiem compliance. Dodatnie `poach` nadal świadomie wypiera zakaz drużyny.
- `playerInstructions` / `tacticsBehavior`: `noPoachBias` odpowiada compliance tej konkretnej instrukcji; zgodny zawodnik nie opuszcza lane, słabiej zgodny nadal ma ograniczoną szansę samowolnej decyzji. Zastosowano istniejący próg 0.55 z dyrektywy zakazu. Osobisty zakaz działa również na reset-poach: powyżej progu blokuje/kończy wypad, poniżej skraca okno. Nie zmienia percepcji, cushionu ani niezależnego `helpDeep`.

## Walidacja deterministyczna

`node scripts/test-tactics-poach-regression.mjs` — PASS:

- Pierwszy tick reset-poachu rzeczywiście porusza zawodnika w lane i zachowuje timer/flagę. W scenie compliance 0.73 timer wynosi 2628 ms, 132 ticki są POACHING, pierwszy tick powrotu następuje w 2640 ms. Po ruchu krytego zawodnika obrońca odzyskuje krycie, do końca 16 s nie ponawia reset-poachu.
- Aktualny `isDump` i zastępczy `fieldRole=dump` uruchamiają dyrektywę. Zawodnik niebędący resetem, dystans >14 m, marker rzucającego oraz wyłączona dyrektywa nie inicjują reset-poachu.
- Osobisty zakaz blokuje nowy i przerywa już aktywny poach przy wysokim compliance. Trzy sceny słabszego compliance zachowują niezerowy, krótszy wypad.
- `helpDeep=1` pod zakazem nadal przesuwa obrońcę głębiej niż `helpDeep=-1`. Trajektoria helpDeep jest identyczna z osobistym zakazem i bez niego przy wyłączonym stochastic poachu.
- **180 000 sparowanych okazji** na tych samych kwantylach RNG: sześć poziomów znajomości systemu, cztery zestawy cech, dwa poziomy familiarity, trzy ustawienia poachSeeking, pięć geometrii/ograniczeń i dwa stalle. Żadna decyzja z dodanym no_poach nie pojawia się w okazji odrzuconej bez niego. Prób poachu: 8157 bez dodatkowego zakazu, 259 z zakazem; pozostałe próby zachowują niskie compliance.
- **24 przypadki dodatniego override** `poach` przy zakazie drużyny nadal pozwalają na poach.
- Zwykły poach nadal kończy się po swoim krótkim oknie i przestrzega 1800 ms cooldownu.
- Pełna pętla akcji: dwie akcje/podania tego samego posiadania zachowują once flag; turnover ją kasuje; kolejna zmiana posiadania ponownie pozwala rozpocząć poach.

Oryginalna sonda `probe-tactics-balance-mechanisms.mjs`, seed 8103, gracz demo bez cech, 250 ticków: przed poprawką off/on 0/0 ticków POACHING i identyczny ruch; po poprawce off/on **0/131**, flaga zachowana przez **250/250** ticków on. Oryginalna próba zakazu (seed 554, 10000 okazji): brak instrukcji **0**, no_poach **0** (wcześniej 77), poach **1195** (bez zmiany). Są to testy mechanizmów, nie estymaty częstości lub przewagi w pełnym meczu.

`node scripts/test-tactical-behavior-fixes.mjs` — PASS (runtime role/instrukcje, registry, ciągłość preferencji, spacing, decyzje przy stallach, pełny i uproszczony punkt). ESLint dla zmienianych plików mechanizmu — PASS. Końcową regresję łączną, pełne mecze holdout i ocenę wpływu wykonuje koordynator audytu; ten dokument nie przypisuje efektu meczowego na podstawie jednostkowych scen.
