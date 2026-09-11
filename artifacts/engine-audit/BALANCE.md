# Balans pełnego silnika — 9 września 2026

Wprowadzono i sprawdzono zmiany mechaniki obrony, wyskoku, odzyskiwania i przejęć dysku oraz wspólną krzywą zmęczenia rzutu. Zakończono iterację balansu obejmującą kontrolowane sytuacje i pełne mecze. Nie jest to certyfikacja realizmu na danych ligi: brak zewnętrznego zbioru obserwacji, a próby meczowe są niewielkie.

**Co zmienia zachowanie zawodników**

- Obrońca może przejąć dysk. Sam udany kontakt nadal nie gwarantuje utrzymania: decyzja chwyt/zbij zależy od prędkości i pozycji, chwyt od catching i trudności, a chwyt w powietrzu musi przetrwać lądowanie. Legalne przejęcie kończy się dyskiem w rękach obrońcy; nie ma podnoszenia przez przypadkowego kolegę. Przejęcie w atakowanej przez niego strefie może dać punkt.
- Czas wyskoku odnosi się do przewidywanego kontaktu, a nie nominalnego końca toru. Odbierający i obrońca mogą sięgnąć po opadający dysk wcześniej.
- Obrońca może poczekać jeden krok na głębszy kontakt, jeśli przeciwnik nie ma już okazji chwytu. Presja na odbiorcę wynika z rzeczywistego zasięgu zareagowanego obrońcy, nie wyłącznie ze zbieżności dwóch przecięć w oknie około 2 ms.
- Zbicie obrońcy kieruje dysk w dół, z siłą zależną od jakości kontaktu. Drop nie odwraca automatycznie opadającego dysku ku górze. Dysk pozostaje żywy do ziemi; odzyskanie po odbiciu wymaga czasu reakcji. Rejestruje się moment kontaktu wewnątrz ticka.
- Jedna kara wykonania rzutu zastępuje sumę accuracy + performance + collapse. Ta sama formuła działa w trybie pełnym i fast. Pozostałe skutki zmęczenia ruchu, percepcji, opanowania i chwytu pozostają odrębnymi mechanizmami.

**Przyjęte parametry i odrzucona próba**

Pozostawiono bazę szansy bloku 0,1 i wpływ umiejętności 0,28. Próba 0,45/0,5 wraz z przejęciami dawała około 43 bloków na mecz i 78,5% celnych podań; została odrzucona. Wzrost liczby bloków w końcowej wersji wynika z mechaniki, bez tego mnożnika. Granica wyboru chwytu przez obrońcę to 14 m/s, reakcja po odbiciu max(80, 200 − reactions) ms. Są to parametry projektowe wymagające dalszej walidacji, nie pomiary fizjologiczne.

Kara wykonania = 24 × max(0, (80 − energia)/80)^1,5. Przy energii 20 spada z 38,61 do 15,59 punktu, przy 0 wynosi 24. Nie ma skoku kary na progach 30/45/50. Nie zmieniono kosztów sprintu, rotacji ani regeneracji.

| Energia | Kara wykonania | Celne incuty / 256 |
|---:|---:|---:|
| 0 | 24.00 | 207 |
| 20 | 15.59 | 236 |
| 40 | 8.49 | 250 |
| 60 | 3.00 | 252 |

**Kontrolowane sytuacje**

Siedem końcowych wariantów po 17 sytuacji × 2 warstwy × 256 seedów daje 60 928 przebiegów. Warianty to kontrola, przyjęty model, rozłączne seedy walidacyjne, obrońcy 60 oraz energia 0/40/60. Idealny lot usuwa błędy wykonania, ale zachowuje losowość chwytu. Tabela pokazuje warstwę wykonania. Kontrola odtwarza dawne parametry obrony i sumę kar zmęczenia; zawiera wspólne poprawki obsługi czasu odbicia, więc nie jest bajtową kopią dawnego silnika.

| Sytuacja | Kontrola | Przyjęte | Walidacja | Obrońcy 60 |
|---|---:|---:|---:|---:|
| incut | 252 | 252 | 256 | 252 |
| reset | 254 | 254 | 256 | 254 |
| double_coverage | 246 | 232 | 233 | 246 |
| deep_open | 242 | 252 | 250 | 252 |
| sideline | 256 | 256 | 256 | 256 |
| returning_arc | 256 | 256 | 256 | 256 |
| outside | 0 | 0 | 0 | 0 |
| toe_in | 256 | 256 | 255 | 256 |
| toe_out | 0 | 0 | 0 | 0 |
| tip_recovery | 256 | 256 | 256 | 256 |
| fatigued_incut | 163 | 236 | 244 | 236 |

Przyjęty model: 19 przejęć w 256 wymuszonych huckach w podwójne krycie; po obniżeniu całego profilu obrońców do 60 — 7 przejęć. To test całego profilu, nie izolowanej statystyki blocking. Atak nadal łapie około 91% podań w tej konkretnej wymuszonej geometrii, więc nie traktować jej jako kompletnego modelu wszystkich podwójnych kryć. Próby decyzyjne nadal mogą odrzucić rzut, którego wykonanie wymuszono w scenariuszu.

**Pełne mecze**

