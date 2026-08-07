/**
 * Statystyki sezonu regularnego UFA 2025 — Seattle Cascades & Boston Glory.
 * Pozostałe drużyny ligi: src/data/ufa2025LeagueRosters.js (ten sam katalog UFA Stats).
 * Źródło: https://watchufa.com/stats/player-stats?year=2025
 */
import { buildTeamRoster } from './playerStatsFromUfa.js'

const SEATTLE_RAW = [
  { jersey: 76, firstName: 'Ryan', lastName: 'Allenson', gls: 1, ast: 0, blk: 1, ha: 0, throwingYards: 3, receivingYards: 32 },
  { jersey: 2, firstName: 'Lukas', lastName: 'Ambrose', gls: 15, ast: 4, blk: 13, ha: 11, throwingYards: 433, receivingYards: 1074 },
  { jersey: 4, firstName: 'Conor', lastName: 'Belfield', gls: 20, ast: 23, blk: 7, ha: 13, throwingYards: 1038, receivingYards: 2571 },
  { jersey: 63, firstName: 'Louie', lastName: 'Bertoncin', gls: 3, ast: 5, blk: 3, ha: 1, throwingYards: 337, receivingYards: 295 },
  { jersey: 6, firstName: 'Aage', lastName: 'Bonnell', gls: 2, ast: 1, blk: 1, ha: 0, throwingYards: 190, receivingYards: 125 },
  { jersey: 18, firstName: 'Jack', lastName: 'Brown', gls: 6, ast: 12, blk: 10, ha: 6, throwingYards: 539, receivingYards: 1110 },
  { jersey: 3, firstName: 'Langley', lastName: 'Fitzpatrick', gls: 10, ast: 4, blk: 14, ha: 4, throwingYards: 23, receivingYards: 609 },
  { jersey: 10, firstName: 'Christian', lastName: 'Foster', gls: 3, ast: 21, blk: 1, ha: 15, throwingYards: 2755, receivingYards: 525 },
  { jersey: 1, firstName: 'Tony', lastName: 'Goss', gls: 15, ast: 13, blk: 4, ha: 21, throwingYards: 1454, receivingYards: 753 },
  { jersey: 74, firstName: 'Axel', lastName: 'Hartzog', gls: 0, ast: 1, blk: 0, ha: 1, throwingYards: 83, receivingYards: 34 },
  { jersey: 55, firstName: 'Dominic', lastName: 'Jacobs', gls: 6, ast: 1, blk: 8, ha: 0, throwingYards: 63, receivingYards: 214 },
  { jersey: 13, firstName: 'Alex', lastName: 'Kabat', gls: 1, ast: 0, blk: 0, ha: 1, throwingYards: 31, receivingYards: 69 },
  { jersey: 39, firstName: 'Phillip', lastName: 'Korolog', gls: 3, ast: 4, blk: 2, ha: 3, throwingYards: 103, receivingYards: 204 },
  { jersey: 67, firstName: 'Spencer', lastName: 'Land', gls: 0, ast: 1, blk: 2, ha: 2, throwingYards: 87, receivingYards: 41 },
  { jersey: 96, firstName: 'Asher', lastName: 'Lantz', gls: 5, ast: 4, blk: 8, ha: 5, throwingYards: 191, receivingYards: 611 },
  { jersey: 50, firstName: 'Gavin', lastName: 'Leahy', gls: 1, ast: 4, blk: 0, ha: 1, throwingYards: 87, receivingYards: 85 },
  { jersey: 17, firstName: 'Tommy', lastName: 'Li', gls: 19, ast: 14, blk: 4, ha: 23, throwingYards: 1072, receivingYards: 1786 },
  { jersey: 88, firstName: 'Brandon', lastName: 'Li', gls: 7, ast: 5, blk: 5, ha: 2, throwingYards: 204, receivingYards: 843 },
  { jersey: 34, firstName: 'Ryan', lastName: 'Liao', gls: 5, ast: 1, blk: 1, ha: 4, throwingYards: 166, receivingYards: 254 },
  { jersey: 25, firstName: 'Tommy', lastName: 'Lin', gls: 6, ast: 5, blk: 2, ha: 6, throwingYards: 420, receivingYards: 323 },
  { jersey: 9, firstName: 'Spencer', lastName: 'Lofink', gls: 0, ast: 1, blk: 0, ha: 4, throwingYards: 198, receivingYards: 3 },
  { jersey: 12, firstName: 'Garrett', lastName: 'Martin', gls: 37, ast: 31, blk: 4, ha: 23, throwingYards: 1473, receivingYards: 2733 },
  { jersey: 73, firstName: 'Will', lastName: 'McDonald', gls: 2, ast: 0, blk: 0, ha: 0, throwingYards: -4, receivingYards: 90 },
  { jersey: 72, firstName: 'Steve', lastName: 'Mogielski', gls: 0, ast: 1, blk: 0, ha: 0, throwingYards: 36, receivingYards: 11 },
  { jersey: 19, firstName: 'Derek', lastName: 'Mourad', gls: 10, ast: 17, blk: 2, ha: 23, throwingYards: 2918, receivingYards: 491 },
  { jersey: 11, firstName: 'Marc', lastName: 'Munoz', gls: 8, ast: 25, blk: 7, ha: 21, throwingYards: 2070, receivingYards: 1042 },
  { jersey: 36, firstName: 'Gabe', lastName: 'Nobis', gls: 0, ast: 1, blk: 0, ha: 1, throwingYards: 180, receivingYards: 23 },
  { jersey: 15, firstName: 'Mikey', lastName: "O'Brien", gls: 1, ast: 7, blk: 7, ha: 4, throwingYards: 275, receivingYards: 578 },
  { jersey: 29, firstName: 'Axel', lastName: 'Olson', gls: 0, ast: 3, blk: 2, ha: 3, throwingYards: 279, receivingYards: -1 },
  { jersey: 0, firstName: 'Zeppelin', lastName: 'Raunig', gls: 31, ast: 11, blk: 6, ha: 9, throwingYards: 563, receivingYards: 2660 },
  { jersey: 16, firstName: 'Chris', lastName: 'Roach', gls: 1, ast: 2, blk: 0, ha: 0, throwingYards: 134, receivingYards: 143 },
  { jersey: 23, firstName: 'Emmet', lastName: 'Shipway', gls: 16, ast: 2, blk: 4, ha: 3, throwingYards: 842, receivingYards: 486 },
  { jersey: 33, firstName: 'Ian', lastName: 'Sweeney', gls: 2, ast: 6, blk: 3, ha: 4, throwingYards: 802, receivingYards: 196 },
  { jersey: 70, firstName: 'Aaron', lastName: 'Wolf', gls: 8, ast: 16, blk: 5, ha: 13, throwingYards: 1496, receivingYards: 379 },
  { jersey: 7, firstName: 'Bailey', lastName: 'Wu', gls: 1, ast: 1, blk: 0, ha: 0, throwingYards: 22, receivingYards: 63 },
]

