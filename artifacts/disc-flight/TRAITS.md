# Inwentarz wpływu cech zawodników

Katalog: 82 cech. Każda porównana z zawodnikiem bez cech. Wartości dotyczą pojedynczej cechy; zestawy przechodzą agregację i ograniczenia w getTraitMods.

To analiza statycznych połączeń, nie pomiar siły efektu ani dowód, że każda gałąź występuje w każdym meczu. Forma i rozwój mogą zmieniać karierę bez bezpośredniego wpływu na decyzje w bieżącym punkcie. Pełna lista plików używających modyfikatorów jest w trait-effects.json. Sześć premii zależnych od typu rzutu jest używanych przez pomocnicze funkcje wewnątrz playerTraits.js.

| Cecha | Znaczenie deklarowane w grze | Modyfikatory: domyślnie → z cechą |
|---|---|---|
| Zdeterminowany (determined) | Rzadko załamuje się po porażkach — wraca silniejszy. | lossMoraleMult: 1 → 0.55; zeroPpFormDelta: -1.2 → -0.5; lossFormMult: 1 → 0.7; lowStaminaMovePenaltyMult: 1 → 0.75 |
| Lider (leader) | Podnosi na duchu kolegów z drużyny. | lossMoraleMult: 1 → 0.75; teamAuraEmit: 0 → 0.55 |
| Głos na boisku (vocal) | Dodaje drużynie energii swoją obecnością na boisku. | teamAuraEmit: 0 → 0.35 |
| Samotnik (loner) | Trzyma się na uboczu — mało wpływa na drużynę i mało z niej czerpie. | teamAuraRecvMult: 1 → 0.15 |
| Pewny siebie (confident) | Nie traci pewności siebie po pojedynczym błędzie. | lossMoraleMult: 1 → 0.7; turnoverMoraleExtra: 0 → -0.25; highStallAccuracy: 0 → 2; acceptanceThresholdDelta: 0 → 3 |
| Krucha pewność siebie (fragile_ego) | Ciężko przeżywa błędy i porażki. | lossMoraleMult: 1 → 1.45; turnoverMoraleExtra: 0 → 0.4 |
| Profesjonalista (professional) | Stabilny i konsekwentny — dobrze przygotowany na każdy mecz. | zeroPpFormDelta: -1.2 → -0.35; formDriftMult: 1 → 1.45; trainingFatigueMult: 1 → 0.82; decisionNoiseMult: 1 → 0.9; structureComplianceBonus: 0 → 0.08 |
| Porywczy (hot_headed) | Traci głowę pod presją, co prowadzi do pochopnych decyzji. | huckWeightMult: 1 → 1.25; ottWeightMult: 1 → 1.25; highStallAccuracy: 0 → -6; lowStallAccuracy: 0 → -2; decisionNoiseMult: 1 → 1.25 |
| Opanowany (composed) | Zachowuje spokój i celność nawet pod dużą presją. | highStallAccuracy: 0 → 5; lowStallAccuracy: 0 → 2; stall8PlusAccuracy: 0 → 3; badDecisionMult: 1 → 0.7; decisionNoiseMult: 1 → 0.85 |
| Clutch (clutch) | Rośnie w kluczowych momentach meczu. | highStallAccuracy: 0 → 4; stall8PlusAccuracy: 0 → 6; badDecisionMult: 1 → 0.75; decisionNoiseMult: 1 → 0.85 |
| Nerwowy (nervous) | Pod presją traci pewność i częściej się myli. | turnoverMoraleExtra: 0 → 0.35; highStallAccuracy: 0 → -5; lowStallAccuracy: 0 → -2; stall8PlusAccuracy: 0 → -4; badDecisionMult: 1 → 1.3; decisionNoiseMult: 1 → 1.2 |
| Team first (team_first) | Stawia bezpieczną, zespołową grę ponad własne statystyki. | goalAssistMoraleMult: 1 → 0.85; huckWeightMult: 1 → 0.7; dumpWeightMult: 1 → 1.35; ottWeightMult: 1 → 0.85; heroThrowWeightMult: 1 → 0.85; dumpEarlyBias: 0 → 0.35; huckAcceptanceDelta: 0 → -0.08; scoringOptionBonus: 0 → -0.12; resetFirstStallBias: 0 → 1 |
| Łowca chwały (glory_hunter) | Szuka okazji do zdobycia gola lub asysty, nawet kosztem ryzyka. | goalAssistMoraleMult: 1 → 1.45; goalAssistFormMult: 1 → 1.35; huckWeightMult: 1 → 1.4; dumpWeightMult: 1 → 0.7; ottWeightMult: 1 → 1.2; heroThrowWeightMult: 1 → 1.25; huckAcceptanceDelta: 0 → 0.12; scoringOptionBonus: 0 → 0.22; huckAccuracy: 0 → -2 |
| Pracowity (workhorse) | Nie odpuszcza — dobrze znosi mecze i obciążenie treningowe. | trainingFatigueMult: 1 → 0.8; benchRegenBonus: 0 → 2; oLineCostMult: 1 → 0.9 |
| Leniwy (lazy) | Unika wysiłku i szybciej się męczy. | zeroPpFormDelta: -1.2 → -1.8; trainingFatigueMult: 1 → 1.2; benchRegenBonus: 0 → -3; oLineCostMult: 1 → 1.15; dLineCostMult: 1 → 1.15; lowStaminaMovePenaltyMult: 1 → 1.35 |
| Lubi hucki (huck_lover) | Chętnie sięga po długie rzuty na bramkę. | huckWeightMult: 1 → 1.55; dumpWeightMult: 1 → 0.75; huckAccuracy: 0 → 4; huckSpreadMult: 1 → 0.94; huckBlockRisk: 0 → 3 |
| Dump guy (dump_guy) | Preferuje bezpieczne, krótkie zagrania do resetu. | huckWeightMult: 1 → 0.55; dumpWeightMult: 1 → 1.55; dumpEarlyBias: 0 → 0.45; huckAcceptanceDelta: 0 → -0.1; scoringOptionBonus: 0 → -0.08; dumpAccuracy: 0 → 4; resetFirstStallBias: 0 → 1.5 |
| Safe hands (safe_hands) | Gra z dyskiem bardzo bezpiecznie, unikając niepotrzebnego ryzyka. | huckWeightMult: 1 → 0.7; dumpWeightMult: 1 → 1.25; ottWeightMult: 1 → 0.65; standardWeightMult: 1 → 1.15; heroThrowWeightMult: 1 → 0.8; safeOptionBias: 0 → 0.55; huckAccuracy: 0 → -1; dumpAccuracy: 0 → 3; highStallAccuracy: 0 → 2; badDecisionMult: 1 → 0.75; acceptanceThresholdDelta: 0 → 8 |
| Kreatywny rzucający (creative_thrower) | Szuka nietypowych, ryzykownych podań. | ottWeightMult: 1 → 1.45; standardWeightMult: 1 → 0.85; heroThrowWeightMult: 1 → 1.3; creativeRiskBias: 0 → 0.55; ottAccuracy: 0 → 3; standardAccuracy: 0 → -2; huckBlockRisk: 0 → 3; ottBlockRisk: 0 → 5; decisionNoiseMult: 1 → 1.1; acceptanceThresholdDelta: 0 → -7; breakSideOptionBonus: 0 → 0.12 |
| Hammer happy (hammer_happy) | Chętnie sięga po rzuty zza góry (hammer). | ottWeightMult: 1 → 1.6; ottAccuracy: 0 → 4; ottBlockRisk: 0 → 4 |
| Deep threat (deep_threat) | Szuka głębokich wycięć w stronę strefy końcowej. | deepCutBias: 0 → 0.35; deepSpeedMult: 1 → 1.06 |
| Under cutter (under_cutter) | Preferuje krótkie, podstawowe wycięcia. | underCutBias: 0 → 0.35 |
| Layout machine (layout_machine) | Bez wahania rzuca się do dysku w powietrzu. | aerialRecvMult: 1 → 1.1; layoutAerialMult: 1 → 1.35 |
| Agresywny cutter (aggressive_cutter) | Wycina się często i zdecydowanie. | clearActiveCutMult: 1 → 1.1; cutRollMult: 1 → 1.45; cutPriorityDelta: 0 → -8 |
| Wahający się cutter (hesitant_cutter) | Waha się przy wycięciach, przez co traci okazje. | cutRollMult: 1 → 0.55; cutPriorityDelta: 0 → 8 |
| Dobry timing (good_timing) | Świetnie wyczuwa właściwy moment na wycięcie. | clogChanceMult: 1 → 0.75; timingCutBias: 0 → 0.55 |
| Big man (big_man) | Dominuje w pojedynkach powietrznych. | catchBonus: 0 → 3; aerialRecvMult: 1 → 1.35; aerialDefMult: 1 → 1.15; layoutAerialMult: 1 → 1.2 |
| Chce dysk (wants_the_disc) | Zawsze chce być w centrum akcji z dyskiem. | clearActiveCutMult: 1 → 1.15; clogChanceMult: 1 → 1.3; cutRollMult: 1 → 1.4; cutPriorityDelta: 0 → -6 |
| Zdyscyplinowany (disciplined) | Trzyma się ustalonej struktury ofensywnej. | clearActiveCutMult: 1 → 0.85; clearLaneExtraM: 0 → 1; clogChanceMult: 1 → 0.55; cutRollMult: 1 → 0.88; structureComplianceBonus: 0 → 0.12 |
| Shutdown (shutdown) | Twardo kryje swojego rywala, nie dając mu przestrzeni. | cushionDeltaM: 0 → -0.45; reactionDelayDeltaMs: 0 → -40; blockChanceMult: 1 → 1.08; poachChanceMult: 1 → 0.55 |
| Poacher (poacher) | Szuka okazji do przechwytu, czasem kosztem swojego podopiecznego. | cushionDeltaM: 0 → 0.3; reactionDelayDeltaMs: 0 → 30; blockChanceMult: 1 → 1.2; poachMarkPressureMult: 1 → 0.82; poachChanceMult: 1 → 1.55 |
| Fizyczny mark (physical_mark) | Wywiera silną presję na markującym rzucającego. | huckBlockRisk: 0 → 2; cushionDeltaM: 0 → -0.15; markPressureBonus: 0 → 5 |
| Soft mark (soft_mark) | Markuje zbyt łagodnie, dając rywalowi zbyt dużo przestrzeni. | cushionDeltaM: 0 → 0.35; markPressureBonus: 0 → -5; poachMarkPressureMult: 1 → 0.9 |
| Nieustępliwy (relentless) | Nie zwalnia tempa nawet przy dużym zmęczeniu. | benchRegenBonus: 0 → 1; dLineCostMult: 1 → 0.85; lowStaminaMovePenaltyMult: 1 → 0.5 |
| Elitarny huck (elite_huck) | Wybitnie celny w długich rzutach na bramkę. | huckAccuracy: 0 → 7; huckSpreadMult: 1 → 0.9 |
| Klejące ręce (glue_hands) | Rzadko gubi dysk przy chwycie. | catchBonus: 0 → 5; aerialRecvMult: 1 → 1.2 |
| Sprinter (track_star) | Wyjątkowo szybki na otwartym boisku. | speedMult: 1 → 1.05 |
| Vertical threat (vertical_threat) | Groźny w powietrzu — wysoko i pewnie skacze po dysk. | aerialRecvMult: 1 → 1.2; aerialDefMult: 1 → 1.2 |
| Generał pola (field_general) | Świetnie czyta grę i widzi opcje niedostępne innym. | decisionNoiseMult: 1 → 0.65; scanRadiusBonusM: 0 → 3.5; perceivedOptionsBonus: 0 → 1; acceptanceThresholdDelta: 0 → 2; structureComplianceBonus: 0 → 0.04 |
| Smart (smart) | Podejmuje przemyślane, trafne decyzje z dyskiem. | highStallAccuracy: 0 → 2; lowStallAccuracy: 0 → 1; badDecisionMult: 1 → 0.8; decisionNoiseMult: 1 → 0.78; scanRadiusBonusM: 0 → 2; perceivedOptionsBonus: 0 → 1 |
| Quick (quick) | Błyskawicznie reaguje i zmienia kierunek biegu. | cutRollMult: 1 → 1.1; reactionDelayDeltaMs: 0 → -28; speedMult: 1 → 1.04; plantMsMult: 1 → 0.82 |
| Adaptive (adaptive) | Łatwo dostosowuje się do zmieniającej się sytuacji i formy. | lossMoraleMult: 1 → 0.85; formDriftMult: 1 → 1.5; lossFormMult: 1 → 0.85; trainingFatigueMult: 1 → 0.9; decisionNoiseMult: 1 → 0.92; structureComplianceBonus: 0 → 0.05 |
| Lockdown (lockdown) | Bardzo trudny do ograna w obronie jeden na jeden. | cushionDeltaM: 0 → -0.35; reactionDelayDeltaMs: 0 → -30 |
| Skłonny do błędów (turnover_prone) | Częściej traci dysk przez nieprzemyślane decyzje. | turnoverMoraleExtra: 0 → 0.2; heroThrowWeightMult: 1 → 1.1; highStallAccuracy: 0 → -5; badDecisionMult: 1 → 1.35; decisionNoiseMult: 1 → 1.15; acceptanceThresholdDelta: 0 → -4 |
| Showboat (showboat) | Lubi efektowne, ryzykowne zagrania kosztem skuteczności. | huckWeightMult: 1 → 1.35; ottWeightMult: 1 → 1.35; standardWeightMult: 1 → 0.85; huckAccuracy: 0 → -3; ottAccuracy: 0 → -3 |
| Łatwo się poddaje (quitter) | Gdy sprawy idą źle, łatwo traci zaangażowanie. | lossMoraleMult: 1 → 1.55; zeroPpFormDelta: -1.2 → -2; lossFormMult: 1 → 1.55; lowStaminaMovePenaltyMult: 1 → 1.25 |
| Lojalny (loyal) | Ceni stabilność i rzadko myśli o odejściu z klubu. | loyaltyGainMult: 1 → 1.25; loyaltyLossMult: 1 → 0.75; wageDemandMult: 1 → 0.96; transferWillingnessDelta: 0 → -0.18; preferredYearsDelta: 0 → 1 |
| Najemnik (mercenary) | Łatwo skuszony lepszą ofertą z innego klubu. | loyaltyGainMult: 1 → 0.7; loyaltyLossMult: 1 → 1.35; wageDemandMult: 1 → 1.12; transferWillingnessDelta: 0 → 0.2; preferredYearsDelta: 0 → -1 |
| Skromny (modest) | Ma umiarkowane oczekiwania finansowe. | wageDemandMult: 1 → 0.88 |
| Chciwy (greedy) | Oczekuje wysokiego wynagrodzenia. | wageDemandMult: 1 → 1.2 |
| Domator (homebody) | Niechętnie zmienia klub i otoczenie. | transferWillingnessDelta: 0 → -0.14; preferredYearsDelta: 0 → 0.5; benchMoraleSensitivity: 1 → 0.7 |
| Niespokojny (restless) | Szuka nowych wyzwań i częściej myśli o transferze. | transferWillingnessDelta: 0 → 0.16; preferredYearsDelta: 0 → -0.75 |
| Showman (showman) | Kwitnie w blasku fanów, ale też mocniej odczuwa ich nastroje. | goalAssistMoraleMult: 1 → 1.1; fanMoodMoraleSensitivity: 0 → 0.9; performanceFanMoodMult: 1 → 1.45 |
| Lękliwy pod presją (anxious) | Presja oczekiwań fanów ciąży mu bardziej niż innym. | fanMoodMoraleSensitivity: 0 → 1.15 |
| Charyzmatyczny (charismatic) | Dobrze wypada w mediach i przed kamerami. | mediaPositiveMoraleMult: 1 → 1.3; mediaNegativeMoraleMult: 1 → 0.7 |
| Nieśmiały (shy) | Unika mediów i źle znosi publiczną krytykę. | mediaPositiveMoraleMult: 1 → 0.7; mediaNegativeMoraleMult: 1 → 1.35 |
| Zadowolony ze swojej roli (content) | Rzadko narzeka na swoją rolę w drużynie. | promisePlayingTimeBias: 0 → -0.2; benchMoraleSensitivity: 1 → 0.55 |
| Ambitny (ambitious) | Oczekuje więcej minut na boisku i szans na rozwój. | wageDemandMult: 1 → 1.06; promisePlayingTimeBias: 0 → 0.45; benchMoraleSensitivity: 1 → 1.45 |
| Ciekawy (curious) | Chętnie się uczy i ceni możliwości rozwoju. | wageDemandMult: 1 → 0.94; promiseDevelopmentBias: 0 → 0.5; trainingFatigueMult: 1 → 0.92 |
| Niecierpliwy (impatient) | Oczekuje szybkich efektów i szans na boisku. | wageDemandMult: 1 → 1.08; transferWillingnessDelta: 0 → 0.08; promisePlayingTimeBias: 0 → 0.25; promiseDevelopmentBias: 0 → 0.15; benchMoraleSensitivity: 1 → 1.25 |
| Wyluzowany (relaxed) | Dobrze się regeneruje mentalnie w wolnym czasie. | chillRoomMoraleMult: 1 → 1.5 |
| Stoicki (stoic) | Niewzruszony — trudno wytrącić go z równowagi. | lossMoraleMult: 1 → 0.9; chillRoomMoraleMult: 1 → 0.5 |
| Samolubny (selfish) | Gra bardziej dla własnych statystyk niż dla drużyny. | goalAssistMoraleMult: 1 → 1.35; goalAssistFormMult: 1 → 1.2; teamAuraEmit: 0 → -0.25; teamAuraRecvMult: 1 → 0.7; huckWeightMult: 1 → 1.15; dumpWeightMult: 1 → 0.85; scoringOptionBonus: 0 → 0.15 |
| Uparty (stubborn) | Trzyma się swojego stylu gry, trudno go zmienić. | huckWeightMult: 1 → 1.15; dumpWeightMult: 1 → 0.7; dumpEarlyBias: 0 → -0.25; acceptanceThresholdDelta: 0 → -3; structureComplianceBonus: 0 → -0.06 |
| Perfekcjonista (perfectionist) | Dąży do bezbłędnej gry, ale ciężko znosi własne pomyłki. | lossMoraleMult: 1 → 1.15; turnoverMoraleExtra: 0 → 0.45; safeOptionBias: 0 → 0.35; standardAccuracy: 0 → 2; badDecisionMult: 1 → 0.85; acceptanceThresholdDelta: 0 → 5 |
| Przemyślacza (overthinker) | Zbyt długo analizuje sytuację, zanim podejmie decyzję. | huckWeightMult: 1 → 0.85; heroThrowWeightMult: 1 → 0.85; dumpEarlyBias: 0 → 0.15; creativeRiskBias: 0 → -0.25; acceptanceThresholdDelta: 0 → 6; plantMsMult: 1 → 1.18 |
| Tunel (tunnel_vision) | Skupia się na jednej opcji, nie widząc reszty boiska. | dumpWeightMult: 1 → 0.65; dumpAccuracy: 0 → -4; decisionNoiseMult: 1 → 1.15; scanRadiusBonusM: 0 → -2; perceivedOptionsBonus: 0 → -1 |
| Samozadowolony (complacent) | Traci mobilizację, gdy sprawy idą dobrze. | zeroPpFormDelta: -1.2 → -1.6; formDriftMult: 1 → 0.7; winFormMult: 1 → 0.55 |
| Diva (diva) | Wymagający wobec klubu, bardzo wrażliwy na swoją rolę. | teamAuraRecvMult: 1 → 0.6; loyaltyLossMult: 1 → 1.2; wageDemandMult: 1 → 1.22; mediaNegativeMoraleMult: 1 → 1.25; benchMoraleSensitivity: 1 → 1.5 |
| Kompleks (chip_on_shoulder) | Gra z pretensją do świata — przeciwności go napędzają, ale i mocno uwierają. | lossMoraleMult: 1 → 0.8; turnoverMoraleExtra: 0 → 0.3; lossFormMult: 1 → 0.75; mediaNegativeMoraleMult: 1 → 1.2; highStallAccuracy: 0 → 2 |
| Competitor (competitor) | Podnosi poziom gry w najważniejszych meczach, ale ciężko znosi porażki. | lossMoraleMult: 1 → 1.2; lossFormMult: 1 → 1.15; goalAssistMoraleMult: 1 → 1.1; highStallAccuracy: 0 → 3; stall8PlusAccuracy: 0 → 4 |
| Uczulony na feedback (coachable) | Chłonnie przyjmuje wskazówki i szybciej się rozwija. | promiseDevelopmentBias: 0 → 0.2; trainingFatigueMult: 1 → 0.92; developmentGainMult: 1 → 1.12; structureComplianceBonus: 0 → 0.04 |
| Nieprzyjmujący rad (uncoachable) | Trudno przyjmuje uwagi, co spowalnia jego rozwój. | promiseDevelopmentBias: 0 → -0.15; trainingFatigueMult: 1 → 1.1; developmentGainMult: 1 → 0.78; structureComplianceBonus: 0 → -0.08 |
| Film junkie (film_junkie) | Godzinami analizuje mecze, co przyspiesza jego rozwój. | promiseDevelopmentBias: 0 → 0.25; developmentGainMult: 1 → 1.1; decisionNoiseMult: 1 → 0.92; structureComplianceBonus: 0 → 0.08 |
| Imprezowicz (party_animal) | Lubi życie towarzyskie, czasem kosztem przygotowania do meczu. | formDriftMult: 1 → 0.65; fanMoodMoraleSensitivity: 0 → 0.55; performanceFanMoodMult: 1 → 1.2; chillRoomMoraleMult: 1 → 1.25; trainingFatigueMult: 1 → 1.08 |
| Force happy (force_happy) | Chętnie szuka podań w stronę force, ryzykując więcej. | heroThrowWeightMult: 1 → 1.2; huckAccuracy: 0 → -2; ottAccuracy: 0 → -1; badDecisionMult: 1 → 1.12; acceptanceThresholdDelta: 0 → -5; breakSideAccuracy: 0 → 2; breakSideOptionBonus: 0 → 0.18 |
| Iso ball (iso_ball) | Woli rozegrać sytuację jeden na jeden niż czekać na reset. | dumpWeightMult: 1 → 0.75; heroThrowWeightMult: 1 → 1.15; dumpEarlyBias: 0 → -0.35; scoringOptionBonus: 0 → 0.18; structureComplianceBonus: 0 → -0.05; plantMsMult: 1 → 1.12 |
| Check-down (checkdown) | Zawsze ma pod ręką bezpieczną opcję zagrania. | huckWeightMult: 1 → 0.55; dumpWeightMult: 1 → 1.4; standardWeightMult: 1 → 1.1; dumpEarlyBias: 0 → 0.4; huckAcceptanceDelta: 0 → -0.12; safeOptionBias: 0 → 0.4; resetFirstStallBias: 0 → 1.5; deepCutBias: 0 → -0.15; underCutBias: 0 → 0.1 |
| Sky baller (sky_baller) | Rzuca się w powietrze po dysk, ryzykując kontuzję. | injuryChanceMult: 1 → 1.25; aerialRecvMult: 1 → 1.25; aerialDefMult: 1 → 1.15; layoutAerialMult: 1 → 1.2 |
| Zone breaker (zone_breaker) | Skuteczny w rozbijaniu obrony strefowej. | ottWeightMult: 1 → 1.15; breakSideOptionBonus: 0 → 0.08; zoneOffenseWeightMult: 1 → 1.45 |
| Man D (man_d_specialist) | Wyspecjalizowany w obronie jeden na jeden. | cushionDeltaM: 0 → -0.2; poachChanceMult: 1 → 0.85; personDefenseBlockMult: 1 → 1.12; zoneDefenseBlockMult: 1 → 0.88 |
| Foulozy (foul_prone) | Często wchodzi w kontakt przy markowaniu, ryzykując faul lub kontuzję. | injuryChanceMult: 1 → 1.15; decisionNoiseMult: 1 → 1.08; cushionDeltaM: 0 → -0.15; markPressureBonus: 0 → 3; blockChanceMult: 1 → 0.92 |
