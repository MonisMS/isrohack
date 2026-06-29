"""
Bake map overlay geometries:
  - hotspots_merged.geojson : 0.5deg hotspot cells dissolved into SMOOTH blobs
                              (rounder than before, less staircase)
  - igp_region.geojson      : the real Indo-Gangetic Plain shape = union of its
                              constituent states (NOT a rectangle), for a soft glow
"""
import json
from collections import defaultdict
from pathlib import Path

from shapely.geometry import shape, mapping, Polygon, MultiPolygon
from shapely.ops import unary_union


def chaikin(ring, iters=3):
    """Chaikin corner-cutting: turns a stair-step ring into a flowing curve."""
    pts = ring[:-1] if ring[0] == ring[-1] else ring[:]
    for _ in range(iters):
        out = []
        n = len(pts)
        for i in range(n):
            p, q = pts[i], pts[(i + 1) % n]
            out.append((p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25))
            out.append((p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75))
        pts = out
    pts.append(pts[0])
    return pts


def smooth_poly(geom):
    """Apply Chaikin to every ring of a (Multi)Polygon."""
    polys = geom.geoms if geom.geom_type == "MultiPolygon" else [geom]
    out = []
    for poly in polys:
        ext = chaikin(list(poly.exterior.coords))
        holes = [chaikin(list(r.coords)) for r in poly.interiors]
        out.append(Polygon(ext, holes))
    return out[0] if len(out) == 1 else MultiPolygon(out)

EXPORTS = Path(__file__).resolve().parent.parent / "backend" / "exports"

# states that make up the Indo-Gangetic Plain (match india_states.geojson st_nm)
IGP_STATES = {
    "Punjab", "Haryana", "Chandigarh", "Delhi", "Uttar Pradesh",
    "Bihar", "Jharkhand", "West Bengal", "Uttarakhand",
}


def bake_hotspots():
    d = json.load(open(EXPORTS / "hotspots.json"))
    by_date = defaultdict(list)
    for f in d["features"]:
        by_date[f["properties"]["date"]].append(
            (shape(f["geometry"]).buffer(0), f["properties"]))

    feats = []
    for date, items in by_date.items():
        geoms = [g for g, _ in items]
        # round the cell staircase into a FLOWING contour: big round-join close
        # then open smooths both convex & concave corners. Keep simplify tiny so
        # the rounded arcs survive (a large tolerance straightens them back).
        merged = (unary_union(geoms)
                  .buffer(0.5, join_style=1, resolution=16)
                  .buffer(-0.62, join_style=1, resolution=16)
                  .buffer(0.14, join_style=1, resolution=16)
                  .simplify(0.04, preserve_topology=True))
        merged = smooth_poly(merged).simplify(0.01, preserve_topology=True)
        zmax = max(p.get("z", 0) for _, p in items)
        hmean = sum(p.get("hcho", 0) for _, p in items) / len(items)
        polys = merged.geoms if merged.geom_type == "MultiPolygon" else [merged]
        for poly in polys:
            if poly.is_empty:
                continue
            feats.append({"type": "Feature",
                          "properties": {"date": date, "z": round(zmax, 2), "hcho": round(hmean, 2)},
                          "geometry": mapping(poly)})
    out = {"type": "FeatureCollection", "method": d.get("method", ""), "features": feats}
    json.dump(out, open(EXPORTS / "hotspots_merged.geojson", "w"), separators=(",", ":"))
    print("hotspots_merged:", len(feats), "blobs")


def bake_igp_region():
    states = json.load(open(EXPORTS / "india_states.geojson"))
    geoms = [shape(f["geometry"]).buffer(0)
             for f in states["features"] if f["properties"]["st_nm"] in IGP_STATES]
    region = unary_union(geoms).buffer(0.1).buffer(-0.05).simplify(0.03, preserve_topology=True)
    out = {"type": "FeatureCollection",
           "features": [{"type": "Feature", "properties": {"name": "Indo-Gangetic Plain"},
                         "geometry": mapping(region)}]}
    json.dump(out, open(EXPORTS / "igp_region.geojson", "w"), separators=(",", ":"))
    print("igp_region: union of", len(geoms), "states")


if __name__ == "__main__":
    bake_hotspots()
    bake_igp_region()
