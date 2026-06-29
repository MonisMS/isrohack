import { createContext, useContext } from 'react'
import type { Dashboard, Inspection } from './data/adapter'
import type { LayerToggles, Opacities } from './map/layers'

export interface PinState { lng: number; lat: number; insp: Inspection }

// Shared dashboard state, provided by the App shell and consumed by every
// routed view (Explore / Analysis / Methodology) so the map, timeline and
// panels stay in lockstep regardless of route.
export interface DashboardState {
  data: Dashboard
  date: string
  time: number; setTime: (t: number) => void
  playing: boolean; setPlaying: (p: boolean) => void
  layers: LayerToggles; setLayers: (l: LayerToggles) => void
  opacities: Opacities; setOpacities: (o: Opacities) => void
  pin: PinState | null; setPin: (p: PinState | null) => void
}

export const DashboardCtx = createContext<DashboardState | null>(null)

export function useDashboard(): DashboardState {
  const v = useContext(DashboardCtx)
  if (!v) throw new Error('useDashboard must be used within DashboardCtx provider')
  return v
}
