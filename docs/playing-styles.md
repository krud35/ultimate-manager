# Playing styles

36 stylów. Kategorie służą dokumentacji i nie blokują kombinacji między rolami.
Thinks fast jest cechą mentalną, nie stylem gry.

Pięć nowych stylów działa w pełnej symulacji przestrzennej; szybki silnik nie odtwarza
zwodów, ruchu przy linii ani planowania skoków. Brak sztucznego bonusu do celności
lub szybkości w ich zastępstwie.

Attacks the disc high: waga losowania według najniższej z wartości jump/cutTiming/catching:
poniżej 75 → 0,25; 75–79 → 1; 80–84 → 2; od 85 → 4. To preferencja, nie zakaz.
Osobowość pozostaje niezależna od umiejętności.

## Thrower

| Styl | Działanie |
|---|---|
| Huck lover | Chętnie sięga po długie rzuty na bramkę. |
| Reset first | Wcześniej szuka resetu, rzadziej przedłuża posiadanie. |
| Cautious with the disc | Wymaga bezpieczniejszego okna podania; nie gwarantuje bezbłędnej gry. |
| Creative thrower | Chętnie rozważa nietypowe podania, bez automatycznej skłonności do błędów. |
| Hammer happy | Chętnie sięga po rzuty zza góry (hammer). |
| Looks for breaks | Chętniej szuka podania na zamkniętą stronę marka. |
| Iso ball | Woli rozegrać sytuację jeden na jeden niż czekać na reset. |
| Zone breaker | Skuteczny w rozbijaniu obrony strefowej. |
| Good insides | Precyzyjniej wykonuje zakrzywienie inside-out backhandem i forehandem. |
| Good arounds | Precyzyjniej wykonuje zakrzywienie outside-in backhandem i forehandem. |
| Fakes a lot | Częściej zwodzi marka przed podaniem, poświęcając czas posiadania. |

## Receiver

| Styl | Działanie |
|---|---|
| Deep threat | Szuka głębokich wycięć w stronę strefy końcowej. |
| Under cutter | Preferuje krótkie, podstawowe wycięcia. |
| Dives for the disc | Częściej podejmuje trudną próbę layoutu, bez dodatkowej kary do ryzyka urazu. |
| Aggressive cutter | Wycina się często i zdecydowanie. |
| Hesitant cutter | Waha się przy wycięciach, przez co traci okazje. |
| Long cuts | Wybiera dalsze cele i dłużej kontynuuje kierunek przed powrotem pod dysk. |
| Quick cuts | Wybiera bliższe cele i częściej zmienia kierunek; częściej zatłacza przestrzeń. |
| Double-move cutter | Poprzedza cut zwodem; dobry timing pomaga rozpocząć przygotowanie wcześniej. |
| Sideline receiver | Chętniej szuka okien podania blisko linii bocznej, gdzie ma mniej miejsca na chwyt. |
| Attacks the disc high | Chętniej planuje chwyt w wyskoku; wykonanie zależy od wyskoku, timingu i chwytu. |

## Offense

| Styl | Działanie |
|---|---|
| Wants the disc | Zawsze chce być w centrum akcji z dyskiem. |
| Keeps the structure | Preferuje pozostanie w strukturze ofensywnej. |
| Give and go | Po podaniu chętniej rusza po krótkie podanie zwrotne. |
| Upline seeker | Jako reset chętniej atakuje przestrzeń przed dyskiem wzdłuż linii. |
| Switches play | Chętniej przenosi dysk na drugą stronę boiska. |
| Attacks turnovers | Po odzyskaniu dysku chętniej szuka szybkiego podania do przodu. |
| Settles turnovers | Po odzyskaniu dysku chętniej zabezpiecza posiadanie krótkim podaniem. |

## Defense

| Styl | Działanie |
|---|---|
| Sticks to the matchup | Preferuje bliskie krycie swojego zawodnika i rzadziej odchodzi do pomocy. |
| Poacher | Szuka okazji do przechwytu, czasem kosztem swojego podopiecznego. |
| Physical mark | Wywiera silną presję na markującym rzucającego. |
| Soft mark | Markuje zbyt łagodnie, dając rywalowi zbyt dużo przestrzeni. |
| Contact prone | Markuje blisko i ryzykuje uraz w kontakcie. |
| Denies deep first | Oddaje więcej miejsca pod dysk, chroniąc głębię. |
| Denies under first | Zamyka krótkie podanie kosztem większego ryzyka za plecami. |
| Recovery defense | Po stracie najpierw wraca chronić przestrzeń za plecami, zamiast naciskać dysk. |

## Modyfikatory

Wagi opcji nie są bezpośrednimi procentami skuteczności. Fizyczny ruch, kontakt
i wykonanie nadal podlegają atrybutom i ograniczeniom silnika.

### Huck lover

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| huckWeightMult | 1 | 1.55 |
| dumpWeightMult | 1 | 0.75 |

