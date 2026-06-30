#!/usr/bin/env bash
# Regenerate the social preview image (public/og.png) from the SVG source.
#
# Requires rsvg-convert (librsvg). Install via your package manager:
#   Debian/Ubuntu: sudo apt install librsvg2-bin
#   macOS:         brew install librsvg
#   Arch:          sudo pacman -S librsvg
#   Fedora:        sudo dnf install librsvg2-tools
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src="$script_dir/../src/assets/og/og.svg"
out="$script_dir/../public/og.png"

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "error: rsvg-convert not found. Install librsvg:" >&2
  echo "  Debian/Ubuntu: sudo apt install librsvg2-bin" >&2
  echo "  macOS:         brew install librsvg" >&2
  exit 1
fi

# The SVG is typeset for IosevkAllyP (the site's brand font, loaded from the
# system here). If it's missing, rsvg-convert silently falls back to a default
# font and the preview won't match the site.
if ! fc-match "IosevkAllyP" 2>/dev/null | grep -q "IosevkAllyP"; then
  echo "warning: font 'IosevkAllyP' not found; falling back to a default font." >&2
  echo "         Install IosevkAlly to /usr/share/fonts/IosevkAlly/ for a matching preview." >&2
fi

rsvg-convert -w 1200 -h 630 -f png "$src" -o "$out"
echo "generated $out"
