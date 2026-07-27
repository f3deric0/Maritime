#!/usr/bin/env python3
"""
build-coastline.py

Regenerates assets/data/coastline.json — the real (simplified) coastline
outline drawn behind the Fleet Watch map on insights.html. World scale:
covers every chokepoint in assets/data/chokepoints.json, from the Bering
Strait to the Drake Passage.

Source: Natural Earth 110m Coastline (public domain, no attribution
required — https://www.naturalearthdata.com/about/terms-of-use/), fetched
from the nvkelso/natural-earth-vector GitHub mirror as plain GeoJSON.

This is a coarse (110m) resolution on purpose: the map is illustrative
("engraved chart" style, see design.md), not a navigation chart, and the
whole point is keeping the bundled asset tiny (no CDN mapping library —
see CLAUDE.md's no-dependency rule).

Usage:
    python3 scripts/build-coastline.py
"""
import json
import urllib.request
import os

SRC_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_coastline.geojson"
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "data", "coastline.json")

# World scale — trimmed at the poles (nothing chokepoint-relevant happens
# above ~78N or below ~62S) to keep the polyline payload down.
LON_MIN, LON_MAX = -180.0, 180.0
LAT_MIN, LAT_MAX = -62.0, 78.0
MARGIN = 1.0  # degrees kept just outside the crop so lines don't dead-end abruptly


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

    out = {
        "meta": {
            "source": "Natural Earth 110m Coastline (public domain)",
            "sourceUrl": "https://www.naturalearthdata.com/downloads/110m-physical-vectors/",
            "note": "Simplified/cropped by scripts/build-coastline.py — illustrative, not navigational.",
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
