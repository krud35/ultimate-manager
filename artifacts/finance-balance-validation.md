# Balans finansów klubowych — 9 września 2026

Wdrożono wspólną skalę płac, wycen i kosztów oraz rozdzielono przychody od kosztów sprzedaży. To kalibracja ekonomii gry, nie model rzeczywistych sprawozdań klubów ultimate.

## Reguły

| Obszar | Nowe działanie |
|---|---|
| Pensje referencyjne | `600 × 1,10^(OVR−80)` tygodniowo. OVR 75: około 373; 80: 600; 85: 966; 90: 1556. Negocjacje nadal uwzględniają zawodnika i klub, ale kolejne odnowienia nie nakręcają tak szybko płac. |
| Wyceny | Baza: 2,2 rocznych pensji referencyjnych, modyfikowana przez wiek, potencjał i pozostały kontrakt. Premia za potencjał maksymalnie 45%. Kończący się kontrakt obniża cenę. Wycena wolnego zawodnika nie oznacza opłaty transferowej. |
| Personel | Poziomy 0–3 kosztują odpowiednio 0/120/300/600 tygodniowo za stanowisko; rekrutacja kosztuje cztery tygodnie nowej stawki. |
| Obiekty | Cotygodniowe utrzymanie: `(20 + 6 × poziom²) × waga obiektu`. Rozbudowa jest osobnym wydatkiem, z łagodniejszą krzywą ceny. Akademia dodatkowo kosztuje 40 tygodniowo za zawodnika. |
| Bilety | Wyłącznie gospodarz. Frekwencja zależy od liczby i nastroju kibiców, nie przekracza pojemności stadionu `400 + 350 × poziom`. Cena: `8 + floor(reputacja/15)`. |
| Koszulki | Osobne przychody i koszty: cena 45, produkcja 22 za sztukę. Popyt zależy od frekwencji, sklepu i wyniku meczu. |
| Gadżety | Osobna sprzedaż; koszt towaru wynosi 45% przychodów. Na wyjeździe sprzedaż ograniczona do niewielkiej grupy klientów. |
| Organizacja meczu | Gospodarz płaci 650 + 1,4 za widza. |
| Wyjazdy | Maksymalnie 24 zawodników + 4 osoby obsługi, zamiast całej zarejestrowanej kadry. Koszt stały 350 i stawka za osobę: EUCS krajowy 100, zagraniczny 210, UFA 180; wahania ±10%. |
| Właściciel | Roczny plan wsparcia uwzględnia koszty, przychody i nadwyżkę gotówki. Bogaty klub nie dostaje automatycznie kolejnego pełnego zastrzyku środków. To nadal normalne planowane finansowanie klubu, odrębne od awaryjnego ratowania zadłużenia. |
| Wydarzenia | Kwoty nowych zdarzeń są skalowane do referencyjnego kosztu klubu (mnożnik 0,35–1,20). Opis, wybór i płatność korzystają z tej samej skali, zachowanej również w dalszych etapach historii. |

AI inwestuje w budynki dopiero przy co najmniej 24 seniorach, dodatnim prognozowanym wyniku i odpowiedniej rezerwie. Nowo kupionego zawodnika AI nie wystawia do kolejnego zakupu przez 120 dni. Sprawdzenie limitu płac przed płatnością za transfer i wykup wypożyczenia zapobiega księgowaniu opłat i zwrotów za niedoszłe transakcje.

Panel zarządzania pokazuje rozliczenie ostatniego meczu: frekwencję, bilety, koszulki, gadżety, koszty i wynik netto. Rejestr finansowy rozróżnia te kategorie. Prognoza roczna uwzględnia szacunkowy wynik 15 meczów domowych i 15 wyjazdowych oraz średni koszt wyjazdu 4200; rzeczywiste rozliczenia korzystają z faktycznych parametrów meczu.

## Zgodność zapisów

Istniejąca gotówka i uzgodnione pensje pozostają zachowane. Nowa skala płac obowiązuje przy nowych umowach i odnowieniach. Pierwsze miesięczne rozliczenie wdraża nowy plan finansowania; dodatkowy limit wsparcia dla wysokiego starego funduszu płac wygasa liniowo przez cztery lata. Nie jest to gwarancja pokrycia dowolnych wydatków. Niższe budżety startowe dotyczą nowych światów. Starsze oczekujące wydarzenia bez zapisanej skali zachowują dotychczasowe kwoty.

Rozliczenie meczu jest jednokrotne w obrębie sezonu. Powtórzenie identyfikatora terminarza w następnym sezonie nie blokuje wypłaty. Walkower nie uruchamia sprzedaży ani kosztów rozegranego meczu.

## Walidacja

51 testów zakończonych powodzeniem: 9 finansowych, 13 ekonomii i zarządzania, 14 cyklu świata, 15 wydarzeń i wiadomości. Sprawdzono między innymi migrację, limit płac, rozliczenia wypożyczeń, niezmienność finansów przy odrzuconym transferze, zgodność gotówki z wynikiem meczu, powtórzone mecze, formaty USD/EUR i jednokrotność decyzji.

`npm run build` zakończony powodzeniem. Pozostało ostrzeżenie Vite o dużym pakiecie aplikacji.

Test długoterminowy: 16 i 48 klubów, ziarna 17 i 71, po 10 sezonów; łącznie 40 rocznych obserwacji światów i 1280 klubosezonów. Każde roczne zamknięcie weryfikuje zgodność gotówki z księgą, unikalność zawodników i limity akademii.

| Kluby | Ziarno | Mediana gotówki po 10 sezonach | Najmniejsza gotówka | Zadłużone kluby na końcu | Najmniejsza kadra na końcu |
|---:|---:|---:|---:|---:|---:|
| 16 | 17 | 354 719 | 168 831 | 0 | 26 |
| 16 | 71 | 399 793 | 160 763 | 0 | 27 |
| 48 | 17 | 371 901 | 166 896 | 0 | 14 |
| 48 | 71 | 351 554 | 170 491 | 0 | 24 |

We wszystkich rocznych obserwacjach: zero zadłużonych klubów, zero awaryjnych ratunków; najmniejsze saldo na koniec dowolnego badanego sezonu: 45 185. Nie oznacza to braku przejściowego długu pomiędzy rocznymi obserwacjami.

Ograniczenia: test używa syntetycznych 30 kolejek i właściwego kodu rozliczeń, bez silnika meczowego, wpływu wyników na reputację, pełnego treningu i nagród sportowych. Dla wydarzeń losuje decyzje i stosuje tylko efekty pieniężne; nie odtwarza pełnych łańcuchów historii, kontuzji, negocjacji ani polityki dostępności kosztownych wyborów. Pełne ścieżki decyzji są objęte oddzielnymi testami regresji. To test stabilności finansowej, nie gwarancja identycznych wyników każdej kariery.

W większym świecie pozostaje problem kompletowania kadr AI mimo dodatniej gotówki: minimum w całej próbie wyniosło 10 seniorów, a jeden świat kończy z minimum 14. Roczny pomiar przypada po odejściach i starzeniu, przed kolejnym naborem AI. Nie należy interpretować stabilnych finansów jako rozwiązania wszystkich problemów rynku i populacji.

Surowe dane: `artifacts/finance-balance-results.json`. Reprodukcja: `node --import ./scripts/register-world-tests.mjs scripts/check-finance-balance.mjs`.
