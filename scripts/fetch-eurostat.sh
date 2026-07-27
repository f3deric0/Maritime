#!/usr/bin/env bash
#
# fetch-eurostat.sh
#
# Regenerates assets/data/observatory.json — the real EU maritime-freight
# figures behind the "Blue Economy Observatory" (insights.html + the
# homepage #insights teaser). No API key needed: Eurostat's dissemination
# API is open. See data-section.md for the section's background.
#
# Requires: curl, jq.
#
# Usage:
#   ./scripts/fetch-eurostat.sh
#
# Datasets used (verified live against the Eurostat dissemination API,
# https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/<code>):
#
#   mar_go_qm    Gross weight of goods transported to/from main EU ports,
#                by direction and type of traffic — quarterly.
#                Dims: freq, direct(TOTAL/IN/OUT), tra_cov, unit, rep_mar, time.
#                Eurostat's own public headline figure ("X million tonnes
#                handled at EU main ports") is IN + OUT summed — NOT the
#                dataset's own direct=TOTAL category, which measures a
#                narrower quantity. This script reproduces that convention.
#
#   mar_sg_am_cw Short sea shipping — country level — gross weight of goods
#                transported to/from main ports — annual.
#                Dims: freq, unit(THS_T/PC_TOT), seaship(TOTAL/SSS/DSS/UNK),
#                rep_mar, time. unit=PC_TOT gives short-sea's % share of a
#                country's/aggregate's total maritime freight directly —
#                no manual division needed for the EU-level share stat.
#
# If Eurostat changes these dataset codes/dimensions, this script will fail
# loudly (curl/jq errors or a null in the output) rather than silently
# writing bad data — check the codes at
# https://ec.europa.eu/eurostat/databrowser/product/page/<code> and adjust
# the dimension filters below.

set -euo pipefail
cd "$(dirname "$0")/.."

command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }
command -v jq   >/dev/null || { echo "jq is required"   >&2; exit 1; }

OUT="assets/data/observatory.json"
API="https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> Fetching mar_go_qm (quarterly goods, IN/OUT, EU27_2020, last 8 quarters)..."
curl -sf --max-time 20 \
  "$API/mar_go_qm?format=JSON&lang=EN&rep_mar=EU27_2020&direct=IN&direct=OUT&tra_cov=TOTAL&unit=THS_T&lastTimePeriod=8" \
  -o "$TMP/goods.json"

echo "==> Fetching mar_sg_am_cw (short-sea share + volume, EU27_2020, last 2 years)..."
curl -sf --max-time 20 \
  "$API/mar_sg_am_cw?format=JSON&lang=EN&rep_mar=EU27_2020&seaship=SSS&lastTimePeriod=2" \
  -o "$TMP/shortsea_eu.json"

