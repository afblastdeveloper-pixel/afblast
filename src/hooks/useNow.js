import { useState, useEffect } from 'react'

/**
 * Hook yang mengembalikan waktu saat ini dan diperbarui setiap 1 detik.
 * Menggunakan setInterval dengan cleanup agar tidak memory leak.
 * @returns {Date} now - Objek Date terkini
 */
export function useNow() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date())
    }, 1000)

    // Cleanup saat komponen unmount
    return () => clearInterval(interval)
  }, [])

  return now
}
