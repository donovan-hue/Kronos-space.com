#!/usr/bin/env node
"use strict";

/**
 * PRESUPUESTO DE PRUEBAS OMITIDAS
 *
 * Por qué existe: un `pass` en CI no distingue entre "corrió y pasó" y "no
 * corrió". Las suites E2E del servidor se saltan solas cuando no hay MongoDB
 * real, así que el verde de `main` puede contener 192 casos que nadie ejecutó
 * —que es exactamente donde vivieron los defectos críticos de la auditoría de
 * octubre. Este filtro convierte ese silencio en un fallo con nombre:
 *
 *   - toda omisión tiene que coincidir con un patrón declarado en
 *     `skips-declarados.json`, y
 *   - no puede superar el presupuesto declarado por ese patrón.
 *
 * Uso (el TAP entra por la tubería, como cualquier filtro de CI):
 *
 *   cd server && node --test --test-reporter=tap test/*.test.js | node ../scripts/ci/presupuesto-skip.mjs
 *
 * Opciones:
 *   --declarado <ruta>   archivo JSON de declaración (por defecto el del repo)
 *   --estricto           también falla si el número real queda por debajo del
 *                        presupuesto: se bajó una cota sin bajar el presupuesto
 *   --json               salida máquina-legible para publicar como artefacto
 *
 * Salida: un recuento por motivo y, si algo se desvió, una línea `FALTA`/`EXCEDE`
 * por cada caso concreto. Nunca imprime el nombre completo de 192 pruebas.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DECLARADO = path.join(RAIZ, "scripts", "ci", "skips-declarados.json");

const VERDE = "\u001b[32m";
const ROJO = "\u001b[31m";
const GRIS = "\u001b[90m";
const FIN = "\u001b[0m";

function parsear(args) {
  const opciones = { declarado: DECLARADO, estricto: false, json: false };

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--declarado") opciones.declarado = path.resolve(args[i + 1] || "");
    else if (args[i] === "--estricto") opciones.estricto = true;
    else if (args[i] === "--json") opciones.json = true;
    else if (!args[i].startsWith("--")) opciones.extra = (opciones.extra || []).concat(args[i]);
  }

  return opciones;
}

/**
 * Extrae las omisiones de un TAP de `node --test`.
 *
 * El formato relevante es una línea de resultado con la directiva al final:
 * `ok 12 - <nombre> # SKIP <motivo>`. Se leen también `# TODO`, que en node:test
 * significa "aún no implementada" y es exactamente igual de silenciosa.
 */
