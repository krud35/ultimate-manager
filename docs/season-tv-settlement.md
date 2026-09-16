# Prawa TV — rozliczenie sezonowe

Wypłata następuje podczas rozliczenia zakończonego sezonu, najwcześniej 31 lipca,
po rozegraniu meczów ligowych. Obejmuje ligę gracza i ligi równoległe.

- Roczna pula zachowuje poprzednią wielkość: suma nominalnych miesięcznych
  stawek krajów/dywizji uczestników pomnożona przez 12.
- 70% puli jest dzielone po równo między wszystkie kluby ligi, także ligi
  wielonarodowej. Reputacja klubu nie zmienia tej części.
- 30% puli jest dzielone według miejsca. W lidze N klubów wagi wynoszą
  N, N−1, …, 1. Każde wyższe miejsce zwiększa premię.
- Zaokrąglenia rozliczamy w części premiowej, zachowując całą pulę i równą bazę.
- Premie ligowe i pucharowe pozostają odrębnymi nagrodami.

Przykład: 16 klubów polskiej D1 tworzy pulę 86,4 mln USD. Każdy dostaje
3,78 mln części równej. Mistrz otrzymuje dodatkowo około 3,05 mln,
a ostatni klub około 191 tys. premii TV.

Prognoza uwzględnia tylko część równą, w terminie zakończenia sezonu.
Nie rozkłada jej na miesięczne wpływy i nie zakłada przyszłego miejsca.
Po rozliczeniu nie dolicza wypłaconej kwoty ponownie. Wiadomość w skrzynce
rozdziela część równą, premię, wcześniejsze zaliczki i faktyczną wypłatę.

Dywizja zakończonych rozgrywek określa pulę także po awansie/spadku. Znacznik
rozliczenia ligi i sezonu jest zapisany w finansach klubu i zapobiega duplikatom.
Zachowane stare funkcje miesięczne nie przekazują już żadnej gotówki.

Starsze zapisy przechowują ostatni miesiąc wypłaty, bez kompletnej historii
stawek. Zaliczkę szacujemy jako liczbę miesięcy od sierpnia do tego miesiąca
pomnożoną przez nominalną stawkę zakończonej dywizji. Zaliczki z poprzednich
sezonów nie są potrącane. Przy nadpłacie pozostała wypłata wynosi zero;
nie odbieramy gotówki klubowi. Historyczna zmiana stawek w trakcie sezonu
może oznaczać różnicę między tym szacunkiem a faktycznymi dawnymi wypłatami.

Testy: `scripts/test-season-tv.mjs` — podział puli, terminy, powtórzenie/wczytanie,
awanse, prognoza i zaliczki; dodatkowo testy krajów, prognoz i sezonów krajowych.
