/**
 * English copy for random inbox events (bodies + choice labels/hints).
 * PL source stays in randomEvents.js; EN resolved at message creation time.
 */

/** @type {Record<string, (ctx: object) => string>} */
export const RANDOM_EVENT_BODY_EN = {
  sponsor_clinic: (ctx) =>
    `A sponsor wants ${ctx.starName} to run a fan clinic. Good PR and money, but the star will be worn out by the extra duties.`,
  locker_room_clash: (ctx) =>
    `${ctx.playerAName} and ${ctx.playerBName} argued after practice. The locker room is waiting for your call.`,
  exhibition_invite: () =>
    'Organizers invite your club to a weekend exhibition. The money tempts, but the calendar is packed.',
  player_day_off: (ctx) =>
    `${ctx.playerName} complains about overload and asks for a day without training. How do you respond?`,
  media_interview: () =>
    'A local station wants a short on-camera chat. You can play it safe, go spicy, or decline.',
  friendly_clinic: () =>
    'A local club proposes a joint scrimmage / clinic. Small organizing cost, atmosphere may rise.',
  board_budget_push: () =>
    'The board suggests “caution” on spending. You can fight for extra funds or yield for peace.',
  playing_time_request: (ctx) =>
    `${ctx.playerName} (OVR ${ctx.playerOvr}) asks for a bigger role. A promise doesn’t change the lineup yet — for now it’s about the relationship.`,
  fan_appreciation_day: (ctx) =>
    `Fans (${ctx.fanSizeLabelEn ?? ctx.fanSizeLabel ?? '…'} people, traits: ${ctx.fanTraitNamesEn ?? ctx.fanTraitNames ?? '…'}) propose a day on the field: autographs, a mini-tournament and photos. Small cost, big atmosphere upside.`,
  kit_sponsor_deal: () =>
    'A kit maker offers a package: logo on jerseys and a budget top-up. Terms are fine, but some prefer the classic look.',
  late_night_party: (ctx) =>
    `Staff caught that ${ctx.culpritNames} came back late from town. Form may suffer — how do you react?`,
  captain_armband: (ctx) =>
    `The locker room is debating who should wear the armband — ${ctx.playerAName} or ${ctx.playerBName}? Your vote carries weight.`,
  muddy_field: () =>
    'Morning rain turned the field to mud. You can push through, move the session indoors, or give a rest day.',
  rival_trash_talk: (ctx) =>
    `A rival posted a jab at your club — especially ${ctx.starName}. Media wait for a reaction.`,
  charity_hat_tournament: () =>
    'Organizers ask you to join a charity hat tournament. Good PR, but load on key players.',
  equipment_upgrade: () =>
    'Staff wants new discs, cones and recovery mats. Comfort investment may translate into form.',
  social_media_drama: (ctx) =>
    `${ctx.playerName} dropped a controversial post. Fans are split, and the club’s image may take a hit.`,
  team_bonding_trip: () =>
    'The captain suggests a short trip / team dinner. Moderate cost, chemistry upside can be large.',
  scout_hot_tip: () =>
    'A scout claims a lead on an undervalued player from another league. Wants budget for travel and a report.',
  rookie_nerves: (ctx) =>
    `${ctx.rookieName} looks tense before upcoming games. You can mentor, ease the load, or apply pressure.`,
  nutritionist_visit: () =>
    'The club dietitian proposes a two-week nutrition program. It costs, but may boost key players’ form.',
  analytics_hire: () =>
    'A freelance analyst offers rival film packs and reports on your turnovers. Expensive, but concrete.',
  jersey_number_dispute: (ctx) =>
    `${ctx.aName} and ${ctx.bName} want the same number this season. Small thing, big egos.`,
  weather_camp: () =>
    'The coming week looks wet and windy. Train outdoors “for character”, rent a hall, or focus on recovery.',
  veteran_contract_talk: (ctx) =>
    `${ctx.vetName} (${ctx.age}) asks for a role talk for the rest of the season: mentoring, rotation, or fighting for minutes.`,
  local_derby_hype: () =>
    'Media and fans are cranking the atmosphere before your next match. You can fuel the fire, quiet the room, or use the PR.',
  practice_tourament: () =>
    'Staff proposes a mini-tournament midweek. Internal rivalry can raise the level — or leave bruises on egos.',
  medical_checkup: (ctx) =>
    `Medical staff wants extra tests for ${ctx.playerName}. May catch overload — or just cost money and nerves.`,
  podcast_guest: (ctx) =>
    `A popular podcast wants ${ctx.starName} for an hour “uncensored”. Exposure vs. risk of a gaffe.`,
  youth_camp_invite: (ctx) =>
    `${ctx.youthName} (${ctx.age}) got invited to a short youth camp. Prestige vs. fatigue.`,
  bench_meeting: (ctx) =>
    `Part of the rotation (${ctx.benchNames?.join(', ') ?? '…'}) wants a talk about minutes and prospects. Ignoring is also a decision.`,
  merch_drop: () =>
    'Marketing wants a limited jersey drop. Go aggressive, careful, or skip the seasonal hype.',
  referee_clinic: () =>
    'The league asks clubs to host fair-play workshops for juniors. Prestige and fatigue in one package.',
  hotel_nightmare: (ctx) =>
    `The booking went wrong: noise, no AC, “inspirational” breakfast. Hardest hit: ${ctx.victims?.map((v) => v.name).join(', ') ?? 'several players'}.`,
  new_throw_obsession: (ctx) =>
    `${ctx.playerName} throws ${ctx.throwName} everywhere — even when it’s not needed. You can channel it or cut it back.`,
  rival_spy_rumor: () =>
    'Someone with a camera in the parking lot. Maybe a rival scout, a fan, or an influencer. The locker room is boiling.',
  yoga_experiment: (ctx) =>
    `Physio proposes yoga. Skeptics at the front of the room: ${ctx.skepticNames?.join(', ') ?? 'a few veterans'}.`,
  birthday_surprise: (ctx) =>
    `The locker room wants to celebrate ${ctx.playerName}. Cake and memes, or a full team-building?`,
  field_booking_war: () =>
    'The city facility mixed up times. Either pay for an emergency slot or train on a makeshift setup.',
  dance_challenge: (ctx) =>
    `TikTok trend. ${ctx.playerName} wants the whole team to film a choreo in jerseys. Sponsors might like it.`,
  massage_gun_craze: (ctx) =>
    `${ctx.playerName} shows an Instagram unboxing. Everyone else wants the same “for recovery”.`,
  old_rival_media: (ctx) =>
    `A former rival player said on a podcast that ${ctx.starName} is “overrated”. The locker room waits for your reaction.`,
  flight_delay_tour: (ctx) =>
    `The flight is stuck. At the airport sit e.g. ${ctx.names?.slice(0, 3).join(', ') ?? 'your players'}. Wait, rebook, or cancel?`,
  fan_open_letter: (ctx) => {
    const loyal = (ctx.fanTraits ?? []).includes('loyal')
    const size = ctx.fanSizeLabelEn ?? ctx.fanSizeLabel
    const traits = ctx.fanTraitNamesEn ?? ctx.fanTraitNames
    if (loyal) {
      return `Loyal fans (${size}) publish an open letter: “We’ve got your back.” They still want specifics from staff — a meeting, a plan, a gesture.`
    }
    return `Fans (${size}, traits: ${traits}) publish a sharp letter: results, communication, atmosphere. Media are already quoting it.`
  },
  ultras_banner: (ctx) =>
    `A fan group (${ctx.fanTraitNamesEn ?? ctx.fanTraitNames}) wants a big display with a slogan on the edge of fair play. The league is watching; the terraces are boiling.`,
  season_ticket_drive: (ctx) =>
    `Marketing wants a season-ticket campaign. Fanbase: ${ctx.fanSizeLabelEn ?? ctx.fanSizeLabel}. Big reach = chance at cash and new fans — or a flop.`,
  fan_boycott_threat: (ctx) =>
    `Some fans (${ctx.fanTraitNamesEn ?? ctx.fanTraitNames}) threaten to boycott the next match. Terrace mood: ${ctx.fanMood}/100. You need to respond.`,
  away_day_caravan: (ctx) =>
    `Fans want a big away day: buses, chants, a display. Fanbase ${ctx.fanSizeLabelEn ?? ctx.fanSizeLabel}. They’re asking for logistics support.`,
  family_fan_day: (ctx) =>
    `The family side of the fanbase (${ctx.fanTraitNamesEn ?? ctx.fanTraitNames}) wants a day with kids’ workshops and photos with players — e.g. ${ctx.youthNames || 'younger players'}.`,
  chant_tradition_clash: (ctx) =>
    `Some fans want new “party” chants; traditionalists defend the classics. The fanbase (${ctx.fanTraitNamesEn ?? ctx.fanTraitNames}) waits for a signal from the club.`,
  fan_club_donation: (ctx) =>
    `The official fan club (~${ctx.fanSizeLabelEn ?? ctx.fanSizeLabel} around the club) is raising money for academy/reserve gear. They ask for co-funding and ${ctx.playerName} to show up.`,
}

