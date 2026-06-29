import { HeatmapLayer } from '@deck.gl/aggregation-layers'
import { GeoJsonLayer, ScatterplotLayer, PolygonLayer, TextLayer } from '@deck.gl/layers'
import { ParticleLayer, ImageType } from 'weatherlayers-gl'
import type { Dashboard } from '../data/adapter'
import { hchoWeights, firesForDate, hotspotsForDate, nearestDate } from '../data/adapter'
import type { TextureData } from './windTexture'

// Key Indian cities to keep as labels (foreign labels are hidden + masked out).
const CITIES: { name: string; coord: [number, number] }[] = [
  { name: 'New Delhi', coord: [77.21, 28.61] },
  { name: 'Mumbai', coord: [72.87, 19.07] },
  { name: 'Kolkata', coord: [88.36, 22.57] },
  { name: 'Chennai', coord: [80.27, 13.08] },
  { name: 'Bengaluru', coord: [77.59, 12.97] },
  { name: 'Hyderabad', coord: [78.49, 17.38] },
  { name: 'Ahmedabad', coord: [72.57, 23.03] },
  { name: 'Jaipur', coord: [75.79, 26.91] },
  { name: 'Lucknow', coord: [80.95, 26.85] },
  { name: 'Amritsar', coord: [74.87, 31.63] },
]

// Build an inverse mask: a big rectangle with India's polygons punched out as
// holes. Filled near-black, it spotlights India and darkens everyone else —
// and conveniently clips HCHO/wind bleed to India's real coastline.
function maskPolygon(india: any): number[][][] {
  const outer = [[40, -8], [122, -8], [122, 46], [40, 46], [40, -8]]
  const holes: number[][][] = []
  for (const f of india.features) {
    const g = f.geometry
    const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]
    for (const poly of polys) holes.push(poly[0]) // exterior ring of each part
  }
  return [outer, ...holes]
}

export interface LayerToggles {
  hcho: boolean
  hotspots: boolean
  fires: boolean
  wind: boolean
  igp: boolean
}

export type Opacities = Record<keyof LayerToggles, number>

// transparent → deep indigo → magenta → orange → white-hot
const HCHO_RAMP: [number, number, number, number][] = [
  [12, 10, 48, 0],
  [54, 22, 110, 90],
  [140, 32, 124, 170],
  [222, 62, 90, 222],
  [251, 152, 42, 246],
  [255, 246, 226, 255],
]

// additive blending so overlapping glows BLOOM instead of occluding
const ADDITIVE = {
  blendColorOperation: 'add',
  blendColorSrcFactor: 'src-alpha',
  blendColorDstFactor: 'one',
  blendAlphaOperation: 'add',
  blendAlphaSrcFactor: 'src-alpha',
  blendAlphaDstFactor: 'one',
} as const

// FRP ~5..100. Brightness is EARNED: most fires are dim deep-ember, a few
// high-FRP go amber, only the rare hottest approach yellow-white.
function fireNorm(frp: number) {
  return Math.max(0, Math.min((frp - 5) / 95, 1))
}
function fireColor(frp: number): [number, number, number] {
  const t = fireNorm(frp)
  if (t < 0.45) {                                       // most: deep ember
    const u = t / 0.45
    return [130 + u * 90, 35 + u * 45, 18 + u * 7]      // (130,35,18) → (220,80,25)
  }
  if (t < 0.82) {                                       // few: amber
    const u = (t - 0.45) / 0.37
    return [220 + u * 35, 80 + u * 90, 25 + u * 55]     // (220,80,25) → (255,170,80)
  }
  const u = (t - 0.82) / 0.18                           // rare hottest: yellow-white
  return [255, 170 + u * 70, 80 + u * 140]              // (255,170,80) → (255,240,220)
}
function fireAlpha(frp: number) {
  return Math.round(95 + fireNorm(frp) * 130)           // dim (~0.37) → bright (~0.88)
}

interface Ctx {
  data: Dashboard
  time: number
  toggles: LayerToggles
  opacities: Record<keyof LayerToggles, number>
  windTex: TextureData | null
  pulse: number // 0..2π animation phase
}

