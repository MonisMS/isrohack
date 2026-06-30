// The HCHO ramp (matches the map's HeatmapLayer): used for chart points,
// the legend bar, and swatches so the whole UI shares one palette.
const STOPS: [number, [number, number, number]][] = [
  [0.0, [22, 16, 54]],
  [0.2, [54, 22, 110]],
  [0.42, [140, 32, 124]],
  [0.62, [224, 70, 90]],
  [0.82, [251, 152, 42]],
  [1.0, [255, 246, 226]],
]

export function rampColor(t: number): string {
  const x = Math.max(0, Math.min(1, t))
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1]
      const [t1, c1] = STOPS[i]
      const f = (x - t0) / (t1 - t0 || 1)
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * f)
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * f)
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * f)
      return `rgb(${r},${g},${b})`
    }
  }
  return 'rgb(255,246,226)'
}

// CSS gradient string for the legend bar.
export const RAMP_CSS =
  'linear-gradient(90deg,#0c0a1f,#36166e,#a02d80,#e0466e,#fb8b24,#fff6e2)'

export const ACCENT = '#F5A524'
