import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { UiLangProvider } from './ui/UiLangContext.jsx'
import { UiThemeProvider } from './ui/UiThemeContext.jsx'
import { AppErrorBoundary } from './ui/AppErrorBoundary.jsx'

const el = document.getElementById('root')

createRoot(el).render(
  <StrictMode>
    <AppErrorBoundary>
      <UiThemeProvider>
        <UiLangProvider>
          <App />
        </UiLangProvider>
      </UiThemeProvider>
    </AppErrorBoundary>
  </StrictMode>,
)

// Po udanym starcie React — wyłącz boot overlay z index.html (jeśli był).
window.__UFA_APP_BOOTED__ = true
document.getElementById('ufa-boot-error')?.remove()
