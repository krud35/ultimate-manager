/** Style weights only. Personality deliberately has no archetype/OVR dependency. */
export const ARCHETYPE_TRAIT_PREFERENCES = {
  control_handler: ['dump_guy', 'safe_hands', 'swing_first', 'settle_turnover', 'zone_breaker'],
  deep_handler: ['huck_lover', 'force_happy', 'creative_thrower', 'attack_turnover'],
  mobile_handler: ['give_and_go', 'upline_seeker', 'swing_first'],
  under_cutter: ['under_cutter', 'give_and_go', 'aggressive_cutter'],
  deep_cutter: ['deep_threat', 'layout_machine'],
  matchup_defender: ['shutdown', 'deny_deep', 'deny_under', 'physical_mark'],
  reading_defender: ['poacher', 'attack_turnover', 'deny_deep'],
  all_rounder: [],
}

export const STYLE_TRAITS = new Set([
  'huck_lover', 'dump_guy', 'safe_hands', 'creative_thrower', 'hammer_happy',
  'deep_threat', 'under_cutter', 'layout_machine', 'aggressive_cutter', 'hesitant_cutter',
  'wants_the_disc', 'disciplined', 'shutdown', 'poacher', 'physical_mark', 'soft_mark',
  'force_happy', 'iso_ball', 'zone_breaker', 'foul_prone',
  'give_and_go', 'upline_seeker', 'swing_first', 'attack_turnover', 'settle_turnover',
  'deny_deep', 'deny_under', 'good_insides', 'good_arounds', 'long_cuts', 'quick_cuts',
  'fakes_a_lot', 'double_move_cutter', 'sideline_receiver', 'attacks_disc_high', 'recovery_defense',
])

export const ATTRIBUTE_BADGES = {
  track_star: ['Sprinter', 'Sprinter', [['physical', 'speed', 88]]],
  quick: ['Dynamiczny', 'Explosive', [['physical', 'acceleration', 85], ['physical', 'agility', 85]]],
  elite_huck: ['Świetny huck', 'Excellent huck', [['throwing', 'huck', 88]]],
  glue_hands: ['Pewny chwyt', 'Reliable catch', [['offensive', 'catching', 88]]],
  vertical_threat: ['Świetny wyskok', 'Excellent jump', [['physical', 'jump', 88]]],
  smart: ['Trafne decyzje', 'Sound decisions', [['mental', 'decisionMaking', 88]]],
  good_timing: ['Dobry timing', 'Good timing', [['offensive', 'cutTiming', 88]]],
  lockdown: ['Silna obrona indywidualna', 'Strong matchup defense', [['defensive', 'matchupReading', 88], ['defensive', 'positioning', 85]]],
  field_general: ['Czyta grę', 'Reads the game', [['mental', 'vision', 88], ['mental', 'spatialAwareness', 85]]],
}

