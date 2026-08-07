/**
 * Kompendium taktyk ultimate frisbee.
 *
 * Źródła (synteza, nie cytaty dosłowne):
 * - theuap.com/ultimate-frisbee-strategy
 * - catchthespirit.co.uk (offense/defense tactics)
 * - USAU Skills, Strategy and Drills (2010)
 * - someflow.substack.com (AP defense, zone O, turnovers, filozofia D)
 * - ultiworld.com (Davide's Doctrines, Tuesday Tips — vert/ho stack)
 * - flikulti.com/theory (taksonomia formacji i ról)
 * - glasgowultimate.co.uk/training (zasady ataku/obrony, skill progression)
 *
 * UWAGA: ten plik jest źródłem wiedzy dla UI „Kompendium”.
 * Silnik czyta odpowiadające style z tacticsModifiers.js / tacticsBehavior.js
 * (formacje, force, poach, zachowania AI).
 * EN body fields: src/data/tacticsGuideEn.js (merged in getters).
 */

import {
  TACTICS_GUIDE_EN,
  TACTICS_LOADOUTS_EN,
  TACTICS_SOURCES_EN,
} from './tacticsGuideEn.js'

export const TACTICS_GUIDE_SOURCES = [
  {
    id: 'uap',
    label: 'The UAP — Ultimate Frisbee Strategy',
    labelPl: 'The UAP — Ultimate Frisbee Strategy',
    labelEn: 'The UAP — Ultimate Frisbee Strategy',
    url: 'https://www.theuap.com/ultimate-frisbee-strategy',
  },
  {
    id: 'cts',
    label: 'Catch the Spirit — Ultimate Frisbee Tactics',
    labelPl: 'Catch the Spirit — Ultimate Frisbee Tactics',
    labelEn: 'Catch the Spirit — Ultimate Frisbee Tactics',
    url: 'https://www.catchthespirit.co.uk/ultimate/ultimate-frisbee-tactics',
  },
  {
    id: 'usau',
    label: 'USAU — Skills, Strategy and Drills (PDF)',
    labelPl: 'USAU — Skills, Strategy and Drills (PDF)',
    labelEn: 'USAU — Skills, Strategy and Drills (PDF)',
    url: 'https://usaultimate.org/wp-content/uploads/2020/11/USAU_SkillsDrills.pdf',
  },
  {
    id: 'someflow',
    label: 'Some Flow (Substack) — analiza taktyczna',
    labelPl: 'Some Flow (Substack) — analiza taktyczna',
    labelEn: TACTICS_SOURCES_EN.someflow.labelEn,
    url: 'https://someflow.substack.com/',
  },
  {
    id: 'ultiworld',
    label: 'Ultiworld — Tuesday Tips / Davide’s Doctrines',
    labelPl: 'Ultiworld — Tuesday Tips / Davide’s Doctrines',
    labelEn: 'Ultiworld — Tuesday Tips / Davide’s Doctrines',
    url: 'https://ultiworld.com/',
  },
  {
    id: 'flik',
    label: 'Flik Ultimate — Theory',
    labelPl: 'Flik Ultimate — Theory',
    labelEn: 'Flik Ultimate — Theory',
    url: 'https://www.flikulti.com/theory/',
  },
  {
    id: 'glasgow',
    label: 'Glasgow Ultimate — Training (offense / defense)',
    labelPl: 'Glasgow Ultimate — Training (offense / defense)',
    labelEn: 'Glasgow Ultimate — Training (offense / defense)',
    url: 'https://glasgowultimate.co.uk/training/',
  },
]

/** Kategorie nawigacji w UI. */
export const TACTICS_GUIDE_CATEGORIES = [
  { id: 'offense', labelPl: 'Atak', labelEn: 'Offense', accent: 'sky' },
  { id: 'defense', labelPl: 'Obrona', labelEn: 'Defense', accent: 'orange' },
  { id: 'force', labelPl: 'Force / Mark', labelEn: 'Force / Mark', accent: 'amber' },
  { id: 'situational', labelPl: 'Sytuacyjne', labelEn: 'Situational', accent: 'violet' },
  { id: 'principles', labelPl: 'Zasady', labelEn: 'Principles', accent: 'emerald' },
]

/**
 * Wpływ na decyzje AI / zawodników — opisowy model na przyszłą implementację.
 * Klucze są semantyczne (nie mapują 1:1 na obecny silnik).
 */
export const BEHAVIOR_KEYS = {
  throwRisk: 'Ryzyko rzutu',
  throwDepth: 'Głębokość ataku',
  cutTiming: 'Timing cutów',
  resetPriority: 'Priorytet resetu',
  spaceCreation: 'Tworzenie przestrzeni',
  helpDefense: 'Help defense',
  poachPressure: 'Poaching / junk',
  markPressure: 'Presja markera',
  staminaDrain: 'Zużycie staminy',
  communicationNeed: 'Wymagana komunikacja',
}

/**
 * @typedef {Object} TacticEntry
 * @property {string} id
 * @property {'offense'|'defense'|'force'|'situational'|'principles'} category
 * @property {string} namePl
 * @property {string} nameEn
 * @property {string} [engineId] — id z tacticsModifiers.js, jeśli już istnieje w grze
 * @property {string} summary
 * @property {string} description
 * @property {string[]} howItWorks
 * @property {{ role: string, behavior: string }[]} playerBehaviors
 * @property {{ label: string, effect: string }[]} matchImpact
 * @property {string[]} pros
 * @property {string[]} cons
 * @property {string[]} suggestedWhen
 * @property {string[]} avoidWhen
 * @property {string[]} pairsWellWith
 * @property {string[]} conflictsWith
 * @property {string[]} sources
 * @property {string} [engineStatus] — status względem silnika
 */

