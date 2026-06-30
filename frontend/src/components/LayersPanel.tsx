import { useState } from 'react'
import { useDashboard } from '../state'
import { statsForDate } from '../data/adapter'
import type { LayerToggles } from '../map/layers'

const LAYER_META: { key: keyof LayerToggles; label: string; chip: string }[] = [
  { key: 'hcho', label: 'HCHO column', chip: 'linear-gradient(90deg,#36166e,#a02d80,#e0466e,#fb8b24,#fff6e2)' },
  { key: 'hotspots', label: 'Hotspots (z>1.5σ)', chip: 'radial-gradient(circle at 50% 50%,#fff4de,#ffce9c 55%,rgba(255,168,104,0.15))' },
  { key: 'fires', label: 'Active fires', chip: 'linear-gradient(90deg,#7a1f0e,#ff7a18,#ffd24a)' },
  { key: 'wind', label: 'Wind transport', chip: 'linear-gradient(90deg,#4d6fa8,#9bb0cf)' },
  { key: 'igp', label: 'IGP region', chip: 'linear-gradient(90deg,#caa15a,#ffe6c0)' },
]

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <label className="sw" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={on} onChange={onToggle} />
      <span className="track" /><span className="knob" />
    </label>
  )
}

export default function LayersPanel() {
  const { data, date, layers, setLayers, opacities, setOpacities } = useDashboard()
  const [open, setOpen] = useState(true)
  const s = statsForDate(data, date)
  const counts: Partial<Record<keyof LayerToggles, number>> = { fires: s.fires, hotspots: s.hotspotCells }

  if (!open) {
    return (
      <button className="panel-fab" onClick={() => setOpen(true)} title="Layers" aria-label="Show layers">
        ☰
      </button>
    )
  }
  return (
    <div className="dock-panel layers-dock">
      <div className="dock-head">
        <span className="t-section">Layers</span>
        <button className="dock-collapse" onClick={() => setOpen(false)} aria-label="Collapse">‹</button>
      </div>
      <div className="rack">
        {LAYER_META.map(({ key, label, chip }) => {
          const on = layers[key]
          const count = counts[key]
          return (
            <div key={key} className={`lrow ${on ? '' : 'off'}`}>
              <span className="chip" style={{ background: chip }} />
              <span className="lname">{label}</span>
              <span className="lcount">{on && count != null ? count.toLocaleString() : ''}</span>
              <Switch on={on} onToggle={() => setLayers({ ...layers, [key]: !on })} />
              <div className="opwrap">
                <input
                  type="range" min={0.1} max={1} step={0.05} value={opacities[key]}
                  onChange={(e) => setOpacities({ ...opacities, [key]: Number(e.target.value) })}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="legend">
        <div className="t-section" style={{ marginBottom: 7 }}>HCHO · ×10¹⁵ molec/cm²</div>
        <div className="bar" />
        <div className="ax">
          <span>{data.hcho.vmin}</span>
          <span>{((data.hcho.vmin + data.hcho.vmax) / 2).toFixed(1)}</span>
          <span>{data.hcho.vmax}+</span>
        </div>
      </div>
    </div>
  )
}
