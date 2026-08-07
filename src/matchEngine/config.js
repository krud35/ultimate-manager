/**
 * Centralna konfiguracja silnika meczowego — zmieniaj tu parametry bez grzebania w logice.
 */
export const MATCH_CONFIG = {
  /** Mecz wygrywa drużyna, która pierwsza zdobędzie tyle punktów */
  pointsToWin: 15,

  /** Rozmiar składu na boisko (7v7 w UFA) */
  lineupSize: 7,

  /**
   * Pozycja dysku wzdłuż boiska (metry X na boisku 0–100): 0 = własna linia końcowa, linia punktowa rywala ≈ 82 m.
   * Po turnoverze pozycja jest odwracana (100 - pos).
   */
  field: {
    min: 0,
    max: 100,
    /** Szerokość boiska (m) — tylko wizualizacja 2D; logika gry wzdłuż osi 0–max. */
    widthM: 37,
    endzoneM: 18,
    lengthM: 100,
    /** Ile jednostek pola przesuwa udany rzut */
    advanceOnSuccess: 12,
    /** Po pullu atak zaczyna głębiej (symulacja odbioru) */
    positionAfterPull: 8,
  },

  /** Losowość w teście umiejętności */
  skillCheck: {
    /** ± spread dla ataku (rzut) */
    throwRandomSpread: 22,
    /** Obrona: los tylko ujemny, zakres [-spread, 0] — wyższa skuteczność rzutów */
    defenseRandomSpread: 22,
    /** Waga statów w teście rzutu (reszta to los) */
    throwWeights: { throwing: 0.55, vision: 0.25, catching: 0.1, speed: 0.1 },
    defenseWeights: { defense: 0.55, speed: 0.3, catching: 0.15 },
  },

  /** Limit rzutów w jednym punkcie (zabezpieczenie przed nieskończoną pętlą) */
  maxThrowsPerPoint: 120,

  /** Kto wykonuje pull na pierwszym punkcie meczu: 'home' | 'away' */
  firstPointPullTeam: 'home',
}