/** @type {Record<string, Record<string, { labelEn?: string, hintEn?: string }>>} */
export const RANDOM_EVENT_CHOICE_EN = {
  sponsor_clinic: {
    accept: { labelEn: 'Agree — send the star', hintEn: 'Budget +, reputation +2, star morale −' },
    decline: { labelEn: 'Refuse — protect the player', hintEn: 'Slight star morale boost' },
    send_reserve: { labelEn: 'Send the reserve instead', hintEn: 'Smaller budget, reputation +1, star happy' },
  },
  locker_room_clash: {
    talk: { labelEn: '1:1 talk with both', hintEn: 'Both morale +3' },
    public: { labelEn: 'Public warning', hintEn: 'Leader +, other −' },
    ignore: { labelEn: 'Ignore', hintEn: 'Team morale −2' },
  },
  exhibition_invite: {
    accept: { labelEn: 'Accept', hintEn: 'Budget +, fatigue' },
    decline: { labelEn: 'Decline', hintEn: 'No change' },
    youth: { labelEn: 'Send youth squad', hintEn: 'Smaller fee, development' },
  },
  player_day_off: {
    grant: { labelEn: 'Grant the day off', hintEn: 'Morale +8, form −2' },
    train: { labelEn: 'Train as usual', hintEn: 'Morale −5' },
    recovery: { labelEn: 'Light recovery', hintEn: 'Morale +3' },
  },
  media_interview: {
    positive: { labelEn: 'Safe / positive', hintEn: '+$3k, team morale +2, reputation +3' },
    spicy: { labelEn: 'Spicy answers', hintEn: 'Buzz +, morale −, reputation −2' },
    decline: { labelEn: 'Decline the interview', hintEn: 'No change' },
  },
  friendly_clinic: {
    organize: { labelEn: 'Organize', hintEn: 'Chemistry +, small cost' },
    decline: { labelEn: 'Decline', hintEn: 'No change' },
  },
  board_budget_push: {
    fight: { labelEn: 'Fight for funds', hintEn: 'Budget chance +, board tension' },
    yield: { labelEn: 'Yield', hintEn: 'Peace, less budget' },
  },
  playing_time_request: {
    promise: { labelEn: 'Promise more minutes', hintEn: 'Morale +6' },
    honest: { labelEn: 'Be honest', hintEn: 'Morale −2' },
    ignore: { labelEn: 'Ignore', hintEn: 'Morale −7' },
  },
  fan_appreciation_day: {
    full: {
      labelEn: 'Full fan day',
      hintEn: '−$3k, team morale +5, reputation +4, fan mood +',
    },
    short: {
      labelEn: 'Short autograph session',
      hintEn: '−$1k, morale +2, reputation +2, mood +',
    },
    skip: { labelEn: 'Refuse', hintEn: 'Morale −1, reputation −2, fan mood −' },
  },
  kit_sponsor_deal: {
    sign: { labelEn: 'Sign', hintEn: '+$15k, morale +1, reputation +2' },
    negotiate: { labelEn: 'Negotiate harder', hintEn: '50%: +$22k & reputation +3, or nothing' },
    refuse: { labelEn: 'Refuse', hintEn: 'Morale +2, reputation +1' },
  },
  late_night_party: {
    fine: { labelEn: 'Fine them', hintEn: 'Discipline, morale −' },
    talk: { labelEn: 'Private talk', hintEn: 'Softer correction' },
    ignore: { labelEn: 'Ignore', hintEn: 'Form risk' },
  },
  captain_armband: {
    pick_a: { labelEn: 'Pick A', hintEn: 'Morale shifts' },
    pick_b: { labelEn: 'Pick B', hintEn: 'Morale shifts' },
    rotate: { labelEn: 'Rotate captains', hintEn: 'Compromise' },
  },
  muddy_field: {
    push: { labelEn: 'Train anyway', hintEn: 'Character +, injury risk' },
    indoor: { labelEn: 'Move indoors', hintEn: 'Cost' },
    rest: { labelEn: 'Rest day', hintEn: 'Recovery' },
  },
  rival_trash_talk: {
    clapback: { labelEn: 'Sharp clapback', hintEn: 'Star form +, morale −1, reputation −1' },
    classy: { labelEn: 'Classy, calm reply', hintEn: 'Team morale +3, reputation +3' },
    mute: { labelEn: 'Ignore', hintEn: 'No change' },
  },
  charity_hat_tournament: {
    stars: { labelEn: 'Send stars', hintEn: 'PR +, reputation +5, fatigue' },
    mix: { labelEn: 'Mixed squad', hintEn: 'Balance, reputation +3' },
    decline: { labelEn: 'Decline', hintEn: 'Morale −1, reputation −2' },
  },
  equipment_upgrade: {
    premium: { labelEn: 'Premium package', hintEn: 'Cost +, form' },
    basic: { labelEn: 'Basic upgrade', hintEn: 'Cheaper' },
    refuse: { labelEn: 'Refuse', hintEn: 'Save money' },
  },
  social_media_drama: {
    apology: { labelEn: 'Public apology', hintEn: 'Image repair, reputation +2' },
    defend: { labelEn: 'Defend the player', hintEn: 'Loyalty +, reputation −3' },
    mute: { labelEn: 'Internal discipline', hintEn: 'Morale −2, reputation −1' },
  },
  team_bonding_trip: {
    weekend: { labelEn: 'Weekend trip', hintEn: 'Cost +, chemistry' },
    dinner: { labelEn: 'Team dinner', hintEn: 'Cheaper boost' },
    skip: { labelEn: 'Skip bonding', hintEn: 'No change' },
  },
  scout_hot_tip: {
    fund: { labelEn: 'Fund the trip', hintEn: 'Cost, intel' },
    cheap: { labelEn: 'Cheap look', hintEn: 'Less intel' },
    pass: { labelEn: 'Pass', hintEn: 'No change' },
  },
  rookie_nerves: {
    mentor: { labelEn: 'Assign a mentor', hintEn: 'Morale +' },
    ease: { labelEn: 'Ease the load', hintEn: 'Less pressure' },
    pressure: { labelEn: 'Apply pressure', hintEn: 'Sink or swim' },
  },
  nutritionist_visit: {
    full: { labelEn: 'Full program', hintEn: 'Budget −, top-4 form ↑' },
    snacks: { labelEn: 'Healthier snacks only', hintEn: 'Cheap morale boost' },
    skip: { labelEn: 'Postpone', hintEn: 'No change' },
  },
  analytics_hire: {
    hire: { labelEn: 'Hire for a month', hintEn: 'Budget −, team form +' },
    one_report: { labelEn: 'One test report', hintEn: 'Small cost, small boost' },
    pass: { labelEn: 'Trust the coach’s eye', hintEn: 'Staff morale (team) +1' },
  },
  jersey_number_dispute: {
    a: { labelEn: 'Give to A', hintEn: 'Ego management' },
    b: { labelEn: 'Give to B', hintEn: 'Ego management' },
    neither: { labelEn: 'Neither keeps it', hintEn: 'Both unhappy' },
  },
  weather_camp: {
    grit: { labelEn: 'Train in the wind', hintEn: 'Form +, morale −' },
    hall: { labelEn: 'Rent a hall', hintEn: 'Budget −, form +' },
    regen: { labelEn: 'Recovery / video', hintEn: 'Morale +, form −1' },
  },
  veteran_contract_talk: {
    mentor: { labelEn: 'Mentor role', hintEn: 'Respect +, fewer minutes' },
    compete: { labelEn: 'Compete for minutes', hintEn: 'Motivation' },
    minutes: { labelEn: 'Guarantee minutes', hintEn: 'Morale +, flexibility −' },
  },
  local_derby_hype: {
    fire: { labelEn: 'Turn up motivation', hintEn: 'Form +, star morale − (pressure)' },
    calm: { labelEn: 'Calm the locker room', hintEn: 'Team morale +' },
    pr: { labelEn: 'Star interview', hintEn: 'Budget + (sponsor), star form −1' },
  },
  practice_tourament: {
    compete: { labelEn: 'Full competition', hintEn: 'Top form ↑, bench morale risk' },
    fun: { labelEn: 'Fun + silly prizes', hintEn: 'Team morale +, form 0' },
    skip: { labelEn: 'Normal training', hintEn: 'No change' },
  },
  medical_checkup: {
    full: { labelEn: 'Full test package', hintEn: 'Budget −; form + or rest' },
    basic: { labelEn: 'Basic check', hintEn: 'Cheap, small effect' },
    skip: { labelEn: 'They feel fine', hintEn: 'Form risk −' },
  },
  podcast_guest: {
    go: { labelEn: 'Send the star', hintEn: 'Morale +, form −1; 20% drama' },
    coach: { labelEn: 'You go (manager)', hintEn: 'Budget + (fee), team morale +' },
    decline: { labelEn: 'Decline', hintEn: 'No change' },
  },
  youth_camp_invite: {
    send: { labelEn: 'Send them', hintEn: 'Youth morale +, form −2, PR budget +' },
    partial: { labelEn: 'Weekend only', hintEn: 'Smaller effect both ways' },
    keep: { labelEn: 'Keep at the club', hintEn: 'Youth morale −' },
  },
  bench_meeting: {
    honest: { labelEn: 'Honest talk + plan', hintEn: 'Bench morale +, top form −1' },
    promise: { labelEn: 'Promise more minutes', hintEn: 'Bench morale ++; risk later' },
    ignore: { labelEn: '“The pitch picks the lineup”', hintEn: 'Bench morale −' },
  },
  merch_drop: {
    big: { labelEn: 'Big drop', hintEn: 'Budget − now, later +; morale +' },
    small: { labelEn: 'Small run', hintEn: 'Small profit, small boost' },
    skip: { labelEn: 'No merch', hintEn: 'No change' },
  },
  referee_clinic: {
    host: { labelEn: 'Host with leaders', hintEn: 'Host morale +, form −1, budget +' },
    staff: { labelEn: 'Send staff / volunteers', hintEn: 'Budget +, no roster effect' },
    decline: { labelEn: 'Not this time', hintEn: 'Slight morale − (image)' },
  },
  hotel_nightmare: {
    upgrade: { labelEn: 'Pay to upgrade', hintEn: 'Cost +, recovery' },
    tough: { labelEn: 'Tough it out', hintEn: 'Form risk' },
    early: { labelEn: 'Leave early', hintEn: 'Disruption' },
  },
  new_throw_obsession: {
    encourage: { labelEn: 'Encourage', hintEn: 'Creativity +' },
    drill: { labelEn: 'Structure drills', hintEn: 'Focus' },
    ban: { labelEn: 'Ban in matches', hintEn: 'Discipline' },
  },
  rival_spy_rumor: {
    confront: { labelEn: 'Confront', hintEn: 'Drama' },
    decoy: { labelEn: 'Run a decoy session', hintEn: 'Mind games' },
    ignore: { labelEn: 'Shrug it off', hintEn: 'Neutral / slight morale −' },
  },
  yoga_experiment: {
    full: { labelEn: 'Everyone on the mat', hintEn: 'Team form +, mixed morale' },
    opt: { labelEn: 'Optional', hintEn: 'Skeptic form +, small cost' },
    skip: { labelEn: 'Keep classic warm-up', hintEn: 'No change / physio vibes −' },
  },
  birthday_surprise: {
    party: { labelEn: 'Team party', hintEn: 'Budget −, team morale +' },
    gift: { labelEn: 'Gift for the birthday player', hintEn: 'Small cost, birthday morale ++' },
    lowkey: { labelEn: 'Quiet cake after practice', hintEn: 'Team morale +1' },
  },
  field_booking_war: {
    pay: { labelEn: 'Pay for an emergency slot', hintEn: 'Budget −, form +' },
    park: { labelEn: 'Train in the park', hintEn: 'Form −1, morale −1' },
    video: { labelEn: 'Video session instead', hintEn: 'Form 0, leader morale +1' },
  },
  dance_challenge: {
    full: { labelEn: 'Whole team in the clip', hintEn: 'Budget + (PR), form −1, morale +' },
    star: { labelEn: 'Star only', hintEn: 'Small budget +, player morale +' },
    no: { labelEn: 'Ban social media this season', hintEn: 'Morale −' },
  },
  massage_gun_craze: {
    buy: { labelEn: 'Buy a set for the squad', hintEn: 'Budget −−, form +' },
    few: { labelEn: 'Buy 3 to share', hintEn: 'Budget −, form slightly +' },
    no: { labelEn: 'Foam roller is enough', hintEn: 'Morale −1' },
  },
  old_rival_media: {
    clapback: { labelEn: 'Star answers sharply', hintEn: 'Star morale +, team form +/−' },
    class: { labelEn: 'Classy staff reply', hintEn: 'Team morale +2' },
    silence: { labelEn: 'Radio silence', hintEn: 'No effect / slight −' },
  },
  flight_delay_tour: {
    wait: { labelEn: 'Wait it out', hintEn: 'Fatigue' },
    rebook: { labelEn: 'Rebook', hintEn: 'Cost' },
    cancel: { labelEn: 'Cancel trip', hintEn: 'Refund +, frustration' },
  },
  fan_open_letter: {
    meet: { labelEn: 'Meet fan reps', hintEn: 'Fan mood +, team morale +1' },
    plan: { labelEn: 'Publish a one-month plan', hintEn: 'Reputation +2, mood +' },
    ignore: { labelEn: 'Ignore the noise', hintEn: 'Fan mood −' },
  },
  ultras_banner: {
    approve: { labelEn: 'Allow the display', hintEn: 'Fan mood +, risky reputation' },
    tone_down: { labelEn: 'Ask to soften the slogan', hintEn: 'Compromise: mood +, reputation +1' },
    ban: { labelEn: 'Block the display', hintEn: 'Reputation +, ultras mood −' },
  },
  season_ticket_drive: {
    aggressive: { labelEn: 'Aggressive campaign', hintEn: '−$4k, chance of budget + and fanbase +' },
    steady: { labelEn: 'Steady promo', hintEn: '−$1.5k, stable growth' },
    skip: { labelEn: 'Postpone', hintEn: 'No change / slight mood −' },
  },
  fan_boycott_threat: {
    gesture: { labelEn: 'Goodwill gesture (discounts / meeting)', hintEn: '−$2k, mood ++' },
    hardline: { labelEn: 'Hard line — play for those who stay', hintEn: 'Team morale +, fan mood −' },
    mediate: { labelEn: 'Mediator / calm talk', hintEn: 'Mood +, reputation +1' },
  },
  away_day_caravan: {
    sponsor: { labelEn: 'Help fund the buses', hintEn: '−$2.5k, mood +, team morale +' },
    star: { labelEn: 'Send a star to greet them', hintEn: 'Star morale −, fan mood ++' },
    decline: { labelEn: 'Don’t support the trip', hintEn: 'Mood −' },
  },
  family_fan_day: {
    full: { labelEn: 'Full family day', hintEn: '−$2k, fanbase +, mood +, reputation +3' },
    photo: { labelEn: 'Photo session only', hintEn: '−$500, mood +' },
    skip: { labelEn: 'Refuse', hintEn: 'Mood −, reputation −1' },
  },
  chant_tradition_clash: {
    tradition: { labelEn: 'Defend traditional chants', hintEn: 'Traditionalists +, party fans −' },
    new: { labelEn: 'Support new chants', hintEn: 'Party fans +, tradition −' },
    both: { labelEn: 'Room for both', hintEn: 'Compromise, slight mood boost' },
  },
  fan_club_donation: {
    match: { labelEn: 'Match the fundraiser', hintEn: '−$3k, reputation +4, mood ++' },
    token: { labelEn: 'Token top-up', hintEn: '−$800, mood +' },
    appear: { labelEn: 'Player appearance only', hintEn: 'Player morale +, mood +' },
  },
}

export function randomEventBodyEn(templateId, ctx) {
  const fn = RANDOM_EVENT_BODY_EN[templateId]
  if (!fn) return null
  try {
    return fn(ctx ?? {})
  } catch {
    return null
  }
}

export function localizeEventChoices(templateId, choices) {
  const map = RANDOM_EVENT_CHOICE_EN[templateId] ?? {}
  return (choices ?? []).map((c) => {
    const en = map[c.id] ?? {}
    return {
      ...c,
      labelEn: c.labelEn ?? en.labelEn,
      hintEn: c.hintEn ?? en.hintEn,
    }
  })
}