# The EU-level fetch above tells us which year is "latest" — read it back
# before fetching country figures, so both calls line up on the same year.
LATEST_YEAR=$(jq -r '
  .dimension.time.category.index | to_entries | max_by(.value) | .key
' "$TMP/shortsea_eu.json")
echo "  latest short-sea year available: $LATEST_YEAR"

echo "==> Fetching mar_sg_am_cw country breakdown (Italy, Netherlands, Spain, $LATEST_YEAR)..."
curl -sf --max-time 20 \
  "$API/mar_sg_am_cw?format=JSON&lang=EN&rep_mar=IT&rep_mar=NL&rep_mar=ES&seaship=SSS&unit=THS_T&time=$LATEST_YEAR" \
  -o "$TMP/shortsea_countries.json"

echo "==> Computing figures..."

# ── Total goods: latest complete quarter (both IN and OUT reported) ──
GOODS_JSON=$(jq -c '
  (.dimension.direct.category.index) as $d
  | (.dimension.time.category.index) as $t
  | (.size[5]) as $tsize
  | (.value) as $v
  | ($t | to_entries | sort_by(.value) | reverse
      | map(select(
          ($v[(($d["IN"]  * $tsize) + .value) | tostring]) != null and
          ($v[(($d["OUT"] * $tsize) + .value) | tostring]) != null
        ))
      | .[0]
    ) as $latest
  | ($latest.key | capture("(?<y>[0-9]{4})-Q(?<q>[0-9])")) as $lp
  | (($lp.y | tonumber - 1) | tostring) + "-Q" + $lp.q as $prevKey
  | ($t[$prevKey]) as $prevIdx
  | {
      latestLabel: $latest.key,
      latestIn:  $v[(($d["IN"]  * $tsize) + $latest.value) | tostring],
      latestOut: $v[(($d["OUT"] * $tsize) + $latest.value) | tostring],
      prevLabel: $prevKey,
      prevIn:  (if $prevIdx == null then null else $v[(($d["IN"]  * $tsize) + $prevIdx) | tostring] end),
      prevOut: (if $prevIdx == null then null else $v[(($d["OUT"] * $tsize) + $prevIdx) | tostring] end)
    }
  | . + {
      latestTotalKt: (.latestIn + .latestOut),
      prevTotalKt: (if .prevIn == null then null else (.prevIn + .prevOut) end)
    }
  | . + {
      yoyPct: (if .prevTotalKt == null then null else (((.latestTotalKt - .prevTotalKt) / .prevTotalKt) * 100) end)
    }
' "$TMP/goods.json")
echo "  $GOODS_JSON"

# ── Short-sea EU share + volume, latest vs previous year ──
SHORTSEA_JSON=$(jq -c --arg latest "$LATEST_YEAR" '
  (.dimension.unit.category.index) as $u
  | (.dimension.time.category.index) as $t
  | (.size[4]) as $tsize
  | (.value) as $v
  | ($t | to_entries | map(select(.key != $latest)) | .[0].key) as $prev
  | {
      latestYear: $latest,
      prevYear: $prev,
      volumeKt: $v[(($u["THS_T"] * $tsize) + $t[$latest]) | tostring],
      sharePctLatest: $v[(($u["PC_TOT"] * $tsize) + $t[$latest]) | tostring],
      sharePctPrev:  $v[(($u["PC_TOT"] * $tsize) + $t[$prev]) | tostring]
    }
' "$TMP/shortsea_eu.json")
echo "  $SHORTSEA_JSON"

# ── Country breakdown (kt) ──
COUNTRIES_JSON=$(jq -c '
  (.dimension.rep_mar.category.index) as $r
  | (.value) as $v
  | { IT: $v[($r["IT"] | tostring)], NL: $v[($r["NL"] | tostring)], ES: $v[($r["ES"] | tostring)] }
' "$TMP/shortsea_countries.json")
echo "  $COUNTRIES_JSON"

echo "==> Assembling $OUT ..."
jq -n \
  --argjson goods "$GOODS_JSON" \
  --argjson sss "$SHORTSEA_JSON" \
  --argjson countries "$COUNTRIES_JSON" \
  --arg retrieved "$(date +%F)" \
  '
  ($goods.latestTotalKt / 1000) as $goodsMt
  | ($sss.volumeKt / 1000000) as $sssVolBn
  | ($sss.sharePctLatest - $sss.sharePctPrev) as $shareDelta
  | (100 - $sss.sharePctLatest) as $otherShare
  | ($countries.IT + $countries.NL + $countries.ES) as $top3Kt
  | {
      meta: {
        title: "Blue Economy Observatory — data snapshot",
        source: "Eurostat — Maritime transport statistics",
        datasets: [
          "mar_go_qm — Gross weight of goods transported to/from main ports by direction and type of traffic, quarterly",
          "mar_sg_am_cw — Short sea shipping, country level, gross weight of goods to/from main ports, annual"
        ],
        sourceUrl: "https://ec.europa.eu/eurostat/databrowser/product/page/mar_go_qm",
        retrieved: $retrieved,
        note: "Committed fallback snapshot. Every value below was pulled live from the Eurostat dissemination API (statistics/1.0/data/<dataset>?format=JSON) and computed directly with jq — not read off a rendered page. js/observatory.js tries a live fetch first and falls back to this file on any network/CORS failure, so the section never renders empty. Regenerate with scripts/fetch-eurostat.sh."
      },
      stats: [
        {
          id: "total-goods",
          value: ($goodsMt * 10 | round / 10),
          suffix: " Mt",
          label: ("Goods handled at EU main ports — " + $goods.latestLabel),
          delta: (if $goods.yoyPct == null then null else
            ((if $goods.yoyPct >= 0 then "+" else "" end) + ($goods.yoyPct * 10 | round / 10 | tostring) + "% year-on-year")
          end),
          source: "mar_go_qm, rep_mar=EU27_2020, unit=THS_T, direct=IN+OUT summed (matches how Eurostat itself publishes the headline figure), latest complete quarter vs same quarter prior year"
        },
        {
          id: "shortsea-share",
          value: $sss.sharePctLatest,
          suffix: "%",
          label: ("Share of EU maritime freight carried by short-sea shipping — " + $sss.latestYear),
          delta: ((if $shareDelta >= 0 then "+" else "" end) + ($shareDelta * 10 | round / 10 | tostring) + "pp vs " + $sss.prevYear + " (" + ($sss.sharePctPrev | tostring) + "%)"),
          source: "mar_sg_am_cw, rep_mar=EU27_2020, seaship=SSS, unit=PC_TOT, time=" + $sss.latestYear + " vs " + $sss.prevYear
        },
        {
          id: "shortsea-volume",
          value: ($sssVolBn * 100 | round / 100),
          suffix: " Bn t",
          label: ("EU short-sea shipping volume — " + $sss.latestYear),
          source: ("mar_sg_am_cw, rep_mar=EU27_2020, seaship=SSS, unit=THS_T, time=" + $sss.latestYear + " (" + ($sss.volumeKt | tostring) + " kt)")
        }
      ],
      countries: {
        title: ("Top short-sea shipping nations, " + $sss.latestYear),
        unit: "million tonnes",
        footnote: ("Italy, the Netherlands and Spain together handled " + (($top3Kt / $sss.volumeKt * 1000 | round / 10) | tostring) + "% of all EU short-sea shipping tonnage in " + $sss.latestYear + "."),
        source: ("mar_sg_am_cw, rep_mar=IT|NL|ES, seaship=SSS, unit=THS_T, time=" + $sss.latestYear),
        items: [
          { name: "Italy",       value: ($countries.IT / 100 | round / 10), share: ($countries.IT / $sss.volumeKt * 1000 | round / 10) },
          { name: "Netherlands", value: ($countries.NL / 100 | round / 10), share: ($countries.NL / $sss.volumeKt * 1000 | round / 10) },
          { name: "Spain",       value: ($countries.ES / 100 | round / 10), share: ($countries.ES / $sss.volumeKt * 1000 | round / 10) }
        ]
      },
      modeShare: {
        title: ("Short-sea vs. other maritime freight — " + $sss.latestYear),
        shortSea: $sss.sharePctLatest,
        other: ($otherShare * 10 | round / 10)
      }
    }
  ' > "$TMP/observatory.json"

jq empty "$TMP/observatory.json"   # fail loudly if the assembled JSON is malformed
mv "$TMP/observatory.json" "$OUT"

echo "✓ $OUT updated."
jq '{stats: [.stats[] | {id, value, suffix, delta}], countries: .countries.items}' "$OUT"
