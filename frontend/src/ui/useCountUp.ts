import { useEffect, useRef, useState } from 'react'

// Smoothly tween a displayed number toward `value` whenever it changes, so
// stats count/roll as the timeline scrubs instead of snapping.
export function useCountUp(value: number, duration = 450): number {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const start = useRef(0)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    from.current = shown
    start.current = 0
    const ease = (t: number) => 1 - Math.pow(1 - t, 3)
    const step = (ts: number) => {
      if (!start.current) start.current = ts
      const p = Math.min((ts - start.current) / duration, 1)
      setShown(from.current + (value - from.current) * ease(p))
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return shown
}
