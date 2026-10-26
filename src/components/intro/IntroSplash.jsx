import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { SkipForward, VolumeX, Volume2, Loader2 } from 'lucide-react'

/**
 * IntroSplash Component
 * Menampilkan video pembuka AF Blast layar penuh satu kali saat pertama kali membuka website.
 * Memenuhi semua standar aksesibilitas, ketahanan jaringan, kontrol mute/skip, dan RTL.
 *
 * @param {Object} props
 * @param {Function} props.onFinish - Callback saat video selesai atau dilewati
 * @param {boolean} [props.isFading=false] - State transisi fade-out (400ms)
 */
export default function IntroSplash({ onFinish, isFading = false }) {
  const { t } = useTranslation()

  const videoRef = useRef(null)
  const skipBtnRef = useRef(null)
  const isFinishedRef = useRef(false)

  const [isMuted, setIsMuted] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)

  // Selesaikan intro (panggil callback sekali saja)
  const handleFinish = useCallback(() => {
    if (isFinishedRef.current) return
    isFinishedRef.current = true

    // Bersihkan elemen video untuk melepaskan memori dan audio
    if (videoRef.current) {
      try {
        videoRef.current.pause()
        videoRef.current.removeAttribute('src')
        videoRef.current.load()
      } catch {}
    }

    if (onFinish) {
      onFinish()
    }
  }, [onFinish])

  // 1. Kunci scroll body saat intro tampil, pulihkan setelah unmount
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Fokus awal pada tombol Lewati
    if (skipBtnRef.current) {
      skipBtnRef.current.focus()
    }

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  // 2. Keyboard listener: tombol Escape untuk melewati intro
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleFinish()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleFinish])

  // 3. Tab visibility listener: jeda saat tab disembunyikan, lanjutkan saat terlihat
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!videoRef.current || isFinishedRef.current) return
      if (document.hidden) {
        try {
          videoRef.current.pause()
        } catch {}
      } else {
        videoRef.current.play().catch(() => {
          // Abaikan jika autoplay dicegah browser saat resume
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // 4. Resilience Watchdog: Jika dalam 4 detik video tidak mulai memutar, lewati secara halus
  useEffect(() => {
    const watchdogTimer = setTimeout(() => {
      if (!isPlaying && !isFinishedRef.current) {
        console.warn('[IntroSplash] Autoplay/playing timeout 4s reached, skipping intro.')
        handleFinish()
      }
    }, 4000)

    return () => clearTimeout(watchdogTimer)
  }, [isPlaying, handleFinish])

  // 5. Inisialisasi video.play() secara terprogram untuk menangkap penolakan browser
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const playPromise = video.play()
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          // Playback dimulai
        })
        .catch((err) => {
          console.warn('[IntroSplash] Autoplay was prevented by browser policy:', err.message)
          // Jika play ditolak, lewati intro agar user tidak terjebak di layar hitam
          handleFinish()
        })
    }
  }, [handleFinish])

  // Video Event Handlers
  const handlePlaying = () => {
    setIsPlaying(true)
  }

  const handleTimeUpdate = () => {
    if (!videoRef.current) return
    const current = videoRef.current.currentTime || 0
    const duration = videoRef.current.duration || 1
    const pct = Math.min(100, Math.max(0, (current / duration) * 100))
    setProgress(pct)
  }

  const handleEnded = () => {
    handleFinish()
  }

  // Jika terjadi error atau stalled lebih dari 4 detik
  const handleError = () => {
    console.warn('[IntroSplash] Video playback error encountered, skipping intro.')
    handleFinish()
  }

  const handleStalled = () => {
    setTimeout(() => {
      if (videoRef.current && videoRef.current.readyState < 3 && !isFinishedRef.current) {
        console.warn('[IntroSplash] Video stalled for too long, skipping intro.')
        handleFinish()
      }
    }, 4000)
  }

  // Toggle Mute / Unmute
  const toggleMute = () => {
    if (videoRef.current) {
      const nextMuted = !isMuted
      videoRef.current.muted = nextMuted
      setIsMuted(nextMuted)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('intro.dialogLabel', 'Video pembuka AF Blast')}
      className={`fixed inset-0 z-[99999] bg-[#000] flex items-center justify-center select-none overflow-hidden transition-opacity duration-400 ease-out ${
        isFading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Video Layar Penuh */}
      <video
        ref={videoRef}
        src="/intro/afblast-intro.mp4"
        muted={isMuted}
        playsInline
        autoPlay
        preload="auto"
        disablePictureInPicture
        controlsList="nodownload nofullscreen noremoteplayback"
        className="w-full h-full object-contain pointer-events-none"
        onPlaying={handlePlaying}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleError}
        onStalled={handleStalled}
        onWaiting={() => setIsPlaying(false)}
      />

      {/* Indikator Pemuatan Tipis sebelum video mulai */}
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <Loader2 className="w-7 h-7 text-white/30 animate-spin" />
        </div>
      )}

      {/* Kontrol Kanan Atas (Logical Property: end-4 top-4 agar kompatibel RTL Arab) */}
      <div className="absolute top-4 end-4 z-20">
        <button
          ref={skipBtnRef}
          type="button"
          onClick={handleFinish}
          className="min-w-[44px] min-h-[44px] px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white backdrop-blur-md border border-white/20 transition-all flex items-center gap-1.5 text-xs sm:text-sm font-medium shadow-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-black"
          aria-label={t('intro.skip', 'Lewati')}
          title={t('intro.skip', 'Lewati')}
        >
          <SkipForward className="w-4 h-4 rtl:rotate-180" />
          <span>{t('intro.skip', 'Lewati')}</span>
        </button>
      </div>

      {/* Kontrol Suara Kiri Bawah (Logical Property: start-4 bottom-4 agar kompatibel RTL Arab) */}
      <div className="absolute bottom-4 start-4 z-20">
        <button
          type="button"
          onClick={toggleMute}
          className="min-w-[44px] min-h-[44px] px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white backdrop-blur-md border border-white/20 transition-all flex items-center gap-1.5 text-xs font-medium shadow-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-black"
          aria-label={isMuted ? t('intro.unmute', 'Aktifkan suara') : t('intro.mute', 'Matikan suara')}
          title={isMuted ? t('intro.unmute', 'Aktifkan suara') : t('intro.mute', 'Matikan suara')}
        >
          {isMuted ? (
            <>
              <VolumeX className="w-4 h-4" />
              <span className="hidden sm:inline">{t('intro.unmute', 'Aktifkan suara')}</span>
            </>
          ) : (
            <>
              <Volume2 className="w-4 h-4" />
              <span className="hidden sm:inline">{t('intro.mute', 'Matikan suara')}</span>
            </>
          )}
        </button>
      </div>

      {/* Batang Progres Tipis (2px, warna primary) di tepi bawah */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/10 z-10 pointer-events-none">
        <div
          className="h-full bg-primary transition-[width] duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
