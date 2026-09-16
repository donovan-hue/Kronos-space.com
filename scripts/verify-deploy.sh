#!/usr/bin/env bash
#
# KRONOS — verificación de despliegue (SOLO LECTURA).
#
# Comprueba lo que puede romper la aplicación en producción sin crear ni
# modificar datos: health del backend, CORS para el origen del frontend y
# la URL de API que quedó compilada en el bundle del frontend.
#
#   BASE=https://tu-api.onrender.com \
#   FRONTEND=https://kronos-space.com \
#   ORIGIN=https://kronos-space.com \
#   scripts/verify-deploy.sh
#
set -uo pipefail

BASE="${BASE:-https://kronos-space-com-bwu9.onrender.com}"
FRONTEND="${FRONTEND:-https://kronos-space.com}"
ORIGINS="${ORIGINS:-https://kronos-space.com,https://www.kronos-space.com}"

failures=0
tmp="$(mktemp -d)"

ok() { printf 'OK    %s\n' "$1"; }
fail() { printf 'FALLA %s\n' "$1"; failures=$((failures + 1)); }
info() { printf '      %s\n' "$1"; }

cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT

echo "===== KRONOS · VERIFICACIÓN DE DESPLIEGUE (solo lectura) ====="
echo "API:      ${BASE}"
echo "Frontend: ${FRONTEND}"
echo

echo "----- 1. HEALTH DEL BACKEND -----"
health_code="$(curl -sS -o "$tmp/health.json" -w '%{http_code}' --max-time 30 "${BASE}/health" || echo 000)"
health_body="$(cat "$tmp/health.json" 2>/dev/null || true)"

if [ "$health_code" = "200" ]; then
  ok "GET /health → HTTP 200"
else
  fail "GET /health → HTTP ${health_code}"
fi

if printf '%s' "$health_body" | grep -q '"database":"connected"'; then
  ok "MongoDB conectado (database: connected)"
else
  fail "MongoDB NO conectado: ${health_body:-sin respuesta}"
fi

info "respuesta: ${health_body:0:160}"

echo
echo "----- 2. CORS PARA EL FRONTEND -----"

IFS=',' read -r -a ORIGIN_LIST <<< "$ORIGINS"

for origin in "${ORIGIN_LIST[@]}"; do
  origin="$(printf '%s' "$origin" | xargs)"

  # GET simple con Origin
  simple_headers="$(
    curl -sS -D - -o /dev/null --max-time 30 \
      -H "Origin: ${origin}" \
      "${BASE}/api/health" 2>/dev/null |
      tr -d '\r' |
      grep -i '^access-control-allow-origin:' || true
  )"

  if printf '%s' "$simple_headers" | grep -qi "origin: ${origin}$"; then
    ok "GET /api/health permite origen ${origin}"
  else
    fail "GET /api/health NO permite origen ${origin} (${simple_headers:-sin encabezado Access-Control-Allow-Origin})"
  fi

  # Preflight de una petición autenticada
  preflight_headers="$(
    curl -sS -D - -o /dev/null --max-time 30 -X OPTIONS \
      -H "Origin: ${origin}" \
      -H "Access-Control-Request-Method: POST" \
      -H "Access-Control-Request-Headers: authorization,content-type" \
      "${BASE}/api/auth/login" 2>/dev/null |
      tr -d '\r' |
      grep -i '^access-control-allow-' || true
  )"

  if printf '%s' "$preflight_headers" | grep -qi "^access-control-allow-origin: ${origin}$"; then
    ok "preflight OPTIONS /api/auth/login permite ${origin}"
  else
    fail "preflight OPTIONS /api/auth/login NO permite ${origin}"
    info "$(printf '%s' "$preflight_headers" | tr '\n' ' ')"
  fi
done

echo
echo "----- 3. FRONTEND Y URL DE API COMPILADA -----"

front_code="$(curl -sS -o "$tmp/index.html" -w '%{http_code}' --max-time 30 "${FRONTEND}/" || echo 000)"

if [ "$front_code" = "200" ]; then
  ok "GET ${FRONTEND} → HTTP 200"
else
  fail "GET ${FRONTEND} → HTTP ${front_code}"
fi

if grep -q 'id="root"' "$tmp/index.html" 2>/dev/null; then
  ok "el HTML del frontend incluye el contenedor de la SPA"
else
  fail "no se encontró id=\"root\" en el HTML del frontend"
fi

bundle_path="$(
  grep -oE 'src="[^"]+\.js"' "$tmp/index.html" 2>/dev/null |
  head -1 |
  sed 's/^src="//; s/"$//' || true
)"

if [ -n "$bundle_path" ]; then
  case "$bundle_path" in
    http*) bundle_url="$bundle_path" ;;
    /*) bundle_url="${FRONTEND}${bundle_path}" ;;
    *) bundle_url="${FRONTEND}/${bundle_path}" ;;
  esac

  curl -sS -o "$tmp/bundle.js" --max-time 60 "$bundle_url" || true

  api_url="$(
    grep -oE 'https://[A-Za-z0-9._-]+(/api)?' "$tmp/bundle.js" 2>/dev/null |
    grep -iE 'onrender\.com|api\.kronos-space\.com' |
    sort -u |
    head -3 |
    tr '\n' ' ' || true
  )"

  if [ -n "$api_url" ]; then
    ok "el bundle apunta a la API desplegada"
    info "API en el bundle: ${api_url}"
  elif grep -q '"/api"' "$tmp/bundle.js" 2>/dev/null; then
    fail "el bundle usa la ruta relativa \"/api\" y no hay proxy en ese origen"
    info "define VITE_API_URL=https://api.kronos-space.com/api (y redespliega),"
    info "o agrega un rewrite /api/* hacia ${BASE}"
  else
    fail "no se pudo determinar la URL de API en el bundle (${bundle_url})"
  fi

  if printf '%s %s' "$api_url" "$(grep -oE '"https://[A-Za-z0-9._-]+"' "$tmp/bundle.js" 2>/dev/null | head -5 | tr '\n' ' ')" | grep -qi 'localhost'; then
    fail "el bundle contiene referencias a localhost (se romperá en el navegador del usuario)"
  else
    ok "el bundle no contiene referencias a localhost"
  fi
else
  fail "no se encontró el bundle JS en el HTML del frontend"
fi

echo
if [ "$failures" -eq 0 ]; then
  echo "RESULTADO: despliegue correcto (health, CORS y frontend OK)"
  exit 0
fi

echo "RESULTADO: ${failures} comprobaciones fallaron"
exit 1
