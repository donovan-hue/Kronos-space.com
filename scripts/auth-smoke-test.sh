#!/usr/bin/env bash
#
# KRONOS-AUDIT-002 — validación end-to-end del flujo de autenticación
# contra un backend real (MongoDB real, sin sustitutos).
#
#   BASE=http://127.0.0.1:5000 scripts/auth-smoke-test.sh
#   BASE=https://TU-API-EN-RENDER scripts/auth-smoke-test.sh
#
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:5000}"
STAMP="$(date +%s)"
EMAIL="${EMAIL:-smoke${STAMP}@example.com}"
USERNAME="${USERNAME:-smoke${STAMP}}"
PASSWORD="${PASSWORD:-KronosTest123!}"
BODY_FILE="$(mktemp)"

failures=0

json_field() {
  printf '%s' "$1" |
    python3 -c "import json,sys; print(json.load(sys.stdin).get(sys.argv[1], ''))" "$2" 2>/dev/null || printf ''
}

check() {
  local label="$1" expected="$2" actual="$3"

  if [ "$expected" = "$actual" ]; then
    printf 'OK    %-44s HTTP %s\n' "$label" "$actual"
  else
    printf 'FALLA %-44s esperado %s, recibido %s\n' "$label" "$expected" "$actual"
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

echo "===== KRONOS-AUDIT-002 · FLUJO DE AUTENTICACIÓN ====="
echo "BASE=${BASE}"

echo
echo "----- 1. HEALTH -----"
check "GET /api/health" "200" "$(curl -sS -o "$BODY_FILE" -w '%{http_code}' "${BASE}/api/health")"
echo "      database=$(json_field "$(cat "$BODY_FILE")" database)"

echo
echo "----- 2. REGISTRO REAL -----"
status="$(request POST /api/auth/register "" "{\"username\":\"${USERNAME}\",\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"displayName\":\"Smoke Test\"}")"
TOKEN="$(json_field "$(cat "$BODY_FILE")" token)"
check "registro" "201" "$status"

if [ -z "$TOKEN" ]; then
  echo "ERROR: el registro no devolvió token"
  cat "$BODY_FILE"
  exit 1
fi

echo
echo "----- 3. NAVEGACIÓN AUTENTICADA -----"
check "GET /api/auth/me" "200" "$(request GET /api/auth/me "$TOKEN")"
check "GET /api/users/me" "200" "$(request GET /api/users/me "$TOKEN")"
check "GET /api/auth/session" "200" "$(request GET /api/auth/session "$TOKEN")"
check "GET /api/auth/token" "200" "$(request GET /api/auth/token "$TOKEN")"
check "GET /api/users/me sin token" "401" "$(request GET /api/users/me)"

echo
echo "----- 4. LOGIN REAL -----"
check "login" "200" "$(request POST /api/auth/login "" "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")"
LOGIN_TOKEN="$(json_field "$(cat "$BODY_FILE")" token)"
check "login con contraseña incorrecta" "401" "$(request POST /api/auth/login "" "{\"email\":\"${EMAIL}\",\"password\":\"ClaveIncorrecta999!\"}")"

if [ -z "$LOGIN_TOKEN" ]; then
  echo "ERROR: el login no devolvió token"
  exit 1
fi

echo
echo "----- 5. LOGOUT REAL -----"
check "POST /api/auth/logout" "200" "$(request POST /api/auth/logout "$LOGIN_TOKEN")"
echo "      respuesta: $(cat "$BODY_FILE")"

revoked="$(request GET /api/users/me "$LOGIN_TOKEN")"
revoked_code="$(json_field "$(cat "$BODY_FILE")" code)"
check "token revocado rechazado" "401" "$revoked"

if [ "$revoked_code" = "TOKEN_REVOKED" ]; then
  printf 'OK    %-44s code %s\n' "código de revocación" "$revoked_code"
else
  printf 'FALLA %-44s esperado TOKEN_REVOKED, recibido %s\n' "código de revocación" "${revoked_code:-vacío}"
  failures=$((failures + 1))
fi

echo
echo "----- 6. TOKEN INVÁLIDO -----"
malformed="$(request GET /api/users/me "esto-no-es-un-jwt")"
malformed_code="$(json_field "$(cat "$BODY_FILE")" code)"
check "token malformado" "401" "$malformed"
echo "      code: ${malformed_code:-?}"

rm -f "$BODY_FILE"

echo
if [ "$failures" -eq 0 ]; then
  echo "RESULTADO: FLUJO DE AUTENTICACIÓN COMPLETO OK"
else
  echo "RESULTADO: ${failures} comprobaciones fallaron"
  exit 1
fi
