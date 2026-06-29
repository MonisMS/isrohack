"""
gee_pipeline.py  -  REAL satellite pipeline (Google Earth Engine)
=================================================================
Produces the SAME export files as generate_mock_data.py, but from real
satellite observations. Run this once you have a Google Earth Engine account.

Covers Objective-2 steps of the ISRO BAH PS:
  1. Acquire & pre-process satellite HCHO column data   -> hcho_grid.json
  2. Extract biomass-burning periods (fire counts)      -> fires.json (+region_counts)
  4. Identify hotspots — Getis-Ord Gi* (shared logic)   -> hotspots.json
  4b. Auto-detect & name source regions + per-region R  -> regions.json
  5. Fire <-> HCHO correlation                          -> correlation.json
  6. Transport via ERA5 wind                            -> wind.json
(Step 3 = the spatio-temporal map = the frontend.)

Hotspot detection, region naming and the derived-asset bake are SHARED with
generate_mock_data.py via pipeline_common.py, so this emits the identical
schema — the dashboard cannot tell mock from real.

The static official boundary files (india.geojson, india_states.geojson) are
NOT regenerated here — they are the same for mock and real.

SETUP (one time):
    pip install -r requirements-gee.txt
    earthengine authenticate
    export EE_PROJECT=your-gee-project-id   # or edit the default below

RUN (single command — also bakes hotspot blobs, IGP shape, wind textures):
    python gee_pipeline.py
    # writes everything into ../backend/exports/  (same files the dashboard reads)

NOTE: band names / collection ids are current as of 2024 but GEE occasionally
renames things - if a band errors, print the image bandNames() to verify.
"""
import json
import os

import ee

from pipeline_common import (REGIONS, region_of, gi_hotspots,
                             build_regions_doc, bake_overlays)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "backend", "exports"))
os.makedirs(OUT, exist_ok=True)

EE_PROJECT = os.environ.get("EE_PROJECT", "your-gee-project-id")

# --- Config (keep in sync with generate_mock_data.py) -----------------------
DATES = ["2024-10-01", "2024-10-08", "2024-10-15", "2024-10-22",
         "2024-10-29", "2024-11-05", "2024-11-12", "2024-11-19"]
STEP = 0.5
LON_MIN, LON_MAX, LAT_MIN, LAT_MAX = 68.0, 98.0, 7.0, 37.0
IGP = {"name": "Indo-Gangetic Plain", "lon": [73.5, 88.5], "lat": [25.0, 31.5]}
FIRE_BOX = {"lon": [74.0, 77.2], "lat": [29.0, 31.6]}
HCHO_SCALE = 1e15 / 6.022e19  # mol/m2 -> 1e15 molec/cm2  (Avogadro, m2->cm2)


def init():
    ee.Initialize(project=EE_PROJECT)
    print("GEE initialised, project:", EE_PROJECT)


def india_geom():
    fc = (ee.FeatureCollection("FAO/GAUL/2015/level0")
          .filter(ee.Filter.eq("ADM0_NAME", "India")))
    return fc.geometry()


def week_bounds(date_str):
    start = ee.Date(date_str)
    return start, start.advance(7, "day")


def build_grid():
    """A FeatureCollection of 0.5-deg cell-centre points covering India bbox.
    reduceRegions samples the image mean at each (used as the cell grid)."""
    pts = []
    lo = LON_MIN
    while lo <= LON_MAX + 1e-9:
        la = LAT_MIN
        while la <= LAT_MAX + 1e-9:
            pts.append(ee.Feature(ee.Geometry.Point([round(lo, 3), round(la, 3)]),
                                  {"lon": round(lo, 3), "lat": round(la, 3)}))
            la += STEP
        lo += STEP
    return ee.FeatureCollection(pts)


# --- Step 1: HCHO column grid per week --------------------------------------
def export_hcho(grid, region):
    band = "tropospheric_HCHO_column_number_density"
    coll = ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_HCHO").select(band)

    cells, values = None, {}
    for d in DATES:
        s, e = week_bounds(d)
        img = coll.filterDate(s, e).mean().multiply(HCHO_SCALE).rename("hcho")
        sampled = img.reduceRegions(
            collection=grid, reducer=ee.Reducer.mean(), scale=7000
        ).getInfo()
        rows = [(f["properties"]["lon"], f["properties"]["lat"],
                 f["properties"].get("hcho")) for f in sampled["features"]]
        rows = [r for r in rows if r[2] is not None]
        if cells is None:
            cells = [[lon, lat] for lon, lat, _ in rows]
        values[d] = [round(float(v), 2) for _, _, v in rows]
        print(f"  HCHO {d}: {len(values[d])} cells")

    allv = [v for d in DATES for v in values[d]]
    out = {"dates": DATES, "step": STEP, "unit": "1e15 molecules/cm2",
           "vmin": round(min(allv), 2), "vmax": round(sorted(allv)[int(0.99 * len(allv))], 2),
           "cells": cells, "values": values}
    json.dump(out, open(os.path.join(OUT, "hcho_grid.json"), "w"))
    return out


