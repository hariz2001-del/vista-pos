import { useCallback, useEffect, useState } from 'react'

type WakeLockHandle = {
  isActive: boolean
  isSupported: boolean
  error: string | null
  toggle: () => Promise<void>
}

export function useDisplayMode(): WakeLockHandle {
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null)
  const [isActive, setIsActive] = useState(Boolean(document.fullscreenElement))
  const [error, setError] = useState<string | null>(null)
  const isSupported = 'wakeLock' in navigator && 'requestFullscreen' in document.documentElement

  useEffect(() => {
    const handleFullscreenChange = () => setIsActive(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(
    () => () => {
      void wakeLock?.release()
    },
    [wakeLock],
  )

  const toggle = useCallback(async () => {
    setError(null)
    if (!isSupported) {
      setError('Full screen mode is not supported on this device.')
      return
    }

    try {
      if (document.fullscreenElement) {
        await wakeLock?.release()
        setWakeLock(null)
        await document.exitFullscreen()
        return
      }

      await document.documentElement.requestFullscreen()
      const lock = await navigator.wakeLock.request('screen')
      setWakeLock(lock)
      setIsActive(true)
    } catch {
      setError('Could not enable full screen or the screen wake lock.')
    }
  }, [isSupported, wakeLock])

  return { isActive, isSupported, error, toggle }
}
