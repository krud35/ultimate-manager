# Finanse inspirowane piłką 2008–2012

Nowe kariery korzystają z zawodowej skali finansowej. Kwoty bazowe są w USD;
formatowanie walut w interfejsie pozostaje wspólne dla całej gry.

| OVR | Bazowa płaca tygodniowa | Bazowa wartość transferowa |
| --- | ---: | ---: |
| 70 | ok. 5,4 tys. | ok. 1,5 mln |
| 80 | 20 tys. | 5,72 mln |
| 90 | ok. 74,1 tys. | ok. 21,2 mln |
| 99 | ok. 241 tys. | ok. 69 mln |

Wiek, potencjał, długość kontraktu i negocjacje nadal modyfikują te kwoty.
Różnica 20 OVR daje ponad 13-krotną różnicę bazowych płac.

## Hierarchia klubów

- Kapitał transferowy zależy wykładniczo od reputacji. Losowanie waha się o ±15%.
- Mnożniki kapitału dla lig europejskich: 1,8 / 0,75 / 0,25.
- Sponsoring przy reputacji 85 daje ponad osiem razy większą bazę niż przy 45.
- Roczne wpływy TV: 18 mln / 3,6 mln / 0,6 mln, wspólne dla prognozy i wypłat.
- Zwiększono widownię, utrzymanie i rozbudowę obiektów, płace sztabu, premie
  ligowe i pucharowe, domyślne premie kontraktowe oraz skalę zdarzeń finansowych.
- Progi ostrzeżenia i kryzysu: −1,5 mln i −8 mln. Nadal obowiązują okresy
  zadłużenia wymagane do interwencji i walkowerów.

Inspiracja: [raport UEFA za 2011 rok](https://www.uefa.com/news-media/news/0206-0e8316185b0d-b29475a135dd-1000--fifth-club-licensing-benchmark-report/),
w którym wzrost płac między 2007 a 2011 wynosi 38%, a płace i koszty transferowe
netto stanowią 71% przychodów. To autorski balans gry inspirowany epoką,
a nie odwzorowanie ksiąg konkretnych klubów czy historycznych kursów walut.

## Zapisane kariery

Nie przeliczamy wstecz gotówki, długu ani podpisanych umów zawodników i sponsorów.
Nowe płace obowiązują przy nowych kontraktach, nowe wyceny od razu, a finansowanie
właściciela jest aktualizowane podczas miesięcznego przeglądu wersji bilansu.
Pełny rozkład nowych budżetów startowych wymaga nowej kariery.

## Weryfikacja

- 10 testów finansów, 10 alokacji budżetu, 9 rezerw płac i 13 ekonomii świata.
- Symulacja 48 klubów, seed 17, dwa sezony: zero zadłużonych klubów i dotacji
  ratunkowych; zachowana zgodność gotówki z księgą. Symulacja używa syntetycznego
  terminarza i nie obejmuje wypłat premii ligowych/pucharowych.
- Wyniki: `artifacts/finance-balance-results.json` i
  `artifacts/finance-allocation-starting-worlds.json`.
- Kontrola importów i kompilacja produkcyjna.
