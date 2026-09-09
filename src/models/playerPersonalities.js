// Hidden generation profiles; no direct gameplay modifiers or UI labels.
export const PLAYER_PERSONALITIES = {
  "captain": [
    "leader",
    "team_first",
    "determined"
  ],
  "example_leader": [
    "professional",
    "workhorse",
    "leader"
  ],
  "motivator": [
    "charismatic",
    "leader",
    "confident"
  ],
  "quiet_pillar": [
    "modest",
    "team_first",
    "composed"
  ],
  "club_patriot": [
    "loyal",
    "homebody",
    "team_first"
  ],
  "teammate": [
    "team_first",
    "charismatic",
    "content"
  ],
  "professional": [
    "professional",
    "workhorse",
    "coachable"
  ],
  "learner": [
    "curious",
    "ambitious",
    "coachable"
  ],
  "analyst": [
    "film_junkie",
    "curious",
    "overthinker"
  ],
  "pragmatist": [
    "adaptive",
    "coachable",
    "composed"
  ],
  "perfectionist": [
    "perfectionist",
    "workhorse",
    "fragile_ego"
  ],
  "independent": [
    "professional",
    "loner",
    "confident"
  ],
  "competitor": [
    "competitor",
    "determined",
    "ambitious"
  ],
  "fighter": [
    "relentless",
    "determined",
    "workhorse"
  ],
  "clutch_performer": [
    "clutch",
    "composed",
    "confident"
  ],
  "prove_yourself": [
    "chip_on_shoulder",
    "competitor",
    "ambitious"
  ],
  "aspirant": [
    "ambitious",
    "impatient",
    "curious"
  ],
  "hothead": [
    "hot_headed",
    "competitor",
    "impatient"
  ],
  "stoic": [
    "stoic",
    "composed",
    "content"
  ],
  "relaxed_teammate": [
    "relaxed",
    "team_first",
    "content"
  ],
  "sensitive_worker": [
    "workhorse",
    "fragile_ego",
    "anxious"
  ],
  "introvert": [
    "shy",
    "overthinker",
    "nervous"
  ],
  "individualist": [
    "loner",
    "stubborn",
    "uncoachable"
  ],
  "discouraged_idealist": [
    "perfectionist",
    "fragile_ego",
    "quitter"
  ],
  "careerist": [
    "ambitious",
    "restless",
    "mercenary"
  ],
  "financial_pragmatist": [
    "mercenary",
    "greedy",
    "professional"
  ],
  "spotlight": [
    "showman",
    "charismatic",
    "confident"
  ],
  "recognition_seeker": [
    "selfish",
    "showman",
    "diva"
  ],
  "socialite": [
    "party_animal",
    "relaxed",
    "charismatic"
  ],
  "comfortable_routine": [
    "complacent",
    "lazy",
    "homebody"
  ]
}

export const PERSONALITY_SOFT_PAIRS = [
 ['charismatic', 'shy'], ['showman', 'anxious'], ['professional', 'diva'],
 ['professional', 'party_animal'], ['content', 'ambitious'], ['composed', 'nervous'],
 ['stoic', 'hot_headed'], ['confident', 'nervous'], ['workhorse', 'complacent'],
]
const EFFECT_GROUPS = [
 ['composed', 'stoic', 'clutch', 'confident'],
 ['workhorse', 'professional', 'coachable', 'film_junkie'],
 ['nervous', 'anxious', 'fragile_ego'],
 ['ambitious', 'impatient', 'diva'],
 ['loyal', 'homebody'], ['greedy', 'mercenary'],
]
export function personalityTraitWeight(id, preferred, selected) {
 let weight = preferred.includes(id) ? 4 : 1
 if (PERSONALITY_SOFT_PAIRS.some(pair => pair.includes(id) && pair.some(t => t !== id && [...preferred, ...selected].includes(t)))) weight = 0.25
 if (EFFECT_GROUPS.some(group => group.includes(id) && selected.some(t => group.includes(t)))) weight *= 0.35
 return weight
}
