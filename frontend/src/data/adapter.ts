/**
 * DATA ADAPTER — the single swap point between the dashboard and its sources.
 * ==========================================================================
 * Everything the UI renders flows through `loadDashboard()`. Right now it pulls
 * the precomputed MOCK exports from the FastAPI backend. To go live, swap the
 * fetches here for real sources — TROPOMI HCHO (NetCDF), FIRMS fires (CSV),
 * ERA5 winds (GRIB→PNG) — keeping the returned `Dashboard` shape identical.
 * No component imports the raw API; they only see the normalized shapes below.
 */
import type {
  Meta, HchoGrid, Fires, Hotspots, Correlation, Wind, IndiaGeo,
} from '../types'

const BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json() as Promise<T>
}

// ---- normalized shapes the UI consumes -----------------------------------
export interface WindField {
  bounds: [number, number, number, number]   // [w, s, e, n]
  imageUnscale: [number, number]
  dates: string[]
  textureUrl: (date: string) => string
}

export interface Dashboard {
  meta: Meta
  dates: string[]
  hcho: HchoGrid
  fires: Fires
  hotspots: Hotspots               // raw cells (for counts)
  hotspotsGeo: IndiaGeo            // dissolved organic blobs (for the map)
  correlation: Correlation
  wind: WindField
  india: IndiaGeo                  // official outline (J&K + Ladakh)
  states: IndiaGeo                 // state/UT boundaries
  igpRegion: IndiaGeo              // real Indo-Gangetic Plain shape (union of states)
  igp: { name: string; lon: [number, number]; lat: [number, number] }
  regions: RegionInfo[]            // Gi*-detected source regions (IGP/Central/NE)
  windVectors: Wind                // raw per-date u/v vectors (for point inspect)
}

export interface RegionInfo {
  name: string
  short: string
  box: { lon: [number, number]; lat: [number, number] }
  anchor: [number, number]
  detected: boolean
  peak_date: string
  peak_hotspot_cells: number
  mean_hcho_peak: number
  peak_fires: number
  pearson_r: number
  rank: number
}

export async function loadDashboard(): Promise<Dashboard> {
  const [meta, hcho, fires, hotspots, hotspotsGeo, correlation, windMeta, india, states, igpRegion, regionsDoc, windVectors] =
    await Promise.all([
      get<Meta>('/api/meta'),
      get<HchoGrid>('/api/hcho-grid'),
      get<Fires>('/api/fires'),
      get<Hotspots>('/api/hotspots'),
      get<IndiaGeo>('/api/data/hotspots_merged'),
      get<Correlation>('/api/correlation'),
      get<Wind & { bounds: [number, number, number, number]; imageUnscale: [number, number] }>(
        '/exports/wind_meta.json',
      ),
      get<IndiaGeo>('/api/india'),
      get<IndiaGeo>('/api/data/india_states'),
      get<IndiaGeo>('/api/data/igp_region'),
      get<{ regions: RegionInfo[] }>('/api/data/regions'),
      get<Wind>('/api/wind'),
    ])

  return {
    meta,
    dates: meta.dates,
    hcho,
    fires,
    hotspots,
    hotspotsGeo,
    correlation,
    wind: {
      bounds: (windMeta as any).bounds,
      imageUnscale: (windMeta as any).imageUnscale,
      dates: (windMeta as any).dates,
      textureUrl: (date: string) => `${BASE}/exports/wind/${date}.png`,
    },
    india,
    states,
    igpRegion,
    igp: meta.regions.igp,
    regions: regionsDoc.regions,
    windVectors,
  }
}

// ---- per-date selectors (kept here so the swap stays self-contained) ------

// Linearly interpolate the HCHO field between two dates for smooth scrubbing.
export function hchoWeights(d: Dashboard, time: number): number[] {
  const { dates } = d
  const i0 = Math.max(0, Math.min(dates.length - 1, Math.floor(time)))
  const i1 = Math.min(dates.length - 1, i0 + 1)
  const f = time - i0
  const a = d.hcho.values[dates[i0]] ?? []
  const b = d.hcho.values[dates[i1]] ?? []
  return a.map((v, k) => v + (((b[k] ?? v) - v) * f))
}