# --- Step 2: active fires per week ------------------------------------------
def _region_box_geom(box):
    return ee.Geometry.Rectangle([box["lon"][0], box["lat"][0], box["lon"][1], box["lat"][1]])


def export_fires(region):
    # FIRMS is a daily raster fire mask; count fire pixels per week as a proxy.
    # We also count per named region (for per-region correlation) and carry a
    # rough FRP estimate from the T21 brightness temperature for marker sizing.
    coll = ee.ImageCollection("FIRMS").select("T21")
    counts, points, region_counts = {}, {}, {}
    region_geoms = {r["short"]: _region_box_geom(r["box"]) for r in REGIONS}
    for d in DATES:
        s, e = week_bounds(d)
        weekly = coll.filterDate(s, e)
        masked = weekly.count().gt(0).selfMask()
        n = masked.reduceRegion(ee.Reducer.count(), region, 1000,
                                maxPixels=1e10).get("T21").getInfo()
        counts[d] = int(n or 0)
        # per-region fire counts
        rc = {}
        for short, g in region_geoms.items():
            rn = masked.reduceRegion(ee.Reducer.count(), g, 1000, maxPixels=1e10).get("T21").getInfo()
            rc[short] = int(rn or 0)
        region_counts[d] = rc
        # vectorise a sample of fire pixels to points (carry mean T21 -> pseudo-FRP)
        t21 = weekly.mean().rename("t21")
        vec = (masked.addBands(t21).reduceToVectors(
            geometry=region, scale=2000, maxPixels=1e10, geometryType="centroid",
            reducer=ee.Reducer.mean()).limit(550))
        feats = vec.getInfo()["features"]
        pts = []
        for f in feats:
            lon, lat = f["geometry"]["coordinates"]
            t = f["properties"].get("t21") or 320.0
            frp = round(max(5.0, (float(t) - 300.0) * 1.8), 1)   # rough MW proxy
            pts.append([round(lon, 3), round(lat, 3), frp])
        points[d] = pts
        print(f"  fires {d}: count~{counts[d]}, per-region {rc}, sampled {len(pts)} pts")
    out = {"dates": DATES, "counts": counts, "points": points, "region_counts": region_counts}
    json.dump(out, open(os.path.join(OUT, "fires.json"), "w"))
    return out


# --- Step 4: hotspots (Getis-Ord Gi*, shared with the mock pipeline) ---------
def export_hotspots(hcho):
    out = gi_hotspots(hcho["cells"], hcho["values"], DATES, STEP)
    json.dump(out, open(os.path.join(OUT, "hotspots.json"), "w"))
    print(f"  Gi* hotspot cells: {len(out['features'])}")
    return out


# --- Step 5: correlation ----------------------------------------------------
def export_correlation(hcho, fires):
    import statistics
    series = []
    for d in DATES:
        vs = [val for (lon, lat), val in zip(hcho["cells"], hcho["values"][d])
              if IGP["lon"][0] <= lon <= IGP["lon"][1] and IGP["lat"][0] <= lat <= IGP["lat"][1]]
        series.append({"date": d, "hcho": round(statistics.mean(vs), 2),
                       "fire_count": fires["counts"][d]})
    fc = [s["fire_count"] for s in series]
    hc = [s["hcho"] for s in series]
    n = len(fc)
    mfc, mhc = sum(fc) / n, sum(hc) / n
    cov = sum((a - mfc) * (b - mhc) for a, b in zip(fc, hc))
    sfc = sum((a - mfc) ** 2 for a in fc) ** 0.5
    shc = sum((b - mhc) ** 2 for b in hc) ** 0.5
    r = cov / (sfc * shc) if sfc and shc else 0.0
    slope = cov / (sfc ** 2) if sfc else 0.0
    out = {"points": series, "pearson_r": round(r, 3), "r_squared": round(r * r, 3),
           "slope": slope, "intercept": mhc - slope * mfc,
           "x_label": "Active fire count (per week)",
           "y_label": "Mean HCHO over IGP (1e15 molec/cm2)"}
    json.dump(out, open(os.path.join(OUT, "correlation.json"), "w"))
    json.dump({"region": "indo-gangetic-plain", "unit": "1e15 molecules/cm2",
               "series": series}, open(os.path.join(OUT, "hcho.json"), "w"), indent=2)
    return out


