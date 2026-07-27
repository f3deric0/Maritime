#!/usr/bin/env python3
"""
relay.py — Fleet Watch AIS relay.

Long-running process (installed on the VPS as the fleet-relay systemd
service — see fleet-relay.service and deploy.md) that:

  1. Opens ONE WebSocket connection to aisstream.io on behalf of every
     site visitor, subscribed to six small bounding boxes (one per
     maritime chokepoint featured on insights.html — see
     assets/data/chokepoints.json for the actual boxes).
  2. Keeps an in-memory table of the most recently seen position per
     vessel (MMSI), pruning anything not heard from in STALE_AFTER_SEC.
  3. Every SNAPSHOT_INTERVAL_SEC, atomically writes a compact JSON
     snapshot to OUTPUT_PATH (the docroot's assets/data/fleet-live.json)
     so the static frontend (js/fleetwatch.js) can just poll a plain
     file — no WebSocket, no API key, no CORS on the browser side.

The API key is read from the AISSTREAM_API_KEY environment variable
(supplied via systemd's EnvironmentFile=/etc/fleet-relay.env on the VPS)
— it is never written to disk anywhere in this repo.

Usage:
    AISSTREAM_API_KEY=... python3 relay.py
"""
import asyncio
import json
import logging
import os
import time
from pathlib import Path

import websockets

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("fleet-relay")

AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream"
API_KEY = os.environ.get("AISSTREAM_API_KEY")

SCRIPT_DIR = Path(__file__).resolve().parent
CHOKEPOINTS_PATH = Path(os.environ.get("CHOKEPOINTS_PATH", SCRIPT_DIR / ".." / ".." / "assets" / "data" / "chokepoints.json"))
OUTPUT_PATH = Path(os.environ.get("FLEET_OUTPUT_PATH", SCRIPT_DIR / ".." / ".." / "assets" / "data" / "fleet-live.json"))

SNAPSHOT_INTERVAL_SEC = 5
STALE_AFTER_SEC = 600          # drop a ship if we haven't heard from it in 10 min
MAX_SHIPS_PER_CHOKEPOINT = 40  # bound memory/file size — plenty for a "wow" visual, not a full feed
RECONNECT_BACKOFF_SEC = [2, 5, 10, 30, 60]

# {mmsi: {lat, lon, name, cog, heading, chokepoint, seen_at}}
ships: dict[int, dict] = {}


def load_chokepoints():
    with open(CHOKEPOINTS_PATH) as f:
        data = json.load(f)
    return data["items"]


def bounding_boxes_payload(chokepoints):
    # aisstream wants [[[lat1, lon1], [lat2, lon2]], ...] — one pair of
    # corners per box, lat first (see aisstream.io/documentation).
    boxes = []
    for cp in chokepoints:
        b = cp["bbox"]
        boxes.append([[b["latMin"], b["lonMin"]], [b["latMax"], b["lonMax"]]])
    return boxes


def nearest_chokepoint(lat, lon, chokepoints):
    best_id, best_d2 = None, None
    for cp in chokepoints:
        d2 = (lat - cp["lat"]) ** 2 + (lon - cp["lon"]) ** 2
        if best_d2 is None or d2 < best_d2:
            best_id, best_d2 = cp["id"], d2
    return best_id


def prune_stale():
    now = time.time()
    stale = [mmsi for mmsi, s in ships.items() if now - s["seen_at"] > STALE_AFTER_SEC]
    for mmsi in stale:
        del ships[mmsi]


def write_snapshot():
    prune_stale()
    # Cap per-chokepoint so one busy box can't crowd out the others or
    # bloat the file — keep the most-recently-seen N per node.
    by_cp: dict[str, list] = {}
    for mmsi, s in ships.items():
        by_cp.setdefault(s["chokepoint"], []).append((mmsi, s))
    kept = {}
    for cp_id, entries in by_cp.items():
        entries.sort(key=lambda e: e[1]["seen_at"], reverse=True)
        for mmsi, s in entries[:MAX_SHIPS_PER_CHOKEPOINT]:
            kept[mmsi] = s

    snapshot = {
        "generatedAt": int(time.time()),
        "vesselCount": len(kept),
        "vessels": [
            {
                "mmsi": mmsi,
                "name": (s["name"] or "").strip() or None,
                "lat": round(s["lat"], 4),
                "lon": round(s["lon"], 4),
                "heading": s["heading"],
                "cog": s["cog"],
                "chokepoint": s["chokepoint"],
            }
            for mmsi, s in kept.items()
        ],
    }

    tmp_path = OUTPUT_PATH.with_suffix(".tmp")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(tmp_path, "w") as f:
        json.dump(snapshot, f, separators=(",", ":"))
    os.replace(tmp_path, OUTPUT_PATH)  # atomic on POSIX — readers never see a partial file


async def snapshot_loop():
    while True:
        await asyncio.sleep(SNAPSHOT_INTERVAL_SEC)
        try:
            write_snapshot()
        except Exception:
            log.exception("failed to write snapshot")


async def stream_loop(chokepoints):
    subscribe_msg = {
        "APIKey": API_KEY,
        "BoundingBoxes": bounding_boxes_payload(chokepoints),
        "FilterMessageTypes": ["PositionReport"],
    }

    attempt = 0
    while True:
        try:
            log.info("connecting to %s ...", AISSTREAM_URL)
            async with websockets.connect(AISSTREAM_URL, ping_interval=20, ping_timeout=20) as ws:
                await ws.send(json.dumps(subscribe_msg))
                log.info("subscribed — %d bounding boxes", len(subscribe_msg["BoundingBoxes"]))
                attempt = 0
                async for raw in ws:
                    try:
                        handle_message(json.loads(raw), chokepoints)
                    except Exception:
                        log.exception("failed to handle message")
        except Exception as e:
            delay = RECONNECT_BACKOFF_SEC[min(attempt, len(RECONNECT_BACKOFF_SEC) - 1)]
            log.warning("connection lost (%s) — retrying in %ss", e, delay)
            attempt += 1
            await asyncio.sleep(delay)


def handle_message(msg, chokepoints):
    if msg.get("MessageType") != "PositionReport":
        return
    meta = msg.get("Metadata", {})
    pr = msg.get("Message", {}).get("PositionReport", {})

    mmsi = meta.get("MMSI") or pr.get("UserID")
    lat = meta.get("latitude", pr.get("Latitude"))
    lon = meta.get("longitude", pr.get("Longitude"))
    if mmsi is None or lat is None or lon is None:
        return

    ships[mmsi] = {
        "lat": lat,
        "lon": lon,
        "name": meta.get("ShipName"),
        "cog": pr.get("Cog"),
        "heading": pr.get("TrueHeading"),
        "chokepoint": nearest_chokepoint(lat, lon, chokepoints),
        "seen_at": time.time(),
    }


async def main():
    if not API_KEY:
        raise SystemExit("AISSTREAM_API_KEY is not set — see /etc/fleet-relay.env on the VPS")

    chokepoints = load_chokepoints()
    log.info("loaded %d chokepoints from %s", len(chokepoints), CHOKEPOINTS_PATH)
    log.info("writing snapshots to %s", OUTPUT_PATH)

    await asyncio.gather(stream_loop(chokepoints), snapshot_loop())


if __name__ == "__main__":
    asyncio.run(main())
