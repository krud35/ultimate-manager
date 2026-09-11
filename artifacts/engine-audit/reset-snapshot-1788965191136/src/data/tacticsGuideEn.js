/**
 * English counterparts for Tactics Compendium entries / loadouts.
 * Merged onto PL base entries in getEntryById / getEntriesByCategory / getLoadouts.
 */

/** @type {Record<string, object>} */
export const TACTICS_GUIDE_EN = {
  vertical_stack: {
    summaryEn:
      'A line of cutters down the middle creates two throwing lanes (open side / break side). Isolates 1-on-1 matchups and scales cleanly into the endzone.',
    descriptionEn:
      'Vertical stack grew as an answer to the force mark: players stand in a vertical line along midfield to open the sideline lanes. Cuts usually start from the back (deep/under) or the front (break side). The formation works for the whole point, including near the endzone — unlike horizontal stack.',
    howItWorksEn: [
      'Stack sits in the middle → field edges stay free as throwing lanes.',
      'One cutter initiates; everyone else stays still so they do not clog space.',
      'Failed cut → clear to the back of the stack; after a catch → stack walks upfield (mobile stack).',
      'Handlers dump and swing to move the disc to the break side and scramble downfield D.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Handler',
        behavior:
          'Priority: dump/swing at high stall; break the mark when the lane is open. Fewer rigid hucks, more precise throws into an isolated lane.',
      },
      {
        role: 'Cutter (back of stack)',
        behavior:
          'Initiates under or deep. If the defender poaches the lane — escape to the break side. After a cut without the disc: clear to the back.',
      },
      {
        role: 'Cutter (front of stack)',
        behavior:
          'Often attacks the break side or fills reset space. Avoids stepping into the active lane of the back cutter.',
      },
      {
        role: 'Whole offense',
        behavior:
          'Awareness of who is cutting (order / field sense). Rigid “only from the back” lowers IQ — read space instead.',
      },
    ],
    matchImpactEn: [
      {
        label: 'Throw accuracy',
        effect: 'Higher — shorter, more predictable throw lines into an isolated lane.',
      },
      {
        label: 'Yards gained per throw',
        effect: 'Moderate — fewer “big plays,” more controlled advance.',
      },
      {
        label: 'Vulnerability to clam / poach',
        effect: 'High — lanes are readable; clam and lane poaches shut down first looks.',
      },
      {
        label: 'Endzone',
        effect: 'Natural transition — most teams already play vert in the endzone (cut from the back).',
      },
    ],
    prosEn: [
      'Lots of space for dominant cutters',
      'Works into the endzone without changing formation',
      'Easier to teach than motion / hex',
      'Isolates 1-on-1 well',
    ],
    consEn: [
      'Predictable with rigid “cut from the back”',
      'Easily countered by clam / junk / lane poach',
      'Vs zone you must switch formation immediately',
      'Needs handlers who can break the mark or dump-swing',
    ],
    suggestedWhenEn: [
      'You have 1–2 dominant athletic cutters',
      'Handlers can break or swing cleanly',
      'You want one formation for the whole point (including endzone)',
      'Opponent plays standard person + force',
    ],
    avoidWhenEn: [
      'Opponent often runs clam / junk vs vert',
      'Weak handlers (no breaks or dumps) → stagnation',
      'Opponent goes zone — switch to zone O',
    ],
    engineStatusEn:
      'In engine: attackStyle = vertical_stack (accuracy bonus, lower advance). Cutter/handler behaviors — to expand.',
  },

  horizontal_stack: {
    summaryEn:
      '3 handlers + 4 cutters in a line across the field. Creates under space (in front of cutters) and deep space (behind). Flexible flow, weaker near the endzone.',
    descriptionEn:
      'Ho-stack is intuitive for players with a field-sport background (soccer, etc.). Cutter depth sets the priority: closer to handlers = more deep space; farther = more under. Initiation usually comes from the two middle spots (one under, one deep). Wing cutters continue or go deep.',
    howItWorksEn: [
      'Set ~10–15 m between handlers and cutters (Ultiworld / Davide).',
      'Middle cutters run complementary cuts (e.g. diamond: under + deep).',
      'Wings stay active (fake cuts) so D cannot poach/switch freely.',
      'After a catch — continuation across or deep; clear and re-form the line.',
      'Near the endzone teams often transition to vertical stack.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Handlers (3)',
        behavior:
          'Keep the disc near midfield. Dump & swing, give-and-go, avoid sideline traps. Opening throw ideally toward mid-field.',
      },
      {
        role: 'Middle cutter',
        behavior:
          'Initiates under or deep; eyes on the disc during the cut. Timing with partner (diamond / piston).',
      },
      {
        role: 'Wing cutter',
        behavior:
          'Constant motion and fakes; push into middle when middles fatigue (diamond push); deep continuation after a partner’s under.',
      },
    ],
    matchImpactEn: [
      {
        label: 'Tempo / flow',
        effect: 'Higher — more under+deep options at once, easier continuations.',
      },
      {
        label: 'Throw risk',
        effect: 'Higher on aggressive deeps and hucks; more “big plays.”',
      },
      {
        label: 'Zone resistance',
        effect: 'Better than vert — positions are closer to zone O (flat handlers + wings).',
      },
      {
        label: 'Endzone',
        effect: 'Weaker — little space; usually transition to vert.',
      },
      {
        label: 'Stamina drain',
        effect: 'High with systems like double piston (everyone cuts at once).',
      },
    ],
    prosEn: [
      'Flexible movement, harder to scout than rigid vert',
      'Good deep lanes and under space at once',
      'Works in most weather',
      'Easier adaptation vs zone (without big repositioning)',
    ],
    consEn: [
      'Needs high awareness (cut collisions)',
      'Scales poorly in a tight endzone',
      'Aggressive systems tire cutters hard',
      'Easy to stall on the sideline without handler discipline',
    ],
    suggestedWhenEn: [
      'You have many good cutters and 3 solid handlers',
      'You want to attack deep and keep tempo',
      'Opponent mixes person / light junk',
      'Conditions allow longer throws',
    ],
    avoidWhenEn: [
      'Already in red zone / endzone — switch to vert',
      'Handlers do not keep the disc centered (sideline trap)',
      'Tired roster — avoid double piston',
    ],
    engineStatusEn:
      'In engine: attackStyle = horizontal_stack (lower accuracy, higher advance). Full 3H/4C logic — to expand.',
  },

  split_stack: {
    summaryEn:
      'Cutters split to both sides of the field (2–2 or 3–1). Combines isolation with width; strong for flood/iso and pull plays.',
    descriptionEn:
      'Split stack keeps 2–3 handlers outside the stack. Cutters divide to both sides — even 2+2, or overload 3+1. Creates clear space and lets you flood one side quickly while isolating a cutter.',
    howItWorksEn: [
      'Handlers keep the disc; cutters attack from their half.',
      'Flood: most of the stack to one side, iso cutter in the big space.',
      'After a pull play often transition to vert or ho.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Iso cutter',
        behavior: 'Attacks the largest open space; first target after a pull or timeout.',
      },
      {
        role: 'Flood side',
        behavior: 'Clears space, then deep or under continuation from the flood.',
      },
    ],
    matchImpactEn: [
      {
        label: 'Mismatch isolation',
        effect: 'Very high — easy to put your best cutter 1-on-1.',
      },
      {
        label: 'Predictability',
        effect: 'Medium — good D quickly sends help to the iso.',
      },
    ],
    prosEn: ['Strong iso', 'Good pull plays', 'Flexible transitions'],
    consEn: ['Needs clear discipline', 'Help defense punishes late throws'],
    suggestedWhenEn: [
      'Clear athletic mismatch',
      'You want a quick attack after the pull',
    ],
    avoidWhenEn: ['Opponent brackets / help-deep excellently'],
    engineStatusEn: 'Not in engine — guide-only description.',
  },

  side_stack: {
    summaryEn:
      'Most of the offense on one sideline; an isolated cutter (or handler) in big space. Classic iso for a dominant athlete.',
    descriptionEn:
      'Side stack puts 2–3 handlers and the remaining cutters on one side. The active iso attacks the open half. Effective with one standout cutter; less useful at the highest level where D helps quickly.',
    howItWorksEn: [
      'Flood one sideline → isolate the opposite space.',
      'After an iso catch: deep to a designated stack cutter or transition to another formation.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Iso',
        behavior: 'Read mark and help; attack under if deep is bracketed.',
      },
      {
        role: 'Stack',
        behavior: 'Stay out of iso space; be ready for deep continuation.',
      },
    ],
    matchImpactEn: [
      {
        label: 'Star dependency',
        effect: 'High — offense rises and falls with the iso cutter’s form.',
      },
    ],
    prosEn: ['Maximum isolation', 'Simple to call after a timeout'],
    consEn: ['Easy for help D', 'Predictable at high level'],
    suggestedWhenEn: ['Clear mismatch', 'Stopped disc / timeout'],
    avoidWhenEn: ['Balanced roster without a dominant cutter'],
    engineStatusEn: 'Not in engine — guide-only description.',
  },

  motion_offense: {
    summaryEn:
      'Intent more than formation: disc always moving, players close together, point-five mentality. Minimizes time for D to set.',
    descriptionEn:
      'Motion offense is a philosophy (Some Flow, Flik flow offence): do not wait for the perfect diagram — move the disc immediately. Give-and-go, catch facing the break side, cut before the thrower catches. Top teams (e.g. Brown, Truck Stop) claim “no diagrammable offense” — the system is principles, not a playbook.',
    howItWorksEn: [
      'Catch → immediate continuation (point-five) before the mark sets.',
      'Active players stay close; space comes from movement, not a standing stack.',
      'Prefer easy first throws after a dead disc (pull, turnover) instead of a hard opening play.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Anyone with the disc',
        behavior:
          'Scan options before you catch; avoid useless pump fakes; dumps need not lose yards.',
      },
      {
        role: 'Without the disc',
        behavior:
          'Cut before the thrower catches; always be offering; clear out ≠ check out.',
      },
    ],
    matchImpactEn: [
      {
        label: 'Decision turnovers',
        effect: 'Fewer “stagnation” turns — more skill errors (accuracy/drops) at high tempo.',
      },
      {
        label: 'Vs AP / dynamic mark',
        effect: 'Best answer — tempo beats mark chaos.',
      },
    ],
    prosEn: ['Hard to scout', 'Punishes slow D', 'Creates advantage after turns'],
    consEn: ['Needs skill and IQ across the roster', 'Chaos with weak chemistry'],
    suggestedWhenEn: [
      'Experienced roster, high field sense',
      'Opponent runs complex D (AP, trigger-based)',
    ],
    avoidWhenEn: ['Beginner roster — learn formation + space principles first'],
    engineStatusEn: 'Not in engine — candidate for a future attack style.',
  },

  zone_offense: {
    summaryEn:
      'Answer to zone D: 3 flat handlers, 2 poppers/crash, 2 wings. Goal: get behind the cup/wall via around / through / over — not “swing forever.”',
    descriptionEn:
      'USAU and Catch the Spirit describe the classic roles. Some Flow warns against two myths: (1) “swing patiently” with no yards plan, (2) senseless popper running like ho-stack. Zone defends areas — offense should find holes and repeat whatever nets yards.',
    howItWorksEn: [
      'Around: quick dump & swing so the cup cannot catch up; then seize the gap.',
      'Through: short pass to crash/popper into the cup hole; give-and-go through the cup.',
      'Over: hammer / blade / scoober behind the cup — then flow or dump and repeat.',
      'Overload one defender (option play) instead of chaotic popping.',
      'Repeat the sequence that nets +yards until D stops it.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Handler',
        behavior:
          'Fast swing without useless pump fakes; give-and-go; throw into space ahead of the receiver (gain yards).',
      },
      {
        role: 'Popper / crash',
        behavior:
          'Stand in the hole / attack the cup from behind with momentum; do not run aimlessly — work with wings.',
      },
      {
        role: 'Wing / deep wing',
        behavior:
          'Continuation after the swing; deep shot when the cup is stretched; not everyone runs toward the disc (avoid “youth soccer”).',
      },
    ],
    matchImpactEn: [
      {
        label: 'Throws per score',
        effect: 'Higher — on purpose; goal is net yards, not minimizing throws.',
      },
      {
        label: 'Turnovers vs wind',
        effect: 'Over-the-top is risky in strong wind — prefer around/through.',
      },
      {
        label: 'Mismatch exploitation',
        effect: 'You can put your best player on the weakest zone defender.',
      },
    ],
    prosEn: [
      'Structural answer to cup/wall',
      'Give-and-go works great (cup does not “guard” the thrower)',
      'Lets you attack weak spots in D’s shape',
    ],
    consEn: [
      'Patience without a plan = playing D’s game',
      'Overheads in wind = turnovers',
      'Needs trusted handlers and overhead catchers',
    ],
    suggestedWhenEn: [
      'Opponent went zone / cup / junk wall',
      'You have strong handlers and at least one reliable overhead thrower',
    ],
    avoidWhenEn: [
      'Opponent plays person — no reason to stand in zone O',
      'Zero overhead skill and weak swings — zone will smother you',
    ],
    engineStatusEn: 'No dedicated style in engine — add when expanding vs zone.',
  },

  hex_offense: {
    summaryEn:
      'Players keep a hexagon shape; fast disc movement, often “return to sender” as the first look instead of a classic swing.',
    descriptionEn:
      'Hex (UAP) is flexible geometry: intent is closeness and tempo, not fixed handler/cutter spots. First option often returns to the thrower — like give-and-go / German thrower-led.',
    howItWorksEn: [
      'Maintain the hexagon relative to the disc.',
      'Prefer short, quick throws; pivoting may differ from classic stack O.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Everyone',
        behavior: 'Universal roles; everyone ready to throw and cut; high chemistry.',
      },
    ],
    matchImpactEn: [
      {
        label: 'Scout predictability',
        effect: 'Low — harder to scout “positions.”',
      },
    ],
    prosEn: ['Tempo', 'Role flexibility'],
    consEn: ['High learning curve', 'Rare — limited training material'],
    suggestedWhenEn: ['Experienced roster that likes motion'],
    avoidWhenEn: ['Team still learning space/cutting basics'],
    engineStatusEn: 'Not in engine.',
  },

  person: {
    summaryEn:
      'Everyone guards one player; the mark sets force; downfield D shades open side. Foundation for help, switch, and poach.',
    descriptionEn:
      'The simplest and most common defense (USAU, Catch the Spirit, UAP). Matchups by height/speed/level (in mixed — also gender). Open-side positioning ~1–2 m; front of stack denies under, back takes deep. Strength depends on holding the force.',
    howItWorksEn: [
      'Before the pull: call force (forehand/backhand/home/away/middle).',
      'Mark holds one half; downfield D owns the open side.',
      'Switch / sandwich / poach as advanced variants.',
      'Triangulation: see the disc and your person.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Mark',
        behavior:
          'Hold the force; do not chase highlight hand-blocks at the cost of position; scan dump and downfield.',
      },
      {
        role: 'Downfield D',
        behavior:
          'Open-side position; last-back mentality; help deep; orbit/triangulate on swings.',
      },
      {
        role: 'Handler D',
        behavior:
          'Deny upline enough that the dump costs yards; switch on pepe/upline when communication is clear.',
      },
    ],
    matchImpactEn: [
      {
        label: 'Ease of execution',
        effect: 'High — good for less experienced rosters.',
      },
      {
        label: 'Athletic effectiveness',
        effect: 'Very good when you win 1-on-1 matchups.',
      },
      {
        label: 'Vs wind / weak throwers',
        effect: 'Zone may be better — person does not maximize wind.',
      },
    ],
    prosEn: [
      'Easy to understand',
      'Effective with an athletic roster',
      'Base for help/switch/poach',
    ],
    consEn: [
      'Pure “faceguard” loses to thrower-led O',
      'Without help deep — easy hucks',
      'Weaker when you lose athletic matchups',
    ],
    suggestedWhenEn: [
      'Athletic advantage',
      'Younger / less experienced D roster',
      'You want simplicity and intensity',
    ],
    avoidWhenEn: [
      'Strong wind + weak opposing throwers → consider zone',
      'Losing matchups — junk/AP/zone can equalize',
    ],
    engineStatusEn: 'In engine: defenseStyle = person (baseline modifiers).',
  },

  zone_cup: {
    summaryEn:
      'Cup (2 points + middle-middle) + wings + deeps. Forces many short throws; excellent in wind and vs inaccurate handlers.',
    descriptionEn:
      'Classic USAU “force middle cup”: the goal is not sticking to a person, but closing dangerous downfield lanes. The more throws O must make, the higher the turnover chance. Catch the Spirit notes that a pure cup can feel “old school” vs junk wall — but it remains standard at many levels.',
    howItWorksEn: [
      'Cup ~3 m from the disc (double-team rule): force middle, no holes.',
      'Wings: between MM and sideline; stop up-line continuation after a swing.',
      'Short deep: overheads / hammers; deep-deep: last line, do not stand 20 m behind everything.',
      'After a dump — shift; after a swing — sprint contain, then snap to position.',
      'Near endzone: transition call to person.',
    ],
    playerBehaviorsEn: [
      {
        role: 'On-point',
        behavior: 'Force middle; zero breaks; communicate force direction.',
      },
      {
        role: 'Off-point',
        behavior: 'Cut flat swings; after a swing sprint past the disc → become new on-point.',
      },
      {
        role: 'Middle-middle',
        behavior: 'Close the middle lane; shoulder-check open receivers.',
      },
      {
        role: 'Wing',
        behavior:
          'Contain the sideline; do not dive for 50/50 blocks if you lose position (conservative zone).',
      },
      {
        role: 'Deep',
        behavior: 'Communicate; do not get beaten over the top; help wings/MM with voice.',
      },
    ],
    matchImpactEn: [
      {
        label: 'Blocks / D-blocks',
        effect: 'More forced errors and layouts on floaty throws.',
      },
      {
        label: 'Yards allowed on completions',
        effect: 'Higher — O gets short throws, but sometimes punches through the cup.',
      },
      {
        label: 'Opponent tempo',
        effect: 'Drops — zone kills fast-offense flow.',
      },
      {
        label: 'Vs elite throwers',
        effect: 'Weaker — once the cup is broken, D is underloaded.',
      },
    ],
    prosEn: [
      'Excellent in wind',
      'Punishes inaccurate handlers',
      'Changes match rhythm',
      'Protects deep better than pure person (deeps are already deep)',
    ],
    consEn: [
      'After a cup break — underload',
      'Needs huge communication and hustle on swings',
      'Weak vs elite zone O (give-go, over, overload)',
    ],
    suggestedWhenEn: [
      'Wind / rain',
      'Opponent has weak or tired handlers',
      'You want to kill tempo after a string of opponent holds',
    ],
    avoidWhenEn: [
      'Opponent has elite handlers + overheads',
      'Your roster does not communicate in zone',
      'Already near your endzone — person is better',
    ],
    engineStatusEn:
      'In engine: defenseStyle = zone_cup (blockBonus↑, yardsAllowed↑). Cup/wing roles — to expand.',
  },

  junk_wall: {
    summaryEn:
      'Instead of a tight cup — a wall of 3 players ~5–7 m from the disc blocking upfield. More modern zone variant; force usually to sideline/downwind.',
    descriptionEn:
      'Catch the Spirit: junk (“J”) sets a wall 5–7 m from the disc. Flik describes wall/arrowhead and hybrid zones (e.g. Hasami). Goal: do not get sucked to the disc, keep wall unity, force overheads or risky throughs.',
    howItWorksEn: [
      'Wall shifts as a unit in the passing lane.',
      'Force to sideline / downwind.',
      '3 downfield challenge everything that gets through.',
      'Sideline → on-field communication is critical.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Wall',
        behavior: 'Do not split apart; do not get pulled into the mark; shift with the disc.',
      },
      {
        role: 'Force',
        behavior: 'Direct to the sideline; sync with the wall.',
      },
    ],
    matchImpactEn: [
      {
        label: 'Upfield pressure',
        effect: 'High on short throughs; O looks around or over.',
      },
      {
        label: 'Vs patient swing O',
        effect: 'Medium — wall must sprint on swings like a cup.',
      },
    ],
    prosEn: ['Harder to “crash” than a tight cup', 'Good look change'],
    consEn: ['Needs unit discipline', 'Over/around still work'],
    suggestedWhenEn: ['Opponent beats classic cup easily', 'You want a hybrid look'],
    avoidWhenEn: ['No chemistry — the wall falls apart'],
    engineStatusEn: 'Not in engine — candidate zone variant.',
  },

  clam: {
    summaryEn:
      'Defenders guard cut types (open under, break under, deep, hammer space), not people or zones. Proactive switching — lethal vs vertical stack.',
    descriptionEn:
      'UAP: clam = proactive switching. One D takes open-side under, another break under, someone hammer space, someone deep open. Handler D usually stays. After a given cut type finishes — switch. Weak vs ho-stack (less defined lanes).',
    howItWorksEn: [
      'Before the point: assign cut-type roles.',
      'Assertive communication on every switch.',
      'Best right after an O timeout (first pass).',
    ],
    playerBehaviorsEn: [
      {
        role: 'Cut-type defender',
        behavior:
          'Own your “path”; give up the person when they change cut type; anticipate, do not faceguard.',
      },
    ],
    matchImpactEn: [
      {
        label: 'Vs vertical stack',
        effect: 'Very effective — lanes are readable.',
      },
      {
        label: 'Vs horizontal / motion',
        effect: 'Weaker — role chaos, fewer clear cut types.',
      },
      {
        label: 'IQ demands',
        effect: 'Very high — beginners get lost.',
      },
    ],
    prosEn: ['Kills vert after a timeout', 'Creates confusion in O'],
    consEn: ['Fragile in flow', 'Weak vs ho', 'High communication bar'],
    suggestedWhenEn: [
      'Opponent plays vert',
      'Stopped disc / after their timeout',
      'You have an experienced D roster',
    ],
    avoidWhenEn: ['Opponent in ho-stack / motion', 'Young defenders'],
    engineStatusEn: 'Not in engine.',
  },

  all_person: {
    summaryEn:
      'Dynamic mark (force back / to help / wide) + poachy handler D in the middle and lockdown on the sideline. Goal: choppy offense, disconnect backfield↔downfield, longer transit time.',
    descriptionEn:
      'Scheme popularized by Johnny Bravo / Tim Kefalas (Some Flow guide). Not “just force middle”: push the disc to the sideline and only then clamp. Downfield is usually tight person with deny-under emphasis (deep is sometimes baited).',
    howItWorksEn: [
      'Mark: force it back, force to help, force it wide — in practice 1–2 independent vectors.',
      'Handler D: poach the lane when the disc is centered; lockdown on the sideline; switches on upline/pepe.',
      'Downfield: person, deny unders; deep shots partly encouraged.',
      'Trigger: different intensity in the middle vs on the sideline.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Mark',
        behavior:
          'Dynamically change force with help/swing rhythm; “be in the way” without giving easy breaks.',
      },
      {
        role: 'Reset D',
        behavior:
          'Poach → encourage swing to sideline; on sideline faceguard/reset deny; mark last after cutting continuation.',
      },
      {
        role: 'Downfield',
        behavior: 'Tight under; aware deep may come; communicate force changes.',
      },
    ],
    matchImpactEn: [
      {
        label: 'Opponent flow',
        effect: 'Drops — no clean open side, more choppy swings.',
      },
      {
        label: 'Huck completion',
        effect: 'Risk of giving up deep; huck turnovers have lower EV (far from your endzone).',
      },
      {
        label: 'Off-meta advantage',
        effect: 'High until O is ready for ping-pong / inside upfield.',
      },
    ],
    prosEn: [
      'Equalizes athletic gaps with scheme',
      'Disrupts classic open-side hucks',
      'Gunks handler play well',
    ],
    consEn: [
      'Baits deep shots',
      'Force chaos = sometimes easy yards',
      'Weak vs point-five / good small ball',
      'Downfield switching underdeveloped vs top O',
    ],
    suggestedWhenEn: [
      'You want scheme over pure athleticism',
      'Opponent depends on open-side flow and upline',
    ],
    avoidWhenEn: [
      'Opponent completes deep at a high %',
      'Your mark/handler D cannot run dynamic force',
    ],
    engineStatusEn: 'Not in engine — advanced candidate for a future defenseStyle.',
  },

  force_forehand: {
    summaryEn:
      'Mark sets to force the forehand (for right-handers). Most common force; downfield D shades the forehand side.',
    descriptionEn:
      'USAU: mark on the side that denies the backhand field. At beginner level — punishes a weak flick. Higher up — backhand often has more range, so forcing flick limits the farthest throws but gives up a fast, wind-stable flick and easier IO breaks the other way (when someone breaks).',
    howItWorksEn: [
      'Whole D knows force direction before the pull.',
      'Downfield: shade open (forehand) side.',
      'Do not chase a handblock on the open-side throw.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Mark',
        behavior: 'Take away the backhand side; pressure around/IO per call (flat vs diagonal).',
      },
      {
        role: 'Downfield',
        behavior: 'Open-side responsibility; larger buffer on the break side.',
      },
    ],
    matchImpactEn: [
      {
        label: 'Vs weak forehands',
        effect: 'Strong — forces the weaker throw.',
      },
      {
        label: 'Open-side huck lane',
        effect: 'Often clean downfield geometry — exactly what AP critiques.',
      },
    ],
    prosEn: ['Standard, easy D sync', 'Punishes beginners'],
    consEn: ['Clean open-side tunnel for hucks', 'Predictable'],
    suggestedWhenEn: ['Default force', 'Opponent with a weak flick', 'Wind favors that sideline'],
    avoidWhenEn: ['You want to take away the open-side tunnel → consider AP/FM trap'],
    engineStatusEn: 'In engine: forceSide = force_forehand.',
  },

  force_backhand: {
    summaryEn:
      'Forces the backhand for right-handers. Often better at intermediate+: the flick is faster to break with, and force BH helps hammer coverage.',
    descriptionEn:
      'UAP: forehand has more spin and a faster release — easier to break the mark with a flick than an IO backhand. Force backhand makes open side BH; downfield reads hammers more easily.',
    howItWorksEn: [
      'Mirror of force forehand.',
      'Often paired with wind / scouting strong opposing flicks.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Mark',
        behavior: 'Take away the forehand side; be ready for an around flick break.',
      },
    ],
    matchImpactEn: [
      {
        label: 'Break difficulty',
        effect: 'IO backhand harder — fewer cheap breaks.',
      },
      {
        label: 'Hammer coverage',
        effect: 'Better for downfield D.',
      },
    ],
    prosEn: ['Better at mid/high level', 'Makes fast flick breaks harder'],
    consEn: ['Gives a strong backhand huck to some throwers'],
    suggestedWhenEn: ['Opponent breaks with the flick', 'You want to protect hammer space'],
    avoidWhenEn: ['Opponent has dominant backhand huckers without a good flick'],
    engineStatusEn: 'In engine: forceSide = force_backhand.',
  },

  force_middle: {
    summaryEn:
      'Always force toward midfield (or “wide” in AP). Compacts O, hurts continuation; on the sideline becomes a flat mark + trap.',
    descriptionEn:
      'USAU: disc on the right — force flick, on the left — force BH, always to the middle. Some Flow / Rhino: true FM power is pushing to the sideline, then aggressive reset D with a flat mark — not “keeping O in the middle forever.”',
    howItWorksEn: [
      'Mark communicates current direction on every swing.',
      'Downfield orbits the “middle side.”',
      'On the sideline: flat-ish mark, lockdown resets.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Mark + D',
        behavior: 'Constant direction sync; without it — easy break continuation.',
      },
    ],
    matchImpactEn: [
      {
        label: 'Continuation passes',
        effect: 'Fewer — traffic in the middle.',
      },
      {
        label: 'Upline space',
        effect: 'Classic upline disappears; inside upfield lead appears (AP).',
      },
      {
        label: 'Sideline EV',
        effect: 'O has ~lower chance to score on the sideline (Shown Space / Someflow) — FM exploits that.',
      },
    ],
    prosEn: ['Compacts O', 'Pairs well with zone cup', 'Sideline trap'],
    consEn: [
      'Needs communication',
      'Gives a wide half if O runs good small ball',
      'Chaos when sync fails',
    ],
    suggestedWhenEn: ['Zone cup', 'AP-style D', 'You want a sideline trap'],
    avoidWhenEn: ['Roster does not communicate force changes'],
    engineStatusEn: 'In engine: forceSide = force_middle.',
  },

  force_line_trap: {
    summaryEn:
      'Force to the nearest sideline and clamp options. Sideline = “eighth defender.” Effective with athletic advantage and downwind trap.',
    descriptionEn:
      'Catch the Spirit: force line traps O on the edge. UAP: downwind trap — wind helps hold force, breaking into the wind is harder. Someflow: UFA models show lower scoring EV on the sideline.',
    howItWorksEn: [
      'Force to sideline + no-around mark in key moments.',
      'Reset D very tight; downfield clogs ~10 m downfield off the sideline.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Whole D',
        behavior: 'Do not give an easy escape to the middle; punish panic throws along the line.',
      },
    ],
    matchImpactEn: [
      {
        label: 'Sideline turnovers',
        effect: 'Up — out of room, half the field to throw into.',
      },
    ],
    prosEn: ['High turnover EV', 'Simple “sideline helps” intuition'],
    consEn: ['A break to the middle hurts if the mark does not hold'],
    suggestedWhenEn: ['Speed advantage', 'Downwind sideline', 'After opponent swings under the line'],
    avoidWhenEn: ['You cannot finish after the trap (O escapes + scores)'],
    engineStatusEn: 'No dedicated option — partly covered by force_middle.',
  },

  straight_up: {
    summaryEn:
      'Mark straight on the thrower — makes deep harder, gives short throws both ways. Situational: deep cutter on a streak or a known hucker.',
    descriptionEn:
      'USAU: straight up forces shorts under pressure; downfield must cover both sides, often “on the hip,” commit under because deep is harder.',
    howItWorksEn: [
      'Temporary call from the sideline or on a specific thrower.',
      'Deep D can play more under.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Mark',
        behavior: 'Hands high / contest huck lanes; do not bite on a fake dump.',
      },
    ],
    matchImpactEn: [
      {
        label: 'Deep completion %',
        effect: 'Drops.',
      },
      {
        label: 'Short game',
        effect: 'O gets easier flat shorts — a conscious tradeoff.',
      },
    ],
    prosEn: ['Quick patch for a huck threat'],
    consEn: ['Gives both sidelines', 'Tires downfield D'],
    suggestedWhenEn: ['Deep cutter on a streak', 'Known hucker with the disc'],
    avoidWhenEn: ['As a full-game default force'],
    engineStatusEn: 'Not in engine.',
  },

  endzone_vert: {
    nameEn: 'Endzone — Vertical / Cut from the back',
    summaryEn:
      'Regardless of mid-field formation, in the endzone most teams play vert: cut from the back to the corner, then reset–swing–new back of stack.',
    descriptionEn:
      'UAP: banana split (disc center, front splits, middle cuts in), Berkeley option (sideline, ≤5 yd — upline dump). Someflow: “Endzone!” does not have to mean vert — Fury shows alternatives — but cut-from-back is the default.',
    howItWorksEn: [
      'Transition to vert around the red zone.',
      'Iso cut from the back to the open corner.',
      'Incomplete → dump, swing, activate new back.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Thrower',
        behavior: 'Wait for separation; do not force 50/50; use upline dump (Berkeley) from the sideline.',
      },
      {
        role: 'Back of stack',
        behavior: 'Longest run into the biggest space; clear if you do not get it.',
      },
    ],
    matchImpactEn: [
      {
        label: 'Conversion near goal',
        effect: 'Rises with practiced endzone plays.',
      },
    ],
    prosEn: ['Clear roles', 'Universal'],
    consEn: ['Predictable vs scouting D', 'Not the only option'],
    suggestedWhenEn: ['Red zone / endzone'],
    avoidWhenEn: [],
    engineStatusEn: 'No dedicated endzone logic in the engine.',
  },

  pull_play_string: {
    summaryEn:
      'Set sequence after catching the pull: quick yards before D sets. String = receiver order; flood+iso = isolation.',
    descriptionEn:
      'UAP/Flik: pull plays make sense because D is sprinting 60+ m. String (“A to B under, C deep”). Someflow: do not start with the hardest look — small dominoes first; catching the pull and centering while facing forward matters; deep-on-pull is overused and D still falls for it.',
    howItWorksEn: [
      'Call the string before the point.',
      'Pull catcher: safe possession → easy advance.',
      'Flood/iso or transition to stack after 2–3 throws.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Pull catcher',
        behavior: 'Secure catch; avoid panic huck; center with forward momentum.',
      },
      {
        role: 'D after the pull',
        behavior:
          'Hangtime + pinning to the sideline can beat “max yards out of bounds” without a D set (Someflow).',
      },
    ],
    matchImpactEn: [
      {
        label: 'Starting field position',
        effect: 'Better O start; less stagnation.',
      },
    ],
    prosEn: ['Free yards', 'Builds flow'],
    consEn: ['Overorchestrated deep often gets scouted'],
    suggestedWhenEn: ['Every receive pull — have a plan'],
    avoidWhenEn: ['Roster chaos — then: catch, center, play'],
    engineStatusEn: 'No pull-play scripts in the engine.',
  },

  fast_break: {
    summaryEn:
      'Immediate attack after a turnover (especially after a failed huck). D is spread; O should score before they recover.',
    descriptionEn:
      'Some Flow: post-huck turnover = gold fast break; Fury/Brute Squad as examples. Point-five = urgency on every catch. Defense should “get back” like basketball — lanes first, then your person.',
    howItWorksEn: [
      'After a D: first player with the disc looks for an immediate under/deep into open space.',
      'Do not reset into a full stack if you have 2v1 / 3v2.',
    ],
    playerBehaviorsEn: [
      {
        role: 'New O',
        behavior: 'Sprint into space; zero huddle; catch and go.',
      },
      {
        role: 'New D',
        behavior: 'Beat your person downfield; clog lanes; then matchup.',
      },
    ],
    matchImpactEn: [
      {
        label: 'Break chance after a turn',
        effect: 'Rises significantly with a trained fast break.',
      },
    ],
    prosEn: ['High EV', 'Punishes deep-obsessed O'],
    consEn: ['A turnover in the fast break hurts twice'],
    suggestedWhenEn: ['After every turnover — default mindset'],
    avoidWhenEn: [],
    engineStatusEn:
      'Partly natural in the engine after turnovers; no dedicated tactical switch.',
  },

  principle_space: {
    nameEn: 'Space principle',
    summaryEn:
      'Every formation exists to create and attack space. Clearing is as important as cutting. Glasgow: teach space principles before you teach “the stack.”',
    descriptionEn:
      'Catch the Spirit / Glasgow / Flik: standing in the way kills offense. Cut → get the disc or clear. A dump is not failure — it resets position. Someflow: do not lose more yards on the dump than you must; take every free yard on the catch.',
    howItWorksEn: [
      'Create lanes with positioning.',
      'Attack them with timing.',
      'Give them back with a clear.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Everyone',
        behavior: 'Field sense > memorized pattern. Look where space is, not only “whose turn.”',
      },
    ],
    matchImpactEn: [
      {
        label: 'Universal',
        effect: 'Foundation of all stacks and zone O.',
      },
    ],
    prosEn: ['Transfers across formations'],
    consEn: [],
    suggestedWhenEn: ['Always'],
    avoidWhenEn: [],
    engineStatusEn: 'Design principle for AI cutters — to reinforce in cutterBrain.',
  },

  principle_team_defense: {
    nameEn: 'Team defense principle',
    summaryEn:
      'D’s only goal: did O score, or turn. You do not get points for “being close to your person.” Help, switch, bracket, talk.',
    descriptionEn:
      'Some Flow philosophies: threat equalization — every O option equally bad; always last-back; stunt and recover; talk more; do not overcommit to stopping movement backwards.',
    howItWorksEn: [
      'Defend threats, not matchup ego.',
      'Proactive > reactive.',
      'Intensity and smarts are not a tradeoff.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Defender',
        behavior:
          'Micro-poach the lane, recover when the thrower looks at yours; communicate “I’m here.”',
      },
    ],
    matchImpactEn: [
      {
        label: 'Wide-open scores given up',
        effect: 'Drop with help D — even if “your” person gets a short.',
      },
    ],
    prosEn: ['Universal on every scheme'],
    consEn: [],
    suggestedWhenEn: ['Always'],
    avoidWhenEn: [],
    engineStatusEn: 'Partly in defenderBrain; help/switch to expand.',
  },

  principle_turnovers: {
    nameEn: 'Where turnovers come from',
    summaryEn:
      'Some Flow analysis (Fury 2024): accuracy (~63% of factors), decision-making (help deep, sideline), drops. System helps, but skill bottlenecks dominate.',
    descriptionEn:
      'Strategic takeaways: keep the disc off the sideline when you can; read help on deep; floaty huck > outthrown receiver; catching under fatigue. Systemically: fast break, point-five, box-out dump — not just “a stackier stack.”',
    howItWorksEn: [
      'Train accuracy in game context, not only partner throwing.',
      'Scout help defenders before the huck.',
      'Avoid high-difficulty + sideline combo.',
    ],
    playerBehaviorsEn: [
      {
        role: 'Thrower',
        behavior: 'Highest-% throw available; sideline raises difficulty of every throw.',
      },
    ],
    matchImpactEn: [
      {
        label: 'Hold %',
        effect: 'Rises more from skill development than cosmetic formation changes.',
      },
    ],
    prosEn: ['Directs training and scouting priorities'],
    consEn: [],
    suggestedWhenEn: ['Match analysis / training plan'],
    avoidWhenEn: [],
    engineStatusEn: 'Informational — feeds future throwerBrain decision weights.',
  },
}

/** @type {Record<string, { whyEn?: string, nameEn?: string }>} */
export const TACTICS_LOADOUTS_EN = {
  balanced_default: {
    whyEn:
      'Universal set for most matches: controlled offense, readable D, standard force.',
  },
  aggressive_vertical: {
    whyEn:
      'More deep looks and tempo; force BH makes the opponent’s quick flick breaks harder.',
  },
  wind_zone: {
    whyEn:
      'In tough conditions force lots of throws on the opponent; play around/through yourself, careful with overheads.',
  },
  iso_mismatch: {
    whyEn:
      'Feature a dominant cutter; keep simple man-to-man D on matchups.',
  },
  choppy_ap: {
    whyEn:
      'When you want to kill opponent flow with a dynamic mark; your own offense based on tempo, not a rigid stack.',
  },
  anti_vert_clam: {
    whyEn:
      'Against teams that live-and-die by vertical stack — especially after their timeout.',
  },
}

/** Optional English labels for sources that are Polish-leaning. */
export const TACTICS_SOURCES_EN = {
  someflow: {
    labelEn: 'Some Flow (Substack) — tactical analysis',
  },
}