// Layers rebuilt only when time / toggles / wind texture change (expensive:
// heatmap aggregation, particle field). Kept separate from the per-frame
// fire pulse so the animation loop stays cheap.
export function buildBaseLayers({ data, time, toggles, opacities, windTex }: Omit<Ctx, 'pulse'>) {
  const date = nearestDate(data, time)
  const layers: any[] = []

  // ---- IGP region — real geographic shape as a soft warm glow (no box) ------
  if (toggles.igp) {
    layers.push(
      new GeoJsonLayer({
        id: 'igp-region',
        data: data.igpRegion as any,
        stroked: true,
        filled: true,
        getFillColor: [255, 196, 120, 14],
        getLineColor: [255, 196, 120, 55],
        getLineWidth: 1,
        lineWidthUnits: 'pixels',
        opacity: opacities.igp,
      }),
    )
  }

  // ---- HCHO column — glowing heatmap field ---------------------------------
  if (toggles.hcho) {
    const w = hchoWeights(data, time)
    const points = data.hcho.cells.map((c, i) => ({ position: c, weight: w[i] ?? 0 }))
    layers.push(
      new HeatmapLayer({
        id: 'hcho',
        data: points,
        getPosition: (d: any) => d.position,
        getWeight: (d: any) => d.weight,
        aggregation: 'MEAN',
        radiusPixels: 55,
        intensity: 0.55,
        threshold: 0.28, // clip the low tail to fully transparent (no mud)
        colorRange: HCHO_RAMP.map((c) => [c[0], c[1], c[2], c[3]]) as any,
        colorDomain: [data.hcho.vmin, data.hcho.vmax * 1.15],
        opacity: 0.88 * opacities.hcho,
      }),
    )
  }

  // ---- Hotspots (z>1.5σ) — warm GLOW CONTOUR in the HCHO palette ------------
  // Reads as "this area is lit up", not a sticker outline. Stacked additive
  // lines (wide+faint → narrow+bright) fake a soft glow falloff around a thin
  // near-white core. No pink — amber→white, part of the heat story.
  if (toggles.hotspots) {
    const fc = hotspotsForDate(data, date)
    const ring = (id: string, width: number, color: number[]) =>
      new GeoJsonLayer({
        id,
        data: fc as any,
        stroked: true, filled: false,
        getLineColor: color as any,
        getLineWidth: width,
        lineWidthUnits: 'pixels',
        lineJointRounded: true,
        lineCapRounded: true,
        opacity: opacities.hotspots,
        parameters: ADDITIVE,
      })
    layers.push(
      // faint warm wash that brightens the HCHO underneath
      new GeoJsonLayer({
        id: 'hotspots-fill',
        data: fc as any,
        stroked: false, filled: true,
        getFillColor: [255, 196, 140, 12],
        opacity: opacities.hotspots,
      }),
      ring('hotspots-glow3', 13, [255, 165, 100, 14]),   // wide outer falloff
      ring('hotspots-glow2', 7, [255, 188, 134, 26]),
      ring('hotspots-glow1', 3.2, [255, 214, 168, 48]),  // glow dominates...
      // ...over a soft thin core (also the pickable layer for tooltips)
      new GeoJsonLayer({
        id: 'hotspots',
        data: fc as any,
        stroked: true, filled: false,
        getLineColor: [255, 238, 212, 150],
        getLineWidth: 1,
        lineWidthUnits: 'pixels',
        lineJointRounded: true,
        lineCapRounded: true,
        opacity: opacities.hotspots,
        parameters: ADDITIVE,
        pickable: true,
      }),
    )
  }

  // ---- Wind transport — GPU particle field ---------------------------------
  if (toggles.wind && windTex) {
    layers.push(
      new ParticleLayer({
        id: 'wind',
        image: windTex as any,
        imageType: ImageType.VECTOR,
        imageUnscale: data.wind.imageUnscale,
        bounds: data.wind.bounds,
        boundsClip: false,        // India mask does the clipping, not the rect
        // The texture's alpha channel masks out slow areas, so particles spawn
        // only in the fast NW→SE corridor → a current with negative space.
        numParticles: 2800,       // FEWER — a quiet current, not a rain texture
        maxAge: 30,               // LONGER fading trails that connect into flow
        speedFactor: 7,
        width: 1.4,               // thin
        opacity: 0.3 * opacities.wind,   // whispers under the data
        color: [150, 174, 202, 255],   // dim grey-blue context (4-component)
        palette: null,
        animate: true,
        // NORMAL alpha blending (not additive) — additive is what whitens it
      } as any),
    )
  }

  // ---- inverse spotlight mask: darken everything that isn't India ----------
  layers.push(
    new PolygonLayer({
      id: 'india-mask',
      data: [{ polygon: maskPolygon(data.india) }],
      getPolygon: (d: any) => d.polygon,
      stroked: false,
      filled: true,
      getFillColor: [4, 6, 11, 235],
      parameters: { depthCompare: 'always' },
    }),
  )

  // ---- curated Indian city labels (foreign labels are hidden in the style) --
  layers.push(
    new ScatterplotLayer({
      id: 'city-dots',
      data: CITIES,
      getPosition: (d: any) => d.coord,
      getRadius: 2,
      radiusUnits: 'pixels',
      getFillColor: [220, 228, 240, 200],
      stroked: false,
    }),
    new TextLayer({
      id: 'city-labels',
      data: CITIES,
      getPosition: (d: any) => d.coord,
      getText: (d: any) => d.name,
      getSize: 11,
      getColor: [206, 216, 232, 220],
      getTextAnchor: 'start',
      getAlignmentBaseline: 'center',
      getPixelOffset: [6, 0],
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontWeight: 500,
      outlineWidth: 2,
      outlineColor: [3, 5, 10, 230],
      fontSettings: { sdf: true },
      parameters: { depthCompare: 'always' },
    }),
  )

  // ---- Gi*-detected source-region labels (IGP / Central / NE) --------------
  if (toggles.hotspots) {
    const detected = data.regions.filter((r) => r.detected)
    layers.push(
      new TextLayer({
        id: 'region-labels',
        data: detected,
        getPosition: (d: any) => d.anchor,
        getText: (d: any) => d.name.toUpperCase(),
        getSize: 12.5,
        getColor: [236, 240, 248, 240],
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontWeight: 700,
        characterSet: 'auto',
        background: true,
        getBackgroundColor: [10, 12, 20, 165],
        backgroundPadding: [7, 4],
        getBorderColor: [255, 255, 255, 28],
        getBorderWidth: 1,
        fontSettings: { sdf: true },
        outlineWidth: 2,
        outlineColor: [3, 5, 10, 220],
        parameters: { depthCompare: 'always' },
        pickable: true,
      }),
    )
  }

  return layers
}

