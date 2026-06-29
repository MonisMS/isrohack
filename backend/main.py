"""
ISRO BAH 2026 - HCHO Hotspots over India : backend API
=======================================================
Serves the precomputed satellite-data exports (mock or real GEE output) to the
React dashboard. Everything is read from ./exports/*.json.

Run:  uvicorn main:app --reload      (from the backend/ folder, venv active)
Docs: http://127.0.0.1:8000/docs

Design note: the dashboard reads STATIC precomputed JSON, so the demo never
depends on a live Earth Engine call. Re-run the data pipeline to refresh.
"""
import json
from pathlib import Path
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Resolve exports/ relative to THIS file, not the current working dir,
# so the server works no matter where uvicorn is launched from.
EXPORTS = Path(__file__).resolve().parent / "exports"

app = FastAPI(
    title="HCHO Hotspots over India",
    description="Satellite-derived HCHO, fires, hotspots, correlation & wind over India.",
    version="1.0.0",
)

# Allow the React dev/preview server on any localhost or 127.0.0.1 port.
# (regex avoids the localhost-vs-127.0.0.1 / port mismatch gotcha)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve raw export assets (e.g. the baked wind U/V texture PNGs) as static files.
if EXPORTS.exists():
    app.mount("/exports", StaticFiles(directory=str(EXPORTS)), name="exports")


# ---- helpers ---------------------------------------------------------------
def load(name: str):
    """Read exports/<name>.json (or .geojson) or raise a clean 404."""
    for ext in (".json", ".geojson"):
        p = EXPORTS / f"{name}{ext}"
        if p.exists():
            with open(p) as f:
                return json.load(f)
    raise HTTPException(status_code=404, detail=f"dataset '{name}' not found")


# ---- Pydantic models (typed time-series, gives /docs schema) ---------------
class SeriesPoint(BaseModel):
    date: str
    hcho: float
    fire_count: int


class HchoResponse(BaseModel):
    region: str
    unit: str
    series: List[SeriesPoint]


# ---- routes ----------------------------------------------------------------
@app.get("/")
def home():
    """Health check + list of available datasets."""
    files = sorted(p.stem for p in EXPORTS.glob("*.json")) if EXPORTS.exists() else []
    return {"status": "ok", "service": "HCHO backend", "datasets": files}


@app.get("/api/meta")
def meta():
    """Dates, bounding box, region boxes, peak date - the dashboard config."""
    return load("meta")


@app.get("/api/hcho-grid")
def hcho_grid():
    """Per-date HCHO column on a 0.5deg grid over India (the map heat layer)."""
    return load("hcho_grid")


@app.get("/api/fires")
def fires():
    """Per-date active-fire counts and sampled fire points."""
    return load("fires")


@app.get("/api/hotspots")
def hotspots():
    """GeoJSON hotspot polygons (statistical z-score > mean + 1.5 sigma)."""
    return load("hotspots")


@app.get("/api/correlation")
def correlation():
    """Fire-count vs HCHO scatter points + Pearson R."""
    return load("correlation")


@app.get("/api/wind")
def wind():
    """Per-date 10m wind vectors over the IGP (transport analysis)."""
    return load("wind")


@app.get("/api/india")
def india():
    """India country outline (GeoJSON) for the map basemap overlay."""
    return load("india")


@app.get("/api/hcho-data", response_model=HchoResponse)
def hcho_data():
    """IGP weekly HCHO time-series (typed). Validates against HchoResponse."""
    return load("hcho")


@app.get("/api/data/{dataset}")
def dataset(dataset: str):
    """Generic loader: serve any exports/<dataset>.json by name."""
    return load(dataset)
