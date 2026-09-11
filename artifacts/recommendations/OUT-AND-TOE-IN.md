# Przestrzeń poza boiskiem i toe-in

Wdrożono w pełnym silniku przestrzennym:

- Błąd wykonania rzutu nie jest już przycinany do prostokąta boiska. Tor, wiatr, zbicie i upadek mogą mieć współrzędne poza boiskiem.
- Przekroczenie linii w powietrzu nie kończy akcji. Istniejący zakrzywiony tor może wyjść poza linię i wrócić; po powrocie nadal możliwy jest chwyt. Nie dodano osobnego losowania „powrotu”.
- Nieudana akcja kończąca się poza boiskiem otrzymuje `out_of_bounds`. Ślad zachowuje miejsce upadku, a `restartPoint` wskazuje odrębne miejsce wznowienia w centralnej części boiska. Uwzględniane jest ostatnie wyjście oraz późniejsze dotknięcia przez graczy będących in-bounds. Ruch po już rozstrzygniętym aucie nie zmienia tego miejsca.
- Widok 2D ma po 12 m otoczenia z każdej strony i widoczną linię obwodową. Ten pas jest zakresem kamery, nie ograniczeniem fizycznych współrzędnych dysku.
- Przy bliskim chwycie zawodnik może podnieść drugą stopę i oprzeć się jednym palcem. Osiągalność podparcia zależy od wzrostu, balansu, orientacji przestrzennej i prędkości. Zmienia się punkt kontaktu, a nie położenie środka ciała. Dotknięcie linii pozostaje nielegalne.
- Toe-in dotyczy linii zewnętrznych oraz atakowanej linii punktowej. Przy chwycie w powietrzu jest rozstrzygany na pierwszym podparciu. Nie przywraca uprawnień zawodnikowi, który wybił się spoza boiska. Layout nadal ma odrębny, uproszczony model.
- Ślad zapisuje `toeIn` i `pivotPoint`; w widoku kontakt jest oznaczony żółtym punktem. Utrzymanie chwytu nadal podlega dotychczasowej kontroli chwytu i lądowania.

Rozdzielenie lotu poza linią od autu oraz zasada pierwszego podparcia odpowiadają kierunkowi reguł 11, 13.8 i 14 [WFDF 2025–2028](https://rules.wfdf.sport/wp-content/uploads/2025/03/WFDF-Rules-of-Ultimate-2025-2028-Pocket-Format.pdf). Model kontaktu pozostaje przybliżeniem: nie symuluje pełnej stopy, wszystkich punktów ciała ani sekwencji biomechanicznej każdego kroku. Przekroczenie linii przez dysk jest śledzone według jego środka, bez dokładnej geometrii obręczy. Nie dodano animacji fizycznego przyniesienia dysku z autu do miejsca wznowienia. Fast pozostaje modelem statystycznym.

Weryfikacja: przegląd statyczny kodu, `git diff --check` i build zakończone poprawnie (286 plików importów, 332 moduły). Celowany ESLint wykazał 10 istniejących nieużywanych deklaracji w `fieldMotion.js` i ostrzeżenie Fast Refresh w `FieldView2D.jsx`; pozostałe sprawdzane pliki bez błędów. Build zachowuje ostrzeżenie wielkości pakietu. Zgodnie z wcześniejszą instrukcją nie uruchamiano testów ani symulacji meczowych. Nie potwierdzono zachowania przez oglądanie meczu.

Raport `REPORT.md` oraz jego manifest opisują wcześniejszy stan, sprzed tej zmiany.
