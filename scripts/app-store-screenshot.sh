#!/usr/bin/env bash
#
# App Store Connect に出す Mac 用スクリーンショット（16:10）にそろえる。
#
#   ./scripts/app-store-screenshot.sh ~/Desktop/スクリーンショット*.png
#
# 受け付けられるのは 1280×800 / 1440×900 / 2560×1600 / 2880×1800 だけ。
# 開発機の画面はどちらも 16:10 ではない（内蔵 2560×1664、外部 1920×1080）ので、撮ったままでは弾かれる。
#
# 中央を 16:10 で切り出し、切り出した幅に収まるいちばん大きい規定サイズへ縮める。
# **拡大はしない**（ぼやけたスクリーンショットは差し戻しの理由になる）。1280 幅に満たないときだけ 1280×800 に上げる。
# 出力は入力の隣の `<名前>-appstore.png`。元の画像は触らない。

set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <image>..." >&2
  exit 1
fi

for input in "$@"; do
  width=$(sips -g pixelWidth "$input" | awk '/pixelWidth/ { print $2 }')
  height=$(sips -g pixelHeight "$input" | awk '/pixelHeight/ { print $2 }')

  if [ $((width * 10)) -gt $((height * 16)) ]; then
    crop_width=$((height * 16 / 10))
    crop_height=$height
  else
    crop_width=$width
    crop_height=$((width * 10 / 16))
  fi

  if [ "$crop_width" -ge 2880 ]; then
    out_width=2880; out_height=1800
  elif [ "$crop_width" -ge 2560 ]; then
    out_width=2560; out_height=1600
  elif [ "$crop_width" -ge 1440 ]; then
    out_width=1440; out_height=900
  else
    out_width=1280; out_height=800
  fi

  output="${input%.*}-appstore.png"
  sips -s format png --cropToHeightWidth "$crop_height" "$crop_width" "$input" --out "$output" >/dev/null
  sips -z "$out_height" "$out_width" "$output" >/dev/null
  echo "$output  (${width}x${height} -> ${out_width}x${out_height})"
done
