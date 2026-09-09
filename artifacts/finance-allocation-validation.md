# Podział budżetu i nowy balans finansów

## Jedno saldo, dwie części

`gotówka = budżet transferowy + sezonowy budżet płacowy`

`budżet tygodniowy = sezonowy budżet płacowy / pozostałe tygodnie wypłat`

Suwak działa w zakładkach klubu i transferów. Przenosi pieniądze między obiema częściami bez zmiany salda i bez sztucznych operacji w księdze. Minimalna część płacowa pokrywa podpisane kontrakty do 31 lipca, z uwzględnieniem ich wygaśnięcia i udziałów w wypożyczeniach. Wartość tygodniowa jest wyświetlana do dwóch miejsc po przecinku; obliczenia zachowują dokładny podział.

Pensje zmniejszają saldo i część płacową. Opłaty transferowe, utrzymanie, budowy i inne wydatki zmniejszają część transferową. Przychody zwiększają część transferową. Podpisanie zawodnika sprawdza zarówno miejsce w tygodniowym budżecie, jak i pokrycie całego pozostałego zobowiązania; opłata transferowa nie może naruszyć części płacowej. Usunięto ponowne doliczanie rezerwy kontraktu do opłaty transferowej przy sprawdzaniu części transferowej.

Podział jest zapisany w karierze. AI przegląda go co miesiąc, zwykle przeznaczając na pensje 112% obecnego funduszu płac razy pozostałe tygodnie, w granicach dostępnej gotówki. Na nowy sezon podział wylicza się ponownie, ale saldo nie jest resetowane. Gdy w końcówce sezonu nie ma już wypłat, część sezonowa wynosi zero. Niedobór finansowania jest widoczny jako ujemna część transferowa i blokada zakupów, zamiast ukrywania długu.

## Poduszka startowa

Nowe kariery otrzymują pełne pokrycie sezonowych pensji oraz dodatkowo dotychczasową pulę startową (w nowej skali), pół roku kosztów utrzymania i 20% sezonowych płac. Kapitał startowy jest księgowany jednokrotnie. W sprawdzonych nowych światach wszystkie 64 kluby mają pokrycie pensji i dodatnią część transferową.

| Świat | Mediana całej gotówki | Mediana części transferowej | Mediana wyceny zawodnika | Kluby z pokryciem pensji |
|---|---:|---:|---:|---:|
| UFA, 16 klubów | 3 312 688 | 1 124 188 | 332 000 | 16/16 |
| EUCS, 48 klubów | 2 380 040 | 1 001 668 | 289 000 | 48/48 |

Iloraz median daje około 3–3,5 przeciętnych wycen na startową część transferową, jeszcze przed kosztami utrzymania i wymaganiami płacowymi nowych zawodników. To orientacyjna relacja cen i możliwości, a nie gwarantowana liczba zakupów.

## Skala cen i przepływów

W porównaniu z poprzednią wersją: referencyjne płace ×2, baza wyceny zawodnika ×5, nowe oferty sponsorów ×2, TV ×2, ceny biletów i koszulek oraz związane z nimi koszty ×2. Podwojono także stawki personelu, utrzymanie i rozbudowę obiektów, podróże, koszty akademii i skautingu, nagrody ligowe/pucharowe i domyślne premie nowych kontraktów. Wydarzenia zachowują skalowanie do wielkości klubu, teraz w przedziale 0,7–2,4 zamiast 0,35–1,2.

Wycena bazowa wynosi 5,5 rocznych pensji referencyjnych, z dotychczasowymi korektami wieku, potencjału i pozostałego kontraktu. Przykład: OVR 80 → 1200 tygodniowo i 343 200 bazowej wyceny. Ceny rosną mocniej niż płace, żeby większa płynność nie oznaczała dowolnych zakupów.

Właściciel uwzględnia większą docelową rezerwę gotówki. AI rozpoczyna rozbudowę dopiero przy pokryciu 1,4 rocznych kosztów w gotówce i prognozie przekraczającej 1,2 rocznych kosztów. Chroni to poduszkę przed systematycznym wydawaniem na obiekty.

Istniejące zapisy zachowują pieniądze oraz podpisane pensje i umowy sponsorskie. Nowy podział jest inicjalizowany bez tworzenia gotówki. Zwiększona poduszka startowa dotyczy nowych karier; istniejące kluby nie dostają powtarzalnej dotacji przy wczytywaniu zapisu. Nowe stawki kontraktów i sponsorów wchodzą przy nowych umowach.

## Walidacja

68 testów przeszło: ekonomia (13), cykl świata (14), wydarzenia (15), wcześniejszy balans (9), rezerwa sezonowa (9), podział i nowe światy (8). Sprawdzono równanie obu budżetów z gotówką, granice suwaka, podpisywanie umów, wypłaty, transfery, migrację, odczyt zapisu i zmianę sezonu.

Przeglądarka: sprawdzono rzeczywisty komponent, zmianę suwakiem oraz odświeżenie podglądu. Dla salda 3 185 106 ustawienie 50 000 tygodniowo przy 52 wypłatach dało część płacową 2 600 000 i transferową 585 106; saldo pozostało bez zmian. Kontrola odbyła się w izolowanym podglądzie komponentu, bez zmieniania zapisanej kariery użytkownika.

Build produkcyjny przeszedł; lint sprawdzonych plików modelu podziału i suwaka bez błędów. Vite nadal ostrzega o wielkości pakietu aplikacji.

Symulacja: 16 i 48 klubów, po dwa ziarna, po 10 sezonów — 40 rocznych obserwacji światów, 1280 klubosezonów.

| Kluby | Ziarno | Mediana gotówki po 10 sezonach | Najniższe saldo na końcu | Najmniejsza kadra na końcu |
|---:|---:|---:|---:|---:|
| 16 | 17 | 2 904 475 | 2 046 475 | 27 |
| 16 | 71 | 2 833 162 | 1 970 166 | 29 |
| 48 | 17 | 2 474 399 | 1 659 851 | 28 |
| 48 | 71 | 2 514 946 | 1 389 570 | 28 |

Zero awaryjnych dokapitalizowań. W rocznych obserwacjach wystąpił jeden przypadek niewielkiego długu: −2351 w świecie 48 klubów, ziarno 17, rok 2029. Wszystkie cztery światy kończą bez zadłużonych klubów. Minimum kadry w całej próbie wyniosło 12; problem początkowo krótkich kadr części klubów EUCS nie jest tym samym co niewypłacalność i nie został ukryty w wynikach.

Symulacja stosuje rzeczywiste rozliczenia do syntetycznych 30 kolejek oraz pieniężne efekty losowych decyzji. Nie symuluje pełnego silnika meczowego, zmian reputacji wskutek wyników, pełnych łańcuchów wydarzeń ani nagród sportowych. To walidacja stabilności ekonomii, nie obietnica identycznego przebiegu każdej kariery.

Dane: `finance-allocation-starting-worlds.json` i `finance-allocation-final-results.json`. Plik `finance-allocation-balance-results.json` zawiera wcześniejszą próbę przed zaostrzeniem warunków inwestycji AI, nie końcowy balans.
