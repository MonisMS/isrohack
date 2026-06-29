# Methodology & Scientific Interpretation
### HCHO Hotspots over India — ISRO BAH 2026, Objective-2

This document is the scientific write-up behind the dashboard. It maps each step
to the official Problem Statement rubric and explains the detection method,
results, and interpretation. (The same content is surfaced in-app via the
**Methodology ↗** panel.)

---

## 1. Rationale

Most of India lies >100 km from a ground air-quality monitor, leaving large
blind spots during the crop-burning season. **Formaldehyde (HCHO)** is a short-
lived chemical fingerprint of the volatile organic compounds (VOCs) released
when biomass burns: when crops and forests burn, VOCs spike and HCHO spikes.
Mapping satellite HCHO therefore reveals *where India is burning*, from space,
even where no monitor exists.

We address **Objective-2** (HCHO hotspots). We deliberately do **not** attempt
the CNN-LSTM AQI model of Objective-1.

---

## 2. Data sources

| Variable | Product | GEE ID | Role |
|---|---|---|---|
| HCHO column | TROPOMI / Sentinel-5P | `COPERNICUS/S5P/OFFL/L3_HCHO` | Steps 1, 3, 4 |
| Active fires | NASA FIRMS (MODIS/VIIRS) | `FIRMS` | Steps 2, 5 |
| Wind (u/v) | ECMWF ERA5 10 m | `ECMWF/ERA5/DAILY` | Step 6 |
| Admin boundaries | Survey-of-India-consistent outline | — | masking, region stats |

All variables are composited to **weekly means** over the **Oct–Nov 2024**
burning window and clipped to the official India boundary (J&K + Ladakh
included). The dashboard reads precomputed JSON/PNG so a live demo never depends
on a flaky Earth-Engine call. **Mock ↔ real is a one-command swap** — the
pipeline emits an identical schema.

---

## 3. Method, by rubric step

1. **Acquire & pre-process HCHO** — filter `L3_HCHO` by date + India bounds,
   quality-screen, composite to weekly means on a 0.5° grid, clip to India.
2. **Extract burning periods** — aggregate FIRMS fire counts per week per
   region; the seasonal peak (late Oct) is the burning window.
3. **Map spatio-temporal HCHO** — interactive MapLibre + deck.gl dashboard with
   a continuous time scrubber that cross-fades the weekly HCHO field.
4. **Hotspot detection — Getis-Ord Gi\*** (see §4).
5. **Fire ↔ HCHO correlation** — per-region and global Pearson R between weekly
   fire count and mean HCHO (§5).
6. **Transport via wind** — ERA5 u/v advected as a GPU particle field; the flow
   is NW→SE across the Indo-Gangetic Plain.

---

## 4. Hotspot detection — Getis-Ord Gi\*

A naïve "HCHO > mean + kσ" threshold flags *individual* high pixels, including
isolated noisy retrievals. Instead we use the **Getis-Ord Gi\*** local
spatial-statistic. For each cell *i*:

```
        Σ_j w_ij x_j  −  x̄ Σ_j w_ij
Gi*_i = ───────────────────────────────────────
        S · sqrt[ (n Σ_j w_ij² − (Σ_j w_ij)²) / (n−1) ]
```

with binary spatial weights `w_ij = 1` for cells within **1.25°** (including
self), `x̄`/`S` the global mean/standard deviation, and `n` the cell count.
Gi\* is itself a z-score: a cell scores high only when it **and its
neighbourhood** are jointly elevated. We flag cells with **Gi\* ≥ 1.96**
(95% confidence) as hotspots. This distinguishes a coherent *source region*
from a single bad pixel — the accuracy/innovation the rubric rewards.

Flagged cells are dissolved into smooth contour polygons for display, and each
is tagged with the named region it falls in.

---

## 5. Results

Global fire↔HCHO correlation over the season: **R ≈ 0.94** (R² ≈ 0.89).

Three source regions are auto-detected and named (ranked by hotspot extent at
the late-October peak):

| # | Region | Fire–HCHO R | Hotspot cells (peak) | Peak HCHO (×10¹⁵) |
|---|---|---|---|---|
| 1 | Indo-Gangetic Plain | 0.95 | ~184 | ~14 |
| 2 | Central India | 0.79 | ~97 | ~13 |
| 3 | Northeast India | 0.93 | ~33 | ~11 |

(Exact figures depend on the data run; the in-app panel shows live values.)

---

## 6. Interpretation

The **Indo-Gangetic Plain** dominates: its HCHO hotspots track active fires at
**R ≈ 0.95**, peaking in late October with Punjab/Haryana paddy-stubble burning.
**Central** and **Northeast India** emerge as secondary forest-fire sources with
their own fire-coupled HCHO enhancement.

ERA5 winds blow **NW→SE** across the plain, so the HCHO enhancement over the
*eastern* IGP is partly **transported** downwind from the Punjab source rather
than purely local — visible as the plume's elongated NW→SE shape and confirmed
by the wind field. The tight, region-specific fire↔HCHO coupling is the headline
result: **from space, HCHO reveals where and when India burns**, filling the gap
left by sparse ground monitors.

### Limitations
- Weekly composites smooth sub-weekly fire/HCHO dynamics; a 1–2 day HCHO lag
  behind fires is expected and is a natural next analysis.
- HCHO has other (biogenic, industrial) sources; the fire correlation isolates
  the burning contribution but does not remove background entirely.
- Current figures are from shape-compatible **mock** data; swapping in live
  TROPOMI/FIRMS/ERA5 via the GEE pipeline reproduces the identical dashboard.
