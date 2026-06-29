"""
pipeline_common.py — shared science for BOTH the mock and the real GEE pipeline.
==============================================================================
Keeping hotspot detection, region naming and the overlay bake in one place is
what makes the mock <-> real swap truly drop-in: both producers emit byte-for-
byte the same schema, because they call the same functions here.
"""
import json
import math
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "backend", "exports"))

# Named source regions the Gi* detector should auto-find & label.
REGIONS = [
    {"name": "Indo-Gangetic Plain", "short": "IGP",
     "box": {"lon": [73.5, 88.5], "lat": [24.5, 31.5]}, "anchor": [80.5, 27.6]},
    {"name": "Central India", "short": "Central",
     "box": {"lon": [78.0, 84.5], "lat": [18.5, 24.4]}, "anchor": [81.0, 21.2]},
    {"name": "Northeast India", "short": "NE",
     "box": {"lon": [89.5, 97.0], "lat": [22.0, 28.5]}, "anchor": [93.6, 25.6]},
]

GI_RADIUS = 1.25   # Gi* neighbourhood radius (degrees)
GI_Z = 1.96        # 95% confidence


def region_of(lon, lat):
    for r in REGIONS:
        b = r["box"]
        if b["lon"][0] <= lon <= b["lon"][1] and b["lat"][0] <= lat <= b["lat"][1]:
            return r["short"]
    return None


def gi_hotspots(cells, grid_values, dates, step=0.5, radius=GI_RADIUS, zthr=GI_Z):
    """Getis-Ord Gi* hotspot detection over a 0.5deg cell grid, per date.
    Returns GeoJSON features (square cells) tagged with gi_z + region."""
    coords = np.array(cells, dtype=float)
    n = len(coords)
    dx = coords[:, 0][:, None] - coords[:, 0][None, :]
    dy = coords[:, 1][:, None] - coords[:, 1][None, :]
    W = (np.hypot(dx, dy) <= radius).astype(float)        # binary weights incl. self
    sum_w = W.sum(1)
    sum_w2 = (W * W).sum(1)
    half = step / 2.0

    feats = []
    for d in dates:
        x = np.array(grid_values[d], dtype=float)
        xbar = x.mean()
        S = math.sqrt(max((x * x).mean() - xbar ** 2, 1e-12))
        num = (W @ x) - xbar * sum_w
        den = S * np.sqrt((n * sum_w2 - sum_w ** 2) / (n - 1))
        gi = np.divide(num, den, out=np.zeros_like(num), where=den > 0)
        for i, (lon, lat) in enumerate(cells):
            if gi[i] >= zthr:
                feats.append({
                    "type": "Feature",
                    "properties": {"date": d, "hcho": round(float(x[i]), 2),
                                   "gi_z": round(float(gi[i]), 2),
                                   "z": round(float(gi[i]), 2),
                                   "region": region_of(lon, lat) or "Other"},
                    "geometry": {"type": "Polygon", "coordinates": [[
                        [lon - half, lat - half], [lon + half, lat - half],
                        [lon + half, lat + half], [lon - half, lat + half],
                        [lon - half, lat - half]]]},
                })
    return {"type": "FeatureCollection",
            "method": f"Getis-Ord Gi* (95% confidence, |z|>={zthr})", "features": feats}


def region_mean(cells, values, box):
    vs = [v for (lo, la), v in zip(cells, values)
          if box["lon"][0] <= lo <= box["lon"][1] and box["lat"][0] <= la <= box["lat"][1]]
    return float(np.mean(vs)) if vs else 0.0


def build_regions_doc(cells, grid_values, fires, dates, hotspots, peak_date, noise=None):
    """Per-region stats + fire<->HCHO correlation. `noise` is an optional
    callable() -> float added to each weekly HCHO mean (mock realism); real
    data passes None (already noisy)."""
    feats = hotspots["features"]
    out = []
    for r in REGIONS:
        short, box = r["short"], r["box"]
        fser = np.array([fires.get("region_counts", {}).get(d, {}).get(short, 0)
                         for d in dates], dtype=float)
        hser = np.array([region_mean(cells, grid_values[d], box) + (noise() if noise else 0.0)
                         for d in dates])
        rr = float(np.corrcoef(fser, hser)[0, 1]) if fser.std() > 0 and hser.std() > 0 else 0.0
        n_hot = sum(1 for f in feats
                    if f["properties"]["date"] == peak_date and f["properties"]["region"] == short)
        out.append({"name": r["name"], "short": short, "box": box, "anchor": r["anchor"],
                    "detected": n_hot > 0, "peak_date": peak_date, "peak_hotspot_cells": n_hot,
                    "mean_hcho_peak": round(region_mean(cells, grid_values[peak_date], box), 2),
                    "peak_fires": int(fires.get("region_counts", {}).get(peak_date, {}).get(short, 0)),
                    "pearson_r": round(rr, 3)})
    out.sort(key=lambda x: x["peak_hotspot_cells"], reverse=True)
    for i, r in enumerate(out):
        r["rank"] = i + 1
    doc = {"method": "Getis-Ord Gi* (95% confidence) over weekly HCHO composites",
           "detected_at": peak_date, "regions": out}
    json.dump(doc, open(os.path.join(OUT, "regions.json"), "w"), indent=2)
    per_region = [{"name": r["name"], "short": r["short"], "pearson_r": r["pearson_r"]} for r in out]
    return doc, per_region


def bake_overlays():
    """Run the derived-asset bakes (dissolved hotspot blobs, IGP region shape,
    wind U/V textures) so ONE command regenerates everything the frontend reads."""
    for script in ("gen_overlays.py", "gen_wind_textures.py"):
        print(f"  baking {script} ...")
        subprocess.run([sys.executable, os.path.join(HERE, script)], check=True)
