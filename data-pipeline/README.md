# Data pipeline

Two ways to produce the dashboard's data. Both write the **same JSON files** into
`../backend/exports/`, so the backend and frontend never change.

## A) Mock data (works right now, no account needed)
```bash
../backend/.venv/bin/python generate_mock_data.py
```
Realistic synthetic HCHO/fire/wind data over India for the Oct–Nov 2024 burning
season. Use this to build & demo the whole app today.

## B) Real satellite data (Google Earth Engine)
```bash
pip install -r requirements-gee.txt
earthengine authenticate              # one-time, opens browser
export EE_PROJECT=your-gee-project-id
python gee_pipeline.py                # overwrites exports/ with REAL data
```
Pulls TROPOMI HCHO, FIRMS fires, ERA5 wind. The frontend instantly shows real
data — no code change. **The swap from mock → real is just running this script.**

## Output files (`backend/exports/`)
| file | what |
|------|------|
| `meta.json` | dates, bbox, region boxes, peak date |
| `hcho_grid.json` | per-date HCHO column on a 0.5° grid over India |
| `fires.json` | per-date fire counts + sampled fire points |
| `hotspots.json` | GeoJSON hotspot polygons (z-score > mean+1.5σ) |
| `correlation.json` | fire-count vs HCHO scatter + Pearson R |
| `wind.json` | per-date 10 m wind vectors over the IGP |
| `india.geojson` | country outline for the map |
