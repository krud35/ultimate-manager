# Finanse krajów i dywizji

Każdy kraj obecny w katalogu lig ma osobny profil w
`src/career/financialMarkets.js`. Są to parametry balansu gry inspirowanego
piłką lat 2008–2012, a nie historyczne dane PKB lub ranking sportowy ultimate.

Profil rozdziela kapitał inwestycyjny, rynek sponsorski, prawa TV i lokalne
koszty. Dzięki temu zamożny, mały rynek (np. Szwajcaria) nie musi mieć tak dużych
praw TV jak Wielka Brytania. Reputacja nadal różnicuje kluby w obrębie ligi.

## Przykłady

Kwoty TV miesięcznie, w bazowych USD gry:

| Kraj | Dywizja 1 | Dywizja 2 | Dywizja 3 |
| --- | ---: | ---: | ---: |
| Wielka Brytania | 2 250 000 | 450 000 | 90 000 |
| Niemcy | 1 725 000 | 345 000 | 69 000 |
| Francja | 1 500 000 | 300 000 | 60 000 |
| Polska | 450 000 | 90 000 | 18 000 |
| Litwa | 180 000 | 36 000 | 7 200 |

To porównanie stawek; nie każdy kraj ma wszystkie pokazane dywizje w katalogu.
Każda kolejna dywizja mnoży kapitał startowy przez 0,45, bazę sponsoringu przez
0,50, stawki nowych płac przez 0,68, frekwencję przez 0,65, ceny biletów przez
0,85, a TV i bazę nagród ligowych przez 0,20. Działa również poniżej trzeciej ligi.

## Zakres

- Budżety startowe: kraj × dywizja × reputacja × niewielkie losowanie.
- Sponsoring: nowe oferty według kraju i dywizji; zawarte umowy zachowują kwoty.
- Płace: lokalna baza przy tworzeniu kontraktów, negocjacjach i promocji juniorów.
  Zawodnik przychodzący z bogatszego rynku nadal bierze pod uwagę obecną pensję.
  Wycena transferowa umiejętności pozostaje wspólna dla światowego rynku.
- Finansowanie właściciela: limit wsparcia uwzględnia lokalną skalę kosztów.
- Mecze: lokalna frekwencja, bilety, towary i koszty organizacji.
- Sztab: nowe stawki lokalne; podpisane kontrakty pozostają ważne.
- Obiekty i utrzymanie akademii: koszty kraju. Sama zmiana dywizji nie przecenia
  budowy identycznego obiektu.
- TV: jedna funkcja dla rzeczywistej wypłaty i prognozy finansowej.
- Premie ligowe: według dywizji właśnie zakończonego sezonu, nawet gdy klub
  awansował już przed wypłatą.
- Puchar krajowy: taka sama nagroda za taki sam wynik niezależnie od dywizji
  uczestnika. Dla pucharów kilku krajów obowiązuje średni profil TV krajów uczestników.

## Ligi łączone, awanse i zapis gry

Model używa kraju klubu, nie identyfikatora ligi łączonej. Przykładowo Austria
i Serbia w Danube League zachowują osobne profile. Poziom pochodzi z bieżącego
`team.tier`, również dla francuskich grup regionalnych bez numeru w identyfikatorze.

Awans/spadek od razu zmienia nowe oferty, stawki referencyjne i TV; finansowanie
właściciela aktualizuje się przy kolejnym miesięcznym przeglądzie. Nie przeliczamy
wstecz gotówki, długu, zapłaconych premii ani umów. Nowe budżety startowe dotyczą
nowych karier. Istniejące kariery krajowe przechodzą na nowy model stopniowo.
Starsze kariery UFA i EUCS zachowują dotychczasową skalę.

Widok finansów pokazuje kraj, dywizję, miesięczne TV i opis wpływu lokalnego rynku.

## Sprawdzenie

`node --import ./scripts/register-world-tests.mjs scripts/test-country-finances.mjs`

Dziewięć testów obejmuje pokrycie katalogu krajów, różnice krajów i dywizji,
ligi łączone, wypłaty/prognozy TV, awans i ponowny odczyt zapisu, nagrody,
tworzenie świata, negocjacje oraz zgodność starych karier. Przeszły również testy
bilansu finansów, rezerw płac, ekonomii świata, prognozy terminarza, wyłączonych
lig i sezonów krajowych (w tym trzy kolejne sezony), a także build produkcyjny.
