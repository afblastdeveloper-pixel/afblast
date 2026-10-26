import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isStaffPath } from '../utils/portal'

export const INTRO_STORAGE_KEY = 'afblast.introSeen.v1'
const ALLOWED_INITIAL_PATHS = ['/', '/login', '/register']

/**
 * Memeriksa apakah video animasi intro memenuhi seluruh syarat tampil:
 * 1. Area = member (bukan staff)
 * 2. Rute saat masuk adalah '/', '/login', atau '/register'
 * 3. Belum pernah dilihat (key afblast.introSeen.v1 tidak ada di localStorage)
 * 4. prefers-reduced-motion: reduce tidak aktif
 * 5. Parameter ?intro=1 memaksa tampil; ?intro=0 melewati
 * 6. Save-data / slow network tidak aktif
 */
export function checkShouldPlayIntro() {
  if (typeof window === 'undefined') return false

  // 1. Parameter URL override (?intro=0 lewati, ?intro=1 paksa tampil)
  try {
    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.get('intro') === '0') return false
    if (searchParams.get('intro') === '1') return true
  } catch {}

  // 2. Area check: JANGAN PERNAH tampil di area staf
  const pathname = (window.location.pathname || '/').toLowerCase()
  if (isStaffPath(pathname)) {
    return false
  }

  // 3. Rute saat masuk: HANYA '/', '/login', atau '/register'
  // Jangan tampil di /reset-password, /forgot-password, /app/*, atau deep link lainnya
  const isAllowedPath = ALLOWED_INITIAL_PATHS.includes(pathname)
  if (!isAllowedPath) {
    return false
  }

  // 4. Belum pernah dilihat: key localStorage afblast.introSeen.v1 tidak ada
  // Bungkus semua akses storage dengan try/catch; jika storage tidak tersedia anggap sudah dilihat
  try {
    const seen = localStorage.getItem(INTRO_STORAGE_KEY)
    if (seen === '1') {
      return false
    }
  } catch (err) {
    // Storage tidak tersedia (private browsing / disabled), anggap sudah dilihat agar tidak looping
    return false
  }

  // 5. prefers-reduced-motion: reduce tidak aktif
  // Jika aktif, lewati intro dan tandai sudah dilihat
  try {
    if (
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      try {
        localStorage.setItem(INTRO_STORAGE_KEY, '1')
      } catch {}
      return false
    }
  } catch {}

  // 6. Hormati navigator.connection.saveData / slow-2g / 2g
  try {
    if (navigator.connection) {
      if (
        navigator.connection.saveData ||
        navigator.connection.effectiveType === 'slow-2g' ||
        navigator.connection.effectiveType === '2g'
      ) {
        try {
          localStorage.setItem(INTRO_STORAGE_KEY, '1')
        } catch {}
        return false
      }
    }
  } catch {}

  return true
}

/**
 * Hook useIntro
 * Mengelola state tampil, fading, penyelesaian, dan navigasi redirect pasca-intro.
 */
export function useIntro() {
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuth()

  // Tangkap path awal saat mount
  const initialPathRef = useRef(
    typeof window !== 'undefined'
      ? (window.location.pathname || '/').toLowerCase()
      : '/'
  )

  const [shouldShow, setShouldShow] = useState(() => checkShouldPlayIntro())
  const [isFading, setIsFading] = useState(false)
  const isFinishingRef = useRef(false)

  // Tandai sudah dilihat di localStorage
  const markAsSeen = useCallback(() => {
    try {
      localStorage.setItem(INTRO_STORAGE_KEY, '1')
    } catch {}
  }, [])

  // Selesaikan intro dengan transisi fade-out dan arahkan ke halaman yang sesuai
  const finishIntro = useCallback(() => {
    if (isFinishingRef.current) return
    isFinishingRef.current = true

    markAsSeen()

    // Cek reduced motion untuk durasi fade
    let fadeDuration = 400
    try {
      if (
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        fadeDuration = 0
      }
    } catch {}

    if (fadeDuration > 0) {
      setIsFading(true)
    }

    setTimeout(() => {
      setShouldShow(false)
      setIsFading(false)

      // Navigasi setelah intro:
      // - Jika member sudah login -> /app
      // - Jika belum login:
      //   - Jika masuk dari /register -> tetap di /register
      //   - Jika masuk dari / atau /login -> ke /login
      if (isAuthenticated && user?.role === 'user') {
        navigate('/app', { replace: true })
      } else if (initialPathRef.current === '/register') {
        navigate('/register', { replace: true })
      } else {
        navigate('/login', { replace: true })
      }
    }, fadeDuration)
  }, [markAsSeen, isAuthenticated, user, navigate])

  return {
    shouldShow,
    isFading,
    finishIntro,
    initialPath: initialPathRef.current,
  }
}

export default useIntro
