import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

// Same behavior as khayrul.com: follow the system until the visitor picks a
// theme, then remember the pick. index.html applies it before first paint.
const KEY = 'patchlane.theme'
const COLORS = { light: '#f8fafc', dark: '#0a0e17' }

function savedTheme() {
  try {
    const value = window.localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function systemTheme() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function initialTheme() {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
  return savedTheme() ?? systemTheme()
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(initialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', COLORS[theme]))
  }, [theme])

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!query) return undefined
    const onChange = (e) => {
      if (!savedTheme()) setTheme(e.matches ? 'dark' : 'light')
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try {
      window.localStorage.setItem(KEY, next)
    } catch {
      /* storage unavailable: the choice lasts until the page reloads */
    }
  }

  const dark = theme === 'dark'
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
    >
      {dark ? <Moon className="size-[17px]" aria-hidden="true" /> : <Sun className="size-[17px]" aria-hidden="true" />}
    </button>
  )
}
