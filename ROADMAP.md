# ISRO BAH 2026 — HCHO Hotspots over India 🛰️🔥

> **Project skeleton & roadmap.** This is our north star. Re-read the top section every morning;
> tick the checklists as we go. If we're ever unsure "what next?", the answer is in here.

---

## 0. One-liner (memorize this — it's our pitch)

> *"We use Sentinel-5P satellite data to map formaldehyde (HCHO) across all of India, automatically
> detect pollution **hotspots** during the crop-burning season, and prove — with fire data and wind
> data — that those hotspots are driven by biomass burning and transported downwind."*

---

## 1. The problem (why this matters)

- Most of India is >100 km from a ground air-quality monitor → huge blind spots.
- **HCHO (formaldehyde)** is a chemical *fingerprint* of VOC emissions. When crops/forests burn,
  VOCs spike → HCHO spikes. So mapping HCHO = seeing where India is burning, from space.
- We solve **Objective-2** of the PS (HCHO hotspots). We do NOT do the heavy CNN-LSTM AQI model
  (Objective-1) — that's a separate, harder track. We may add a light AQI-context layer at the end.

---

## 2. The official scoring rubric → our deliverables

The PS lists 6 steps for Objective-2. **These ARE our task list.** Every one must be visibly done.

| # | Official step | Our deliverable | Status |
|---|--------------|-----------------|:------:|
| 1 | Acquire & pre-process satellite HCHO column data | Clean TROPOMI HCHO over India, quality-filtered | ✅ |
| 2 | Extract biomass burning periods using fire count data | Fire time-series → identify burning windows | ✅ |
| 3 | Map spatio-temporal distribution of HCHO | Interactive map + time slider/animation | ✅ |
| 4 | Identify hotspots (statistical thresholds / clustering) | **Getis-Ord Gi\*** detection + map overlay, 3 regions auto-named | ✅ |
| 5 | Correlation between fire activity & HCHO | Scatter + R value, per-region analysis | ✅ |
| 6 | Assess transport using wind/reanalysis data | Wind vectors showing downwind transport | ✅ |