/** @type {TacticEntry[]} */
export const TACTICS_GUIDE_ENTRIES = [
  // ─── OFFENSE ───────────────────────────────────────────────
  {
    id: 'vertical_stack',
    category: 'offense',
    namePl: 'Vertical Stack',
    nameEn: 'Vertical Stack',
    engineId: 'vertical_stack',
    summary:
      'Linia cuttersów w środku boiska tworzy dwa pasy podań (open side / break side). Izoluje pojedyncze pojedynki i dobrze skaluje się aż do endzone.',
    description:
      'Vertical stack powstał jako odpowiedź na force markera: zawodnicy ustawiają się w pionowej linii wzdłuż środka boiska, żeby otworzyć boczne pasy. Cuts zwykle startują z tyłu (deep/under) lub z przodu (break side). Formacja działa przez cały punkt, także blisko endzone — w przeciwieństwie do horizontal stack.',
    howItWorks: [
      'Stack stoi w środku → boki boiska są wolne jako pasy podań.',
      'Jeden cutter inicjuje cut; reszta stoi nieruchomo, żeby nie zablokować przestrzeni.',
      'Po nieudanym cucie — clear do tyłu stacka; po złapaniu — stack przesuwa się w górę boiska (mobile stack).',
      'Handlerzy dumpują i swingują, żeby przenieść dysk na break side i zdezorganizować downfield D.',
    ],
    playerBehaviors: [
      {
        role: 'Handler',
        behavior:
          'Priorytet: dump/swing przy wysokim stallu; break mark, gdy lane jest otwarty. Mniej hucków „na sztywno”, więcej precyzyjnych podań w izolowany pas.',
      },
      {
        role: 'Cutter (tył stacka)',
        behavior:
          'Inicjuje cut under lub deep. Jeśli obrońca poachuje w lane — ucieka na break side. Po cutcie bez dysku: clear na tył.',
      },
      {
        role: 'Cutter (przód stacka)',
        behavior:
          'Często atakuje break side lub wypełnia reset space. Unika wchodzenia w aktywny pas cuttera z tyłu.',
      },
      {
        role: 'Cały atak',
        behavior:
          'Świadomość, kto cutuje (kolejność / awareness). Sztywne „tylko z tyłu” obniża IQ — lepiej czytać przestrzeń.',
      },
    ],
    matchImpact: [
      {
        label: 'Celność podań',
        effect: 'Wyższa — krótsze, bardziej przewidywalne linie rzutu w izolowanym pasie.',
      },
      {
        label: 'Zysk jardów na podanie',
        effect: 'Umiarkowany — mniej „big plays”, więcej kontrolowanego awansu.',
      },
      {
        label: 'Podatność na clam / poach',
        effect: 'Wysoka — lane’y są czytelne; clam i poache w pasie skutecznie blokują pierwsze opcje.',
      },
      {
        label: 'Endzone',
        effect: 'Naturalne przejście — większość drużyn i tak gra vert w endzone (cut from the back).',
      },
    ],
    pros: [
      'Duża przestrzeń dla dominant cuttersów',
      'Działa aż do endzone bez zmiany formacji',
      'Prostsza do nauczenia niż motion / hex',
      'Dobrze izoluje 1-na-1',
    ],
    cons: [
      'Przewidywalność przy sztywnym „cut from the back”',
      'Łatwo kontruje clam / junk / poach w lane',
      'Przeciw zone trzeba natychmiast przełączyć formację',
      'Wymaga handlerów potrafiących breakować mark lub dump-swing',
    ],
    suggestedWhen: [
      'Masz 1–2 dominantych cuttersów atletycznych',
      'Handlerzy potrafią breakować lub sprawnie swingować',
      'Chcesz jedną formację na cały punkt (w tym endzone)',
      'Przeciwnik gra standard person + force',
    ],
    avoidWhen: [
      'Przeciwnik często gra clam / junk przeciw vert',
      'Słabi handlerzy (brak breaków i dumpów) → stagnacja',
      'Przeciwnik wychodzi w zone — przełącz na zone O',
    ],
    pairsWellWith: ['person', 'force_forehand', 'force_backhand', 'endzone_vert'],
    conflictsWith: ['clam', 'zone_cup'],
    sources: ['uap', 'cts', 'flik', 'ultiworld', 'usau'],
    engineStatus:
      'W silniku: attackStyle = vertical_stack (bonus celności, mniejszy advance). Zachowania cuttersów/handlerów — do rozbudowy.',
  },
  {
    id: 'horizontal_stack',
    category: 'offense',
    namePl: 'Horizontal Stack (Ho-Stack)',
    nameEn: 'Horizontal Stack',
    engineId: 'horizontal_stack',
    summary:
      '3 handlerów + 4 cuttersów w linii w poprzek boiska. Tworzy przestrzeń under (przed cuttersami) i deep (za nimi). Elastyczny flow, słabszy blisko endzone.',
    description:
      'Ho-stack jest intuicyjny dla zawodników z backgroundu boiskowego (piłka nożna itp.). Głębokość ustawienia cuttersów reguluje priorytet: bliżej handlerów = więcej deep space; dalej = więcej under. Inicjacja zwykle z dwóch środkowych pozycji (jeden under, drugi deep). Boczni cuttersi kontynuują lub idą deep.',
    howItWorks: [
      'Ustawienie ~10–15 m między handlerami a cuttersami (Ultiworld / Davide).',
      'Środkowi cuttersi robią komplementarne cuty (np. diamond: under + deep).',
      'Boczni utrzymują aktywność (fake cuts), żeby uniemożliwić poache/switche.',
      'Po złapaniu — continuation na drugą stronę lub deep; clear i reorganizacja linii.',
      'Blisko endzone drużyny często przechodzą na vertical stack.',
    ],
    playerBehaviors: [
      {
        role: 'Handlerzy (3)',
        behavior:
          'Utrzymują dysk w środku boiska. Dump & swing, give-and-go, unikanie sideline trap. Pierwszy rzut inicjujący ideally w kierunku mid-field.',
      },
      {
        role: 'Cutter środkowy',
        behavior:
          'Inicjuje under lub deep; zawsze patrzy na dysk podczas cuta. Timing z partnerem (diamond / piston).',
      },
      {
        role: 'Cutter boczny',
        behavior:
          'Ciągły ruch i fake’i; push do środka gdy środkowi się zmęczą (diamond push system); continuation deep po underze partnera.',
      },
    ],
    matchImpact: [
      {
        label: 'Tempo / flow',
        effect: 'Wyższe — więcej opcji under+deep naraz, łatwiejsze kontynuacje.',
      },
      {
        label: 'Ryzyko rzutu',
        effect: 'Wyższe przy agresywnych deepach i huckach; więcej „big plays”.',
      },
      {
        label: 'Odporność na zone',
        effect: 'Lepsza niż vert — pozycje są bliższe zone O (handlers flat + wings).',
      },
      {
        label: 'Endzone',
        effect: 'Słabsza — mało miejsca; zwykle transition do vert.',
      },
      {
        label: 'Zużycie staminy',
        effect: 'Wysokie przy systemach typu double piston (wszyscy cutują naraz).',
      },
    ],
    pros: [
      'Elastyczny ruch, trudniejszy do przewidzenia niż sztywny vert',
      'Dobre deep lanes i under space jednocześnie',
      'Działa w większości warunków pogodowych',
      'Łatwiejsza adaptacja przeciw zone (bez dużej zmiany pozycji)',
    ],
    cons: [
      'Wymaga wysokiej awareness (kolizje cutów)',
      'Słabo skaluje się w ciasnej endzone',
      'Agresywne systemy mocno męczą cuttersów',
      'Łatwo ugrzęznąć na sideline bez dyscypliny handlerów',
    ],
    suggestedWhen: [
      'Masz wielu dobrych cuttersów i 3 solidnych handlerów',
      'Chcesz atakować głęboko i utrzymać tempo',
      'Przeciwnik miesza person / lekkie junk',
      'Warunki pozwalają na dłuższe rzuty',
    ],
    avoidWhen: [
      'Jesteś już w red zone / endzone — przełącz na vert',
      'Handlerzy nie trzymają dysku w środku (sideline trap)',
      'Skład zmęczony — unikaj double piston',
    ],
    pairsWellWith: ['person', 'force_forehand', 'zone_offense_response'],
    conflictsWith: ['clam'],
    sources: ['uap', 'cts', 'ultiworld', 'flik'],
    engineStatus:
      'W silniku: attackStyle = horizontal_stack (niższa celność, wyższy advance). Pełna logika 3H/4C — do rozbudowy.',
  },
  {
    id: 'split_stack',
    category: 'offense',
    namePl: 'Split Stack',
    nameEn: 'Split Stack',
    summary:
      'Cuttersi podzieleni na dwie strony boiska (2–2 lub 3–1). Łączy izolację z szerokością; dobre do flood/iso i pull plays.',
    description:
      'Split stack ma 2–3 handlerów poza stackiem. Cuttersi dzielą się na obie strony — albo równo 2+2, albo overload 3+1. Daje klarowne przestrzenie i pozwala szybko floodować jedną stronę, izolując cuttera.',
    howItWorks: [
      'Handlerzy utrzymują dysk; cuttersi atakują ze swoich pół.',
      'Flood: większość stacka na jedną stronę, iso cutter w dużej przestrzeni.',
      'Po pull play często transition do vert lub ho.',
    ],
    playerBehaviors: [
      {
        role: 'Iso cutter',
        behavior: 'Atakuje największą wolną przestrzeń; pierwszy target po pullu lub timeoucie.',
      },
      {
        role: 'Flood side',
        behavior: 'Czyści przestrzeń, potem continuation deep lub under z floodu.',
      },
    ],
    matchImpact: [
      {
        label: 'Izolacja mismatch',
        effect: 'Bardzo wysoka — łatwo wystawić najlepszego cuttera 1-na-1.',
      },
      {
        label: 'Przewidywalność',
        effect: 'Średnia — dobre drużyny D szybko schodzą help na iso.',
      },
    ],
    pros: ['Silne iso', 'Dobre pull plays', 'Elastyczne przejścia'],
    cons: ['Wymaga dyscypliny clearów', 'Help defense karze spóźnione rzuty'],
    suggestedWhen: [
      'Masz wyraźny mismatch atletyczny',
      'Chcesz szybki atak po pullu',
    ],
    avoidWhen: ['Przeciwnik świetnie bracketuje / help deep'],
    pairsWellWith: ['person', 'pull_play_string'],
    conflictsWith: [],
    sources: ['uap', 'flik'],
    engineStatus: 'Brak w silniku — tylko opis w kompendium.',
  },
  {
    id: 'side_stack',
    category: 'offense',
    namePl: 'Side Stack',
    nameEn: 'Side Stack',
    summary:
      'Większość ataku na jednej sideline; izolowany cutter (lub handler) w dużej przestrzeni. Klasyczne iso dla dominantego zawodnika.',
    description:
      'Side stack ustawia 2–3 handlerów i resztę cuttersów na jednej stronie. Aktywny iso atakuje wolną połowę. Skuteczny, gdy masz jednego wybitnego cuttera; mniej użyteczny na najwyższym poziomie, gdzie D szybko pomaga.',
    howItWorks: [
      'Flood jednej sideline → izolacja przeciwnej przestrzeni.',
      'Po złapaniu iso: deep do wyznaczonego cuttera ze stacka lub transition do innej formacji.',
    ],
    playerBehaviors: [
      {
        role: 'Iso',
        behavior: 'Czytaj mark i help; atakuj under jeśli deep jest bracketowany.',
      },
      {
        role: 'Stack',
        behavior: 'Nie wchodź w przestrzeń iso; bądź gotów na continuation deep.',
      },
    ],
    matchImpact: [
      {
        label: 'Zależność od gwiazdy',
        effect: 'Wysoka — offense stoi i pada z formą iso cuttera.',
      },
    ],
    pros: ['Maksymalna izolacja', 'Proste do wywołania po timeoutie'],
    cons: ['Łatwe do help D', 'Przewidywalne na wysokim poziomie'],
    suggestedWhen: ['Wyraźny mismatch', 'Stopped disc / timeout'],
    avoidWhen: ['Równomierny skład bez dominantego cuttera'],
    pairsWellWith: ['person', 'pull_play_string'],
    conflictsWith: ['clam'],
    sources: ['uap', 'flik'],
    engineStatus: 'Brak w silniku — tylko opis w kompendium.',
  },
  {
    id: 'motion_offense',
    category: 'offense',
    namePl: 'Motion / Flow Offense',
    nameEn: 'Motion / Flow Offense',
    summary:
      'Intencja raczej niż formacja: dysk w ciągłym ruchu, zawodnicy blisko siebie, point-five mentality. Minimalizuje czas, w którym D zdąży się ustawić.',
    description:
      'Motion offense to filozofia (Some Flow, Flik flow offence): nie czekaj na idealny diagram — ruszaj dysk natychmiast. Give-and-go, catch facing break side, cut before the thrower catches. Topowe drużyny (np. Brown, Truck Stop) deklarują „no diagrammable offense” — system to zasady, nie playbook.',
    howItWorks: [
      'Catch → natychmiastowa kontynuacja (point-five), zanim mark się ustawi.',
      'Aktywni zawodnicy blisko siebie; przestrzeń tworzona ruchem, nie standing stackiem.',
      'Preferuj łatwe pierwsze podania po dead disc (pull, turnover) zamiast trudnego opening play.',
    ],
    playerBehaviors: [
      {
        role: 'Każdy z dyskiem',
        behavior:
          'Skanuj opcje zanim złapiesz; unikaj zbędnych pump fake’ów; dump nie musi tracić jardów.',
      },
      {
        role: 'Bez dysku',
        behavior:
          'Cut zanim thrower złapie; always be offering; clear out ≠ check out.',
      },
    ],
    matchImpact: [
      {
        label: 'Turnovery z decyzji',
        effect: 'Mniej „stagnacyjnych” — więcej z błędów skill (accuracy/drops) przy wysokim tempie.',
      },
      {
        label: 'Przeciw AP / dynamic mark',
        effect: 'Najlepsza odpowiedź — tempo bije chaos markera.',
      },
    ],
    pros: ['Trudne do scoutingowania', 'Karze powolną D', 'Buduje przewagę po turnach'],
    cons: ['Wymaga skillu i IQ całego składu', 'Chaos przy słabej chemistry'],
    suggestedWhen: [
      'Skład doświadczony, wysokie field sense',
      'Przeciwnik gra skomplikowaną D (AP, trigger-based)',
    ],
    avoidWhen: ['Początkujący skład — najpierw formacja + space principles'],
    pairsWellWith: ['person', 'fast_break'],
    conflictsWith: [],
    sources: ['uap', 'someflow', 'flik', 'glasgow'],
    engineStatus: 'Brak w silniku — kandydat na przyszły styl ataku.',
  },
  {
    id: 'zone_offense',
    category: 'offense',
    namePl: 'Zone Offense',
    nameEn: 'Zone Offense',
    summary:
      'Odpowiedź na zone D: 3 flat handlerów, 2 poppers/crash, 2 wings. Cel: wyjść za cup/wall przez around / through / over — nie „swingować w nieskończoność”.',
    description:
      'USAU i Catch the Spirit opisują klasyczne role. Some Flow ostrzega przed dwoma mitami: (1) „swing patiently” bez planu na jardy, (2) bezsensowne bieganie poppersów jak w ho-stack. Strefa broni obszaru — ofensywa powinna znajdować dziury i powtarzać to, co daje net yards.',
    howItWorks: [
      'Around: szybkie dump & swing, żeby cup nie nadążył; potem seize the gap.',
      'Through: short pass do crash/poppera w dziurę cupu; give-and-go przez cup.',
      'Over: hammer / blade / scoober za cup — potem flow lub dump i powtórz.',
      'Overload jednego obrońcy (option play) zamiast chaotycznego poppingu.',
      'Powtarzaj sekwencję, która daje net +jardy, aż D ją zatrzyma.',
    ],
    playerBehaviors: [
      {
        role: 'Handler',
        behavior:
          'Szybki swing bez zbędnego pump fake; give-and-go; rzucaj w przestrzeń przed receiverem (gain yards).',
      },
      {
        role: 'Popper / crash',
        behavior:
          'Stoi w dziurze / atakuje cup z tyłu z momentum; nie biega bez celu — współpracuje z wings.',
      },
      {
        role: 'Wing / deep wing',
        behavior:
          'Continuation po swingu; deep shot gdy cup jest rozciągnięty; nie wszyscy biegają w stronę dysku (unikaj „youth soccer”).',
      },
    ],
    matchImpact: [
      {
        label: 'Liczba podań na score',
        effect: 'Wyższa — świadomie; cel to net yards, nie minimalizacja podań.',
      },
      {
        label: 'Turnovery vs wind',
        effect: 'Over-the-top ryzykowne przy silnym wietrze — preferuj around/through.',
      },
      {
        label: 'Mismatch exploitation',
        effect: 'Można ustawić najlepszego zawodnika na najsłabszym zone defenderze.',
      },
    ],
    pros: [
      'Strukturalna odpowiedź na cup/wall',
      'Give-and-go świetnie działa (cup nie „pilnuje” throwera)',
      'Pozwala atakować słabe punkty ustawienia D',
    ],
    cons: [
      'Cierpliwość bez planu = gra w grę D',
      'Overheads w wietrze = turnovery',
      'Wymaga zaufanych handlerów i catcherów overhead',
    ],
    suggestedWhen: [
      'Przeciwnik wyszedł w zone / cup / junk wall',
      'Masz silnych handlerów i choć jednego pewnego overhead throwera',
    ],
    avoidWhen: [
      'Przeciwnik gra person — nie ma sensu stać w zone O',
      'Zero skillu overhead i słabe swingu — zone Cię udusi',
    ],
    pairsWellWith: ['zone_cup', 'junk_wall'],
    conflictsWith: [],
    sources: ['uap', 'cts', 'usau', 'someflow', 'flik'],
    engineStatus: 'Brak osobnego stylu w silniku — do dodania przy rozbudowie vs zone.',
  },
  {
    id: 'hex_offense',
    category: 'offense',
    namePl: 'Hex / Hexagon',
    nameEn: 'Hex Offense',
    summary:
      'Zawodnicy utrzymują kształt sześciokąta; szybki ruch dysku, często „return to sender” jako pierwsza opcja zamiast klasycznego swingu.',
    description:
      'Hex (UAP) to elastyczna geometria: intencją jest bliskość i tempo, nie stałe pozycje handler/cutter. Pierwsza opcja często wraca do podającego — jak give-and-go / German thrower-led.',
    howItWorks: [
      'Utrzymuj heksagon względem dysku.',
      'Preferuj bliskie, szybkie podania; pivoting może różnić się od klasycznego stack O.',
    ],
    playerBehaviors: [
      {
        role: 'Wszyscy',
        behavior: 'Uniwersalne role; każdy gotów rzucić i cutować; wysoka chemistry.',
      },
    ],
    matchImpact: [
      {
        label: 'Przewidywalność scoutingowa',
        effect: 'Niska — trudniej scoutingować „pozycje”.',
      },
    ],
    pros: ['Tempo', 'Elastyczność ról'],
    cons: ['Wysoki próg wejścia', 'Rzadko spotykany — mało materiałów treningowych'],
    suggestedWhen: ['Doświadczony skład lubiący motion'],
    avoidWhen: ['Zespół uczący się podstaw space/cutting'],
    pairsWellWith: ['person'],
    conflictsWith: [],
    sources: ['uap', 'flik'],
    engineStatus: 'Brak w silniku.',
  },

  // ─── DEFENSE ───────────────────────────────────────────────
  {
    id: 'person',
    category: 'defense',
    namePl: 'Person-to-Person (Man)',
    nameEn: 'Person Defense',
    engineId: 'person',
    summary:
      'Każdy broni jednego zawodnika; mark ustawia force; downfield D stoi po open side. Fundament, na którym buduje się help, switch i poach.',
    description:
      'Najprostsza i najczęściej używana obrona (USAU, Catch the Spirit, UAP). Matchupy wg wzrostu/szybkości/poziomu (w mixed — też płci). Open-side positioning ~1–2 m; front of stack broni under, tył — deep. Siła zależy od trzymania force.',
    howItWorks: [
      'Przed pullem: wywołaj force (forehand/backhand/home/away/middle).',
      'Mark trzyma jedną połowę; downfield D odpowiada za open side.',
      'Switch / sandwich / poach jako warianty zaawansowane.',
      'Triangulacja: widzisz dysk i swojego człowieka.',
    ],
    playerBehaviors: [
      {
        role: 'Mark',
        behavior:
          'Trzymaj force; nie gonij highlight hand-blocków kosztem pozycji; skanuj dump i downfield.',
      },
      {
        role: 'Downfield D',
        behavior:
          'Pozycja open-side; last-back mentality; help na deep; orbit/triangulacja przy swingach.',
      },
      {
        role: 'Handler D',
        behavior:
          'Deny upline na tyle, by dump kosztował jardy; switch na pepe/upline gdy komunikacja jest jasna.',
      },
    ],
    matchImpact: [
      {
        label: 'Prostość wykonania',
        effect: 'Wysoka — dobra dla mniej doświadczonych składów.',
      },
      {
        label: 'Skuteczność atletyczna',
        effect: 'Bardzo dobra, gdy masz lepsze matchupy 1-na-1.',
      },
      {
        label: 'Vs wind / słabi rzucający',
        effect: 'Zone może być lepsza — person nie maksymalizuje wiatru.',
      },
    ],
    pros: [
      'Łatwa do zrozumienia',
      'Skuteczna z atletycznym składem',
      'Baza pod help/switch/poach',
    ],
    cons: [
      'Czysty „faceguard” przegrywa z thrower-led O',
      'Bez help deep — łatwe hucki',
      'Słabsza, gdy jesteś gorszy atletycznie',
    ],
    suggestedWhen: [
      'Atletyczna przewaga',
      'Młodszy / mniej doświadczony skład D',
      'Chcesz prostoty i intensywności',
    ],
    avoidWhen: [
      'Silny wiatr + słabi rzucający rywala → rozważ zone',
      'Przegrywasz matchupy — junk/AP/zone mogą wyrównać',
    ],
    pairsWellWith: [
      'force_forehand',
      'force_backhand',
      'force_middle',
      'vertical_stack',
      'horizontal_stack',
    ],
    conflictsWith: [],
    sources: ['uap', 'cts', 'usau', 'someflow', 'flik', 'glasgow'],
    engineStatus: 'W silniku: defenseStyle = person (baseline modifiers).',
  },
  {
    id: 'zone_cup',
    category: 'defense',
    namePl: 'Zone Cup (3-person cup)',
    nameEn: 'Zone Cup',
    engineId: 'zone_cup',
    summary:
      'Cup (2 points + middle-middle) + wings + deeps. Zmusza atak do wielu krótkich podań; świetna w wietrze i przeciw niedokładnym handlerom.',
    description:
      'Klasyczna zone USAU „force middle cup”: celem nie jest klejenie człowieka, tylko zamknięcie niebezpiecznych lane’ów downfield. Im więcej podań O musi wykonać, tym wyższa szansa na turnover. Catch the Spirit zauważa, że czysty cup bywa „old school” względem junk wall — ale wciąż standard na wielu poziomach.',
    howItWorks: [
      'Cup ~3 m od dysku (reguła double-team): force do środka, brak dziur.',
      'Wings: między MM a sideline; powstrzymaj continuation up-line po swingu.',
      'Short deep: overheads / hammery; deep-deep: last line, nie stój 20 m za wszystkim.',
      'Po dumpie — shift; po swingu — sprint contain, potem snap do pozycji.',
      'Blisko endzone: transition call na person.',
    ],
    playerBehaviors: [
      {
        role: 'On-point',
        behavior: 'Force middle; zero breaków; komunikuj kierunek force.',
      },
      {
        role: 'Off-point',
        behavior: 'Tnij flat swing; po swingu sprint past disc → nowy on-point.',
      },
      {
        role: 'Middle-middle',
        behavior: 'Zamykaj middle lane; shoulder-check na otwartych receiverów.',
      },
      {
        role: 'Wing',
        behavior:
          'Contain sideline; nie rzucaj się na 50/50 block jeśli tracisz pozycję (conservative zone).',
      },
      {
        role: 'Deep',
        behavior: 'Komunikuj; nie daj się obejść; pomagaj wings/MM głosem.',
      },
    ],
    matchImpact: [
      {
        label: 'Bloki / D-blocks',
        effect: 'Więcej wymuszonych błędów i layoutów na floaty throws.',
      },
      {
        label: 'Jardy oddane przy completion',
        effect: 'Wyższe — O dostaje krótkie podania, ale czasem przebija cup.',
      },
      {
        label: 'Tempo rywala',
        effect: 'Spada — zone zabija flow szybkiego ataku.',
      },
      {
        label: 'Vs elite throwers',
        effect: 'Słabiej — po przebiciu cupu D jest w underload.',
      },
    ],
    pros: [
      'Świetna w wietrze',
      'Karze niedokładnych handlerów',
      'Zmienia rytm meczu',
      'Chroni deep lepiej niż czysty person (deeps już są głęboko)',
    ],
    cons: [
      'Po breaku cupu — underload',
      'Wymaga ogromnej komunikacji i hustle na swingach',
      'Słaba przeciw elite zone O (give-go, over, overload)',
    ],
    suggestedWhen: [
      'Wiatr / deszcz',
      'Rywal ma słabych lub zmęczonych handlerów',
      'Chcesz zabić tempo po serii holdów rywala',
    ],
    avoidWhen: [
      'Rywal ma elite handlers + overheads',
      'Twój skład nie komunikuje się w zone',
      'Już blisko twojej endzone — lepiej person',
    ],
    pairsWellWith: ['zone_offense', 'force_middle'],
    conflictsWith: ['motion_offense'],
    sources: ['usau', 'cts', 'uap', 'flik', 'someflow'],
    engineStatus:
      'W silniku: defenseStyle = zone_cup (blockBonus↑, yardsAllowed↑). Role cup/wings — do rozbudowy.',
  },
  {
    id: 'junk_wall',
    category: 'defense',
    namePl: 'Junk / Wall (Arrowhead)',
    nameEn: 'Junk Zone / Wall',
    summary:
      'Zamiast ciasnego cupu — ściana 3 zawodników ~5–7 m od dysku blokująca upfield. Nowocześniejsza odmiana zone; force zwykle do sideline/downwind.',
    description:
      'Catch the Spirit: junk („J”) ustawia wall 5–7 m od dysku. Flik opisuje wall/arrowhead i hybrid zones (np. Hasami). Cel: nie dać się „wyssać” do dysku, trzymać jedność ściany, zmuszać do overheads lub ryzykownych through.',
    howItWorks: [
      'Wall przesuwa się jako jednostka w passing lane.',
      'Force do sideline / downwind.',
      '3 downfield challengeuje wszystko, co przejdzie.',
      'Komunikacja sideline → on-field critical.',
    ],
    playerBehaviors: [
      {
        role: 'Wall',
        behavior: 'Nie rozchodzić się; nie wciągać się do marka; shift z dyskiem.',
      },
      {
        role: 'Force',
        behavior: 'Kieruj do sideline; synchronizacja z wall.',
      },
    ],
    matchImpact: [
      {
        label: 'Presja upfield',
        effect: 'Wysoka na krótkie through; O szuka around lub over.',
      },
      {
        label: 'Vs patient swing O',
        effect: 'Średnia — wall musi sprintować na swingach jak cup.',
      },
    ],
    pros: ['Trudniejsza do „crashnięcia” niż ciasny cup', 'Dobry look change'],
    cons: ['Wymaga dyscypliny jednostki', 'Over/around wciąż działają'],
    suggestedWhen: ['Rywal łatwo bije klasyczny cup', 'Chcesz hybrid look'],
    avoidWhen: ['Brak chemii — wall się rozłazi'],
    pairsWellWith: ['force_middle', 'zone_offense'],
    conflictsWith: [],
    sources: ['cts', 'flik'],
    engineStatus: 'Brak w silniku — kandydat na wariant zone.',
  },
  {
    id: 'clam',
    category: 'defense',
    namePl: 'Clam (cut-type defense)',
    nameEn: 'Clam Defense',
    summary:
      'Obrońcy bronią typów cutów (open under, break under, deep, hammer space), nie ludzi ani stref. Proactive switching — zabójcze vs vertical stack.',
    description:
      'UAP: clam = proactive switching. Jeden D bierze open-side under, inny break under, ktoś hammer space, ktoś deep open. Handler D zwykle zostaje. Po zakończeniu danego typu cuta — switch. Słabo vs ho-stack (mniej zdefiniowane lane’y).',
    howItWorks: [
      'Przed punktem: rozdziel role cut-type.',
      'Komunikacja asertywna przy każdym switchu.',
      'Najlepsza tuż po timeoutie O (pierwszy pass).',
    ],
    playerBehaviors: [
      {
        role: 'Cut-type defender',
        behavior:
          'Pilnuj swojej „ścieżki”; oddaj zawodnika gdy zmienia typ cuta; anticipate, nie faceguard.',
      },
    ],
    matchImpact: [
      {
        label: 'Vs vertical stack',
        effect: 'Bardzo skuteczna — lane’y są czytelne.',
      },
      {
        label: 'Vs horizontal / motion',
        effect: 'Słabsza — chaos ról, mniej jasnych cut types.',
      },
      {
        label: 'Wymagania IQ',
        effect: 'Bardzo wysokie — początkujący się gubią.',
      },
    ],
    pros: ['Zabija vert po timeoutie', 'Generuje confusion w O'],
    cons: ['Krucha w flow', 'Słaba vs ho', 'Wysoki próg komunikacji'],
    suggestedWhen: [
      'Rywal gra vert',
      'Stopped disc / po ich timeoutie',
      'Masz doświadczony skład D',
    ],
    avoidWhen: ['Rywal w ho-stack / motion', 'Młodzi obrońcy'],
    pairsWellWith: ['vertical_stack'],
    conflictsWith: ['horizontal_stack', 'motion_offense'],
    sources: ['uap', 'flik'],
    engineStatus: 'Brak w silniku.',
  },
  {
    id: 'all_person',
    category: 'defense',
    namePl: 'All Person (AP) / Dynamic Force',
    nameEn: 'All Person Defense',
    summary:
      'Dynamiczny mark (force back / to help / wide) + poachy handler D w środku i lockdown na sideline. Cel: choppy offense, disconnect backfield↔downfield, dłuższy transit time.',
    description:
      'Schemat spopularyzowany przez Johnny Bravo / Tim Kefalas (Some Flow guide). Nie jest to „zwykły force middle”: chodzi o wypchnięcie dysku na sideline i dopiero tam zaciśnięcie. Downfield zwykle tight person z naciskiem na deny under (deep bywa baitowany).',
    howItWorks: [
      'Mark: force it back, force to help, force it wide — w praktyce 1–2 niezależne wektory.',
      'Handler D: poach w lane gdy dysk w środku; lockdown przy sideline; switche na upline/pepe.',
      'Downfield: person, deny unders; deep shots częściowo zachęcane.',
      'Trigger: inny intensywność w środku vs na sideline.',
    ],
    playerBehaviors: [
      {
        role: 'Mark',
        behavior:
          'Dynamiczna zmiana force w rytm help/swing; „be in the way” bez oddawania łatwego breaka.',
      },
      {
        role: 'Reset D',
        behavior:
          'Poach → zachęć swing do sideline; na sideline faceguard/reset deny; mark last po odcięciu continuation.',
      },
      {
        role: 'Downfield',
        behavior: 'Tight under; świadomość, że deep może przyjść; komunikuj force changes.',
      },
    ],
    matchImpact: [
      {
        label: 'Flow rywala',
        effect: 'Spada — brak czystego open side, więcej choppy swings.',
      },
      {
        label: 'Huck completion',
        effect: 'Ryzyko oddania deep; turnovery z hucków mają niższy EV (daleko od twojej endzone).',
      },
      {
        label: 'Off-meta advantage',
        effect: 'Wysoki, póki O nie jest przygotowane na ping-pong / inside upfield.',
      },
    ],
    pros: [
      'Wyrównuje braki atletyczne schematem',
      'Utrudnia klasyczne open-side hucki',
      'Dobrze gunkuje handler play',
    ],
    cons: [
      'Baituje deep shots',
      'Chaos force = czasem łatwe jardy',
      'Słaba vs point-five / good small ball',
      'Downfield switching niedorozwinięty vs top O',
    ],
    suggestedWhen: [
      'Chcesz schemat ponad czysty athleticism',
      'Rywal uzależniony od open-side flow i upline',
    ],
    avoidWhen: [
      'Rywal kompletuje deep na wysokim %',
      'Twój mark/handler D nie ogarnia dynamic force',
    ],
    pairsWellWith: ['force_middle', 'person'],
    conflictsWith: ['motion_offense'],
    sources: ['someflow', 'flik'],
    engineStatus: 'Brak w silniku — zaawansowany kandydat na przyszły defenseStyle.',
  },

  // ─── FORCE / MARK ──────────────────────────────────────────
  {
    id: 'force_forehand',
    category: 'force',
    namePl: 'Force Forehand',
    nameEn: 'Force Forehand',
    engineId: 'force_forehand',
    summary:
      'Mark ustawia się tak, by wymusić forehand (u praworęcznych). Najczęstszy force; downfield D stoi po stronie forehandu.',
    description:
      'USAU: mark po stronie uniemożliwiającej backhand field. Na poziomie beginners — karze słaby flick. Na wyższym — backhand ma często większy zasięg, więc force flick ogranicza najdalsze rzuty, ale oddaje szybki, stabilny w wietrze flick i łatwiejsze IO breaks z drugiej strony (gdy ktoś breakuje).',
    howItWorks: [
      'Cała D zna kierunek force przed pullem.',
      'Downfield: shade open (forehand) side.',
      'Nie goń handblocka na open-side throw.',
    ],
    playerBehaviors: [
      {
        role: 'Mark',
        behavior: 'Zabierz backhand side; pressure around/IO według ustaleń (flat vs diagonal).',
      },
      {
        role: 'Downfield',
        behavior: 'Open-side responsibility; break side z większym buforem.',
      },
    ],
    matchImpact: [
      {
        label: 'Vs weak forehands',
        effect: 'Silny — wymusza słabszy rzut.',
      },
      {
        label: 'Open-side huck lane',
        effect: 'Często czysta geometria downfield — AP krytykuje właśnie to.',
      },
    ],
    pros: ['Standard, łatwa synchronizacja D', 'Karze początkujących'],
    cons: ['Czysty open-side tunnel na huck', 'Przewidywalny'],
    suggestedWhen: ['Domyślny force', 'Rywal ze słabym flickiem', 'Wiatr sprzyja tej sideline'],
    avoidWhen: ['Chcesz zabrać open-side tunnel → rozważ AP/FM trap'],
    pairsWellWith: ['person', 'vertical_stack', 'horizontal_stack'],
    conflictsWith: [],
    sources: ['usau', 'uap', 'cts', 'someflow'],
    engineStatus: 'W silniku: forceSide = force_forehand.',
  },
  {
    id: 'force_backhand',
    category: 'force',
    namePl: 'Force Backhand',
    nameEn: 'Force Backhand',
    engineId: 'force_backhand',
    summary:
      'Wymusza backhand u praworęcznych. Na poziomach intermediate+ często lepszy: flick jest szybszy do breaka, a force BH ułatwia coverage hammerów.',
    description:
      'UAP: forehand ma więcej spinu i szybszy release — łatwiej breaknąć mark flickiem niż IO backhandem. Force backhand sprawia, że open side to BH; downfield łatwiej czyta hammery.',
    howItWorks: [
      'Mirror force forehand.',
      'Często łączony z wiatrem / scoutingiem mocnych flicków rywala.',
    ],
    playerBehaviors: [
      {
        role: 'Mark',
        behavior: 'Zabierz forehand side; bądź gotów na around flick break.',
      },
    ],
    matchImpact: [
      {
        label: 'Break difficulty',
        effect: 'IO backhand trudniejszy — mniej taniego breaka.',
      },
      {
        label: 'Hammer coverage',
        effect: 'Lepsza dla downfield D.',
      },
    ],
    pros: ['Lepszy na mid/high level', 'Utrudnia szybki flick break'],
    cons: ['Oddaje mocny backhand huck niektórym throwerom'],
    suggestedWhen: ['Rywal breakuje flickiem', 'Chcesz chronić hammer space'],
    avoidWhen: ['Rywal ma dominant backhand huckerów bez dobrego flicka'],
    pairsWellWith: ['person'],
    conflictsWith: [],
    sources: ['uap', 'usau'],
    engineStatus: 'W silniku: forceSide = force_backhand.',
  },
  {
    id: 'force_middle',
    category: 'force',
    namePl: 'Force Middle (FM)',
    nameEn: 'Force Middle',
    engineId: 'force_middle',
    summary:
      'Zawsze forsuj do środka boiska (lub „wide” w AP). Kompaktuje O, utrudnia continuation; na sideline staje się flat mark + trap.',
    description:
      'USAU: przy dysku na prawej — force flick, na lewej — force BH, zawsze do środka. Some Flow / Rhino: prawdziwa siła FM to wypchnięcie na sideline, a potem agresywny reset D przy flat mark — nie „trzymanie O w środku na zawsze”.',
    howItWorks: [
      'Mark komunikuje aktualny kierunek przy każdym swingu.',
      'Downfield orbituje na „middle side”.',
      'Na sideline: flat-ish mark, lockdown resetów.',
    ],
    playerBehaviors: [
      {
        role: 'Mark + D',
        behavior: 'Stała synchronizacja kierunku; bez niej — łatwe break continuation.',
      },
    ],
    matchImpact: [
      {
        label: 'Continuation passes',
        effect: 'Mniej — traffic w środku.',
      },
      {
        label: 'Upline space',
        effect: 'Tradycyjny upline znika; pojawia się inside upfield lead (AP).',
      },
      {
        label: 'Sideline EV',
        effect: 'O ma ~niższy chance to score na sideline (Shown Space / Someflow) — FM to exploituje.',
      },
    ],
    pros: ['Kompaktuje O', 'Dobrze łączy się z zone cup', 'Sideline trap'],
    cons: ['Wymaga komunikacji', 'Oddaje szeroką połowę jeśli O umie small ball', 'Chaos przy złej synchronizacji'],
    suggestedWhen: ['Zone cup', 'AP-style D', 'Chcesz trap na sideline'],
    avoidWhen: ['Skład nie komunikuje zmian force'],
    pairsWellWith: ['zone_cup', 'all_person', 'person'],
    conflictsWith: [],
    sources: ['usau', 'cts', 'someflow', 'flik'],
    engineStatus: 'W silniku: forceSide = force_middle.',
  },
  {
    id: 'force_line_trap',
    category: 'force',
    namePl: 'Force Sideline / Trap',
    nameEn: 'Force Line / Sideline Trap',
    summary:
      'Forsuj do najbliższej sideline i zaciśnij opcje. Sideline = „ósmý obrońca”. Skuteczne przy przewadze atletycznej i downwind trap.',
    description:
      'Catch the Spirit: force line trapuje O na krawędzi. UAP: downwind trap — wiatr pomaga trzymać force, break pod wiatr jest trudniejszy. Someflow: modele UFA pokazują niższy scoring EV na sideline.',
    howItWorks: [
      'Force do sideline + no-around mark w kluczowych momentach.',
      'Reset D bardzo tight; downfield clog ~10 m downfield off sideline.',
    ],
    playerBehaviors: [
      {
        role: 'Cała D',
        behavior: 'Nie dawaj easy escape do środka; karz panic throws wzdłuż linii.',
      },
    ],
    matchImpact: [
      {
        label: 'Turnovery przy sideline',
        effect: 'Wzrost — out of room, połowa pola do rzutu.',
      },
    ],
    pros: ['Wysoki EV turnoverów', 'Prosta intuicja „sideline pomaga”'],
    cons: ['Break do środka boli, jeśli mark nie trzyma'],
    suggestedWhen: ['Przewaga speed', 'Downwind sideline', 'Po swingu rywala pod linię'],
    avoidWhen: ['Nie umiesz dograć po trapie (O escape + score)'],
    pairsWellWith: ['person', 'all_person', 'force_middle'],
    conflictsWith: [],
    sources: ['cts', 'uap', 'someflow'],
    engineStatus: 'Brak osobnej opcji — częściowo pokryte przez force_middle.',
  },
  {
    id: 'straight_up',
    category: 'force',
    namePl: 'Straight Up / No Huck',
    nameEn: 'Straight-Up Mark',
    summary:
      'Mark na wprost throwera — utrudnia deep, oddaje shorty na obie strony. Sytuacyjne: deep cutter streak lub znany hucker.',
    description:
      'USAU: straight up zmusza do shortów pod presją; downfield musi bronić obie strony, często „on the hip”, commit do under bo deep jest trudniejszy.',
    howItWorks: [
      'Tymczasowy call z sideline lub na konkretnego throwera.',
      'Deep D może grać bardziej under.',
    ],
    playerBehaviors: [
      {
        role: 'Mark',
        behavior: 'Hands high / contest huck lanes; nie sprzedawaj się na fake dump.',
      },
    ],
    matchImpact: [
      {
        label: 'Deep completion %',
        effect: 'Spada.',
      },
      {
        label: 'Short game',
        effect: 'O dostaje łatwiejsze flat shorty — świadomy tradeoff.',
      },
    ],
    pros: ['Szybki patch na huck threat'],
    cons: ['Oddaje obie sideline', 'Męczy downfield D'],
    suggestedWhen: ['Streak deep cutter', 'Znany hucker z dyskiem'],
    avoidWhen: ['Jako stały force całego meczu'],
    pairsWellWith: ['person'],
    conflictsWith: [],
    sources: ['usau', 'uap', 'cts'],
    engineStatus: 'Brak w silniku.',
  },

  // ─── SITUATIONAL ───────────────────────────────────────────
  {
    id: 'endzone_vert',
    category: 'situational',
    namePl: 'Endzone — Vertical / Cut from the back',
    nameEn: 'Endzone — Vertical / Cut from the back',
    summary:
      'Niezależnie od formacji mid-field, w endzone większość drużyn gra vert: cut z tyłu do rogu, potem reset–swing–nowy tył stacka.',
    description:
      'UAP: banana split (disc center, front splits, middle cuts in), Berkeley option (sideline, ≤5 yd — upline dump). Someflow: „Endzone!” nie musi znaczyć vert — Fury pokazuje alternatywy — ale cut-from-back jest defaultem.',
    howItWorks: [
      'Transition do vert przy ~red zone.',
      'Iso cut z tyłu do open corner.',
      'Incomplete → dump, swing, activate new back.',
    ],
    playerBehaviors: [
      {
        role: 'Thrower',
        behavior: 'Czekaj na separation; nie forsuj 50/50; użyj upline dump (Berkeley) z sideline.',
      },
      {
        role: 'Back of stack',
        behavior: 'Najdłuższy run na największą przestrzeń; clear jeśli nie dostajesz.',
      },
    ],
    matchImpact: [
      {
        label: 'Conversion blisko celu',
        effect: 'Rosną przy wyćwiczonych endzone plays.',
      },
    ],
    pros: ['Klarowne roles', 'Uniwersalne'],
    cons: ['Przewidywalne vs scouting D', 'Nie jedyna opcja'],
    suggestedWhen: ['Red zone / endzone'],
    avoidWhen: [],
    pairsWellWith: ['vertical_stack', 'force_forehand'],
    conflictsWith: [],
    sources: ['uap', 'flik', 'someflow', 'ultiworld'],
    engineStatus: 'Brak osobnej logiki endzone w silniku.',
  },
  {
    id: 'pull_play_string',
    category: 'situational',
    namePl: 'Pull Play / String',
    nameEn: 'Pull Plays',
    summary:
      'Ustalona sekwencja po catchu pulla: szybkie jardy zanim D się ustawi. String = kolejność receiverów; flood+iso = izolacja.',
    description:
      'UAP/Flik: pull play ma sens, bo D sprintuje 60+ m. String („A to B under, C deep”). Someflow: nie zaczynaj od najtrudniejszego — small dominoes first; zbieranie pulla i centering facing forward ma znaczenie; deep-on-pull jest overused i D wciąż pada ofiarą.',
    howItWorks: [
      'Wywołaj string przed punktem.',
      'Catcher pulla: safe possession → easy advance.',
      'Flood/iso lub transition do stacku po 2–3 podaniach.',
    ],
    playerBehaviors: [
      {
        role: 'Pull catcher',
        behavior: 'Pewny catch; unikaj panic huck; centering z momentum do przodu.',
      },
      {
        role: 'D po pullu',
        behavior:
          'Hangtime + pinning na sideline bywa lepsze niż „max yards out of bounds” bez setu D (Someflow).',
      },
    ],
    matchImpact: [
      {
        label: 'Field position start',
        effect: 'Lepsza pozycja startowa O; mniej stagnacji.',
      },
    ],
    pros: ['Darmowe jardy', 'Buduje flow'],
    cons: ['Overorchestrated deep often scoutingowany'],
    suggestedWhen: ['Każdy receive pull — miej plan'],
    avoidWhen: ['Chaos w składzie — wtedy: catch, center, play'],
    pairsWellWith: ['horizontal_stack', 'split_stack', 'side_stack'],
    conflictsWith: [],
    sources: ['uap', 'flik', 'someflow', 'usau'],
    engineStatus: 'Brak pull-play scriptów w silniku.',
  },
  {
    id: 'fast_break',
    category: 'situational',
    namePl: 'Fast Break / Point-Five',
    nameEn: 'Fast Break',
    summary:
      'Natychmiastowy atak po turnoverze (szczególnie po nieudanym hucku). D jest rozstawiona; O powinno score’ować zanim wrócą.',
    description:
      'Some Flow: post-huck turnover = złoty fast break; Fury/Brute Squad jako przykłady. Point-five = urgency na każdym catchu. Obrona powinna „get back” jak w koszykówce — najpierw lane’y, potem swój człowiek.',
    howItWorks: [
      'Po D: pierwszy zawód z dyskiem szuka natychmiastowego under/deep w otwartą przestrzeń.',
      'Nie resetuj się do pełnego stacku, jeśli masz 2v1 / 3v2.',
    ],
    playerBehaviors: [
      {
        role: 'Nowy O',
        behavior: 'Sprint w przestrzeń; zero huddle’u; catch and go.',
      },
      {
        role: 'Nowa D',
        behavior: 'Beat man downfield; clog lanes; potem matchup.',
      },
    ],
    matchImpact: [
      {
        label: 'Break chance po turnie',
        effect: 'Znacząco rośnie przy wytrenowanym fast break.',
      },
    ],
    pros: ['Wysoki EV', 'Karze deep-obsessed O'],
    cons: ['Turnover w fast break boli podwójnie'],
    suggestedWhen: ['Po każdym turnoverze — default mindset'],
    avoidWhen: [],
    pairsWellWith: ['motion_offense', 'person'],
    conflictsWith: [],
    sources: ['someflow', 'flik'],
    engineStatus: 'Częściowo naturalne w silniku po turnoverze; brak osobnego taktycznego przełącznika.',
  },

  // ─── PRINCIPLES ────────────────────────────────────────────
  {
    id: 'principle_space',
    category: 'principles',
    namePl: 'Zasada przestrzeni',
    nameEn: 'Space principle',
    summary:
      'Każda formacja istnieje, by tworzyć i atakować przestrzeń. Clear jest równie ważny jak cut. Glasgow: ucz zasad przestrzeni zanim uczysz „stacku”.',
    description:
      'Catch the Spirit / Glasgow / Flik: standing in the way zabija offense. Cut → get disc or clear. Dump nie jest porażką — to reset pozycji. Someflow: nie trać więcej jardów na dumpie niż musisz; bierz wszystkie darmowe jardy przy catchu.',
    howItWorks: [
      'Twórz lane’y ustawieniem.',
      'Atakuj je timingiem.',
      'Oddawaj je clear’em.',
    ],
    playerBehaviors: [
      {
        role: 'Wszyscy',
        behavior: 'Field sense > memorized pattern. Patrz, gdzie jest miejsce, nie tylko „czyja kolej”.',
      },
    ],
    matchImpact: [
      {
        label: 'Uniwersalne',
        effect: 'Podstawa wszystkich stacków i zone O.',
      },
    ],
    pros: ['Transferuje się między formacjami'],
    cons: [],
    suggestedWhen: ['Zawsze'],
    avoidWhen: [],
    pairsWellWith: [],
    conflictsWith: [],
    sources: ['glasgow', 'cts', 'flik', 'someflow'],
    engineStatus: 'Zasada projektowa dla AI cutters — do wzmocnienia w cutterBrain.',
  },
  {
    id: 'principle_team_defense',
    category: 'principles',
    namePl: 'Obrona drużynowa',
    nameEn: 'Team defense principle',
    summary:
      'Jedyny cel D: czy O scored, czy turn. Nie dostajesz punktów za „bycie blisko swojego”. Help, switch, bracket, talk.',
    description:
      'Some Flow philosophies: threat equalization — każda opcja O ma być równie zła; last-back zawsze; stunt and recover; mów więcej; nie overcommit do zatrzymywania ruchu do tyłu.',
    howItWorks: [
      'Broń zagrożeń, nie ego matchupu.',
      'Proactive > reactive.',
      'Intensywność i smarts nie są tradeoffem.',
    ],
    playerBehaviors: [
      {
        role: 'Obrońca',
        behavior:
          'Mikro-poach w lane, recover gdy thrower patrzy na Twojego; komunikuj „I’m here”.',
      },
    ],
    matchImpact: [
      {
        label: 'Wide-open scores oddane',
        effect: 'Spadają przy help D — nawet jeśli „Twój” człowiek dostaje shorta.',
      },
    ],
    pros: ['Uniwersalne na każdym schemacie'],
    cons: [],
    suggestedWhen: ['Zawsze'],
    avoidWhen: [],
    pairsWellWith: ['person', 'zone_cup', 'all_person', 'clam'],
    conflictsWith: [],
    sources: ['someflow', 'flik', 'usau'],
    engineStatus: 'Częściowo w defenderBrain; help/switch do rozbudowy.',
  },
  {
    id: 'principle_turnovers',
    category: 'principles',
    namePl: 'Skąd biorą się turnovery',
    nameEn: 'Where turnovers come from',
    summary:
      'Analiza Some Flow (Fury 2024): accuracy (~63% czynników), decision-making (help deep, sideline), drops. System pomaga, ale skill bottlenecks dominują.',
    description:
      'Wnioski strategiczne: trzymaj dysk z dala od sideline gdy możesz; czytaj help na deep; floaty huck > outthrown receiver; catching under fatigue. Systemowo: fast break, point-five, box-out dump, nie tylko „bardziej stackowy stack”.',
    howItWorks: [
      'Trenuj accuracy w kontekście gry, nie tylko partner throwing.',
      'Scout help defenders przed huckiem.',
      'Unikaj high-difficulty + sideline combo.',
    ],
    playerBehaviors: [
      {
        role: 'Thrower',
        behavior: 'Highest-% throw available; sideline zwiększa difficulty każdego rzutu.',
      },
    ],
    matchImpact: [
      {
        label: 'Hold %',
        effect: 'Rośnie bardziej z skill development niż z kosmetyką formacji.',
      },
    ],
    pros: ['Kieruje priorytety treningu i scouting'],
    cons: [],
    suggestedWhen: ['Analiza meczów / plan treningowy'],
    avoidWhen: [],
    pairsWellWith: [],
    conflictsWith: [],
    sources: ['someflow'],
    engineStatus: 'Informacyjne — wpływa na przyszłe wagi decyzji throwerBrain.',
  },
]

