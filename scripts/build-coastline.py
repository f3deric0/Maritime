#!/usr/bin/env python3
"""
build-coastline.py

Regenerates assets/data/coastline.json — the real (simplified) coastline
outline drawn behind the Fleet Watch map on insights.html. World scale:
covers every chokepoint in assets/data/chokepoints.json, from the Bering
Strait to the Drake Passage.

Source: Natural Earth 50m Coastline (public domain, no attribution
required — https://www.naturalearthdata.com/about/terms-of-use/), fetched
from the nvkelso/natural-earth-vector GitHub mirror as plain GeoJSON.

50m, not 110m: the coarser 110m tier can't resolve narrow straits at all
(Gibraltar is 14km wide, the Bosphorus under 1km) — they show as solid,
unbroken coastline with no visible water gap, so a correctly-placed
chokepoint marker looks like it's sitting on land. 50m is still coarse by
design (illustrative "engraved chart" style, see design.md, not a
navigation chart, and still a small bundled asset — no CDN mapping
library, see CLAUDE.md's no-dependency rule) but is enough to show real
gaps at the chokepoints this map is actually about.

Usage:
    python3 scripts/build-coastline.py
"""
import json
import math
import urllib.request
import os

SRC_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_coastline.geojson"
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "data", "coastline.json")

# World scale — trimmed at the poles (nothing chokepoint-relevant happens
# above ~78N or below ~62S) to keep the polyline payload down.
LON_MIN, LON_MAX = -180.0, 180.0
LAT_MIN, LAT_MAX = -62.0, 78.0
MARGIN = 1.0  # degrees kept just outside the crop so lines don't dead-end abruptly

# Douglas-Peucker tolerance, in degrees (~1.3km at the equator). Thinout
# nearly-straight runs of points while keeping crisp bays, gulfs, and straits.
SIMPLIFY_EPSILON_DEG = 0.012


def in_bounds(lon, lat, margin=MARGIN):
    return (LON_MIN - margin) <= lon <= (LON_MAX + margin) and (LAT_MIN - margin) <= lat <= (LAT_MAX + margin)


def clip_linestring(coords):
    """Split a LineString's points into runs that stay within bounds,
    so a line that leaves and re-enters the region doesn't get drawn as
    one long incorrect jump across the map."""
    runs = []
    current = []
    for lon, lat in coords:
        if in_bounds(lon, lat):
            current.append([round(lon, 3), round(lat, 3)])
        else:
            if len(current) >= 2:
                runs.append(current)
            current = []
    if len(current) >= 2:
        runs.append(current)
    return runs


def perpendicular_distance(pt, start, end):
    if start == end:
        return math.hypot(pt[0] - start[0], pt[1] - start[1])
    x0, y0 = pt
    x1, y1 = start
    x2, y2 = end
    num = abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1)
    den = math.hypot(y2 - y1, x2 - x1)
    return num / den


def simplify(points, epsilon):
    """Iterative Douglas-Peucker (stack-based, not recursive — some
    coastline features have thousands of points and would blow Python's
    recursion limit)."""
    if len(points) < 3:
        return points[:]
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start_idx, end_idx = stack.pop()
        if end_idx <= start_idx + 1:
            continue
        start, end = points[start_idx], points[end_idx]
        dmax, idx = 0.0, start_idx
        for i in range(start_idx + 1, end_idx):
            d = perpendicular_distance(points[i], start, end)
            if d > dmax:
                dmax, idx = d, i
        if dmax > epsilon:
            keep[idx] = True
            stack.append((start_idx, idx))
            stack.append((idx, end_idx))
    return [points[i] for i in range(len(points)) if keep[i]]


def main():
    print(f"Fetching {SRC_URL} ...")
    with urllib.request.urlopen(SRC_URL, timeout=30) as r:
        gj = json.load(r)

    polylines = []
    for feature in gj["features"]:
        geom = feature["geometry"]
        if geom["type"] == "LineString":
            polylines.extend(clip_linestring(geom["coordinates"]))
        elif geom["type"] == "MultiLineString":
            for line in geom["coordinates"]:
                polylines.extend(clip_linestring(line))

    polylines = [simplify(line, SIMPLIFY_EPSILON_DEG) for line in polylines]

    out = {
        "meta": {
            "source": "Natural Earth 50m Coastline (public domain)",
            "sourceUrl": "https://www.naturalearthdata.com/downloads/50m-physical-vectors/",
            "note": "Simplified/cropped/Douglas-Peucker-thinned by scripts/build-coastline.py — illustrative, not navigational.",
        },
        "bbox": {"lonMin": LON_MIN, "lonMax": LON_MAX, "latMin": LAT_MIN, "latMax": LAT_MAX},
        "polylines": polylines,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))

    size_kb = os.path.getsize(OUT) / 1024
    print(f"Wrote {OUT} — {len(polylines)} polylines, {size_kb:.1f} KB")


if __name__ == "__main__":
    main()