// Active fires — soft glow + hot core, brightest pulse. Rebuilt every frame
// (cheap: a couple of ScatterplotLayers) so the pulse stays smooth.
export function buildFireLayers({ data, time, toggles, opacities, pulse }: Omit<Ctx, 'windTex'>) {
  if (!toggles.fires) return []
  const date = nearestDate(data, time)
  const fires = firesForDate(data, date)
  const pulseScale = 1 + 0.15 * Math.sin(pulse)
  // NORMAL alpha blending (NOT additive). Small crisp embers with a tight dim
  // halo; brightness/size driven by FRP so most sit quietly in the HCHO glow.
  return [
    new ScatterplotLayer({
      id: 'fires-halo',
      data: fires,
      getPosition: (d: any) => d.position,
      getRadius: (d: any) => 2 + Math.min(d.frp / 45, 2.4),     // 2–4.4px, tight
      radiusUnits: 'pixels',
      getFillColor: (d: any) => [...fireColor(d.frp), Math.round(fireAlpha(d.frp) * 0.22)] as any,
      stroked: false,
      opacity: 0.8 * opacities.fires,                          // sit IN the HCHO glow
    }),
    new ScatterplotLayer({
      id: 'fires',
      data: fires,
      getPosition: (d: any) => d.position,
      getRadius: (d: any) => {
        const r = 0.9 + Math.min(d.frp / 55, 1.7)              // 0.9–2.6px, small
        return d.frp > 80 ? r * pulseScale : r                 // only hottest pulse
      },
      radiusUnits: 'pixels',
      getFillColor: (d: any) => [...fireColor(d.frp), fireAlpha(d.frp)] as any,
      stroked: false,
      pickable: true,
      opacity: 0.8 * opacities.fires,
      updateTriggers: { getRadius: pulse },
    }),
  ]
}
