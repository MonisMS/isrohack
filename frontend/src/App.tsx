import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { loadDashboard, type Dashboard } from './data/adapter'
import type { LayerToggles, Opacities } from './map/layers'
import { DashboardCtx, type PinState } from './state'
import MapView from './components/MapView'
import TopBar from './components/TopBar'
import ExploreView from './views/ExploreView'
import AnalysisView from './views/AnalysisView'
import MethodologyView from './views/MethodologyView'

export default function App() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [layers, setLayers] = useState<LayerToggles>({
    hcho: true, fires: true, hotspots: true, wind: true, igp: true,
  })
  const [opacities, setOpacities] = useState<Opacities>({
    hcho: 1, fires: 1, hotspots: 1, wind: 1, igp: 1,
  })
  const [pin, setPin] = useState<PinState | null>(null)
  const raf = useRef<number | null>(null)
  const location = useLocation()

  useEffect(() => {
    loadDashboard()
      .then((d) => {
        setData(d)
        const pi = d.dates.indexOf(d.meta.peak_date)
        setTime(pi >= 0 ? pi : 0)
      })
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    if (!playing || !data) return
    const n = data.dates.length
    const step = () => {
      setTime((t) => (t + 0.012) % (n - 1 + 0.0001))
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [playing, data])

  if (error) {
    return (
      <div className="loading">
        <div>
          <h2>Backend not reachable</h2>
          <p className="muted">{error}</p>
          <p className="muted">Start it: <code>cd backend &amp;&amp; uvicorn main:app --reload</code></p>
        </div>
      </div>
    )
  }
  if (!data) return <div className="loading"><div className="spinner" />Loading satellite data…</div>

  const date = data.dates[Math.round(time)]
  const isExplore = location.pathname === '/explore' || location.pathname === '/'

  return (
    <DashboardCtx.Provider value={{
      data, date, time, setTime, playing, setPlaying,
      layers, setLayers, opacities, setOpacities, pin, setPin,
    }}>
      <div className="shell">
        <TopBar />
        <div className="shell-body">
          {/* map is mounted ONCE and persists across routes; analysis/methodology
              pages render opaque on top of it */}
          <div className="map-layer">
            <MapView
              data={data} time={time} layers={layers} opacities={opacities}
              pin={pin} onInspect={setPin}
            />
          </div>
          {/* Explore controls overlay only when on the map route */}
          {isExplore && <ExploreView />}
          <Routes>
            <Route path="/" element={<Navigate to="/explore" replace />} />
            <Route path="/explore" element={null} />
            <Route path="/analysis" element={<AnalysisView />} />
            <Route path="/methodology" element={<MethodologyView />} />
            <Route path="*" element={<Navigate to="/explore" replace />} />
          </Routes>
        </div>
      </div>
    </DashboardCtx.Provider>
  )
}
