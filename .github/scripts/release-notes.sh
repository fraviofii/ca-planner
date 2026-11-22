#!/usr/bin/env bash
# Notas de uma release: a mensagem da tag anotada, se houver; senão, os commits desde a
# tag anterior. Em seguida, os instaladores gerados e o aviso sobre assinatura.
#
#   bash .github/scripts/release-notes.sh v0.2.0 dist > notes.md
set -euo pipefail

TAG="$1"
DIST="${2:-dist}"
REPO="${GITHUB_REPOSITORY:-fraviofii/ca-planner}"
PREV="$(git describe --tags --abbrev=0 --match 'v*' "${TAG}^" 2>/dev/null || true)"

echo "## Novidades"
echo
ANNOTATED=""
[ "$(git cat-file -t "$TAG")" = "tag" ] && ANNOTATED=1
BODY=""
[ -n "$ANNOTATED" ] && BODY="$(git tag -l --format='%(contents:body)' "$TAG" | sed '/^-----BEGIN PGP SIGNATURE-----/,$d')"

if [ -n "$(printf '%s' "$BODY" | tr -d '[:space:]')" ]; then
  # Tag anotada com texto: ela é o texto das novidades.
  git tag -l --format='%(contents:subject)' "$TAG"
  echo
  printf '%s\n' "$BODY"
else
  # Tag leve, ou anotada só com o título: título (se houver) e os commits.
  if [ -n "$ANNOTATED" ]; then
    git tag -l --format='%(contents:subject)' "$TAG"
    echo
  fi
  RANGE="$TAG"
  [ -n "$PREV" ] && RANGE="$PREV..$TAG"
  git log --no-merges --reverse --format='- %s' "$RANGE"
fi
echo
echo "## Instaladores"
echo
echo "| Sistema | Arquivo |"
echo "|---|---|"
for f in "$DIST"/*; do
  name="$(basename "$f")"
  case "$name" in
    *.dmg)      echo "| macOS (Apple Silicon) | \`$name\` |" ;;
    *.exe)      echo "| Windows (64 bits) | \`$name\` |" ;;
    *.AppImage) echo "| Linux (64 bits) | \`$name\` |" ;;
  esac
done
echo
echo "Os instaladores não são assinados. No macOS, abra pela primeira vez com o botão direito"
echo "no app › **Abrir**. No Windows, o SmartScreen pode pedir **Mais informações › Executar"
echo "assim mesmo**. No Linux, dê permissão de execução ao AppImage (\`chmod +x\`)."

if [ -n "$PREV" ]; then
  echo
  echo "**Todas as mudanças:** https://github.com/$REPO/compare/$PREV...$TAG"
fi
