import LayersPanel from '../components/LayersPanel'
import Inspector from '../components/Inspector'
import Controls from '../components/Controls'

// Transparent overlay of map controls. The persistent <MapView> renders behind
// this (in App); only the panels capture pointer events.
export default function ExploreView() {
  return (
    <div className="explore-overlay">
      <LayersPanel />
      <Inspector />
      <Controls />
    </div>
  )
}
