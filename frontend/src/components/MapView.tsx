import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapboxOverlay } from '@deck.gl/mapbox'
import type { Dashboard } from '../data/adapter'
import { nearestDate, inspectPoint } from '../data/adapter'
import { buildBaseLayers, buildFireLayers, type LayerToggles, type Opacities } from '../map/layers'
import { loadUVTexture, type TextureData } from '../map/windTexture'
import type { PinState } from '../state'

export type { LayerToggles as Layers }

const CARTO_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

interface Props {
  data: Dashboard
  time: number
  layers: LayerToggles
  opacities: Opacities
  pin: PinState | null
  onInspect: (p: PinState) => void
}

export default function MapView({ data, time, layers, opacities, pin, onInspect }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const rafRef = useRef<number | null>(null)
  // live values the animation loop reads without re-subscribing
  const live = useRef({ time, layers, opacities })
  const windTex = useRef<TextureData | null>(null)
  const windDate = useRef<string | null>(null)
  const windVer = useRef(0)
  live.current = { time, layers, opacities }
  // pin is lifted to shared state; we only reproject the dot on map move
  const [, setTick] = useState(0)

  // init once
  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: ref.current,
      style: CARTO_DARK,
      center: [82, 22],
      zoom: 4,
      pitch: 0,                 // top-down: wind flows ACROSS, no meteor tilt
      bearing: 0,
      maxPitch: 0,              // lock flat
      minZoom: 3.2,
      maxZoom: 9,
      // loose enough to see Kashmir (37°N), Kanyakumari (8°N) & Andaman, but
      // can't wander off into the rest of the world
      maxBounds: [[57, -1], [105, 41]],
      dragRotate: false,
      attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.touchZoomRotate.disableRotation()
    mapRef.current = map

    map.on('style.load', () => {
      // frame all of India (Kashmir → Kanyakumari + Andaman); bottom padding
      // leaves room for the timeline overlay
      map.fitBounds([[67.8, 6.4], [97.6, 37.4]], {
        // leave room for the floating dock panels + bottom timeline
        padding: { top: 40, bottom: 110, left: 250, right: 270 }, duration: 0,
      })
      // hide ALL basemap labels — we render a curated Indian-city set on top,
      // and the inverse mask darkens foreign context anyway. Keep admin lines.
      for (const l of map.getStyle().layers ?? []) {
        if (l.type === 'symbol') {
          try { map.setLayoutProperty(l.id, 'visibility', 'none') } catch {}
        }
      }

      const overlay = new MapboxOverlay({
        interleaved: true,
        layers: [],
        getTooltip: ({ object, layer }: any) => {
          if (!object || !layer) return null
          if (layer.id === 'fires') {
            return {
              html: `<b>Active fire</b><br/>FRP ${object.frp.toFixed(0)} MW<br/>${object.date}`,
              style: tooltipStyle,
            }
          }
          if (layer.id === 'hotspots') {
            const p = object.properties
            return {
              html: `<b>Gi* hotspot${p.region && p.region !== 'Other' ? ' · ' + p.region : ''}</b>`
                + `<br/>HCHO ${p.hcho} ·10¹⁵<br/>Gi* z = ${p.gi_z ?? p.z}σ (95%)`,
              style: tooltipStyle,
            }
          }
          if (layer.id === 'region-labels') {
            return {
              html: `<b>${object.name}</b><br/>Fire–HCHO R = ${object.pearson_r}`
                + `<br/>${object.peak_hotspot_cells} hotspot cells · rank #${object.rank}`,
              style: tooltipStyle,
            }
          }
          return null
        },
      })
      map.addControl(overlay)
      overlayRef.current = overlay

      // click-to-inspect: sample HCHO / fire / wind / hotspot at the point
      map.on('click', (e) => {
        const date = nearestDate(data, live.current.time)
        const insp = inspectPoint(data, date, e.lngLat.lng, e.lngLat.lat)
        onInspect({ lng: e.lngLat.lng, lat: e.lngLat.lat, insp })
      })
      map.on('move', () => setTick((t) => t + 1))
      map.getCanvas().style.cursor = 'crosshair'

      startLoop()
    })

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      overlayRef.current?.finalize?.()
      map.remove()
      mapRef.current = null
      overlayRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // load the wind texture for the active date when it changes
  useEffect(() => {
    const date = nearestDate(data, time)
    if (date === windDate.current) return
    windDate.current = date
    loadUVTexture(data.wind.textureUrl(date)).then((t) => { windTex.current = t; windVer.current++ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time])

  // continuous render loop. Heavy base layers (heatmap aggregation, particle
  // field) are rebuilt only when time / toggles / wind texture actually change;
  // the cheap fire layers rebuild every frame to drive the pulse.
  function startLoop() {
    let pulse = 0
    let lastKey = ''
    let base: any[] = []
    const tick = () => {
      const o = overlayRef.current
      if (o) {
        pulse += 0.07
        const { time: t, layers: lay, opacities: op } = live.current
        const key = `${t.toFixed(3)}|${lay.hcho}${lay.hotspots}${lay.wind}${lay.igp}|`
          + `${op.hcho}${op.hotspots}${op.wind}${op.igp}|${windVer.current}`
        if (key !== lastKey) {
          base = buildBaseLayers({ data, time: t, toggles: lay, opacities: op, windTex: windTex.current })
          lastKey = key
        }
        o.setProps({
          layers: [...base, ...buildFireLayers({ data, time: t, toggles: lay, opacities: op, pulse })],
        })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const pt = pin && mapRef.current ? mapRef.current.project([pin.lng, pin.lat]) : null
  return (
    <>
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
      {pt && <div className="pin-dot" style={{ left: pt.x, top: pt.y }} />}
    </>
  )
}

const tooltipStyle = {
  background: 'rgba(10,14,26,0.92)',
  border: '1px solid rgba(120,140,180,0.3)',
  borderRadius: '8px',
  color: '#e6ecf5',
  fontSize: '12px',
  padding: '7px 10px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
} as Record<string, string>
