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
  'deny_deep', 'deny_under',
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
  dump_guy: ['Reset przede wszystkim', 'Reset first', 'Wcześniej szuka resetu, rzadziej przedłuża posiadanie.', 'Looks for a reset earlier instead of holding the disc.'],
  safe_hands: ['Ostrożny z dyskiem', 'Cautious with the disc', 'Wymaga bezpieczniejszego okna podania; nie gwarantuje bezbłędnej gry.', 'Requires a safer passing window; does not guarantee error-free execution.'],
  creative_thrower: ['Kreatywny rzucający', 'Creative thrower', 'Chętnie rozważa nietypowe podania, bez automatycznej skłonności do błędów.', 'Prefers considering unusual passes, without inherently making more mistakes.'],
  force_happy: ['Szuka breaków', 'Looks for breaks', 'Chętniej szuka podania na zamkniętą stronę marka.', 'Prefers looking for a pass to the break side of the mark.'],
  layout_machine: ['Odważny w walce o dysk', 'Dives for the disc', 'Częściej podejmuje trudną próbę layoutu, ryzykując uraz.', 'Attempts difficult layouts more often, risking injury.'],
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
