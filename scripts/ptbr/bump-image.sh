#!/bin/sh
# Aponta o Dockerfile.easypanel para a versão atual de um canal da imagem oficial.
# Uso: scripts/ptbr/bump-image.sh [nightly|latest|beta|canary]   (padrão: nightly)
set -eu
channel="${1:-nightly}"
repo="paperclipai/paperclip"
dockerfile="$(dirname "$0")/../../Dockerfile.easypanel"
accept="application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json"

token="$(curl -fsS "https://ghcr.io/token?scope=repository:$repo:pull" | sed -E 's/.*"token":"([^"]+)".*/\1/')"
digest="$(curl -fsSI -H "Authorization: Bearer $token" -H "Accept: $accept" \
  "https://ghcr.io/v2/$repo/manifests/$channel" | tr -d '\r' | awk -F': ' 'tolower($1)=="docker-content-digest"{print $2}')"
[ -n "$digest" ] || { echo "não achei o digest do canal $channel" >&2; exit 1; }

sed -i.bak -E "s#^FROM ghcr.io/$repo:[^ ]+#FROM ghcr.io/$repo:$channel@$digest#" "$dockerfile"
rm -f "$dockerfile.bak"
grep '^FROM' "$dockerfile"
