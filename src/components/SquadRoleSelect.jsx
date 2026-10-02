import { SQUAD_ROLES } from '../career/streamlinedStories.js'
export default function SquadRoleSelect({ value, onChange, lang = 'pl' }) {
  const en = lang === 'en'
  return <label className="block text-sm">{en ? 'Expected role' : 'Oczekiwana rola'} <select className="rounded border border-ufa-border bg-ufa-bg p-2" value={value} onChange={e => onChange(e.target.value)}>{Object.entries(SQUAD_ROLES).map(([id, role]) => <option key={id} value={id}>{role[en ? 'en' : 'pl']}</option>)}</select><p className="mt-1 text-xs text-ufa-muted">{en ? 'Reserve: no guaranteed minutes. Rotation: 25% of points. Starter: 50%. Reviewed after six available matches; injuries are excluded. In negotiations, rotation lowers the wage target by 2%, starter by 5%.' : 'Rezerwowy: bez gwarancji minut. Rotacja: 25% punktów. Podstawowy: 50%. Ocena po sześciu dostępnych meczach; urazy nie liczą się do oceny. W negocjacjach rotacja obniża oczekiwania płacowe o 2%, podstawowy o 5%.'}</p></label>
}