**Evaluation parameters (image #2) — 4 of 5 favor a web team:**
- ✅ Accuracy & clarity of **hotspot detection** ← our core algorithm
- ✅ **Integration of multi-source datasets** ← engineering (HCHO + fire + wind)
- ✅ **Visualization quality** (spatial maps + time series) ← OUR STRENGTH, explicitly scored
- ✅ **Innovation in methodology** ← clustering + transport analysis
- ✅ Scientific interpretation ← in-app Methodology panel + `docs/methodology.md`

**Expected outcomes to literally show on screen (image #3):**
- High-res HCHO hotspot maps during burning season
- Major source regions named: **Indo-Gangetic Plain (IGP)**, forest-fire zones (NE India, Central India)
- Temporal evolution during burning events
- Fire-count ↔ HCHO enhancement correlation

---

## 3. Datasets (exact sources — copy these IDs)

All available via **Google Earth Engine (GEE)** unless noted. GEE = our escape hatch from raw NetCDF hell.

| Data | GEE ID / source | Resolution | Used for |
|------|-----------------|-----------|----------|
| **HCHO column** | `COPERNICUS/S5P/OFFL/L3_HCHO` | ~5.5×3.5 km, daily | Steps 1, 3, 4 |
| **Active fires** | `FIRMS` (`MODIS/.../FireMask`) or VIIRS via NASA FIRMS API | 375m–1km, daily | Steps 2, 5 |
| **Wind (u/v)** | `ECMWF/ERA5_LAND/DAILY_AGGR` or `ECMWF/ERA5/DAILY` | ~9–25 km, daily | Step 6 |
| **NO₂ (bonus AQI context)** | `COPERNICUS/S5P/OFFL/L3_NO2` | ~5 km, daily | optional layer |
| **AOD / PM2.5 proxy (bonus)** | `MODIS/061/MCD19A2_GRANULES` | 1 km | optional layer |
| **Admin boundaries** | `FAO/GAUL/2015/level1` (India states) | — | maps, region stats |
| **Ground truth (optional)** | CPCB station CSVs (cpcb.nic.in) | point | validation talking point |

**Key band notes:**
- HCHO band: `tropospheric_HCHO_column_number_density` (units: mol/m²). Multiply for readability.
- Quality filter: use `qa_value`-equivalent; S5P L3 is already cloud-screened but filter further if noisy.
- **Burning season to target: Oct–Nov (Punjab/Haryana stubble) + Mar–May (forest fires, Central/NE).**
  Pick **Oct–Nov 2023 or 2024** as the hero window — strongest, most famous signal.

---

## 4. Methodology — the 6 steps in detail

### Step 1 — Acquire & pre-process HCHO
- GEE: filter `L3_HCHO` by date range + India bounds, select HCHO band.
- Composite to daily/weekly mean; mask low-quality/cloudy pixels.
- Clip to India boundary. Export as image tiles (for web) + region-mean time series (CSV/JSON).

### Step 2 — Extract biomass burning periods
- Aggregate FIRMS fire counts per day over India (and per state).
- Plot fire-count time series → the peaks ARE the "burning periods" the PS asks to extract.
- Define burning window programmatically (e.g. days where fire count > seasonal mean + 1σ).

### Step 3 — Map spatio-temporal distribution
- Frontend: India basemap + HCHO heat layer, **time slider** stepping through days/weeks.
- Animate burning season so the HCHO plume visibly grows and spreads. This is the demo centerpiece.

### Step 4 — Hotspot detection (THE analytical core)
- **Baseline (must-have):** per-pixel z-score or 90th/95th percentile threshold → "hotspot = anomalously high HCHO."
- **Better (innovation points):**
  - **Getis-Ord Gi\*** — proper spatial-statistics hotspot test (clusters of high values, not lone pixels).
  - or **DBSCAN** clustering on high-HCHO pixel coordinates → labeled hotspot regions.
- Output: polygons/cells flagged as hotspots + ranked list of top source regions (auto-detect IGP).

### Step 5 — Fire ↔ HCHO correlation
- For each region/day: pair (fire count, mean HCHO). Scatter plot + Pearson R + lag analysis
  (HCHO may peak 1–2 days after fires). Report R per region. Strong R = headline result.

### Step 6 — Transport via wind
- Overlay ERA5 wind vectors (u,v) on the HCHO map.
- Show HCHO advecting downwind from fire-source cells (e.g. Punjab fires → Delhi/IGP HCHO).
- Even a qualitative "arrows point from source to hotspot" visual nails Step 6 + innovation.

---

## 5. Tech stack

**Data / backend**
- Python 3.11+, `earthengine-api`, `geemap`, `pandas`, `numpy`, `scipy`/`scikit-learn` (DBSCAN), `xarray` (if needed).
- **FastAPI** thin backend: serves GEE map tiles + precomputed JSON (time series, hotspot polygons).
- Cache/export precomputed results so the demo never depends on a live GEE call timing out.

**Frontend (our strength — go all in)**
- React + Vite + TypeScript.
- Map: **Mapbox GL** or **MapLibre** (free) or `deck.gl` for fancy layers.
- Charts: `recharts` / `visx` (time series, scatter, correlation).
- UI: Tailwind. Time slider, layer toggles, region selector, info panels.

**Repo layout (proposed)**
```
isrohack/
├── ROADMAP.md          ← this file
├── data-pipeline/      ← Python + GEE scripts, exports JSON/tiles
│   ├── 01_hcho.py
│   ├── 02_fires.py
│   ├── 03_hotspots.py
│   ├── 04_correlation.py
│   └── exports/        ← precomputed JSON/GeoTIFF for the frontend
├── backend/            ← FastAPI (serves tiles + JSON)
├── frontend/           ← React dashboard
└── docs/               ← slides, scientific write-up, screenshots
```

---

## 6. Day-by-day roadmap

> Adjust dates; this assumes a 5-day sprint. **Bold = critical path / de-risk first.**

### Day 0 (TODAY) — Unblock
- [ ] **Create Google Earth Engine account** (free, register a cloud project — can take hours to approve, do it NOW).
- [ ] Install `earthengine-api` + `geemap`, run `earthengine authenticate`.
- [ ] Scaffold repo (folders above). Git init.
- [ ] Everyone skims this ROADMAP.

### Day 1 — Data spine (prove the story exists)
- [ ] **Step 1:** pull HCHO over India for Oct–Nov burning window. Render a static map.
- [ ] **Step 2:** pull fire counts same window. Plot fire time series.
- [ ] **De-risk check:** does HCHO visibly rise with fires? Screenshot it. ← if yes, project is safe.
- [ ] Export first JSON (HCHO region means + fire counts) for frontend to consume.

### Day 2 — Hotspot detection + frontend skeleton
- [ ] **Step 4:** implement z-score threshold (baseline) → hotspot map. Then attempt Gi*/DBSCAN.
- [ ] Frontend: India map renders, loads a static HCHO layer, basic layout.

### Day 3 — Correlation, transport, integration
- [ ] **Step 5:** fire↔HCHO scatter + R, per region.
- [ ] **Step 6:** ERA5 wind overlay, downwind transport visual.
- [ ] Wire frontend ↔ backend: live layer toggles working.

### Day 4 — The dashboard (visualization score)
- [ ] **Step 3:** time slider + spatio-temporal animation polished.
- [ ] All layers toggleable: HCHO / fires / hotspots / wind.
- [ ] Region call-outs (IGP highlighted), time-series + scatter charts in side panels.

### Day 5 — Polish + science + demo
- [ ] Scientific write-up (interpretation = a scored criterion).
- [ ] Slides + recorded demo + rehearse the 1-liner narrative.
- [ ] Bonus: AQI-context layer (NO₂) if time. Final QA.

---

## 7. Team division (4 people)

| Role | People | Owns |
|------|:------:|------|
| **Data/Science** | 1 | GEE pipeline, hotspot stats, correlation, exports (Steps 1,2,4,5,6) |
| **Frontend** | 2 | React dashboard, map, time slider, charts (Step 3 + viz score) |
| **Backend + Narrative** | 1 | FastAPI glue, data plumbing, scientific write-up & slides |

Front-enders: until the data person ships real JSON, build against **mock JSON** with the agreed schema
so nobody is blocked. Agree the JSON schema on Day 1.

---

## 8. Definition of Done (per step — judges must SEE each)

- **Step 1:** a clean HCHO map of India renders. ✔
- **Step 2:** a fire-count time-series chart with burning windows marked. ✔
- **Step 3:** time slider animates HCHO across the season. ✔
- **Step 4:** hotspots are outlined/highlighted, top regions auto-named (IGP). ✔
- **Step 5:** a scatter plot with an R value on screen. ✔
- **Step 6:** wind arrows over the map showing transport. ✔

---

## 9. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| GEE account approval delay | Register Day 0. Backup: NASA FIRMS API + Sentinel Hub for HCHO. |
| Live GEE calls slow/flaky in demo | **Precompute & export** all results to static JSON/tiles. Demo runs offline. |
| HCHO data noisy/cloudy | Composite to weekly means; quality-filter; pick a clear high-signal window. |
| Hotspot algo too complex | z-score threshold is enough for "must-have"; clustering is the bonus. |
| Scope creep into Objective-1 (AQI/ML) | AQI is a *single optional layer* at the very end, not core. Stay disciplined. |
| Frontend blocked on data | Mock JSON schema agreed Day 1; build in parallel. |

---

## 10. Demo narrative (the 90-second story we tell judges)

1. "Most of India has no air-quality monitor." → show blank-spot map.
2. "Satellites see HCHO everywhere." → reveal HCHO layer over all India.
3. "Watch the burning season." → hit play on time slider; plume grows over IGP.
4. "Our algorithm finds the hotspots automatically." → hotspots light up, IGP named.
5. "It's the fires." → toggle fire layer; show scatter + R value.
6. "And it spreads downwind." → wind arrows from Punjab → Delhi.
7. "All from open satellite data, for the 1 billion people far from a monitor."

---

## 11. Stretch goals (only if ahead of schedule)

- AQI-context layer (NO₂/CO from S5P) — gestures at Objective-1 without the ML.
- Multi-year comparison (was 2024 worse than 2023?).
- Per-state drill-down dashboard.
- CPCB ground-station validation overlay (great "scientific interpretation" point).
- Simple HCHO forecast (persistence/regression) — light innovation, NOT CNN-LSTM.

---

## 12. Getting started RIGHT NOW

```bash
# 1. Google Earth Engine: sign up at https://earthengine.google.com (register a cloud project)
# 2. Python env
python -m venv .venv && source .venv/bin/activate
pip install earthengine-api geemap pandas numpy scikit-learn scipy fastapi uvicorn
earthengine authenticate     # opens browser, links your GEE account
# 3. Verify it works
python -c "import ee; ee.Initialize(); print('GEE OK')"
```

When GEE auth works, ping me and I'll write `data-pipeline/01_hcho.py` — the script that pulls HCHO +
fires for the burning window and produces our Day-1 de-risk map.
