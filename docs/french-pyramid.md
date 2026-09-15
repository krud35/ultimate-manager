# Francja: Nationale i regiony

## Katalog nowych karier

Francja jest widoczna w kreatorze. Jeden wybór obejmuje N1 (16), N2 (16)
i regiony Nord, Ouest, Est, Sud (po 12). Kluby mają francuską narodowość,
miasto i przybliżone współrzędne do podziału geograficznego.

Źródłem jest 10 tabel wyników i wcześniejsze 3 listy klubów przekazane przez
użytkownika. Dane: `src/data/world/franceClubs.js`. Zapisujemy poziom źródłowy,
liczbę meczów, zwycięstwa i bilans punktów. Ocena do rozstawienia uwzględnia
poziom, procent zwycięstw i bilans na mecz. Te wyniki delikatnie modyfikują
generowane umiejętności; nie są odczytem prawdziwych umiejętności zawodników.

N1 obejmuje 12 klubów ze źródłowej N1 oraz Disjonctés, Roazhon Ultimate,
Friselis i Jets. N2 tworzy 16 kolejnych klubów N2 według wyników; reszta
trafia do regionów. Tchac i Monkey zachowują dostępne lokalne rostery.
Pozostałe braki w składach są generowane.

Założenia wymagające ewentualnej późniejszej korekty danych:

- Drugi wpis Freezgo traktujemy roboczo jako Freezgo 2, oznaczony
  `provisionalIdentity`. Nie jest to potwierdzona identyfikacja rezerw.
- Pominięto Friz'Toi (0:120 w punktach) i UFO (jeden mecz), aby uzyskać
  80 klubów. Nie twierdzimy, że ich zawodnicy mają zerowe umiejętności.
- Starsza, prowizoryczna lista Francji została zastąpiona tym katalogiem.

## Terminarz i baraże

Regiony kończą ligę do 30 kwietnia, a N1/N2 do 7 maja, aby przed losowaniem
znać przyszły poziom pierwszych zespołów i uprawnienia rezerw. W maju odbywają się trzy środowe rundy
baraży. Nord łączy się z Ouest, Est z Sud. Z każdego regionu kwalifikują się
trzy najwyżej sklasyfikowane uprawnione kluby:

- Ćwierćfinały: A2–B3, B2–A3. Gospodarzem jest wicemistrz.
- Półfinały: A1–zwycięzca pierwszego ćwierćfinału,
  B1–zwycięzca drugiego. Gospodarzem jest mistrz regionu.
- Finał każdej ścieżki na neutralnym boisku; zwycięzca awansuje do N2.

Mecze są zwykłymi rozgrywalnymi spotkaniami silnika, widocznymi w kalendarzu.
Nie zmieniają tabel ligowych. Drabinka i awansujący są widoczni w widoku lig.
Sezon nie może zostać zamknięty przed zakończeniem obu finałów.
Rezerwy nie mogą awansować na poziom pierwszego zespołu ani go wyprzedzić;
ich miejsce barażowe przechodzi na kolejny uprawniony klub. Kwalifikację
rezerw oceniamy po zakończeniu lig, uwzględniając już ustalone awanse i spadki
pierwszych zespołów. Na najniższym poziomie rezerwy mogą pozostać obok
pierwszego zespołu — system nie ma czwartego poziomu ani usuwania rezerw.

Puchar Francji obejmuje wszystkie 80 klubów, ma siedem rund i wolne losy.
Finał przeniesiono na kwiecień, aby nie kolidował z barażami w maju.

## Awanse, spadki i regiony

N1/N2 wymieniają po dwa kluby. Dwa ostatnie kluby N2 spadają do regionów,
z priorytetem przymusowego spadku rezerw, jeśli ich pierwszy zespół spada do N2.
Dwóch zwycięzców baraży zajmuje zwolnione miejsca.

Przydział 48 zespołów do regionów wykorzystuje algorytm minimalnego kosztu:
najpierw minimalizuje liczbę zmian dotychczasowego regionu, potem odległość
do centrów regionów. Każdy region dostaje dokładnie 12 klubów. Dane
geograficzne są przybliżone; granice regionów pozostają elastyczne.
Zmiana grupy na tym samym poziomie jest osobnym rodzajem ruchu, nie spadkiem.
Widok lig pokazuje przeniesienia; gracz dostaje wiadomość, jeśli dotyczą jego klubu.

Składy lig i geografia są zapisane w świecie. Stare kariery z dawną pojedynczą
ligą francuską zachowują poprzedni format. Drabinka nowych karier przetrzymuje
identyfikatory meczów, dzięki czemu zapis/odczyt nie wymaga odtwarzania referencji.

## Sprawdzenie

`node scripts/test-french-pyramid.mjs`: 80 klubów, rostery/metadane w prawdziwej
karierze, 79 spotkań pucharu, rozstawienie baraży, mecze gracza, brak wpływu
baraży na tabelę, blokada przedwczesnego zamknięcia, zapis/odczyt, pięć sezonów
awansów i wyrównywania grup, zachowanie starej 14-zespołowej Francji.
Ponadto testy katalogu, sezonów krajowych, renderowania PL/EN, ESLint i build.
