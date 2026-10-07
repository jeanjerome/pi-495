#!/usr/bin/env bash
# Runs 495's tests on Linux from a Mac, in a virtual machine of Apple container.
#
# The tree of the working directory as Git sees it — tracked files and untracked files that are not
# ignored — is copied into a fresh VM of the image scripts/linux/Containerfile describes, as an
# ordinary user, where its dependencies are installed, `dist/` is built and the tests run. The exit
# code is the tests'.
#
#   scripts/linux/test.sh                     the whole suite, as `npm test`
#   scripts/linux/test.sh <test file>...      those files only, under `node --test`
#
# Apple container's services must be running (`container system start`). The image is built on the
# first run and kept as pi-495-linux.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
image=pi-495-linux
if ! container image inspect "$image" >/dev/null 2>&1; then
	container build -t "$image" -f "$root/scripts/linux/Containerfile" "$root/scripts/linux" >&2
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
(cd "$root" && git ls-files -z --cached --others --exclude-standard | tar --null -T - -cf "$work/tree.tar")

if [[ $# -gt 0 ]]; then
	tests="node --test --test-concurrency=1 $(printf '%q ' "$@")"
else
	tests="npm test"
fi

container run --rm -c 8 -m 8G -v "$work:/in" "$image" bash -c "
	set -e
	mkdir repo && tar -xf /in/tree.tar -C repo && cd repo
	git init -q && git add -A && git commit -qm tree
	npm ci --no-audit --no-fund >/dev/null
	npm run build >/dev/null
	$tests"