Główne porównanie: te same 8 seedów, te same dwa rzeczywiste składy demonstracyjne, normalna rotacja i adaptacja, ten sam sposób generowania pogody. Dodatkowo 8 końcowych meczów przy stałym wietrze 20 mph / 90°, na innych seedach. Mecze są zależnymi sekwencjami akcji: tysiące podań nie zastępują tysięcy niezależnych meczów.

| Wskaźnik | Przed | Po | Wiatr 20 mph, inna próba |
|---|---:|---:|---:|
| Celne podania (%) | 84.78 | 83.93 | 83.92 |
| Hold (%) | 37.11 | 40.88 | 44.26 |
| Hold bez straty (%) | 23.27 | 23.76 | 21.86 |
| Straty na punkt | 1.53 | 1.87 | 1.68 |
| Bloki na mecz | 4.88 | 15.75 | 17.25 |
| Rzuty na punkt | 10.08 | 11.66 | 10.46 |
| Stall-out na mecz | 0.00 | 0.00 | 0.00 |
| Awaryjne limity rzutów | 0.00 | 0.00 | 0.00 |

Średnia sparowana zmiana skuteczności per mecz: -0.43 pp; przybliżony przedział 95%: -3.10 do 2.25 pp. Przedział służy pokazaniu niepewności małej próby. Powyższa tabela używa skuteczności ważonej liczbą podań, dlatego różnica agregatów może być inna.

Fast, 16 meczów: 85.45% → 85.71%. Nie wyrównywano obu trybów jednym mnożnikiem: pełny tryb rozstrzyga kontakt geometrycznie, fast pozostaje przybliżeniem. W końcowych pełnych meczach nie wystąpiły stall-outy ani awaryjne limity; brak stall-outów w małej próbie nie jest dowodem dobrego balansu stall.

**Kontrola stron i trenera**

W testach diagnostycznych identyczny roster z innym id klubu nie był identyczną drużyną: auto-substitution uzupełnia instrukcje z profilu trenera także przy fixed-tactics. Skrypt mirror zachowuje teraz tożsamość klubu i zmienia tylko identyfikatory zawodników. Przy wspólnym trenerze średnia różnica fast w 16 meczach wyniosła +0,125 punktu. W dwóch próbach pełnych po 8 meczów, przed ostatnią poprawką zachowania posiadacza, wyniki to +1,875 i −4,25 po zamianie stron/identyfikatorów (łącznie 6 zwycięstw home na 16). Nie ma podstaw, by z tych prób ogłosić idealną symetrię lub dodać kompensującą premię strony. Te diagnostyczne pliki nie są końcową referencją skuteczności.

**Weryfikacja i odtwarzanie**

Przeszły check-balance (krzywa i scenariusze), check-recommendations, check-player-behavior, check-engine-realism oraz check-disc-flight: 4 pełne mecze, 923 chwyty i 155 strat. Ostatni sprawdza również, że po przejęciu ten sam obrońca jest rzucającym nowego posiadania. Targetowany ESLint i build przeszły; pozostaje ostrzeżenie o rozmiarze bundle.

```powershell
node scripts/balance-engine.mjs --fast 16 --full 8 --offset 4900 --output artifacts/engine-audit/balance-release.json
node scripts/balance-engine.mjs --fast 0 --full 8 --offset 16400 --wind 20 --direction 90 --output artifacts/engine-audit/balance-release-wind.json
node scripts/balance-engine.mjs --situations --n 256 --output artifacts/scenarios/balance-accepted.json
node scripts/balance-engine.mjs --situations --n 256 --offset 81000 --output artifacts/scenarios/balance-accepted-validation.json
node scripts/balance-engine.mjs --situations --n 256 --legacy-defense --legacy-fatigue --output artifacts/scenarios/balance-control.json
node scripts/balance-engine.mjs --situations --n 256 --defender-skill 60 --output artifacts/scenarios/balance-defender60.json
# Analogicznie: --fatigued-energy 0, 40 i 60; pliki balance-energy0/40/60.json.
node scripts/check-balance.mjs
node scripts/check-disc-flight.mjs
node scripts/report-engine-balance.mjs
```

balance-summary.json zawiera główne wyniki, sparowane różnice i hashe bieżących plików modelu. balance-losses.json zawiera każdą stratę obu warstw przyjętych scenariuszy, wraz z diagnozą, odczytami odbierającego i kontaktami. Pliki eksperymentów zapisują parametry i hashe wybranych źródeł w chwili startu; nie stanowią kompletnego snapshotu repozytorium.

**Granice ukończonej iteracji**

Wciąż wymagają dalszej kalibracji: przestrzeń zajmowana przez ciała przy ciasnym kryciu, poziom trudności chwytu pod presją, dłuższe serie na różnych rosterach i taktykach oraz segmenty wiatru/dystansu/poziomu umiejętności. Podobna ogólna skuteczność przy silnym wietrze nie dowodzi braku jego wpływu ani poprawnego balansu: wybór podań i przebieg meczu się zmieniają. Nie dopasowano modelu do empirycznych danych ligi. Wszystkie wcześniejsze balance-after/final/mirror/downward/jump-clock są eksperymentami pośrednimi; końcową referencją pełnych meczów są balance-release i balance-release-wind.
