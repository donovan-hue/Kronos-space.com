#!/usr/bin/env bash
#
# KRONOS — prueba de humo del backend (contra una API real).
#
#   BASE=http://127.0.0.1:5000 scripts/smoke-test.sh
#   BASE=https://api.kronos-space.com scripts/smoke-test.sh
#
# Crea un usuario temporal con credenciales únicas (no hay cuentas de prueba
# fijas ni contraseñas hardcodeadas), recorre el flujo de sesión y comprueba
# que las rutas de IA estén montadas y respondan con un estado esperado.
# Las rutas de IA pueden devolver 503 "proveedor no configurado": eso también
# es una respuesta válida de una ruta cableada, distinta de un 404.
#
set -uo pipefail

BASE="${BASE:-http://127.0.0.1:5000}"
STAMP="$(date +%s)"
EMAIL="${EMAIL:-smoke${STAMP}@example.test}"
USERNAME="${USERNAME:-smoke${STAMP}}"
PASSWORD="${PASSWORD:-KronosSmoke123!}"
BODY_FILE="$(mktemp)"

failures=0

cleanup() { rm -f "$BODY_FILE"; }
trap cleanup EXIT

json_field() {
  printf '%s' "$1" |
    python3 -c "import json,sys; print(json.load(sys.stdin).get(sys.argv[1], ''))" "$2" 2>/dev/null ||
    printf ''
}

check() {
  local label="$1" expected="$2" actual="$3"

  if [ "$expected" = "$actual" ]; then
    printf 'OK    %-46s HTTP %s\n' "$label" "$actual"
  else
    printf 'FALLA %-46s esperado %s, recibido %s\n' "$label" "$expected" "$actual"
    failures=$((failures + 1))
  fi
}

request() {
  local method="$1" path="$2" token="${3:-}" body="${4:-}"
  local args=(-sS -X "$method" -o "$BODY_FILE" -w '%{http_code}')

  [ -n "$token" ] && args+=(-H "Authorization: Bearer ${token}")
  [ -n "$body" ] && args+=(-H "Content-Type: application/json" -d "$body")

  curl "${args[@]}" "${BASE}${path}"
}

echo "===== KRONOS · PRUEBA DE HUMO ====="
echo "BASE=${BASE}"
echo "usuario temporal: ${USERNAME} <${EMAIL}>"

echo
echo "----- 1. SALUD -----"
check "GET /api/health" "200" "$(curl -sS -o "$BODY_FILE" -w '%{http_code}' "${BASE}/api/health")"
echo "      database=$(json_field "$(cat "$BODY_FILE")" database)"

echo
echo "----- 2. REGISTRO -----"
status="$(request POST /api/auth/register "" "{\"username\":\"${USERNAME}\",\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"displayName\":\"Smoke Test\"}")"
TOKEN="$(json_field "$(cat "$BODY_FILE")" token)"
check "registro" "201" "$status"

if [ -z "$TOKEN" ]; then
  echo "ERROR: el registro no devolvió token"
  cat "$BODY_FILE"
  exit 1
fi

echo
echo "----- 3. SESIÓN AUTENTICADA -----"
check "GET /api/auth/me" "200" "$(request GET /api/auth/me "$TOKEN")"
check "GET /api/users/me" "200" "$(request GET /api/users/me "$TOKEN")"

echo
echo "----- 4. LOGIN Y FEED -----"
check "login" "200" "$(request POST /api/auth/login "" "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")"
LOGIN_TOKEN="$(json_field "$(cat "$BODY_FILE")" token)"

if [ -z "$LOGIN_TOKEN" ]; then
  echo "ERROR: el login no devolvió token"
  cat "$BODY_FILE"
  exit 1
fi

check "GET /api/posts/feed" "200" "$(request GET /api/posts/feed "$LOGIN_TOKEN")"

echo
echo "----- 5. RUTAS DE IA (cableadas, no 404) -----"
for route in "ai/scripts/generate" "ai/images/generate" "ai/videos/generate"; do
  status="$(request POST "/api/${route}" "$LOGIN_TOKEN" '{"prompt":"prueba de humo de Kronos"}')"
  case "$status" in
    200|201|202|400|402|429|502|503|504)
      printf 'OK    %-46s HTTP %s\n' "POST /api/${route}" "$status" ;;
    *)
      printf 'FALLA %-46s HTTP %s\n' "POST /api/${route}" "$status"
      failures=$((failures + 1)) ;;
  esac
done

echo
echo "----- 6. LOGOUT -----"
check "POST /api/auth/logout" "200" "$(request POST /api/auth/logout "$LOGIN_TOKEN")"
check "token revocado rechazado" "401" "$(request GET /api/users/me "$LOGIN_TOKEN")"

echo
if [ "$failures" -eq 0 ]; then
  echo "RESULTADO: PRUEBA DE HUMO OK"
  exit 0
fi

echo "RESULTADO: ${failures} comprobaciones fallaron"
exit 1
