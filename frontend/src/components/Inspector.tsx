import { useDashboard } from '../state'
import { statsForDate } from '../data/adapter'

export default function Inspector() {
  const { data, date, pin, setPin } = useDashboard()

  if (!pin) {
    // idle: current-conditions summary + a hint to click
    const s = statsForDate(data, date)
    const top = [...data.regions].sort((a, b) => a.rank - b.rank)[0]
    return (
      <div className="dock-panel inspector idle">
        <div className="t-section">This week · {date}</div>
        <div className="insp-grid">
          <div><span>Fires</span><b className="tnum">{s.fires.toLocaleString()}</b></div>
          <div><span>Hotspot cells</span><b className="tnum">{s.hotspotCells}</b></div>
          <div><span>Max HCHO</span><b className="tnum">{s.maxHcho.toFixed(1)}</b></div>
          <div><span>Top source</span><b>{top?.short}</b></div>
        </div>
        <div className="insp-hint">◎ Click anywhere on the map to inspect a location.</div>
      </div>
    )
  }

  const { insp } = pin
  return (
    <div className="dock-panel inspector">
      <div className="dock-head">
        <span className="insp-region">{insp.region ?? 'Outside source regions'}</span>
        <button className="dock-collapse" onClick={() => setPin(null)} aria-label="Close">×</button>
      </div>
      <div className="insp-coord mono">{insp.lat.toFixed(2)}°N, {insp.lng.toFixed(2)}°E</div>
      <div className="insp-rows">
        <div><span>HCHO column</span><b>{insp.hcho != null ? `${insp.hcho} ×10¹⁵` : '—'}</b></div>
        <div><span>Nearest fire</span><b>{insp.fire ? `${insp.fire.frp} MW · ${insp.fire.km} km` : '—'}</b></div>
        <div><span>Wind</span><b>{insp.wind ? `${insp.wind.speed} m/s → ${insp.wind.dirText}` : '—'}</b></div>
      </div>
      <div className={`pin-badge ${insp.inHotspot ? 'hot' : ''}`}>
        {insp.inHotspot ? '● inside Gi* hotspot' : '○ not a hotspot'}
      </div>
    </div>
  )
}
