import { STAMINA_CONFIG } from '../matchEngine/stamina.js'

export function staminaBarColor(stamina) {
  if (stamina > STAMINA_CONFIG.tiredThreshold) return 'bg-emerald-500'
  if (stamina >= STAMINA_CONFIG.exhaustedThreshold) return 'bg-amber-400'
  return 'bg-red-500'
}

export default function StaminaBar({ stamina, compact = false, className = '' }) {
  const value = Math.max(0, Math.min(100, Math.round(stamina ?? STAMINA_CONFIG.default)))
  const color = staminaBarColor(value)

  return (
    <div
      className={`flex items-center gap-2 ${compact ? 'min-w-[72px]' : 'min-w-[88px]'} ${className}`}
      title={`Stamina ${value}%`}
    >
      <div
        className={`flex-1 rounded-full bg-ufa-border overflow-hidden ${compact ? 'h-1' : 'h-1.5'}`}
      >
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span
        className={`tabular-nums text-ufa-muted text-right ${compact ? 'text-[10px] w-7' : 'text-xs w-8'}`}
      >
        {value}
      </span>
    </div>
  )
}

export function getStaminaForPlayer(staminaMap, playerId) {
  if (!staminaMap) return STAMINA_CONFIG.default
  return staminaMap[playerId] ?? STAMINA_CONFIG.default
}
