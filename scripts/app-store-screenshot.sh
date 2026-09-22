#!/usr/bin/env bash
#
# App Store Connect に出す Mac 用スクリーンショット（16:10）にそろえる。
#
#   ./scripts/app-store-screenshot.sh ~/Desktop/スクリーンショット*.png
#
# 受け付けられるのは 1280×800 / 1440×900 / 2560×1600 / 2880×1800 だけ。
# 開発機の画面はどちらも 16:10 ではない（内蔵 2560×1664、外部 1920×1080）ので、撮ったままでは弾かれる。
#
# 既定は「中央を 16:10 で切り出す」。`--pad` を付けると切らずに余白を足して 16:10 にする。
#
#   ./scripts/app-store-screenshot.sh --pad --pad-color F3F2F2 assets/*.png
#
# **LayerTalk のスクリーンショットでは `--pad` を使うこと。** このアプリはオーバーレイなので
# コメント・質問パネル・参加 QR・コントロール窓がどれも**画面の端**にある。1920×1080 を中央で
# 16:10 に切ると幅が 192px 削られ、端の要素が黙って欠ける（実測: 流れるコメントの
# 「おおおお〜〜〜！！」が「おお〜〜〜！！」になり、コントロール窓の「参加コード」ラベルが消えた）。
# 余白を足す方式なら情報が 1 つも失われない。`--pad-color` にはスライドの地の色を渡す
# （既定は白。スライドが薄いグレーなら帯が見えるので、端の色を拾って渡すこと）。
#
# 縮めるときの規定サイズは、切り出し／余白追加後の幅に収まるいちばん大きいもの。
# **拡大はしない**（ぼやけたスクリーンショットは差し戻しの理由になる）。1280 幅に満たないときだけ 1280×800 に上げる。
# 出力は入力の隣の `<名前>-appstore.png`。元の画像は触らない。

set -euo pipefail

mode=crop
pad_color=FFFFFF

while [ "$#" -gt 0 ]; do
  case "$1" in
    --pad) mode=pad; shift ;;
    --pad-color) pad_color="${2:-}"; shift 2 ;;
    --) shift; break ;;
    -*) echo "unknown option: $1" >&2; exit 1 ;;
    *) break ;;
  esac
done

if [ "$#" -eq 0 ]; then
  echo "usage: $0 [--pad] [--pad-color RRGGBB] <image>..." >&2
  exit 1
fi

for input in "$@"; do
  width=$(sips -g pixelWidth "$input" | awk '/pixelWidth/ { print $2 }')
  height=$(sips -g pixelHeight "$input" | awk '/pixelHeight/ { print $2 }')

  if [ "$mode" = pad ]; then
    # 切らずに広げる。16:10 より横長なら縦を、縦長なら横を足す。
    if [ $((width * 10)) -gt $((height * 16)) ]; then
      fit_width=$width
      fit_height=$((width * 10 / 16))
    else
      fit_width=$((height * 16 / 10))
      fit_height=$height
    fi
  else
    if [ $((width * 10)) -gt $((height * 16)) ]; then
      fit_width=$((height * 16 / 10))
      fit_height=$height
    else
      fit_width=$width
      fit_height=$((width * 10 / 16))
    fi
  fi

  if [ "$fit_width" -ge 2880 ]; then
    out_width=2880; out_height=1800
  elif [ "$fit_width" -ge 2560 ]; then
    out_width=2560; out_height=1600
  elif [ "$fit_width" -ge 1440 ]; then
    out_width=1440; out_height=900
  else
    out_width=1280; out_height=800
  fi

  output="${input%.*}-appstore.png"
  if [ "$mode" = pad ]; then
    sips -s format png --padToHeightWidth "$fit_height" "$fit_width" --padColor "$pad_color" \
      "$input" --out "$output" >/dev/null
  else
    sips -s format png --cropToHeightWidth "$fit_height" "$fit_width" "$input" --out "$output" >/dev/null
  fi
  sips -z "$out_height" "$out_width" "$output" >/dev/null
  echo "$output  (${width}x${height} --${mode}--> ${out_width}x${out_height})"
done