/** Sugerowane zestawy (attack + defense + force) do UI. */
export const TACTICS_SUGGESTED_LOADOUTS = [
  {
    id: 'balanced_default',
    namePl: 'Zbalansowany default',
    nameEn: 'Balanced default',
    attack: 'vertical_stack',
    defense: 'person',
    force: 'force_forehand',
    why: 'Uniwersalny zestaw na większość meczów: kontrolowany atak, czytelna D, standardowy force.',
  },
  {
    id: 'aggressive_vertical',
    namePl: 'Agresywny ho-stack',
    nameEn: 'Aggressive ho-stack',
    attack: 'horizontal_stack',
    defense: 'person',
    force: 'force_backhand',
    why: 'Więcej deep looks i tempa; force BH utrudnia szybkie flick breaki rywala.',
  },
  {
    id: 'wind_zone',
    namePl: 'Wiatr — zone cup',
    nameEn: 'Wind — zone cup',
    attack: 'zone_offense',
    defense: 'zone_cup',
    force: 'force_middle',
    why: 'W trudnych warunkach wymuś dużo podań na rywalu; sam graj around/through, ostrożnie z overhead.',
  },
  {
    id: 'iso_mismatch',
    namePl: 'Mismatch iso',
    nameEn: 'Mismatch iso',
    attack: 'side_stack',
    defense: 'person',
    force: 'force_forehand',
    why: 'Wystaw dominant cuttera; trzymaj prostą D man-to-man na matchupach.',
  },
  {
    id: 'choppy_ap',
    namePl: 'Choppy AP look',
    nameEn: 'Choppy AP look',
    attack: 'motion_offense',
    defense: 'all_person',
    force: 'force_middle',
    why: 'Gdy chcesz zabić flow rywala dynamicznym markiem; własny atak oparty o tempo, nie sztywny stack.',
  },
  {
    id: 'anti_vert_clam',
    namePl: 'Anti-vert clam',
    nameEn: 'Anti-vert clam',
    attack: 'horizontal_stack',
    defense: 'clam',
    force: 'force_forehand',
    why: 'Przeciw drużynom living-and-dying by vertical stack — zwłaszcza po ich timeoutie.',
  },
]