export function firesForDate(d: Dashboard, date: string) {
  return (d.fires.points[date] ?? []).map((p) => ({
    position: [p[0], p[1]] as [number, number],
    frp: p[2],
    date,
  }))
}

export function hotspotsForDate(d: Dashboard, date: string) {
  return {
    type: 'FeatureCollection',
    features: (d.hotspotsGeo.features as any[]).filter((f) => f.properties.date === date),
  }
}

export function nearestDate(d: Dashboard, time: number): string {
  const i = Math.max(0, Math.min(d.dates.length - 1, Math.round(time)))
  return d.dates[i]
}

export interface DateStats {
  fires: number
  hotspotCells: number
  maxHcho: number
  // signed deltas vs the previous week (0 for the first week)
  dFires: number
  dHotspots: number
  dMaxHcho: number
  isPeak: boolean
}

function rawStats(d: Dashboard, date: string) {
  const vals = d.hcho.values[date] ?? []
  return {
    fires: d.fires.counts[date] ?? 0,
    hotspotCells: d.hotspots.features.filter((f) => f.properties.date === date).length,
    maxHcho: vals.length ? Math.max(...vals) : 0,
  }
}

// Live stats for the scrubbed date, with week-over-week deltas.
export function statsForDate(d: Dashboard, date: string): DateStats {
  const i = d.dates.indexOf(date)
  const cur = rawStats(d, date)
  const prev = i > 0 ? rawStats(d, d.dates[i - 1]) : cur
  return {
    ...cur,
    dFires: cur.fires - prev.fires,
    dHotspots: cur.hotspotCells - prev.hotspotCells,
    dMaxHcho: cur.maxHcho - prev.maxHcho,
    isPeak: date === d.meta.peak_date,
  }
}

// Fire-count series (one per date) for the timeline sparkline + season chart.
export function fireSeries(d: Dashboard): { date: string; fires: number }[] {
  return d.dates.map((date) => ({ date, fires: d.fires.counts[date] ?? 0 }))
}

// ---- point inspection (the click-to-inspect "pin") ------------------------
export interface Inspection {
  lng: number; lat: number
  hcho: number | null
  region: string | null
  fire: { frp: number; km: number } | null
  wind: { speed: number; dirText: string } | null
  inHotspot: boolean
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const kmBetween = (a: [number, number], b: [number, number]) =>
  Math.hypot((a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180), a[1] - b[1]) * 111

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (((yi > lat) !== (yj > lat)) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

export function inspectPoint(d: Dashboard, date: string, lng: number, lat: number): Inspection {
  // nearest HCHO grid cell
  let best = Infinity, hcho: number | null = null
  const vals = d.hcho.values[date] ?? []
  d.hcho.cells.forEach((c, i) => {
    const dd = (c[0] - lng) ** 2 + (c[1] - lat) ** 2
    if (dd < best) { best = dd; hcho = vals[i] ?? null }
  })
  if (best > 0.4) hcho = null // click well outside the grid

  // region by box
  const reg = d.regions.find((r) =>
    lng >= r.box.lon[0] && lng <= r.box.lon[1] && lat >= r.box.lat[0] && lat <= r.box.lat[1])

  // nearest fire
  let fire: Inspection['fire'] = null, fbest = Infinity
  for (const p of d.fires.points[date] ?? []) {
    const km = kmBetween([p[0], p[1]], [lng, lat])
    if (km < fbest) { fbest = km; fire = { frp: p[2], km: Math.round(km) } }
  }

  // nearest wind vector
  let wind: Inspection['wind'] = null, wbest = Infinity
  for (const v of d.windVectors.vectors[date] ?? []) {
    const dd = (v[0] - lng) ** 2 + (v[1] - lat) ** 2
    if (dd < wbest) {
      wbest = dd
      wind = { speed: v[4], dirText: COMPASS[Math.round((v[5] % 360) / 45) % 8] }
    }
  }
  if (wbest > 6) wind = null

  // inside a hotspot blob for this date?
  let inHotspot = false
  for (const f of d.hotspotsGeo.features as any[]) {
    if (f.properties.date !== date) continue
    const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]
    if (polys.some((poly: number[][][]) => pointInRing(lng, lat, poly[0]))) { inHotspot = true; break }
  }

  return { lng, lat, hcho, region: reg ? reg.name : null, fire, wind, inHotspot }
}
