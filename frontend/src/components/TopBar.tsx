import { NavLink } from 'react-router-dom'
import { useDashboard } from '../state'

export default function TopBar() {
  const { data, date } = useDashboard()
  const isMock = /mock/i.test(data.meta.source)
  return (
    <header className="topbar">
      <div className="tb-brand">
        HCHO Hotspots<span> · India</span>
      </div>
      <nav className="tb-nav">
        <NavLink to="/explore" className={({ isActive }) => (isActive ? 'on' : '')}>Explore</NavLink>
        <NavLink to="/analysis" className={({ isActive }) => (isActive ? 'on' : '')}>Analysis</NavLink>
        <NavLink to="/methodology" className={({ isActive }) => (isActive ? 'on' : '')}>Methodology</NavLink>
      </nav>
      <div className="tb-right mono">
        <span className="tb-status">
          <i className="live-dot" />{isMock ? 'MOCK' : 'LIVE'} · TROPOMI · FIRMS · ERA5
        </span>
        <span className="tb-date">{date}</span>
      </div>
    </header>
  )
}
