#!/usr/bin/env bash
# KRONOS — ayudantes para publicar evidencia desde CI.
#
# Por qué existe este archivo:
#
#   1. GitHub admite como máximo 10 anotaciones de cada tipo POR PASO. Una
#      cadena larga en un solo paso pierde silenciosamente todo lo que pase
#      de la décima, y lo que se pierde suele ser el final, que es justo la
#      parte que demuestra el resultado. Por eso la cadena se reparte en
#      varios pasos y cada uno carga estos ayudantes.
#
#   2. Los registros y artefactos del run no siempre son accesibles desde
#      donde se revisa el trabajo. Las anotaciones sí lo son por API, así que
#      cada comando publica su resultado ahí.
#
# Uso:
#   source scripts/ci/evidencia.sh
#   ejecutar "titulo" node scripts/db/algo.js
#   medir_antes "titulo" node scripts/db/algo.js   # su fallo ES la evidencia
#   fin "nombre del bloque"

fallos=0

# Ejecuta un comando, publica su resultado y sigue adelante aunque falle:
# una sola corrida tiene que explicar TODO lo que está roto, no solo lo
# primero que se rompió.
ejecutar() {
  local titulo="$1"
  shift

  echo "::group::${titulo}"
  if "$@" > /tmp/kronos-paso.txt 2>&1; then
    tail -n 40 /tmp/kronos-paso.txt
    echo "::endgroup::"
    local resumen
    resumen=$(grep -vE '^\s*$' /tmp/kronos-paso.txt | tail -n 3 | tr '\n' ' ' | cut -c1-600)
    echo "::notice title=${ETIQUETA:-DB} · ${titulo}::${resumen}"
  else
    local codigo=$?
    tail -n 60 /tmp/kronos-paso.txt
    echo "::endgroup::"
    local detalle
    detalle=$(tail -n 10 /tmp/kronos-paso.txt | tr '\n' ' ' | cut -c1-600)
    echo "::error title=${ETIQUETA:-DB} · ${titulo} (salida ${codigo})::${detalle}"
    fallos=$((fallos + 1))
  fi
}

# Para medir el estado PREVIO: que la herramienta proteste es el resultado
# esperado, así que se registra sin contarlo como fallo.
medir_antes() {
  local titulo="$1"
  shift

  echo "::group::${titulo}"
  "$@" > /tmp/kronos-antes.txt 2>&1 || true
  tail -n 40 /tmp/kronos-antes.txt
  echo "::endgroup::"
  local resumen
  resumen=$(grep -vE '^\s*$' /tmp/kronos-antes.txt | tail -n 4 | tr '\n' ' ' | cut -c1-600)
  echo "::notice title=ANTES · ${titulo}::${resumen}"
}

# Cierra un bloque: falla si alguno de sus comandos falló.
fin() {
  local bloque="$1"

  if [ "$fallos" -gt 0 ]; then
    echo "::error title=${bloque}::${fallos} comandos fallaron"
    exit 1
  fi

  echo "${bloque}: completado contra MongoDB real."
}
