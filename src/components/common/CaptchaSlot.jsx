import { isStaffPath } from '../../utils/portal'

/**
 * Komponen CaptchaSlot (Cloudflare Turnstile / Bot Verification)
 * Mendukung dua site key berbeda (Member dan Staf) yang dipilih berdasarkan area path,
 * berjalan pada satu domain yang sama.
 * Flag env VITE_CAPTCHA_ENABLED=false (default).
 */
export default function CaptchaSlot() {
  const isEnabled = import.meta.env.VITE_CAPTCHA_ENABLED === 'true'
  const isStaff = isStaffPath(typeof window !== 'undefined' ? window.location.pathname : '')

  const memberSiteKey =
    import.meta.env.VITE_TURNSTILE_SITE_KEY_MEMBER ||
    import.meta.env.VITE_TURNSTILE_MEMBER_SITE_KEY ||
    ''

  const staffSiteKey =
    import.meta.env.VITE_TURNSTILE_SITE_KEY_STAFF ||
    import.meta.env.VITE_TURNSTILE_STAFF_SITE_KEY ||
    ''

  const siteKey = isStaff ? staffSiteKey : memberSiteKey

  if (!isEnabled) {
    return null
  }

  return (
    <div
      id="captcha-slot"
      data-sitekey={siteKey}
      data-area={isStaff ? 'staff' : 'member'}
      className="my-3 p-3 bg-gray-50/80 dark:bg-slate-800/80 border border-dashed border-gray-200 dark:border-slate-700 rounded-2xl text-xs text-gray-500 dark:text-gray-400 text-center flex items-center justify-center gap-2"
    >
      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
      <span>Verifikasi Keamanan Aktif ({isStaff ? 'Portal Staf' : 'Member'})</span>
    </div>
  )
}