const BOSTON_RAW = [
  { jersey: 37, firstName: 'Gavin', lastName: 'Abrahamsson', gls: 2, ast: 0, blk: 0, ha: 0, throwingYards: -6, receivingYards: 20 },
  { jersey: 7, firstName: 'Turner', lastName: 'Allen', gls: 5, ast: 6, blk: 6, ha: 5, throwingYards: 167, receivingYards: 643 },
  { jersey: 87, firstName: 'Jeff', lastName: 'Babbitt', gls: 28, ast: 0, blk: 24, ha: 12, throwingYards: 284, receivingYards: 1046 },
  { jersey: 16, firstName: 'Henry', lastName: 'Babcock', gls: 4, ast: 8, blk: 2, ha: 7, throwingYards: 779, receivingYards: 244 },
  { jersey: 31, firstName: 'Noah', lastName: 'Backer', gls: 4, ast: 2, blk: 3, ha: 3, throwingYards: 402, receivingYards: 28 },
  { jersey: 10, firstName: 'Peter', lastName: 'Boerth', gls: 9, ast: 1, blk: 2, ha: 7, throwingYards: 170, receivingYards: 413 },
  { jersey: 27, firstName: 'Orion', lastName: 'Cable', gls: 40, ast: 17, blk: 5, ha: 12, throwingYards: 678, receivingYards: 3630 },
  { jersey: 2, firstName: 'Simon', lastName: 'Carapella', gls: 16, ast: 20, blk: 7, ha: 20, throwingYards: 1063, receivingYards: 1805 },
  { jersey: 19, firstName: 'Jac', lastName: 'Carreiro', gls: 0, ast: 0, blk: 1, ha: 1, throwingYards: 19, receivingYards: 121 },
  { jersey: 44, firstName: 'Tyler', lastName: 'Chan', gls: 6, ast: 9, blk: 11, ha: 8, throwingYards: 793, receivingYards: 694 },
  { jersey: 8, firstName: 'Topher', lastName: 'Davis', gls: 6, ast: 9, blk: 3, ha: 13, throwingYards: 815, receivingYards: 772 },
  { jersey: 22, firstName: 'Cole', lastName: 'Davis-Brand', gls: 1, ast: 4, blk: 0, ha: 3, throwingYards: 202, receivingYards: 52 },
  { jersey: 33, firstName: 'Tobe', lastName: 'Decraene', gls: 41, ast: 50, blk: 4, ha: 25, throwingYards: 2230, receivingYards: 4272 },
  { jersey: 26, firstName: 'Nathanial', lastName: 'Dick', gls: 14, ast: 11, blk: 1, ha: 23, throwingYards: 2605, receivingYards: 857 },
  { jersey: 12, firstName: 'Ryan', lastName: 'Dinger', gls: 9, ast: 14, blk: 2, ha: 25, throwingYards: 2807, receivingYards: 646 },
  { jersey: 18, firstName: 'Ethan', lastName: 'Fortin', gls: 2, ast: 3, blk: 5, ha: 4, throwingYards: 690, receivingYards: 105 },
  { jersey: 17, firstName: 'Oscar', lastName: 'Graff', gls: 3, ast: 4, blk: 1, ha: 6, throwingYards: 324, receivingYards: 210 },
  { jersey: 34, firstName: 'Gustav', lastName: 'Haflin', gls: 2, ast: 1, blk: 3, ha: 1, throwingYards: 10, receivingYards: 269 },
  { jersey: 48, firstName: 'Benjamin', lastName: 'Horrisberger', gls: 2, ast: 3, blk: 6, ha: 1, throwingYards: 23, receivingYards: 358 },
  { jersey: 60, firstName: 'Tannor', lastName: 'Johnson-Go', gls: 12, ast: 25, blk: 14, ha: 11, throwingYards: 1113, receivingYards: 1244 },
  { jersey: 4, firstName: 'Wyatt', lastName: 'Kellman', gls: 5, ast: 10, blk: 2, ha: 5, throwingYards: 358, receivingYards: 534 },
  { jersey: 50, firstName: 'Declan', lastName: 'Kervick', gls: 0, ast: 1, blk: 0, ha: 1, throwingYards: 28, receivingYards: 36 },
  { jersey: 15, firstName: 'Peter', lastName: 'Kotz', gls: 0, ast: 0, blk: 0, ha: 1, throwingYards: 13, receivingYards: 54 },
  { jersey: 14, firstName: 'Rocco', lastName: 'Linehan', gls: 0, ast: 1, blk: 2, ha: 0, throwingYards: 115, receivingYards: 47 },
  { jersey: 13, firstName: 'Brendan', lastName: 'McCann', gls: 8, ast: 6, blk: 4, ha: 8, throwingYards: 1235, receivingYards: 75 },
  { jersey: 6, firstName: 'Cole', lastName: 'Moore', gls: 3, ast: 4, blk: 3, ha: 0, throwingYards: 42, receivingYards: 105 },
  { jersey: 80, firstName: 'Sebastian', lastName: 'Rossi', gls: 5, ast: 5, blk: 7, ha: 1, throwingYards: 254, receivingYards: 462 },
  { jersey: 3, firstName: 'Benjamin', lastName: 'Sadok', gls: 14, ast: 30, blk: 4, ha: 21, throwingYards: 4216, receivingYards: 1133 },
  { jersey: 23, firstName: 'Zach', lastName: 'Singer', gls: 1, ast: 0, blk: 1, ha: 0, throwingYards: -7, receivingYards: 51 },
  { jersey: 5, firstName: 'Calvin', lastName: 'Stoughton', gls: 20, ast: 28, blk: 7, ha: 27, throwingYards: 1811, receivingYards: 2112 },
  { jersey: 99, firstName: 'Jason', lastName: 'Tapper', gls: 1, ast: 2, blk: 2, ha: 0, throwingYards: 83, receivingYards: 280 },
  { jersey: 1, firstName: 'Ivan', lastName: 'Tran', gls: 5, ast: 2, blk: 8, ha: 5, throwingYards: 135, receivingYards: 350 },
  { jersey: 0, firstName: 'Luke', lastName: 'Webb', gls: 2, ast: 0, blk: 4, ha: 2, throwingYards: 60, receivingYards: 91 },
  { jersey: 70, firstName: 'Emmett', lastName: 'Young', gls: 0, ast: 0, blk: 2, ha: 4, throwingYards: 162, receivingYards: 111 },
  { jersey: 32, firstName: 'Albert', lastName: 'Yuan', gls: 15, ast: 9, blk: 4, ha: 12, throwingYards: 532, receivingYards: 1282 },
]

export const seattleCascades2025 = buildTeamRoster(
  'Seattle Cascades',
  SEATTLE_RAW,
  1001,
)

export const bostonGlory2025 = buildTeamRoster('Boston Glory', BOSTON_RAW, 2001)

/** Pełna pula zawodników obu drużyn (widok Skład). */
export const mockPlayers = [...seattleCascades2025, ...bostonGlory2025]

export function getPlayerFullName(player) {
  return `${player.firstName} ${player.lastName}`
}

export { getOverallRating } from '../models/playerStats.js'
