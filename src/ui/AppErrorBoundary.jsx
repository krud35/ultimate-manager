import { Component } from 'react'
import { readUiLang, UI_LANG } from './locale'

/**
 * Pokazuje błąd renderu zamiast pustego ekranu (np. po HMR / złym imporcie).
 */
export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[AppErrorBoundary]', error, info?.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const message = error?.message || String(error)
    const stack = error?.stack || ''
    const lang = readUiLang()
    const title =
      lang === UI_LANG.EN ? 'The app failed to start' : 'Aplikacja nie wystartowała'
    const hint =
      lang === UI_LANG.EN
        ? 'Error in a module or render — fix the code and refresh the page (F5).'
        : 'Błąd w module lub renderze — napraw kod i odśwież stronę (F5).'

    return (
      <div
        style={{
          minHeight: '100vh',
          margin: 0,
          padding: '24px',
          boxSizing: 'border-box',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          background: '#0f1419',
          color: '#f2f4f7',
        }}
      >
        <h1 style={{ margin: '0 0 8px', fontSize: 18, color: '#f87171' }}>{title}</h1>
        <p style={{ margin: '0 0 16px', color: '#94a3b8', fontSize: 13 }}>{hint}</p>
        <pre
          style={{
            margin: 0,
            padding: 16,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: '#1a222c',
            border: '1px solid #334155',
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.45,
            color: '#fecaca',
          }}
        >
          {message}
          {stack ? `\n\n${stack}` : ''}
        </pre>
      </div>
    )
  }
}
