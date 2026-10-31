#!/bin/sh
# Erzeugt die web-optimierten Dateien in media/ aus den Originalen in assets/.
# Die Originale bleiben unverändert. Nur macOS (nutzt sips und avconvert).
#
#   sh tools/prepare-media.sh [bild.png] [animation.mp4]
set -eu
cd "$(dirname "$0")/.."

IMG=${1:-assets/Unbenanntes_Projekt.png}
VID=${2:-assets/IMG_1513.mp4}
mkdir -p media

# Standbild in drei Breiten (srcset in index.html)
for w in 960 1440 1920; do
  sips -s format jpeg -s formatOptions 82 --resampleWidth "$w" "$IMG" --out "media/bild-$w.jpg" >/dev/null
done

# Icon: Ausschnitt mit dem Kopf des Hundes (Koordinaten passen zum aktuellen Bild)
tmp=$(mktemp -d)
sips --cropToHeightWidth 520 520 --cropOffset 1320 1480 "$IMG" --out "$tmp/icon.png" >/dev/null
sips -s format png -z 180 180 "$tmp/icon.png" --out media/icon-180.png >/dev/null
rm -rf "$tmp"

# Video: 1920 px breit, H.264 (das Original mit 3552 x 2486 / Level 5.2
# überfordert manche Android-Decoder), Fast-Start für Streaming.
avconvert --source "$VID" --preset Preset1920x1080 --output media/animation.mp4 --replace >/dev/null

ls -l media
