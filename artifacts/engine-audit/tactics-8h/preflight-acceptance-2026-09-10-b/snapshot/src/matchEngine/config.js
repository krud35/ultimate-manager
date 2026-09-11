/**
 * Centralna konfiguracja silnika meczowego — zmieniaj tu parametry bez grzebania w logice.
 */
export const MATCH_CONFIG = {
  /** Mecz wygrywa drużyna, która pierwsza zdobędzie tyle punktów */
  pointsToWin: 15,

  /** Rozmiar składu na boisko: club ultimate 7v7. */
  lineupSize: 7,

  /**
   * Pozycja dysku wzdłuż boiska (metry X na boisku 0–100): 0 = własna linia końcowa, linia punktowa rywala ≈ 82 m.
   * Po turnoverze pozycja jest odwracana (100 - pos).
   */
  field: {
    min: 0,
    max: 100,
    /** Szerokość boiska (m), także dla geometrii ruchu i podań. */
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

  /**
   * Kalibracja fastMode do pełnego silnika pozycyjnego.
   *
   * PO CO. Liga kariery (leagueEngine.js) liczy KAŻDY mecz sezonu w fastMode, a gracz
   * ogląda swój mecz na pełnym silniku. Pomiar na 368 176 kontrolowanych meczach
   * (16 drużyn-klonów OVR 78–93, wszystko poza OVR zamrożone — harness w tmp-ovr/)
   * pokazał, że te dwa silniki wyceniały skład zupełnie inaczej:
   *
   *   bramek marży na 1 pkt OVR   fastMode   pełny silnik
   *   bezwietrznie                    0.23           0.33
   *   wiatr 14 mph                    0.23           0.40
   *   wiatr 20 mph                    0.24           0.56
   *
   * Czyli w tabeli sezonu dobry skład był wart ~2× mniej niż w meczu oglądanym, a wiatr
   * nie robił w lidze praktycznie nic (26.38 pkt/mecz przy 0 mph wobec 26.27 przy 25 mph,
   * podczas gdy pełny silnik schodził z 26.52 na 25.34 i zbijał completion z 93% na 81%).
   *
   * Skalowanie skilla i wiatru jest tu osobne od pełnego silnika, bo `resolveThrow`
   * jest wspólne dla obu — wartości neutralne (1 / 0) zostawiają pełny silnik nietknięty.
   * Wartości wyznaczone sweepem: tmp-ovr/sweep.mjs.
   */
  fastCalibration: {
    /** Mnożnik `skillAdjustment` — nachylenie zależności celność(skill rzucającego). */
    skillMult: 1,
    /** Kalibracja do celu 90–93%: artifacts/engine-audit/COMPLETION-90-93.md. */
    gapOffset: -6,
    /** Długość szybkich podań w modelu zastępczym, skalibrowana do śladu pełnego silnika. */
    advanceMult: 0.8,
    /** Mnożnik modyfikatorów wiatru (celność, spread, drop, advance). */
    windMult: 1,
    /**
     * Jak mocno kara za wiatr zależy od umiejętności rzucającego (0 = wcale).
     *
     * Bez tego sam windMult NIE DZIAŁA jako kalibracja: pomiar pokazał, że przy
     * windMult 6 fastMode trafiał w completion (81.1→85.5 wobec 81.09→86.17) i w straty
     * (15.73→12.51 wobec 15.21→10.70) pełnego silnika, ale nachylenie OVR wynosiło 0.225
     * zamiast 0.56 — i SPADAŁO przy mocniejszym wietrze (0.338 → 0.225 → 0.157 dla
     * windMult 3/6/10). Powód: kara za wiatr jest prawie niezależna od skilla
     * (w gałęzi upwind czynnik `1.15 − skillShield*0.4` daje elicie zaledwie ~8% ulgi),
     * więc dokładanie wiatru dosypuje wszystkim po równo i ŚCIŚNIE drużyny zamiast je
     * rozdzielić.
     *
     * Pełny silnik dostaje tę zależność za darmo z geometrii lotu: niecelny rzut przy
     * wietrze znosi z toru i odbiorca fizycznie nie dobiega, a dobry rzucający to
     * kompensuje. fastMode nie ma toru lotu, więc modelujemy ten efekt wprost —
     * przechylamy karę wokół `windSkillRef`, zostawiając jej średnią bez zmian.
     */
    windSkillSlope: 0,
    /**
     * Punkt odniesienia przechyłu — środek realnego pasma OVR w lidze
     * (playerStats.js: OVR_BULK_MIN 72 … OVR_ELITE_MAX 94). Rzucający powyżej dostaje
     * ulgę, poniżej — dokładkę. Ta sama konwencja co compressSkill (50) i
     * compressSeparationSkill (60), tylko dla innej wielkości.
     */
    windSkillRef: 83,
    /** Udział składowej bocznej w próbkowanym wektorze rzutu (fastMode nie ma geometrii). */
    lateralFrac: 0.45,
  },

  /** Kto wykonuje pull na pierwszym punkcie meczu: 'home' | 'away' */
  firstPointPullTeam: 'home',
}