### Reset first

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| huckWeightMult | 1 | 0.55 |
| dumpWeightMult | 1 | 1.55 |
| dumpEarlyBias | 0 | 0.45 |
| huckAcceptanceDelta | 0 | -0.1 |
| scoringOptionBonus | 0 | -0.08 |
| resetFirstStallBias | 0 | 1.5 |

### Cautious with the disc

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| huckWeightMult | 1 | 0.7 |
| dumpWeightMult | 1 | 1.25 |
| ottWeightMult | 1 | 0.65 |
| standardWeightMult | 1 | 1.15 |
| heroThrowWeightMult | 1 | 0.8 |
| safeOptionBias | 0 | 0.55 |
| acceptanceThresholdDelta | 0 | 8 |

### Creative thrower

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| ottWeightMult | 1 | 1.45 |
| standardWeightMult | 1 | 0.85 |
| heroThrowWeightMult | 1 | 1.3 |
| breakSideOptionBonus | 0 | 0.12 |

### Hammer happy

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| ottWeightMult | 1 | 1.6 |

### Looks for breaks

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| heroThrowWeightMult | 1 | 1.2 |
| acceptanceThresholdDelta | 0 | -5 |
| breakSideOptionBonus | 0 | 0.18 |

### Iso ball

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| dumpWeightMult | 1 | 0.75 |
| heroThrowWeightMult | 1 | 1.15 |
| dumpEarlyBias | 0 | -0.35 |
| scoringOptionBonus | 0 | 0.18 |
| structureComplianceBonus | 0 | -0.05 |
| plantMsMult | 1 | 1.12 |

### Zone breaker

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| ottWeightMult | 1 | 1.15 |
| breakSideOptionBonus | 0 | 0.08 |
| zoneOffenseWeightMult | 1 | 1.45 |

### Good insides

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| insideControlBonus | 0 | 0.08 |

### Good arounds

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| aroundControlBonus | 0 | 0.08 |

### Fakes a lot

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| fakeFrequency | 0 | 1 |

### Deep threat

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| deepCutBias | 0 | 0.35 |

### Under cutter

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| underCutBias | 0 | 0.35 |

### Dives for the disc

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| layoutAttemptMult | 1 | 1.35 |

### Aggressive cutter

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| clearActiveCutMult | 1 | 1.1 |
| cutRollMult | 1 | 1.45 |
| cutPriorityDelta | 0 | -8 |

### Hesitant cutter

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| cutRollMult | 1 | 0.55 |
| cutPriorityDelta | 0 | 8 |

### Long cuts

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| cutLengthMult | 1 | 1.35 |
| cutCommitMult | 1 | 1.3 |

### Quick cuts

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| cutLengthMult | 1 | 0.7 |
| cutCommitMult | 1 | 0.7 |
| clogChanceMult | 1 | 1.15 |

### Double-move cutter

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| doubleMove | 0 | 1 |

### Sideline receiver

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| sidelineBias | 0 | 1 |

### Attacks the disc high

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| highDiscAttack | 0 | 1 |

### Wants the disc

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| clearActiveCutMult | 1 | 1.15 |
| clogChanceMult | 1 | 1.3 |
| cutRollMult | 1 | 1.4 |
| cutPriorityDelta | 0 | -6 |

### Keeps the structure

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| clearActiveCutMult | 1 | 0.85 |
| clearLaneExtraM | 0 | 1 |
| clogChanceMult | 1 | 0.55 |
| cutRollMult | 1 | 0.88 |
| structureComplianceBonus | 0 | 0.12 |

### Give and go

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| giveAndGoBias | 0 | 1 |

### Upline seeker

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| uplineBias | 0 | 1 |

### Switches play

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| swingBias | 0 | 1 |

### Attacks turnovers

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| transitionBias | 0 | 1 |

### Settles turnovers

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| transitionBias | 0 | -1 |

### Sticks to the matchup

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| cushionDeltaM | 0 | -0.35 |
| poachChanceMult | 1 | 0.55 |

### Poacher

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| cushionDeltaM | 0 | 0.3 |
| poachMarkPressureMult | 1 | 0.82 |
| poachChanceMult | 1 | 1.55 |

### Physical mark

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| huckBlockRisk | 0 | 2 |
| cushionDeltaM | 0 | -0.15 |
| markPressureBonus | 0 | 5 |

### Soft mark

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| cushionDeltaM | 0 | 0.35 |
| markPressureBonus | 0 | -5 |
| poachMarkPressureMult | 1 | 0.9 |

### Contact prone

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| injuryChanceMult | 1 | 1.15 |
| decisionNoiseMult | 1 | 1.08 |
| cushionDeltaM | 0 | -0.15 |
| markPressureBonus | 0 | 3 |
| blockChanceMult | 1 | 0.92 |

### Denies deep first

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| denyUnderBias | 0 | -0.25 |
| helpDeepBias | 0 | 0.2 |

### Denies under first

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| denyUnderBias | 0 | 0.3 |

### Recovery defense

| Parametr | Bez cechy | Z cechą |
|---|---:|---:|
| recoveryDefense | 0 | 1 |
