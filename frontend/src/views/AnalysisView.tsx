import { useDashboard } from '../state'
import { statsForDate } from '../data/adapter'
import { SeasonChart, CorrelationScatter, MiniScatter } from '../components/Charts'
import { useCountUp } from '../ui/useCountUp'

function Delta({ value, fmt }: { value: number; fmt: (n: number) => string }) {
  const dir = value > 0 ? 'up' : value < 0 ? 'down' : 'flat'
  const arrow = value > 0 ? '▲' : value < 0 ? '▼' : '—'
  return <span className={`delta ${dir}`}>{arrow}{value !== 0 && <span className="tnum">{fmt(Math.abs(value))}</span>}</span>
}
function StatCard({ label, value, fmt, unit, delta }: {
  label: string; value: number; fmt: (n: number) => string; unit?: string; delta: number
}) {
  const shown = useCountUp(value)
  return (
    <div className="card stat">
      <div className="lab">{label}</div>
      <div className="val">{fmt(shown)}</div>
      {unit && <div className="unit">{unit}</div>}
      <Delta value={delta} fmt={fmt} />
    </div>
  )
}
const intFmt = (n: number) => Math.round(n).toLocaleString()
const oneFmt = (n: number) => n.toFixed(1)

export default function AnalysisView() {
  const { data, date } = useDashboard()
  const s = statsForDate(data, date)
  const heroR = useCountUp(data.correlation.pearson_r)
  const regions = [...data.regions].sort((a, b) => a.rank - b.rank)

  return (
    <div className="page analysis">
      <div className="page-inner an-grid">
        <header className="an-head">
          <h1>Fire–HCHO coupling</h1>
          <p className="t-cap">Weekly analysis over the 2024 burning season · current week {date}</p>
        </header>

        {/* hero */}
        <div className="card hero an-hero">
          <div>
            <div className="hero-num">{heroR.toFixed(2)}</div>
            <div className="hero-label">Fire–HCHO correlation</div>
            <div className="hero-sub mono">R² = {data.correlation.r_squared} · Pearson · whole season</div>
          </div>
          <MiniScatter corr={data.correlation} date={date} />
        </div>

        {/* KPIs */}
        <div className="an-kpis">
          <StatCard label="Fires this week" value={s.fires} fmt={intFmt} delta={s.dFires} />
          <StatCard label="Hotspot cells" value={s.hotspotCells} fmt={intFmt} delta={s.dHotspots} />
          <StatCard label="Max HCHO" value={s.maxHcho} fmt={oneFmt} unit="×10¹⁵ molec/cm²" delta={Math.round(s.dMaxHcho * 10) / 10} />
        </div>

        {/* big proof chart */}
        <div className="card chart an-proof">
          <div className="chart-head">
            <span className="t-section">Fires vs HCHO · the proof</span>
            <span className="chart-r">R {data.correlation.pearson_r}</span>
          </div>
          <CorrelationScatter corr={data.correlation} date={date} />
          <div className="t-cap" style={{ marginTop: 4 }}>each point = one week · coloured by HCHO ramp · ◆ = current week</div>
        </div>

        {/* season chart */}
        <div className="card chart an-season">
          <div className="chart-head"><span className="t-section">HCHO &amp; fires across the season</span></div>
          <SeasonChart corr={data.correlation} date={date} />
          <div className="series-leg">
            <span><i style={{ background: '#39435c' }} />Fire count</span>
            <span><i style={{ background: '#d7dbe2' }} />HCHO column</span>
            <span><i style={{ background: 'var(--accent)' }} />Now</span>
          </div>
        </div>

        {/* regions table */}
        <div className="card an-regions">
          <div className="chart-head"><span className="t-section">Detected source regions · Getis-Ord Gi*</span></div>
          <table className="reg-table">
            <thead><tr><th>#</th><th>Region</th><th>Fire–HCHO R</th><th>Hotspot cells</th><th>Peak HCHO</th><th>Peak fires</th></tr></thead>
            <tbody>
              {regions.map((r) => (
                <tr key={r.short}>
                  <td className="dim">{r.rank}</td>
                  <td>{r.name}</td>
                  <td className="acc tnum">{r.pearson_r}</td>
                  <td className="tnum">{r.peak_hotspot_cells}</td>
                  <td className="tnum">{r.mean_hcho_peak}</td>
                  <td className="tnum">{r.peak_fires.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* insight */}
        <div className="card insight an-insight">
          <div className="t-section">Insight</div>
          <p>
            Active fires and HCHO track tightly (<b>R = {data.correlation.pearson_r}</b>), peaking in
            <b> late October</b> over the <b>Indo-Gangetic Plain</b> during stubble burning.
            <b> Central</b> and <b>Northeast India</b> emerge as secondary forest-fire sources. ERA5
            winds blow <b>NW→SE</b>, so part of the eastern-IGP enhancement is <i>transported</i>, not local.
          </p>
        </div>
      </div>
    </div>
  )
}
