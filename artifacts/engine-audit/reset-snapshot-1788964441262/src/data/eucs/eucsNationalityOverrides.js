/**
 * Ręczne korekty narodowości dla konkretnych realnych zawodników, gdzie domyślne
 * założenie "narodowość = kraj klubu" (patrz eucsLeagueTeams.js) jest błędne —
 * użytkownik rozpoznał tych graczy i podał ich prawdziwą narodowość (2026-08-21).
 * Klucz to `teamId::firstName::lastName`, dokładnie jak w eucsRealRosters.json.
 *
 * Wartości nie muszą występować w eucsCountryStrength.js (EUCS_COUNTRIES) — ta lista
 * służy tylko do skautingu młodzieżowego, narodowość zawodnika to dowolny kraj.
 */
export const EUCS_NATIONALITY_OVERRIDES = {
  'eucs-mooncatchers::Gaël::Ancellin': 'France',
  'eucs-bfd-lafotta::Kais::Mathè': 'France',
  'eucs-mooncatchers::David::Barzasi': 'Italy',
  'eucs-mooncatchers::Toms::Abeltins': 'Latvia',
  'eucs-mooncatchers::Arvids Zanis::Karklins': 'Latvia',
  'eucs-mooncatchers::Alexander::Spahlholz': 'Austria',
  'eucs-catchup::Staš::Miklič': 'Czech Republic',
  'eucs-bfd-lafotta::Jan::Nowak': 'Czech Republic',
  'eucs-wall-city::Ondrej::Rydlo': 'Czech Republic',
  'eucs-grut::Štěpán::Kříž': 'Czech Republic',
  'eucs-wall-city::Andrés Eduardo::Prado Brand': 'Venezuela',
  'eucs-wall-city::Jonas::Vileikis Lopez': 'Venezuela',
  'eucs-wall-city::Krzysztof::Zając': 'Poland',
  'eucs-bristol::Andrzej::Zaród': 'Poland',
  'eucs-grut::Steven::Chang': 'United States',
  'eucs-grut::Anton::Orme': 'United States',
  'eucs-grut::Michael::McAdam': 'United States',
  'eucs-gentle::Orion::Cable': 'United States',
  'eucs-wall-city::Ferdia::Rogers': 'Ireland',
  'eucs-grut::Filip::Molnar': 'Slovakia',
}

export function eucsNationalityOverride(teamId, firstName, lastName) {
  return EUCS_NATIONALITY_OVERRIDES[`${teamId}::${firstName}::${lastName}`] ?? null
}
