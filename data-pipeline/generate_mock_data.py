"""
generate_mock_data.py
----------------------
Produces realistic *mock* exports for the HCHO-hotspots dashboard, geographically
shaped over India for the Oct-Nov 2024 crop-burning season.

This is a STAND-IN for the real Google Earth Engine pipeline (01_hcho.py etc.).
It emits the exact same JSON schema, so the backend + frontend are identical
whether the data is mock or real satellite data. Swap in real data later by
running the GEE scripts, which write the same filenames into ../backend/exports/.

Output (written to ../backend/exports/):
  meta.json         dates, bbox, region boxes
  hcho_grid.json    per-date HCHO column over India (cell grid)
  fires.json        per-date active-fire points (MODIS/VIIRS-style)
  hotspots.json     GeoJSON hotspot polygons (statistical z-score), per date
  correlation.json  fire-count vs HCHO scatter + Pearson R
  wind.json         per-date wind vectors over the IGP (transport)
  hcho.json         IGP weekly time-series (kept for backward-compat)
  india.geojson     country outline (copied through for the map)
"""
import json
import math
import os
import numpy as np

from pipeline_common import (REGIONS, region_of, gi_hotspots,
                             build_regions_doc, bake_overlays)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "backend", "exports"))
os.makedirs(OUT, exist_ok=True)

rng = np.random.default_rng(42)  # deterministic, reproducible

# --- Time axis: weekly composites across the 2024 burning season ------------
DATES = ["2024-10-01", "2024-10-08", "2024-10-15", "2024-10-22",
         "2024-10-29", "2024-11-05", "2024-11-12", "2024-11-19"]
# Seasonal intensity weight per date (Punjab/Haryana stubble burning peaks
# late-Oct -> early-Nov). Drives both fire counts and HCHO enhancement.
WEIGHT = np.array([0.15, 0.28, 0.55, 0.82, 1.00, 0.88, 0.52, 0.30])

# India bounding box
LON_MIN, LON_MAX = 68.0, 98.0
LAT_MIN, LAT_MAX = 7.0, 37.0
STEP = 0.5  # grid resolution in degrees

# Region of interest: Indo-Gangetic Plain (the hero source region)
IGP = {"name": "Indo-Gangetic Plain", "lon": [73.5, 88.5], "lat": [25.0, 31.5]}
# Fire source box: Punjab + Haryana stubble fields
FIRE_BOX = {"lon": [74.0, 77.2], "lat": [29.0, 31.6]}

# Named source regions (REGIONS) + region_of come from pipeline_common so the
# mock and real GEE pipeline detect/label regions with identical logic.
# Fire source clusters (one per region) — count factor + point sampling box.
# NE peaks a touch later than the Punjab stubble window for realistic variation.
FIRE_SOURCES = [
    {"region": "IGP",     "box": {"lon": [74.0, 77.2], "lat": [29.0, 31.6]}, "factor": 3300, "shift": 0.0},
    {"region": "IGP",     "box": {"lon": [77.0, 83.0], "lat": [25.5, 29.0]}, "factor": 700,  "shift": 0.0},
    {"region": "Central", "box": {"lon": [79.0, 83.5], "lat": [20.0, 23.5]}, "factor": 950,  "shift": 0.1},
    {"region": "NE",      "box": {"lon": [91.0, 95.5], "lat": [24.0, 27.2]}, "factor": 720,  "shift": -0.18},
]


# --- India land mask (point-in-polygon ray casting) -------------------------
def load_india_ring():
    g = json.load(open(os.path.join(HERE, "india.geojson")))
    geom = g["features"][0]["geometry"]
    if geom["type"] == "Polygon":
        return geom["coordinates"][0]
    # MultiPolygon: take the largest ring (mainland)
    rings = [poly[0] for poly in geom["coordinates"]]
    return max(rings, key=len)


RING = load_india_ring()


