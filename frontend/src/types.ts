// Shapes of the JSON the FastAPI backend serves (mirrors data-pipeline output).

export interface Meta {
  title: string
  source: string
  dates: string[]
  bbox: [number, number, number, number] // [lonMin, latMin, lonMax, latMax]
  center: [number, number]
  step: number
  n_cells: number
  regions: {
    igp: { name: string; lon: [number, number]; lat: [number, number] }
    fire_box: { lon: [number, number]; lat: [number, number] }
  }
  hcho_unit: string
  peak_date: string
  datasets: Record<string, string>
}

export interface HchoGrid {
  dates: string[]
  step: number
  unit: string
  vmin: number
  vmax: number
  cells: [number, number][]            // [lon, lat]
  values: Record<string, number[]>     // date -> value per cell (aligned to cells)
}

export interface Fires {
  dates: string[]
  counts: Record<string, number>
  points: Record<string, [number, number, number][]> // date -> [lon, lat, frp]
}

export interface HotspotFeature {
  type: 'Feature'
  properties: { date: string; hcho: number; z: number; threshold: number }
  geometry: { type: 'Polygon'; coordinates: number[][][] }
}
export interface Hotspots {
  type: 'FeatureCollection'
  method: string
  features: HotspotFeature[]
}

export interface SeriesPoint { date: string; hcho: number; fire_count: number }
export interface Correlation {
  points: SeriesPoint[]
  pearson_r: number
  r_squared: number
  slope: number
  intercept: number
  x_label: string
  y_label: string
}

export interface Wind {
  dates: string[]
  // [lon, lat, u, v, speed, bearing]
  vectors: Record<string, [number, number, number, number, number, number][]>
}

export interface IndiaGeo {
  type: 'FeatureCollection'
  features: { type: 'Feature'; properties: unknown; geometry: unknown }[]
}