function leerTap(texto) {
  const omitidas = [];
  const fallidas = [];
  let aprobadas = 0;
  // `^\s*` no es cosmético: node:test indenta los resultados anidados dentro
  // de cada suite. Sin ese margen solo se contarían los casos de primera
  // capa y las omisiones profundas serían invisibles para el presupuesto.
  const resultado = /^\s*(ok|not ok)\s+\d+\s+-\s+(.*?)(?:\s+#\s+(SKIP|TODO)(?:\s+(.*?))?)?\s*$/;

  for (const linea of texto.split("\n")) {
    const m = resultado.exec(linea);

    if (!m) continue;
    if (m[1] === "not ok") {
      fallidas.push(m[2].trim());
      continue;
    }
    if (m[3]) omitidas.push({ nombre: m[2].trim(), marca: m[3], motivo: (m[4] || "").trim() });
    else aprobadas += 1;
  }

  return { omitidas, fallidas, aprobadas };
}

function cargarDeclaracion(ruta) {
  if (!fs.existsSync(ruta)) {
    return { error: `no existe la declaración de omisiones: ${path.relative(RAIZ, ruta)}` };
  }

  try {
    const datos = JSON.parse(fs.readFileSync(ruta, "utf8"));

    if (!Array.isArray(datos.declarados)) return { error: "el archivo declarado necesita un arreglo `declarados`" };

    for (const d of datos.declarados) {
      if (typeof d.patron !== "string" || !Number.isFinite(d.hasta)) {
        return { error: "cada declaración necesita `patron` (cadena) y `hasta` (número)" };
      }
      try {
        new RegExp(d.patron);
      } catch (error) {
        return { error: `patrón inválido ${d.patron}: ${error.message}` };
      }
    }

    return { datos };
  } catch (error) {
    return { error: `no se pudo leer la declaración: ${error.message}` };
  }
}

function main() {
  const opciones = parsear(process.argv.slice(2));
  const declaracion = cargarDeclaracion(opciones.declarado);

  if (declaracion.error) {
    console.error(`${ROJO}FALLO${FIN} ${declaracion.error}`);
    return 2;
  }

  const texto = fs.readFileSync(0, "utf8");
  const { omitidas, fallidas, aprobadas } = leerTap(texto);

  // Un log vacío, cortado o con el reporter equivale a un verde fabricado: no
  // hay ninguna línea de resultado que negar. Se falla en vez de aprobar.
  if (aprobadas + fallidas.length + omitidas.length === 0) {
    console.error(`${ROJO}FALLO${FIN} el TAP no contiene ningún resultado (${texto.length} bytes leídos).`);
    console.error(`${GRIS}Sin resultados no se puede afirmar que nada quedó omitido: revisa el --test-reporter y que la suite haya arrancado.${FIN}`);

    return 2;
  }
  const reglas = declaracion.datos.declarados.map((d) => ({ ...d, re: new RegExp(d.patron) }));
  const contadores = new Map(reglas.map((r) => [r.patron, 0]));
  const sinDeclarar = [];

  for (const caso of omitidas) {
    const regla = reglas.find((r) => r.re.test(caso.motivo) || r.re.test(caso.nombre));

    if (!regla) {
      sinDeclarar.push(caso);
      continue;
    }
    contadores.set(regla.patron, contadores.get(regla.patron) + 1);
  }

  const excesos = reglas
    .map((r) => ({ ...r, real: contadores.get(r.patron) }))
    .filter((r) => r.real > r.hasta || (opciones.estricto && r.real < r.hasta));

  if (opciones.json) {
    console.log(
      JSON.stringify(
        {
          aprobadas,
          fallidas: fallidas.length,
          omitidas: omitidas.length,
          porMotivo: reglas.map((r) => ({ patron: r.patron, real: contadores.get(r.patron), hasta: r.hasta })),
          sinDeclarar: sinDeclarar.slice(0, 20),
          ok: sinDeclarar.length === 0 && excesos.length === 0 && fallidas.length === 0
        },
        null,
        2
      )
    );

    return sinDeclarar.length === 0 && excesos.length === 0 && fallidas.length === 0 ? 0 : 1;
  }

  console.log("");
  console.log("  PRESUPUESTO DE OMISIONES");
  console.log(`  Aprobadas ${aprobadas} · omitidas ${omitidas.length} · fallidas ${fallidas.length}`);
  console.log("");

  for (const r of reglas) {
    const real = contadores.get(r.patron);
    const marca = real > r.hasta ? `${ROJO}EXCEDE${FIN}` : real === 0 ? `${GRIS}cero${FIN}` : `${VERDE}ok${FIN}`;

    console.log(`  ${marca}  ${String(real).padStart(4)} / ${String(r.hasta).padEnd(4)}  ${GRIS}${r.patron}${FIN}`);
    if (r.por) console.log(`        ${GRIS}${r.por}${FIN}`);
  }

  let mal = 0;

  for (const caso of sinDeclarar.slice(0, 12)) {
    console.log(`  ${ROJO}FALTA${FIN} omisión sin declarar — ${caso.nombre}${caso.motivo ? ` (${caso.motivo})` : ""}`);
    mal += 1;
  }
  if (sinDeclarar.length > 12) {
    console.log(`  ${ROJO}FALTA${FIN} … y ${sinDeclarar.length - 12} omisiones más sin declarar`);
    mal += sinDeclarar.length - 12;
  }

  for (const e of excesos) {
    console.log(`  ${ROJO}EXCEDE${FIN} «${e.patron}» omitió ${e.real}, el presupuesto dice ${e.hasta}`);
    mal += 1;
  }

  for (const f of fallidas.slice(0, 10)) {
    console.log(`  ${ROJO}FALLA${FIN} ${f}`);
  }
  if (fallidas.length > 10) console.log(`  ${ROJO}FALLA${FIN} … y ${fallidas.length - 10} más`);
  mal += fallidas.length;

  if (mal > 0) {
    console.log("");
    if (sinDeclarar.length) {
      console.log(
        `${ROJO}El verde de esta corrida no es evidencia.${FIN} Declare la omisión en ${GRIS}scripts/ci/skips-declarados.json${FIN} con su motivo y su tope, o corréla.`
      );
    } else {
      console.log(
        `${ROJO}El verde de esta corrida no es evidencia.${FIN} O corrélas, o baja el tope en ${GRIS}scripts/ci/skips-declarados.json${FIN} explicando en el commit qué parte del contrato deja de medirse.`
      );
    }
    console.log("");
    return 1;
  }

  console.log("");
  console.log(`${VERDE}Toda omisión declarada y dentro de su presupuesto.${FIN}`);
  console.log(`${GRIS}Bajar un número real sin bajar el presupuesto se acepta: es trabajo hecho. Se mide con --estricto en el congelado.${FIN}`);
  console.log("");

  return 0;
}

process.exit(main());