def in_india(lon, lat):
    inside = False
    n = len(RING)
    j = n - 1
    for i in range(n):
        xi, yi = RING[i][0], RING[i][1]
        xj, yj = RING[j][0], RING[j][1]
        if ((yi > lat) != (yj > lat)) and \
           (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def gaussian(lon, lat, clon, clat, slon, slat):
    return math.exp(-(((lon - clon) ** 2) / (2 * slon ** 2) +
                      ((lat - clat) ** 2) / (2 * slat ** 2)))


# --- Build the masked cell grid (cells inside India only) -------------------
cells = []  # [lon, lat]
lons = np.arange(LON_MIN, LON_MAX + 1e-9, STEP)
lats = np.arange(LAT_MIN, LAT_MAX + 1e-9, STEP)
for la in lats:
    for lo in lons:
        if in_india(round(lo, 3), round(la, 3)):
            cells.append([round(float(lo), 3), round(float(la), 3)])
print(f"grid cells inside India: {len(cells)}")


def hcho_field(weight):
    """HCHO column (1e15 molec/cm2) for every cell at a given seasonal weight.
    Background + an elongated NW->SE plume from the Punjab source across the IGP,
    plus a small Central/NE-India biomass signal."""
    vals = []
    for lon, lat in cells:
        base = 5.0 + 1.2 * gaussian(lon, lat, 80, 22, 12, 10)  # mild continental bg
        # Elongated IGP plume: source ~Punjab (75.5,30.5), advected SE toward Bihar
        plume = 0.0
        for clon, clat, slon, slat, amp in [
            (75.8, 30.6, 1.6, 0.9, 26.0),   # Punjab/Haryana core
            (79.5, 28.3, 2.4, 1.1, 18.0),   # mid-IGP (Delhi/UP)
            (83.5, 26.2, 2.6, 1.2, 12.0),   # eastern IGP (Bihar)
        ]:
            plume += amp * gaussian(lon, lat, clon, clat, slon, slat)
        # Central India + NE forest-fire secondary source regions (real signal,
        # so the detector finds them too — not just the IGP)
        central = 13.0 * gaussian(lon, lat, 81.2, 21.4, 2.4, 1.9) * (0.4 + 0.6 * weight)
        ne = 11.0 * gaussian(lon, lat, 93.4, 25.7, 1.7, 1.5) * (0.3 + 0.7 * weight)
        noise = rng.normal(0, 0.6)
        v = base + weight * plume + central + ne + noise
        vals.append(round(float(max(0.5, v)), 2))
    return vals


# --- HCHO grid per date -----------------------------------------------------
grid_values = {}
for d, w in zip(DATES, WEIGHT):
    grid_values[d] = hcho_field(w)

all_vals = np.array([v for d in DATES for v in grid_values[d]])
vmin, vmax = float(all_vals.min()), float(np.percentile(all_vals, 99))

hcho_grid = {
    "dates": DATES,
    "step": STEP,
    "unit": "1e15 molecules/cm2",
    "vmin": round(vmin, 2),
    "vmax": round(vmax, 2),
    "cells": cells,                 # [lon,lat] aligned with each values array
    "values": grid_values,          # {date: [v, v, ...]}
}
json.dump(hcho_grid, open(os.path.join(OUT, "hcho_grid.json"), "w"))


# --- Fires per date (multi-source: IGP + Central + NE) ----------------------
fires = {"dates": DATES, "counts": {}, "points": {}, "region_counts": {}}
for di, (d, w) in enumerate(zip(DATES, WEIGHT)):
    # per-source counts with independent day-to-day variability so fire counts
    # are NOT a perfect function of the HCHO weight (keeps the R realistic, <1).
    src_counts = []
    region_counts = {r["short"]: 0 for r in REGIONS}
    for s in FIRE_SOURCES:
        # seasonal weight, optionally time-shifted per source
        sw = float(np.interp(di + s["shift"], range(len(WEIGHT)), WEIGHT))
        c = int(s["factor"] * sw * rng.uniform(0.78, 1.22))
        src_counts.append(c)
        region_counts[s["region"]] += c
    total = sum(src_counts)
    fires["counts"][d] = total
    fires["region_counts"][d] = region_counts

    # sample stored points proportionally across sources (cap payload)
    n_sample = min(total, 550)
    pts = []
    for s, c in zip(FIRE_SOURCES, src_counts):
        k = int(round(n_sample * c / max(total, 1)))
        for _ in range(k):
            lo = rng.uniform(*s["box"]["lon"])
            la = rng.uniform(*s["box"]["lat"])
            frp = round(float(abs(rng.normal(35, 25)) + 5), 1)  # fire radiative power MW
            pts.append([round(float(lo), 3), round(float(la), 3), frp])
    fires["points"][d] = pts
json.dump(fires, open(os.path.join(OUT, "fires.json"), "w"))


# --- Hotspots: Getis-Ord Gi* spatial-statistics detection (shared) ----------
hotspots = gi_hotspots(cells, grid_values, DATES, STEP)
hotspot_features = hotspots["features"]
json.dump(hotspots, open(os.path.join(OUT, "hotspots.json"), "w"))
print(f"Gi* hotspot cells total (all dates): {len(hotspot_features)}")


# --- IGP mean HCHO time-series + fire/HCHO correlation ----------------------
def igp_mean(d):
    vs = [val for (lon, lat), val in zip(cells, grid_values[d])
          if IGP["lon"][0] <= lon <= IGP["lon"][1] and IGP["lat"][0] <= lat <= IGP["lat"][1]]
    return float(np.mean(vs))


series = []
for d in DATES:
    # add retrieval/measurement noise to the regional HCHO mean (satellite
    # products are noisy: clouds, viewing geometry) -> realistic scatter.
    hcho_obs = igp_mean(d) + rng.normal(0, 1.7)
    series.append({"date": d, "hcho": round(hcho_obs, 2),
                   "fire_count": fires["counts"][d]})

fc = np.array([s["fire_count"] for s in series], dtype=float)
hc = np.array([s["hcho"] for s in series], dtype=float)
r = float(np.corrcoef(fc, hc)[0, 1])
slope, intercept = np.polyfit(fc, hc, 1)
correlation = {
    "points": series,
    "pearson_r": round(r, 3),
    "r_squared": round(r * r, 3),
    "slope": float(slope),
    "intercept": float(intercept),
    "x_label": "Active fire count (per week)",
    "y_label": "Mean HCHO over IGP (1e15 molec/cm2)",
}
json.dump(correlation, open(os.path.join(OUT, "correlation.json"), "w"))

# Backward-compat hcho.json (the file from the FastAPI tutorial)
json.dump({"region": "indo-gangetic-plain", "unit": "1e15 molecules/cm2",
           "series": series}, open(os.path.join(OUT, "hcho.json"), "w"), indent=2)


# --- Auto-detected source regions: per-region stats + correlation (shared) --
peak_d = DATES[int(np.argmax(WEIGHT))]
regions_doc, per_region = build_regions_doc(
    cells, grid_values, fires, DATES, hotspots, peak_d,
    noise=lambda: rng.normal(0, 0.7))   # mock realism; real data passes None
print("detected regions:", ", ".join(
    f"{r['short']}(R={r['pearson_r']},cells={r['peak_hotspot_cells']})" for r in regions_doc["regions"]))

correlation["per_region"] = per_region
json.dump(correlation, open(os.path.join(OUT, "correlation.json"), "w"))


# --- Wind vectors over the IGP (post-monsoon NW->SE transport) --------------
wind = {"dates": DATES, "vectors": {}}
wlons = np.arange(73.0, 89.0, 1.5)
wlats = np.arange(25.0, 32.0, 1.0)
for d, w in zip(DATES, WEIGHT):
    vecs = []
    for la in wlats:
        for lo in wlons:
            if not in_india(float(lo), float(la)):
                continue
            # NW-erly: blowing toward ESE -> u>0 (eastward), v<0 (southward)
            u = 3.2 + 0.8 * math.sin(lo / 5.0) + rng.normal(0, 0.3)
            v = -1.8 - 0.5 * math.cos(la / 4.0) + rng.normal(0, 0.3)
            speed = round(math.hypot(u, v), 2)
            bearing = round((math.degrees(math.atan2(u, v)) + 360) % 360, 1)
            vecs.append([round(float(lo), 2), round(float(la), 2),
                         round(float(u), 2), round(float(v), 2), speed, bearing])
    wind["vectors"][d] = vecs
json.dump(wind, open(os.path.join(OUT, "wind.json"), "w"))


# --- Meta -------------------------------------------------------------------
meta = {
    "title": "HCHO Hotspots over India - 2024 Burning Season",
    "source": "MOCK DATA (shape-compatible with GEE pipeline output)",
    "dates": DATES,
    "bbox": [LON_MIN, LAT_MIN, LON_MAX, LAT_MAX],
    "center": [80.0, 23.0],
    "step": STEP,
    "n_cells": len(cells),
    "regions": {"igp": IGP, "fire_box": FIRE_BOX},
    "hcho_unit": "1e15 molecules/cm2",
    "peak_date": DATES[int(np.argmax(WEIGHT))],
    "datasets": {
        "hcho_grid": "COPERNICUS/S5P/OFFL/L3_HCHO (TROPOMI)",
        "fires": "FIRMS MODIS/VIIRS active fire",
        "wind": "ECMWF/ERA5 10m u/v wind",
    },
}
json.dump(meta, open(os.path.join(OUT, "meta.json"), "w"), indent=2)

# copy the india outline through to where the backend/frontend can read it
json.dump(json.load(open(os.path.join(HERE, "india.geojson"))),
          open(os.path.join(OUT, "india.geojson"), "w"))

print("WROTE base exports:", ", ".join(sorted(os.listdir(OUT))))
print(f"Pearson R (fire vs HCHO) = {correlation['pearson_r']}, peak = {meta['peak_date']}")

# chain the derived-asset bakes so one command regenerates everything
print("Baking overlays (hotspot blobs, IGP shape, wind textures)...")
bake_overlays()
print("ALL DONE.")
