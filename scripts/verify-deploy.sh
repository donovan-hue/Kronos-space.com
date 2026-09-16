#!/usr/bin/env bash
#
# KRONOS — verificación de despliegue (SOLO LECTURA).
#
# Comprueba lo que puede romper la aplicación en producción sin crear ni
# modificar datos: health del backend, CORS por origen, quién sirve cada
# frontend y qué URL de API quedó compilada en su bundle.
#
#   BASE=https://api.kronos-space.com \
#   FRONTEND=https://kronos-space.com \
#   FRONTEND_ALT=https://kronos-social-ai-client.vercel.app \
#   ORIGINS=https://kronos-space.com,https://www.kronos-space.com \
#   scripts/verify-deploy.sh
#
set -uo pipefail

BASE="${BASE:-https://api.kronos-space.com}"
FRONTEND="${FRONTEND:-https://kronos-space.com}"
FRONTEND_ALT="${FRONTEND_ALT:-}"
ORIGINS="${ORIGINS:-https://kronos-space.com,https://www.kronos-space.com}"

failures=0
tmp="$(mktemp -d)"

ok() { printf 'OK    %s\n' "$1"; }
fail() { printf 'FALLA %s\n' "$1"; failures=$((failures + 1)); }
info() { printf '      %s\n' "$1"; }

trap 'rm -rf "$tmp"' EXIT

header_value() {
  local file="$1" name="$2"

  tr -d '\r' < "$file" 2>/dev/null |
    grep -i "^${name}:" |
    head -1 |
    sed "s/^[^:]*: *//" || true
}

echo "===== KRONOS · VERIFICACIÓN DE DESPLIEGUE (solo lectura) ====="
echo "API:      ${BASE}"
echo "Frontend: ${FRONTEND}"
[ -n "$FRONTEND_ALT" ] && echo "Alt:      ${FRONTEND_ALT}"
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
echo "----- 2. CORS PARA LOS ORÍGENES DEL FRONTEND -----"

IFS=',' read -r -a ORIGIN_LIST <<< "$ORIGINS"

for origin in "${ORIGIN_LIST[@]}"; do
  origin="$(printf '%s' "$origin" | xargs)"
  [ -z "$origin" ] && continue

  simple="$(curl -sS -D - -o /dev/null --max-time 30 -H "Origin: ${origin}" "${BASE}/api/health" 2>/dev/null | tr -d '\r' | grep -i '^access-control-allow-origin:' || true)"

  if printf '%s' "$simple" | grep -qi "origin: ${origin}$"; then
    ok "GET /api/health permite ${origin}"
  else
    fail "GET /api/health NO permite ${origin} (${simple:-sin encabezado ACAO})"
  fi

  preflight="$(curl -sS -D - -o /dev/null --max-time 30 -X OPTIONS -H "Origin: ${origin}" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type" "${BASE}/api/auth/login" 2>/dev/null | tr -d '\r' | grep -i '^access-control-allow-' || true)"

  if printf '%s' "$preflight" | grep -qi "^access-control-allow-origin: ${origin}$"; then
    ok "preflight OPTIONS /api/auth/login permite ${origin}"
  else
    fail "preflight OPTIONS /api/auth/login NO permite ${origin}"
    info "$(printf '%s' "$preflight" | tr '\n' ' ')"
  fi
done

echo
echo "----- 3. FRONTENDS Y URL DE API COMPILADA -----"