const style = (id, namePl, nameEn, descPl, descEn) => ({ id, namePl, nameEn, descPl, descEn, polarity: 'mixed', tags: ['style'] })
export const NEW_STYLE_DEFS = {
  fakes_a_lot: style('fakes_a_lot', 'Często stosuje zwody rzutowe', 'Fakes a lot', 'Częściej zwodzi marka przed podaniem, poświęcając czas posiadania.', 'Uses more throwing fakes to move the mark, at the cost of possession time.'),
  double_move_cutter: style('double_move_cutter', 'Cutter ze zwodem', 'Double-move cutter', 'Poprzedza cut zwodem; dobry timing pomaga rozpocząć przygotowanie wcześniej.', 'Prepares cuts with a fake; good timing helps start the setup earlier.'),
  sideline_receiver: style('sideline_receiver', 'Receiver przy linii', 'Sideline receiver', 'Chętniej szuka okien podania blisko linii bocznej, gdzie ma mniej miejsca na chwyt.', 'Prefers receiving windows near the sideline, with less catch space.'),
  attacks_disc_high: style('attacks_disc_high', 'Atakuje dysk wysoko', 'Attacks the disc high', 'Chętniej planuje chwyt w wyskoku; wykonanie zależy od wyskoku, timingu i chwytu.', 'Prefers planning jumping catches; execution depends on jump, timing and catching.'),
  recovery_defense: style('recovery_defense', 'Priorytet powrotu do obrony', 'Recovery defense', 'Po stracie najpierw wraca chronić przestrzeń za plecami, zamiast naciskać dysk.', 'After a turnover prioritizes recovering goal-side over pressuring the disc.'),
  good_insides: style('good_insides', 'Dobre inside-out', 'Good insides', 'Precyzyjniej wykonuje zakrzywienie inside-out backhandem i forehandem.', 'Executes inside-out backhand and forehand curves more precisely.'),
  good_arounds: style('good_arounds', 'Dobre outside-in', 'Good arounds', 'Precyzyjniej wykonuje zakrzywienie outside-in backhandem i forehandem.', 'Executes outside-in backhand and forehand curves more precisely.'),
  long_cuts: style('long_cuts', 'Długie cuty', 'Long cuts', 'Wybiera dalsze cele i dłużej kontynuuje kierunek przed powrotem pod dysk.', 'Chooses farther targets and commits longer before cutting back under.'),
  quick_cuts: style('quick_cuts', 'Krótkie cuty', 'Quick cuts', 'Wybiera bliższe cele i częściej zmienia kierunek; częściej zatłacza przestrzeń.', 'Chooses closer targets and changes direction more often; crowds space more often.'),
  thinks_fast: { ...style('thinks_fast', 'Szybko podejmuje decyzje', 'Thinks fast', 'Szybciej ocenia opcje i decyduje o podaniu, bez poprawy trafności decyzji.', 'Evaluates options and commits to a pass sooner, without improving decision quality.'), tags: ['mental'], polarity: 'positive' },
  give_and_go: style('give_and_go', 'Oddaje i rusza', 'Give and go', 'Po podaniu chętniej rusza po krótkie podanie zwrotne.', 'After passing, more often offers a short return pass.'),
  upline_seeker: style('upline_seeker', 'Szuka upline', 'Upline seeker', 'Jako reset chętniej atakuje przestrzeń przed dyskiem wzdłuż linii.', 'As a reset, prefers space upfield along the sideline.'),
  swing_first: style('swing_first', 'Przerzuca ciężar gry', 'Switches play', 'Chętniej przenosi dysk na drugą stronę boiska.', 'More often moves the disc across the field.'),
  attack_turnover: style('attack_turnover', 'Atakuje po przechwycie', 'Attacks turnovers', 'Po odzyskaniu dysku chętniej szuka szybkiego podania do przodu.', 'After winning possession, prefers a quick forward pass.'),
  settle_turnover: style('settle_turnover', 'Uspokaja po przechwycie', 'Settles turnovers', 'Po odzyskaniu dysku chętniej zabezpiecza posiadanie krótkim podaniem.', 'After winning possession, prefers securing it with a short pass.'),
  deny_deep: style('deny_deep', 'Najpierw odcina głębię', 'Denies deep first', 'Oddaje więcej miejsca pod dysk, chroniąc głębię.', 'Concedes more under space to protect deep.'),
  deny_under: style('deny_under', 'Najpierw odcina under', 'Denies under first', 'Zamyka krótkie podanie kosztem większego ryzyka za plecami.', 'Denies the under at the cost of more space behind.'),
}