# --- Step 6: ERA5 wind ------------------------------------------------------
def export_wind(region):
    bands = ["u_component_of_wind_10m", "v_component_of_wind_10m"]
    coll = ee.ImageCollection("ECMWF/ERA5/DAILY").select(bands)
    import math
    grid = []
    lo = 73.0
    while lo < 89.0:
        la = 25.0
        while la < 32.0:
            grid.append(ee.Feature(ee.Geometry.Point([round(lo, 2), round(la, 2)])))
            la += 1.0
        lo += 1.5
    gfc = ee.FeatureCollection(grid)
    vectors = {}
    for d in DATES:
        s, e = week_bounds(d)
        img = coll.filterDate(s, e).mean()
        sampled = img.reduceRegions(gfc, ee.Reducer.mean(), 25000).getInfo()
        vv = []
        for f in sampled["features"]:
            p = f["properties"]
            u, v_ = p.get(bands[0]), p.get(bands[1])
            if u is None or v_ is None:
                continue
            lon, lat = f["geometry"]["coordinates"]
            speed = round(math.hypot(u, v_), 2)
            bearing = round((math.degrees(math.atan2(u, v_)) + 360) % 360, 1)
            vv.append([round(lon, 2), round(lat, 2), round(u, 2), round(v_, 2), speed, bearing])
        vectors[d] = vv
        print(f"  wind {d}: {len(vv)} vectors")
    out = {"dates": DATES, "vectors": vectors}
    json.dump(out, open(os.path.join(OUT, "wind.json"), "w"))
    return out


def export_meta(hcho):
    weights = {d: sum(hcho["values"][d]) / len(hcho["values"][d]) for d in DATES}
    peak = max(weights, key=weights.get)
    meta = {"title": "HCHO Hotspots over India - 2024 Burning Season",
            "source": "Google Earth Engine (TROPOMI / FIRMS / ERA5)",
            "dates": DATES, "bbox": [LON_MIN, LAT_MIN, LON_MAX, LAT_MAX],
            "center": [80.0, 23.0], "step": STEP, "n_cells": len(hcho["cells"]),
            "regions": {"igp": IGP, "fire_box": FIRE_BOX},
            "hcho_unit": "1e15 molecules/cm2", "peak_date": peak,
            "datasets": {"hcho_grid": "COPERNICUS/S5P/OFFL/L3_HCHO",
                         "fires": "FIRMS", "wind": "ECMWF/ERA5/DAILY"}}
    json.dump(meta, open(os.path.join(OUT, "meta.json"), "w"), indent=2)
    # NOTE: india.geojson + india_states.geojson are STATIC official boundary
    # assets (same for mock & real) already in exports/ — we deliberately do NOT
    # overwrite them here (GAUL would lose the official J&K/Ladakh extent).


def main():
    init()
    region = india_geom()
    grid = build_grid()
    print("Step 1: HCHO ...");        hcho = export_hcho(grid, region)
    print("Step 2: fires ...");       fires = export_fires(region)
    print("Step 4: Gi* hotspots ..."); hotspots = export_hotspots(hcho)
    print("Step 5: correlation ..."); corr = export_correlation(hcho, fires)
    print("Step 6: wind ...");        export_wind(region)
    export_meta(hcho)

    # auto-detect & name source regions + per-region R (shared logic). Real
    # HCHO is already noisy, so no synthetic noise is added (noise=None).
    peak = max(DATES, key=lambda d: sum(hcho["values"][d]) / len(hcho["values"][d]))
    _, per_region = build_regions_doc(hcho["cells"], hcho["values"], fires, DATES, hotspots, peak)
    corr["per_region"] = per_region
    json.dump(corr, open(os.path.join(OUT, "correlation.json"), "w"))

    print("Baking overlays (hotspot blobs, IGP shape, wind textures)...")
    bake_overlays()
    print("DONE -> wrote real-data exports into", OUT)


if __name__ == "__main__":
    main()
