# Kariery krajowe i nowy świat gry

## Rozpoczęcie kariery

Menu główne udostępnia nową grę i wczytanie zapisu. Nowa kariera prowadzi przez:
1. Imię, nazwisko, narodowość, wiek, sportową przeszłość, siedem pytań i styl managera.
2. Wybór świata lig krajowych albo osobnego trybu UFA.
3. Konfigurację lig i rozgrywek międzynarodowych.
4. Wybór klubu z grywalnej ligi.
5. Podsumowanie. Cofnięcie kroku zachowuje odpowiedzi.

Osiem atrybutów managera ma skalę 1–20. Odpowiedzi zmieniają profil umiejętności;
wpływają one na rozwój, motywację, trening, adaptację i regenerację. Każdy klub ma
managera oraz osobne preferencje zarządu i kibiców. Historia i statystyki managera
podążają za osobą. Zmiany pracy obejmują tylko grywalne ligi. Emerytowani zawodnicy
mogą zostać managerami albo członkami sztabu, z zachowaniem powiązania tożsamości.

## Bazy i tryby symulacji

Katalog startowy łączy lokalne bazy USAU, CUC, BUOC, PSGU, worldLeagueTeams i EUCS:
29 poziomów ligowych, 24 kraje i 363 kluby. Kluby dawnych lig ponadnarodowych są
przypisane do krajów. Stare zapisy EUCS zachowują swój dotychczasowy format.
Rzeczywiste nazwiska mają referencje źródłowe; brakujące składy, wiek i umiejętności
są generowane na potrzeby gry. Powtarzające się rekordy nazwisk w wielu źródłach
są raportowane w `world.importConflicts`, z informacją o zachowanej drużynie.

- **Grywalna:** pełne mecze, treningi, transfery i rynek pracy managerów.
- **Transferowa:** uproszczone wyniki i rozwój, rzeczywiste kadry, kontrakty,
  transfery i wspólny rejestr zmęczenia. Nie można objąć klubu.
- **Wyłączona:** brak ligi, tabeli i biznesu klubowego. Kadry narodowe mają trwałą
  populację zawodników. Przy włączonych pucharach mogą istnieć minimalni klubowi
  reprezentanci; uzupełniają skład po emeryturach.

Inne poziomy grywalnego kraju pozostają przynajmniej transferowe, aby zachować
awanse i spadki. Awans/spadek klubu człowieka zachowuje grywalność jego nowego
poziomu. Konfiguracja jest zapisana w karierze; nie ma przełączania całych lig
w trakcie sezonu. Wskaźnik szybkości jest porównawczym oszacowaniem, a nie pomiarem
wydajności konkretnego komputera.

Lokalna baza nie zawiera jeszcze klubów afrykańskich. Dla ścieżki WUCC istnieją
wyraźnie fikcyjni reprezentanci pucharowi tych krajów (`isFictional`), bez
symulowania nieistniejącej w katalogu ligi. Docelowa baza może ich zastąpić.

## Kalendarz i obciążenia

- Liga: od połowy sierpnia do końca maja, piątek–poniedziałek; mecz i rewanż.
- Krajowy puchar: eliminacja z wolnymi losami, wtorek–czwartek; rundy rozłożone
  między jesień i wiosnę. Finał neutralny, wcześniejsze rundy u gospodarza.
- Europejska Champions League: kwalifikacje, grupy, faza pucharowa; w tygodniu.
- PAUCC/AOUCC/WUCC: 15–30 czerwca. WUCC co cztery lata, w tym roku zastępuje
  regionalne turnieje letnie. Reprezentacje: 2–14 lipca. Przełączniki niezależne.
- Opcjonalna siedmiodniowa przerwa świąteczna. Okna transferowe zachowane.

Kalendarz rezerwuje terminy pucharowe i przenosi mecze ligowe, zapewniając minimum
trzech dni między zwykłymi meczami klubowymi. Turnieje letnie mają odrębny,
gęstszy harmonogram. Terminarz powstaje na początku sezonu. Codzienny krok jedynie
porównuje rezerwacje pucharowe i zasady kalendarza z poprzednio sprawdzonym stanem.
Nowa runda, zmiana uczestników lub dat pucharowych uruchamia korektę kolizji;
poprawne terminy pozostają bez zmian. Wyniki i upływ dnia nie uruchamiają ponownego
układania terminarza. Rozegrane mecze są nieruchome. Stan kontroli przechodzi przez
zapis i wczytanie; starszy zapis bez tego stanu jest sprawdzany raz.

Trening śledzi faktyczne daty i indywidualny udział. Urlop
dwutygodniowy zaczyna się w czerwcu, po klubowym turnieju albo po zgrupowaniu
reprezentacji, zależnie od zobowiązań zawodnika. Sezon nie zeruje świeżości,
zmęczenia ani urazów; działa codzienna regeneracja.

Puchary zapisują wyniki, trofea, historię, współczynniki krajowe/klubowe i
rejestrację składów. Podróże oraz nagrody wpływają na finanse. Prognoza finansowa
korzysta z faktycznego terminarza; nie zakłada awansu do jeszcze nieznanych rund.

## Weryfikacja

Samodzielne skrypty Node:

```
node scripts/test-domestic-season.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-domestic-calendar.mjs
node scripts/test-national-calendar.mjs
node scripts/test-international-club-cups.mjs
node scripts/test-career-runtime.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-manager-profiles.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-disabled-league-business.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-training-system.mjs
node scripts/test-career-ui.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-finance-schedule.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-domestic-background.mjs
npm run build
```

Zakres obejmuje parzyste i nieparzyste liczby drużyn, wszystkie ligi naraz,
kolizje terminów, puchary, awanse, przypisanie osiągnięć managera, wyłączony
biznes, rzeczywisty pełny sezon, zapis/wczytanie, kolejne sezony, trening oraz UI.