// Keep stable IDs where possible, so career events and team talks retain their meaning.
export const TRAIT_COPY = {
  chip_on_shoulder: ['Potrzeba udowadniania swojej wartości', 'Something to prove', 'Przeciwności motywują go, ale błędy i krytyka mocniej go dotykają.', 'Adversity motivates them, but mistakes and criticism sting more.'],
  greedy: ['Wysokie oczekiwania finansowe', 'High wage expectations', 'Oczekuje wysokiego wynagrodzenia.', 'Expects high wages.'],
  diva: ['Wymagający wobec klubu', 'Demanding of the club', 'Oczekuje wysokiego wynagrodzenia i ważnej roli; mocniej reaguje na krytykę.', 'Expects high wages and an important role; reacts more strongly to criticism.'],
  film_junkie: ['Analizujący nagrania', 'Film student', 'Analiza meczów wspiera rozwój i realizację instrukcji.', 'Studies games to support development and following instructions.'],
  dump_guy: ['Reset przede wszystkim', 'Reset first', 'Wcześniej szuka resetu, rzadziej przedłuża posiadanie.', 'Looks for a reset earlier instead of holding the disc.'],
  safe_hands: ['Ostrożny z dyskiem', 'Cautious with the disc', 'Wymaga bezpieczniejszego okna podania; nie gwarantuje bezbłędnej gry.', 'Requires a safer passing window; does not guarantee error-free execution.'],
  creative_thrower: ['Kreatywny rzucający', 'Creative thrower', 'Chętnie rozważa nietypowe podania, bez automatycznej skłonności do błędów.', 'Prefers considering unusual passes, without inherently making more mistakes.'],
  force_happy: ['Szuka breaków', 'Looks for breaks', 'Chętniej szuka podania na zamkniętą stronę marka.', 'Prefers looking for a pass to the break side of the mark.'],
  layout_machine: ['Odważny w walce o dysk', 'Dives for the disc', 'Częściej podejmuje trudną próbę layoutu, bez dodatkowej kary do ryzyka urazu.', 'Attempts difficult layouts more often, without an additional injury-risk penalty.'],
  shutdown: ['Trzyma swojego', 'Sticks to the matchup', 'Preferuje bliskie krycie swojego zawodnika i rzadziej odchodzi do pomocy.', 'Prefers close matchup coverage and helps less often.'],
  disciplined: ['Trzyma strukturę', 'Keeps the structure', 'Preferuje pozostanie w strukturze ofensywnej.', 'Prefers staying within the offensive structure.'],
  selfish: ['Nastawiony na własne statystyki', 'Stats driven', 'Mocniej reaguje na własne gole i asysty oraz szuka osobistego udziału w zdobyczy.', 'Values personal goals and assists and seeks a direct role in scoring.'],
  coachable: ['Otwarty na wskazówki', 'Coachable', 'Przyjmuje wskazówki i łatwiej wdraża je na treningach.', 'Accepts advice and applies it in training.'],
  overthinker: ['Nadmiernie analizujący', 'Overthinker', 'Dłużej rozważa opcje przed podjęciem decyzji.', 'Spends longer considering options before deciding.'],
  foul_prone: ['Skłonny do kontaktu', 'Contact prone', 'Markuje blisko i ryzykuje uraz w kontakcie.', 'Marks closely and risks injury through contact.'],
  workhorse: ['Pracowity', 'Hard worker', 'Lepiej znosi obciążenie treningowe dzięki zaangażowaniu.', 'Handles training demands through commitment.'],
  lazy: ['Unika wysiłku', 'Avoids effort', 'Gorzej wykorzystuje trening i bez gry łatwiej traci formę.', 'Makes less of training and loses form more easily without playing.'],
  adaptive: ['Elastyczny taktycznie', 'Tactically adaptable', 'Łatwiej realizuje zmienione instrukcje trenera.', 'Adapts more readily to coaching instructions.'],
  competitor: ['Zacięty rywal', 'Competitor', 'Ciężko przeżywa porażki i mocniej reaguje na własny udział w sukcesie.', 'Takes losses hard and responds strongly to contributing to success.'],
  team_first: ['Zespół przede wszystkim', 'Team first', 'Mniej potrzebuje własnych statystyk i łatwiej akceptuje rolę pomocniczą.', 'Needs personal stats less and accepts a supporting role more readily.'],
  stubborn: ['Uparty', 'Stubborn', 'Trudniej odchodzi od nawyków pod wpływem instrukcji.', 'Has more difficulty changing habits in response to instructions.'],
}
