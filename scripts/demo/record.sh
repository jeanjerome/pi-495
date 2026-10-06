#!/usr/bin/env bash
# Records the README demonstration of pi-495: a real change on a copy of the reference npm target
# (vitest, v8 coverage, Stryker), typed into Pi by scripts/demo/drive.py and recorded by asciinema in a
# real pseudo-terminal, then rendered by agg (GIF) and ffmpeg (MP4).
#
# Pi runs under an agent directory of its own that declares this repository and the titanium theme of
# pi-omp-theme, with the theme's own status line off so the footer is Pi's and 495's,
# and nothing of the recorder's own skills or extensions. That directory holds its own Anthropic
# login, made once with `scripts/demo/record.sh login`; the recorder's ~/.pi/agent is never read.
#
#   scripts/demo/record.sh login   open Pi in that directory to run /login, then quit with Ctrl-C
#   scripts/demo/record.sh         build dist/, copy the target afresh, record demo.gif and demo.mp4
#
# Everything is written under $DEMO_DIR (default ~/.495/demo). The recording is left there to be
# watched before it replaces .github/assets/demo.gif and demo.mp4.
set -euo pipefail

racine=$(cd "$(dirname "$0")/../.." && pwd)
demo=${DEMO_DIR:-$HOME/.495/demo}
agent=$demo/pi-agent
cible=$demo/cible
data=$demo/data
modele=${DEMO_MODEL:-claude-sonnet-5-5}

mkdir -p "$agent"
cat >"$agent/settings.json" <<EOF
{
  "packages": ["$racine", "npm:@nguyenquangthai/pi-omp-theme"],
  "theme": "titanium",
  "piOmpTheme": { "statusLine": { "enabled": false } },
  "defaultProvider": "anthropic",
  "defaultModel": "$modele",
  "defaultThinkingLevel": "medium",
  "warnings": { "anthropicExtraUsage": false },
  "quietStartup": "header"
}
EOF
PI_CODING_AGENT_DIR=$agent pi update --extensions

if [[ ${1:-} == login ]]; then
	PI_CODING_AGENT_DIR=$agent exec pi --no-session
fi
if [[ ! -s $agent/auth.json ]]; then
	echo "no Anthropic login in $agent: run scripts/demo/record.sh login first" >&2
	exit 1
fi

(cd "$racine" && npm run build --silent)

rm -rf "$cible" "$data"
cp -R "$racine/cycle/campagnes/npm" "$cible"
(
	cd "$cible"
	git init -q -b main
	npm ci --silent --no-audit --no-fund
	git add -A
	git commit -q -m "initial"
)
mkdir -p "$data"

PI_CODING_AGENT_DIR=$agent HARNESS495_DATA_DIR=$data HARNESS495_LANGUAGE=en PI_SKIP_VERSION_CHECK=1 \
	python3 "$racine/scripts/demo/drive.py" "$cible" "$demo"

agg --font-dir "$HOME/Library/Fonts" --font-family "JetBrainsMono Nerd Font Mono" --font-size 16 \
	--theme dracula --fps-cap 15 --last-frame-duration 5 "$demo/demo.cast" "$demo/demo.gif"
ffmpeg -loglevel error -y -i "$demo/demo.gif" -movflags faststart -pix_fmt yuv420p \
	-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" "$demo/demo.mp4"

echo "recorded $demo/demo.gif and $demo/demo.mp4; the change's dossier is in $data"
