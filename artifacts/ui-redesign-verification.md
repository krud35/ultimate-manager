# Ultimate Manager — wdrożenie stylu, 15.09.2026

## Zakres

Minimalistyczny styl sportowego biuletynu: lokalne fonty Barlow i Barlow Condensed, papierowe / grafitowe powierzchnie, zielony akcent, cienkie separatory i ograniczone zaokrąglenia. Motyw jasny, ciemny oraz zgodny z systemem; wybór jest zapamiętywany.

Przebudowana powłoka, centrum kariery, skład z czterema widokami danych, profile zawodników, ekran wyboru kariery, hierarchia taktyki i tablica wyników. Pozostałe ekrany oraz okna korzystają z tych samych kolorów i prostszych powierzchni. Dolna nawigacja na telefonach: Centrum, Skład, Mecz, Menu. Pełne menu zachowuje wszystkie aktualne kierunki nawigacji. Linki mają widoczne oznaczenia przed najechaniem kursorem, a kontrolki widoczny fokus.

Zachowano aktualne integracje kontraktów, wypożyczeń, cech zawodników, skautingu i reprezentacji. W ramach redesignu nie zmieniano zasad symulacji ani formatu zapisów. W tym samym repozytorium równolegle trwają odrębne prace nad silnikiem oraz treningiem i sztabem.

## Weryfikacja

- `npm run build`: OK, 361 modułów; sprawdzenie lokalnych importów i eksportów OK. Pozostaje ostrzeżenie Vite o rozmiarze głównego pakietu JavaScript.
- Porównanie ESLint dla 72 zmienionych plików UI z wersją HEAD: brak nowych zgłoszeń; 28 istniejących zgłoszeń. Nowe komponenty powłoki bez błędów. Pełny lint repozytorium nie jest czysty — obejmuje również istniejące problemy oraz dodatkowe worktree w `.claude`.
- Przeglądarka: szerokości 360, 390, 768, 1280 i 1440 px; jasny i ciemny motyw, PL i EN.
- Sprawdzone wczytywanie istniejącego testowego zapisu UI Audit, centrum, skład, sortowanie rosnące i malejące, widok kontraktów, otwieranie profilu, Escape oraz powrót fokusu do zawodnika.
- Sprawdzone menu mobilne, trening, kalendarz, taktyka, transfery, skauting, akademia, zarząd i reprezentacje.
- Przejście od przygotowania meczu przez szatnię do odtwarzania punktu; skorygowany kontrast komentarza nad boiskiem i układ wyniku na telefonie. Test nie obejmował rozegrania pełnego sezonu ani wszystkich wariantów zdarzeń.
- Szerokie zestawienia mają własne przewijanie poziome; podstawowy skład mobilny jest listą. Kontrola szerokości dokumentu na małych ekranach nie wykazała poziomego przepełnienia w sprawdzonych widokach.

Podgląd lokalny gotowego buildu: `http://127.0.0.1:5174/ultimate-manager/`. Jest uruchomiony przez Vite preview, więc pokazuje zbudowaną wersję, bez automatycznych przeładowań podczas równoległych edycji repozytorium.