analyze_frontend() {
  local label="$1" url="$2"
  local slug index headers bundle_path bundle_url
  slug="$(printf '%s' "$url" | tr -c 'a-zA-Z0-9' '_')"
  index="$tmp/index${slug}.html"
  headers="$tmp/headers${slug}.txt"

  local code
  code="$(curl -sS -D "$headers" -o "$index" -w '%{http_code}' --max-time 30 "${url}/" || echo 000)"

  echo
  echo "  == ${label}: ${url}"

  if [ "$code" = "200" ]; then
    ok "${label} → HTTP 200"
  else
    fail "${label} → HTTP ${code}"
    return
  fi

  # ¿Qué plataforma sirve este frontend?
  local server vercel_id cf_ray via
  server="$(header_value "$headers" server)"
  vercel_id="$(header_value "$headers" x-vercel-id)"
  cf_ray="$(header_value "$headers" cf-ray)"
  via="$(header_value "$headers" via)"

  if [ -n "$vercel_id" ]; then
    ok "${label} lo sirve VERCEL (x-vercel-id presente)"
  elif [ -n "$cf_ray" ]; then
    ok "${label} lo sirve CLOUDFLARE (cf-ray presente)"
  else
    info "no se pudo identificar la plataforma (server='${server}' via='${via}')"
  fi

  [ -n "$server" ] && info "server: ${server}"
  [ -n "$cf_ray" ] && info "cf-ray: ${cf_ray}"

  if grep -q 'id="root"' "$index" 2>/dev/null; then
    ok "${label} incluye el contenedor de la SPA"
  else
    fail "${label} no incluye id=\"root\""
  fi

  bundle_path="$(grep -oE 'src="[^"]+\.js"' "$index" 2>/dev/null | head -1 | sed 's/^src="//; s/"$//' || true)"

  if [ -z "$bundle_path" ]; then
    fail "${label}: no se encontró el bundle JS"
    return
  fi

  info "bundle: ${bundle_path}"

  case "$bundle_path" in
    http*) bundle_url="$bundle_path" ;;
    /*) bundle_url="${url}${bundle_path}" ;;
    *) bundle_url="${url}/${bundle_path}" ;;
  esac

  curl -sS -o "$tmp/bundle${slug}.js" --max-time 60 "$bundle_url" || true

  local api_url
  api_url="$(grep -oE 'https://[A-Za-z0-9._-]+(/api)?' "$tmp/bundle${slug}.js" 2>/dev/null | grep -iE 'onrender\.com|api\.kronos-space\.com' | sort -u | head -3 | tr '\n' ' ' || true)"

  if [ -n "$api_url" ]; then
    ok "${label}: el bundle apunta a la API"
    info "API en el bundle: ${api_url}"
  elif grep -q '"/api"' "$tmp/bundle${slug}.js" 2>/dev/null; then
    fail "${label}: el bundle usa \"/api\" relativo y ese origen no proxya la API"
    info "este despliegue NO tiene VITE_API_URL definida en su build"
  else
    fail "${label}: no se pudo determinar la URL de API en el bundle"
  fi

  # Referencias a localhost: solo es un problema si son URLs reales
  # (http://localhost:puerto). Las menciones sueltas dentro de una
  # dependencia no afectan al navegador del usuario.
  local localhost_hits
  localhost_hits="$(grep -oE '[A-Za-z0-9:/._-]*localhost[A-Za-z0-9:/._-]*' "$tmp/bundle${slug}.js" 2>/dev/null | sort -u | head -5 || true)"

  if [ -z "$localhost_hits" ]; then
    ok "${label}: sin referencias a localhost"
  else
    local real_urls
    real_urls="$(printf '%s\n' "$localhost_hits" | grep -E 'https?://localhost|localhost:[0-9]+' || true)"

    if [ -n "$real_urls" ]; then
      fail "${label}: el bundle apunta a localhost"
      info "$(printf '%s' "$real_urls" | tr '\n' ' ')"
    else
      ok "${label}: sin URLs de localhost"
      info "menciones internas de dependencias (no afectan al navegador): $(printf '%s' "$localhost_hits" | tr '\n' ' ')"
    fi
  fi
}

analyze_frontend "principal" "$FRONTEND"
[ -n "$FRONTEND_ALT" ] && analyze_frontend "alterno" "$FRONTEND_ALT"

echo
if [ "$failures" -eq 0 ]; then
  echo "RESULTADO: despliegue correcto (health, CORS y frontends OK)"
  exit 0
fi

echo "RESULTADO: ${failures} comprobaciones fallaron"
exit 1
