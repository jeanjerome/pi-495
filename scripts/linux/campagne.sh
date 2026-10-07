#!/usr/bin/env bash
# Runs a reference campaign of cycle/campagnes on Linux from a Mac, in an Apple container virtual
# machine: a real model conducts a real change in a real Pi, as `npm run campagne` does on the Mac.
#
#   scripts/linux/campagne.sh npm|maven [campaign options...]
#
# The tree of the working directory is copied into a fresh VM of the image scripts/linux/test.sh
# builds, Pi is installed there at the version the reference machine runs, and the Anthropic login of
# ~/.pi/agent/auth.json is copied into the VM's own Pi directory: nothing else of the Mac's Pi
# configuration is read. The campaign's verdict and exit code are the VM's.
set -euo pipefail

[[ $# -ge 1 ]] || { echo "usage: scripts/linux/campagne.sh npm|maven [options...]" >&2; exit 2; }
root=$(git rev-parse --show-toplevel)
image=pi-495-linux
pi_version=$(node -p 'require(process.argv[1]).devDependencies["@earendil-works/pi-coding-agent"].replace(/^[^0-9]*/, "")' "$root/package.json")
if ! container image inspect "$image" >/dev/null 2>&1; then
	container build -t "$image" -f "$root/scripts/linux/Containerfile" "$root/scripts/linux" >&2
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
(cd "$root" && git ls-files -z --cached --others --exclude-standard | tar --null -T - -cf "$work/tree.tar")
install -m 600 "$HOME/.pi/agent/auth.json" "$work/auth.json"

container run --rm -c 8 -m 8G -v "$work:/in" "$image" bash -c "
	set -e
	npm install -g --prefix \$HOME/.local @earendil-works/pi-coding-agent@$pi_version >/dev/null
	export PATH=\$HOME/.local/bin:\$PATH
	mkdir -p \$HOME/.pi/agent && install -m 600 /in/auth.json \$HOME/.pi/agent/auth.json
	mkdir repo && tar -xf /in/tree.tar -C repo && cd repo
	git init -q && git add -A && git commit -qm tree
	npm ci --no-audit --no-fund >/dev/null
	npm run campagne -- $(printf '%q ' "$@")"
