import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, ScatterChart, Scatter, CartesianGrid, ZAxis, Cell,
} from 'recharts'
import type { Correlation } from '../types'
import { rampColor, ACCENT } from '../ui/ramp'

const fmt = (d: string) => d.slice(5)
const tip = { background: '#101015', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }

function hchoRange(corr: Correlation) {
  const ys = corr.points.map((p) => p.hcho)
  return [Math.min(...ys), Math.max(...ys)] as const
}

// ---- season: fire bars + HCHO line, with a moving "now" marker -------------
export function SeasonChart({ corr, date }: { corr: Correlation; date: string }) {
  const peak = corr.points.reduce((a, b) => (b.fire_count > a.fire_count ? b : a)).date
  return (
    <div style={{ height: 156 }}>
      <ResponsiveContainer>
        <ComposedChart data={corr.points} margin={{ top: 6, right: 6, bottom: 0, left: -22 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmt} tick={{ fill: '#5c616b', fontSize: 10 }} stroke="rgba(255,255,255,0.08)" />
          <YAxis yAxisId="l" tick={{ fill: '#5c616b', fontSize: 10 }} stroke="rgba(255,255,255,0.08)" />
          <YAxis yAxisId="r" orientation="right" hide />
          <Tooltip contentStyle={tip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          {/* peak week — subtle brighter bar; now — accent marker */}
          <ReferenceLine x={peak} yAxisId="l" stroke="rgba(255,255,255,0.14)" strokeWidth={10} />
          <ReferenceLine x={date} yAxisId="l" stroke={ACCENT} strokeWidth={1.5} />
          <Bar yAxisId="r" dataKey="fire_count" name="Fires" fill="#39435c" radius={[2, 2, 0, 0]} barSize={14} />
          <Line yAxisId="l" type="monotone" dataKey="hcho" name="HCHO" stroke="#d7dbe2" strokeWidth={2} dot={{ r: 2, fill: '#d7dbe2' }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---- correlation scatter — the money chart (ramp-coloured proof) ------------
export function CorrelationScatter({ corr, date }: { corr: Correlation; date: string }) {
  const [lo, hi] = hchoRange(corr)
  const xs = corr.points.map((p) => p.fire_count)
  const xMin = Math.min(...xs), xMax = Math.max(...xs)
  const line = [
    { x: xMin, y: corr.slope * xMin + corr.intercept },
    { x: xMax, y: corr.slope * xMax + corr.intercept },
  ]
  const pts = corr.points.map((p) => ({ x: p.fire_count, y: p.hcho, date: p.date }))
  return (
    <div style={{ height: 184 }}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 8, right: 8, bottom: 2, left: -22 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" />
          <XAxis type="number" dataKey="x" name="fires" tick={{ fill: '#5c616b', fontSize: 10 }} stroke="rgba(255,255,255,0.08)" />
          <YAxis type="number" dataKey="y" name="HCHO" tick={{ fill: '#5c616b', fontSize: 10 }} stroke="rgba(255,255,255,0.08)" />
          <ZAxis range={[60, 60]} />
          <Tooltip contentStyle={tip} cursor={{ strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.2)' }} />
          <Scatter data={line} line={{ stroke: 'rgba(255,255,255,0.35)', strokeWidth: 1.5 }} shape={() => <></>} />
          <Scatter data={pts}>
            {pts.map((p, i) => {
              const active = p.date === date
              return (
                <Cell
                  key={i}
                  fill={active ? ACCENT : rampColor((p.y - lo) / (hi - lo || 1))}
                  stroke={active ? '#fff' : 'none'}
                  strokeWidth={active ? 2 : 0}
                  r={active ? 7 : 5}
                />
              )
            })}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---- tiny inline scatter for the hero card (hand-drawn SVG) -----------------
export function MiniScatter({ corr, date }: { corr: Correlation; date: string }) {
  const [lo, hi] = hchoRange(corr)
  const xs = corr.points.map((p) => p.fire_count)
  const ys = corr.points.map((p) => p.hcho)
  const xMin = Math.min(...xs), xMax = Math.max(...xs)
  const yMin = Math.min(...ys), yMax = Math.max(...ys)
  const W = 104, H = 64, pad = 6
  const sx = (x: number) => pad + ((x - xMin) / (xMax - xMin || 1)) * (W - 2 * pad)
  const sy = (y: number) => H - pad - ((y - yMin) / (yMax - yMin || 1)) * (H - 2 * pad)
  return (
    <svg className="hero-mini" viewBox={`0 0 ${W} ${H}`}>
      <line
        x1={sx(xMin)} y1={sy(corr.slope * xMin + corr.intercept)}
        x2={sx(xMax)} y2={sy(corr.slope * xMax + corr.intercept)}
        stroke="rgba(255,255,255,0.28)" strokeWidth={1}
      />
      {corr.points.map((p, i) => {
        const active = p.date === date
        return (
          <circle
            key={i} cx={sx(p.fire_count)} cy={sy(p.hcho)}
            r={active ? 3.4 : 2.2}
            fill={active ? ACCENT : rampColor((p.hcho - lo) / (hi - lo || 1))}
            stroke={active ? '#fff' : 'none'} strokeWidth={active ? 1 : 0}
          />
        )
      })}
    </svg>
  )
}
