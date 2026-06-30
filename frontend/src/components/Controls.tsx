import { fireSeries } from '../data/adapter'
import { ACCENT } from '../ui/ramp'
import { useDashboard } from '../state'

export default function Controls() {
  const { data, time, setTime: rawSetTime, playing, setPlaying } = useDashboard()
  const setTime = (t: number) => { setPlaying(false); rawSetTime(t) }
  const dates = data.dates
  const series = fireSeries(data)
  const n = dates.length
  const idx = Math.round(time)
  const peakIdx = dates.indexOf(data.meta.peak_date)

  // build the fire-intensity area sparkline (normalised), drawn behind the track
  const max = Math.max(...series.map((s) => s.fires), 1)
  const X = (i: number) => (n === 1 ? 0 : (i / (n - 1)) * 100)
  const Y = (v: number) => 38 - (v / max) * 32 - 2
  const pts = series.map((s, i) => `${X(i)},${Y(s.fires)}`).join(' ')
  const area = `M0,40 L${pts} L100,40 Z`

  return (
    <div className="tl">
      <button className="tl-play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : '▶'}
      </button>

      <div className="tl-track">
        <div className="tl-spark">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none">
            <defs>
              <linearGradient id="fillg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
              </linearGradient>
            </defs>
            {/* peak-week highlight band */}
            {peakIdx >= 0 && (
              <rect
                x={X(peakIdx) - 50 / (n - 1)} y="0" width={100 / (n - 1)} height="40"
                fill="rgba(245,165,36,0.12)"
              />
            )}
            <path d={area} fill="url(#fillg)" />
            <polyline points={pts} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            {/* filled progress under the thumb */}
            <circle cx={X(time)} cy={Y(series[idx]?.fires ?? 0)} r="2.5" fill={ACCENT} vectorEffect="non-scaling-stroke" />
          </svg>
          <input
            className="tl-range" type="range" min={0} max={n - 1} step={0.001} value={time}
            onChange={(e) => setTime(Number(e.target.value))}
          />
        </div>
        <div className="tl-ticks">
          {dates.map((d, i) => (
            <span key={d} className={i === idx ? 'on' : ''} onClick={() => setTime(i)}>{d.slice(5)}</span>
          ))}
        </div>
      </div>

      <div className="tl-date">
        <small>{idx === peakIdx ? 'peak week' : 'week of'}</small>
        {dates[idx]}
      </div>
    </div>
  )
}
