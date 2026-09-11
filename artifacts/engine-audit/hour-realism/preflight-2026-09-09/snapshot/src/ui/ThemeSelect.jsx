import { useUiTheme } from './UiThemeContext.jsx'

export default function ThemeSelect({ lang = 'pl', compact = false }) {
  const { theme, setTheme } = useUiTheme()
  const copy = lang === 'en'
    ? { label: 'Theme', system: 'System', light: 'Light', dark: 'Dark' }
    : { label: 'Motyw', system: 'Systemowy', light: 'Jasny', dark: 'Ciemny' }

  return (
    <label className={`ufa-theme-select ${compact ? 'ufa-theme-select--compact' : ''}`}>
      <span>{copy.label}</span>
      <select
        value={theme}
        onChange={(event) => setTheme(event.target.value)}
        aria-label={copy.label}
      >
        <option value="system">{copy.system}</option>
        <option value="light">{copy.light}</option>
        <option value="dark">{copy.dark}</option>
      </select>
    </label>
  )
}

