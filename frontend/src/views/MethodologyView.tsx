import { useDashboard } from '../state'

export default function MethodologyView() {
  const { data } = useDashboard()
  const regions = [...data.regions].sort((a, b) => a.rank - b.rank)
  const isMock = /mock/i.test(data.meta.source)

  return (
    <div className="page methodology">
      <div className="page-inner method-inner">
        <header className="an-head">
          <h1>Methodology &amp; interpretation</h1>
          <p className="t-cap">ISRO BAH 2026 · Objective-2 · HCHO hotspots over India</p>
        </header>

        <p className="method-lede">
          Satellite-derived formaldehyde (HCHO) is a chemical fingerprint of the VOCs released when
          biomass burns. We map it across India, detect statistically significant hotspots, and tie
          them to active fires and wind transport.
        </p>

        <div className="t-section">Data sources</div>
        <ul className="method-list">
          <li><b>HCHO column</b> — TROPOMI / Sentinel-5P <code>S5P/OFFL/L3_HCHO</code>, weekly composites.</li>
          <li><b>Active fires</b> — NASA <b>FIRMS</b> (MODIS/VIIRS) fire counts &amp; radiative power.</li>
          <li><b>Wind</b> — ECMWF <b>ERA5</b> 10 m u/v, for downwind transport.</li>
        </ul>

        <div className="t-section">Hotspot detection — Getis-Ord Gi*</div>
        <p className="method-body">
          For each 0.5° grid cell we compute the <b>Gi* statistic</b> over its neighbourhood
          (radius 1.25°). Gi* is a z-score of local clustering: a cell scores high only when it
          <i> and its neighbours</i> are jointly elevated, so we flag genuine <b>clusters</b> of high
          HCHO at <b>95% confidence (Gi* ≥ 1.96)</b> rather than lone noisy pixels — the difference
          between a real source region and a single bad retrieval. Flagged cells are dissolved into
          smooth contours and tagged with the named region they fall in.
        </p>

        <div className="t-section">Detected source regions</div>
        <table className="reg-table">
          <thead><tr><th>#</th><th>Region</th><th>Fire–HCHO R</th><th>Hotspot cells</th><th>Peak HCHO</th></tr></thead>
          <tbody>
            {regions.map((r) => (
              <tr key={r.short}>
                <td className="dim">{r.rank}</td><td>{r.name}</td>
                <td className="acc tnum">{r.pearson_r}</td>
                <td className="tnum">{r.peak_hotspot_cells}</td>
                <td className="tnum">{r.mean_hcho_peak}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="t-section">Interpretation</div>
        <p className="method-body">
          The <b>Indo-Gangetic Plain</b> dominates — its hotspots track active fires at
          <b> R = {regions[0]?.pearson_r}</b>, peaking in late October with Punjab/Haryana stubble
          burning. <b>Central</b> and <b>Northeast India</b> emerge as secondary forest-fire sources.
          ERA5 winds blow <b>NW→SE</b>, advecting the HCHO plume downwind across the plain — so the
          enhancement over the eastern IGP is partly <i>transported</i>, not only local. The tight
          fire↔HCHO coupling is the headline: from space, HCHO reveals where India burns.
        </p>

        <div className="method-foot">
          {isMock
            ? 'Running on shape-compatible MOCK data. Swap to live TROPOMI/FIRMS/ERA5 by running the GEE pipeline — schema is identical.'
            : 'Running on live satellite data.'}
        </div>
      </div>
    </div>
  )
}
