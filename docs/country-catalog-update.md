# Wybór krajów i baza klubów — 15.09.2026

## Wybór zakresu lig

Kraje z wieloma poziomami mają w kreatorze pole „Włączone ligi”. Można wybrać
sam poziom 1, poziomy 1 + 2 albo wszystkie kolejne. Włączenie niższego poziomu
wymaga wszystkich wyższych; grupy regionalne tego samego poziomu działają razem.
Normalizacja konfiguracji również pilnuje tej reguły. Niższe niewybrane poziomy
pozostają wyłączone, nie są automatycznie uruchamiane jako transferowe.
Szacunek obciążenia i lista klubów uwzględniają wybrany zakres.
Awanse i spadki odbywają się tylko pomiędzy włączonymi poziomami; francuskie
baraże są aktywne przy włączonym poziomie regionalnym.

## Baltic League

Dodano osiem klubów wskazanych przez użytkownika: Salaspils, Ventspils FK,
Valmiera, Ogre (Łotwa) oraz Ultimate Saku, Tartu Turbulence,
Tallinna Frisbeeklubi i Freeflyers (Estonia). Razem z ośmioma dotychczasowymi
klubami litewskimi tworzą jeden poziom Baltic League (16 drużyn), dostępny
w europejskiej sekcji kreatora. Kluby zachowują kraj pochodzenia; nowe składy
są generowane z łotewskich i estońskich pul imion i nazwisk.
Aktualny katalog zawiera 536 klubów. Zmiana dotyczy nowych karier.

## Aktualny układ lig regionalnych

- Austria, Słowacja, Serbia i przywrócone Węgry: jedna liga 16 klubów.
- Dania, Szwecja i Finlandia: jedna liga 20 klubów.
- RPA: jeden poziom, 20 klubów. Filipiny: jeden poziom, 20 klubów.
- Połączenia zachowują kluby z poprzednich parzystych poziomów oraz ich narodowości.
- Kreator nie udostępnia checkboxa przerwy świątecznej. Nowe światy losują jej
  występowanie dla każdej grupy rozgrywek; wynik jest zapisany w konfiguracji
  świata, wspólny dla wszystkich poziomów i stały w następnych sezonach.
- Stare zapisy zachowują wcześniejszy układ lig i ustawienia przerwy.

Aktualny katalog: 528 klubów, 33 ligi, 25 pozycji w wyborze krajów/grup.
Poniższe sekcje opisują wcześniejsze etapy aktualizacji.

## Późniejsza korekta: parzyste ligi i kontynenty

Wszystkie poziomy nowych karier mają parzystą liczbę klubów. Z nieparzystych
poziomów usuwany jest ostatni wpis według kolejności katalogu (nie jest to
zweryfikowany ranking siły). Wpisy źródłowe pozostają dostępne do audytu.
RPA ma teraz 10 + 10 klubów, Wielka Brytania 16 + 14, Filipiny 10 + 10.
Łącznie aktywny katalog obejmuje 526 klubów w 39 ligach.
Kreator grupuje kraje według kontynentów i sortuje je alfabetycznie wewnątrz
każdej grupy, zgodnie z wybranym językiem. Iberia znajduje się w Europie.
Poniższe liczebności opisują wcześniejszy import, przed tą korektą.

Kreator wybiera jeden tryb symulacji dla całego kraju i wszystkich jego poziomów.
Przeliczenie obciążenia obejmuje wszystkie wybrane kluby. Hiszpania i Portugalia
tworzą wspólną Ligę Iberyjską; kluby i zawodnicy zachowują własne narodowości.
Francja pozostaje w bazie, lecz jest ukryta w wyborze świata. Węgry usunięto
z katalogu klubowego nowych karier; narodowość węgierska nadal istnieje.

## Korekty

- Belgia: 16 + 16. XL Open 1 przesunięto do poziomu 2, White Foxes Open usunięto.
- Czechy: 16, usunięto Sunset.
- Irlandia: 16, usunięto Sligo Sirocco.
- Australia: 16 + 16. Awansowały Geelong Mudlarks, Extinction, Equinox i Quoll.
- Iberia: wspólna liga 18 klubów.
- Wielka Brytania: 16 + 15, w tym kluby szkockie i walijskie ze screenów.
- Indie: 14 + 14, Filipiny: 11 + 11, RPA: 11 + 10.

Do wyboru klubów przesuwanych/usuwanych wykorzystano kolejność rozstawienia
w lokalnych plikach źródłowych, a nie losowe umiejętności generowanych zawodników.
To rozstawienie gry, nie aktualny ranking sportowy. Nowe poziomy dzielą kluby
według kolejności katalogu, z maksymalnie 20 klubami na poziom.

## Źródła i składy

`src/data/world/userClubAdditions.json` zawiera 188 wpisów z przekazanych screenów,
w tym 21 klubów RPA z miastami. Powtórzony screen Finlandii wprowadzono raz.
Dopiski o dywizjach Singapuru pominięto. Znane szwajcarskie aliasy połączono
z lokalnymi rosterami. Francuskie wpisy dodano mimo ukrycia kraju w kreatorze.

Sprawdzono katalog [Find Ultimate](https://www.ukultimate.com/find-ultimate).
Cambridge Ultimate (w mapie: camdisc) i Leamington Lemmings dopasowano do
[wyników Open UKU D2 Nationals 2025](https://www.ukultimate.com/news/uku-d2-nats-2025-winners).
Dywizję Lemmings potwierdza też [strona klubu](https://lemmings.playultimate.co.uk/get-involved/lemmings-2025).
Zbadane źródła nie dostarczyły użytecznych rosterów tych dwóch klubów.
Kluby bez lokalnych składów otrzymują minimum 24 generowanych zawodników.
Dodano geografię i pule imion/nazwisk Serbii, Litwy i Indii.

Nowa kariera korzysta ze zmienionego katalogu. Istniejący świat zachowuje swoje
kluby i identyfikatory rozgrywek przy rozpoczęciu kolejnego sezonu, także dla
starych osobnych lig Hiszpanii/Portugalii lub usuniętych Węgier.

## Weryfikacja

- `node scripts/test-country-catalog.mjs`: liczebności, wszystkie wpisy screenów,
  tryby krajów, koszt symulacji, generowane składy i stare identyfikatory lig.
- `node scripts/test-domestic-season.mjs`: terminarze, puchary i kolejne sezony.
- ESLint zmienionych modułów i produkcyjny build Vite.
