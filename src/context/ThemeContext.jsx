import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'

const STORAGE_KEY = 'afblast.theme'

const ThemeContext = createContext({
  theme: 'system', // 'light' | 'dark' | 'system'
  resolvedTheme: 'light', // 'light' | 'dark'
  isDark: false,
  setTheme: () => {},
})

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'system'
    } catch {
      return 'system'
    }
  })

  // Detect system preference
  const [systemIsDark, setSystemIsDark] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  // Listen to system theme changes
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => setSystemIsDark(e.matches)

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handler)
      return () => mediaQuery.removeListener(handler)
    }
  }, [])

  const resolvedTheme = useMemo(() => {
    if (theme === 'dark') return 'dark'
    if (theme === 'light') return 'light'
    return systemIsDark ? 'dark' : 'light'
  }, [theme, systemIsDark])

  const isDark = resolvedTheme === 'dark'

  // Apply to DOM & meta
  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
      root.style.colorScheme = 'dark'
    } else {
      root.classList.remove('dark')
      root.style.colorScheme = 'light'
    }

    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.setAttribute('content', isDark ? '#0B1220' : '#F4F7FC')
    }
  }, [isDark])

  const setTheme = useCallback((newTheme) => {
    setThemeState(newTheme)
    try {
      localStorage.setItem(STORAGE_KEY, newTheme)
    } catch {}
  }, [])

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      isDark,
      setTheme,
    }),
    [theme, resolvedTheme, isDark, setTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

export default ThemeContext
