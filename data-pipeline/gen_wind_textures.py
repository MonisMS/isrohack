"""
Bake ERA5 wind vectors -> U/V texture PNGs for the GPU particle layer.
=====================================================================
weatherlayers-gl ParticleLayer advects particles across a raster where
R = u-component, G = v-component (both unscaled via `imageUnscale`).

We IDW-interpolate the sparse per-date vectors onto a regular grid and
write one PNG per date plus exports/wind_meta.json (bounds + unscale).

Swap-in note: a real ERA5 GRIB->PNG step lands here unchanged — same
output contract (PNG R=u, G=v, wind_meta.json), so the frontend is blind
to mock-vs-real.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

EXPORTS = Path(__file__).resolve().parent.parent / "backend" / "exports"
OUT = EXPORTS / "wind"
OUT.mkdir(exist_ok=True)

# texture grid + value encoding range (shared for u and v)
W, H = 320, 200
UNSCALE = (-12.0, 12.0)
# Cover the whole northern plain + central India (particles are clipped to the
# India polygon by the map's inverse mask, so the rectangle never shows).
BOUNDS = (69.0, 23.0, 89.0, 33.5)   # [w, s, e, n] — focused on the northern plain
CURL_AMP = 2.1                       # organic swirl strength (m/s)
# Alpha = no-data mask: particles only spawn where wind is fast, so density
# follows the flow (negative space where it's slow). Tuned to the field mag.
MASK_LO, MASK_HI = 3.8, 6.0          # m/s: below LO = empty, above HI = full


def idw(px, py, xs, ys, vals, power=2.0, eps=1e-6):
    """Inverse-distance-weighted sample of scattered vals at grid (px,py)."""
    # px:(H,W,1) ys/xs:(N,) -> distances (H,W,N)
    dx = px[..., None] - xs
    dy = py[..., None] - ys
    d2 = dx * dx + dy * dy + eps
    w = 1.0 / d2 ** (power / 2)
    return (w * vals).sum(-1) / w.sum(-1)


def main():
    data = json.load(open(EXPORTS / "wind.json"))
    dates = list(data["vectors"].keys())

    west, south, east, north = BOUNDS

    # grid cell centres; row 0 = north (image top-left = west/north)
    gx = np.linspace(west, east, W)
    gy = np.linspace(north, south, H)
    px, py = np.meshgrid(gx, gy)  # (H,W)

    # Divergence-free curl from a stream function ψ, so the base NW→SE flow
    # bends into organic swirls instead of reading as straight "rain".
    Lx, Ly = east - west, north - south
    a1, b1 = 2 * np.pi * 1.4 / Lx, 2 * np.pi * 1.1 / Ly
    a2, b2 = 2 * np.pi * 0.7 / Lx, 2 * np.pi * 1.7 / Ly
    sx, sy = (px - west), (py - south)
    # ψ = sin(a1 x)cos(b1 y) + 0.6 sin(a2 x + 1)cos(b2 y)
    u_curl = CURL_AMP * (
        -b1 * np.sin(a1 * sx) * np.sin(b1 * sy)
        - 0.6 * b2 * np.sin(a2 * sx + 1) * np.sin(b2 * sy)
    ) / max(b1, 1e-6)
    v_curl = -CURL_AMP * (
        a1 * np.cos(a1 * sx) * np.cos(b1 * sy)
        + 0.6 * a2 * np.cos(a2 * sx + 1) * np.cos(b2 * sy)
    ) / max(a1, 1e-6)

    lo, hi = UNSCALE
    for date in dates:
        v = np.array(data["vectors"][date])
        xs, ys, us, vs = v[:, 0], v[:, 1], v[:, 2], v[:, 3]
        u = idw(px, py, xs, ys, us) + u_curl
        w = idw(px, py, xs, ys, vs) + v_curl

        def enc(a):
            return np.clip((a - lo) / (hi - lo) * 255.0, 0, 255).astype(np.uint8)

        mag = np.sqrt(u * u + w * w)
        # smoothstep(LO, HI, mag) -> alpha mask (density follows wind speed)
        s = np.clip((mag - MASK_LO) / (MASK_HI - MASK_LO), 0, 1)
        alpha = (s * s * (3 - 2 * s) * 255).astype(np.uint8)

        rgba = np.zeros((H, W, 4), np.uint8)
        rgba[..., 0] = enc(u)            # R = u
        rgba[..., 1] = enc(w)            # G = v
        rgba[..., 3] = alpha             # A = no-data mask by speed
        Image.fromarray(rgba, "RGBA").save(OUT / f"{date}.png")

    meta = {
        "bounds": [float(west), float(south), float(east), float(north)],   # [w, s, e, n]
        "imageUnscale": [lo, hi],
        "width": W, "height": H,
        "dates": dates,
        "url": "/exports/wind/{date}.png",
    }
    json.dump(meta, open(EXPORTS / "wind_meta.json", "w"), indent=1)
    print(f"wrote {len(dates)} wind textures -> {OUT}")
    print("bounds", meta["bounds"], "unscale", meta["imageUnscale"])


if __name__ == "__main__":
    main()