/**
 * Mapowanie: co już jest w silniku gry vs tylko w kompendium.
 * Pomaga UI pokazać badge „w grze” / „opis”.
 */
export function getEngineCoverage() {
  return {
    attackStyles: [
      'vertical_stack',
      'horizontal_stack',
      'split_stack',
      'side_stack',
      'motion_offense',
      'hex_offense',
      'zone_offense',
    ],
    defenseStyles: ['person', 'zone_cup', 'zone_wall', 'clam', 'all_person'],
    forceSides: [
      'force_forehand',
      'force_backhand',
      'force_middle',
      'force_sideline',
      'force_straight',
    ],
  }
}

function mergeGuideEntry(entry) {
  if (!entry) return null
  const en = TACTICS_GUIDE_EN[entry.id]
  return en ? { ...entry, ...en } : entry
}

export function getEntriesByCategory(categoryId) {
  return TACTICS_GUIDE_ENTRIES.filter((e) => e.category === categoryId).map(mergeGuideEntry)
}

export function getEntryById(id) {
  return mergeGuideEntry(TACTICS_GUIDE_ENTRIES.find((e) => e.id === id) ?? null)
}

export function getLoadouts() {
  return TACTICS_SUGGESTED_LOADOUTS.map((l) => {
    const en = TACTICS_LOADOUTS_EN[l.id]
    const merged = en ? { ...l, ...en } : l
    return {
      ...merged,
      attackEntry: getEntryById(l.attack),
      defenseEntry: getEntryById(l.defense),
      forceEntry: getEntryById(l.force),
    }
  })
}
