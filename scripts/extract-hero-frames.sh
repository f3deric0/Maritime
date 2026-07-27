#!/usr/bin/env bash
#
# extract-hero-frames.sh
#
# Regenerates the scroll-scrubbed frame sequence for the homepage hero
# (index.html #hero) from a source video. Scrolling the hero draws one of
# these frames per scroll position instead of seeking a <video> element —
# see design.md "Signature: the transom scrub" for why.
#
# Requires: ffmpeg, cwebp/dwebp (`brew install ffmpeg webp`).
#
# Usage:
#   ./scripts/extract-hero-frames.sh [source_video]
#
#   CROP_PCT=12 ./scripts/extract-hero-frames.sh   # cut 12% off each side
#                                                    # (only if a future video
#                                                    # actually has a
#                                                    # watermark near the
#                                                    # edges — the current
#                                                    # 0708.mp4 does not,
#                                                    # verified by a
#                                                    # start/mid/end contact
#                                                    # sheet)

set -euo pipefail
cd "$(dirname "$0")/.."

SRC="${1:-assets/video/0708.mp4}"
OUT_DESK="assets/frames/hero"
OUT_MOB="assets/frames/hero-m"
POSTER="assets/images/hero-poster.webp"

DESK_COUNT=160
DESK_WIDTH=1280   # native source width — do not upscale, keeps frames sharp
DESK_QUALITY=82

MOB_COUNT=90
MOB_WIDTH=800
MOB_QUALITY=76

POSTER_AT=3       # seconds into the clip — reduced-motion/lite-mode fallback

# Optional side crop, percent cut from EACH side. 0 = full frame (default).
CROP_PCT="${CROP_PCT:-0}"

for bin in ffmpeg cwebp; do
  command -v "$bin" >/dev/null || { echo "Missing $bin — run: brew install ffmpeg webp" >&2; exit 1; }
done
[ -f "$SRC" ] || { echo "Source video not found: $SRC" >&2; exit 1; }

DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$SRC")

CROP_FILTER=""
if [ "$CROP_PCT" != "0" ]; then
  CROP_FILTER="crop=iw*(1-2*${CROP_PCT}/100):ih:iw*${CROP_PCT}/100:0,"
  echo "Cropping ${CROP_PCT}% off each side."
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

extract_set () {
  local count="$1" width="$2" quality="$3" out_dir="$4" label="$5"
  local png_dir="$WORK/$label"
  mkdir -p "$png_dir" "$out_dir"
  rm -f "$out_dir"/frame-*.webp

  local fps
  fps=$(awk "BEGIN{printf \"%.6f\", ${count}/${DURATION}}")

  echo "Extracting $count $label frames (fps=$fps, width=$width)…"
  ffmpeg -y -loglevel error -i "$SRC" \
    -vf "${CROP_FILTER}fps=${fps},scale=${width}:-1:flags=lanczos" \
    -vsync 0 -frames:v "$count" \
    "$png_dir/f-%04d.png"

  local n=0
  for f in "$png_dir"/f-*.png; do
    n=$((n + 1))
    printf -v idx "%03d" "$n"
    cwebp -quiet -q "$quality" "$f" -o "$out_dir/frame-$idx.webp"
  done
  echo "  -> $n frames written to $out_dir/"
}

extract_set "$DESK_COUNT" "$DESK_WIDTH" "$DESK_QUALITY" "$OUT_DESK" "desktop"
extract_set "$MOB_COUNT"  "$MOB_WIDTH"  "$MOB_QUALITY"  "$OUT_MOB"  "mobile"

echo "Extracting poster frame at ${POSTER_AT}s…"
mkdir -p "$(dirname "$POSTER")"
ffmpeg -y -loglevel error -ss "$POSTER_AT" -i "$SRC" \
  -vf "${CROP_FILTER}scale=${DESK_WIDTH}:-1:flags=lanczos" \
  -frames:v 1 -update 1 "$WORK/poster.png"
cwebp -quiet -q 85 "$WORK/poster.png" -o "$POSTER"

echo
echo "Done."
du -sh "$OUT_DESK" "$OUT_MOB" "$POSTER"
