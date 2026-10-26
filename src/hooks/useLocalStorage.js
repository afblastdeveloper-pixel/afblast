import { useState, useEffect } from 'react'

/**
 * Hook untuk menyimpan dan membaca nilai dari localStorage.
 * @param {string} key  - Kunci localStorage
 * @param {*} defaultValue - Nilai default jika key tidak ditemukan
 */
export function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key)
      return stored !== null ? JSON.parse(stored) : defaultValue
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Gagal simpan (misal private mode) – abaikan
    }
  }, [key, value])

  return [value, setValue]
}
