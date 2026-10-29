#!/usr/bin/env node
"use strict";

/**
 * UMBRALES DE COBERTURA — que el número no sea folklore
 *
 * Medir cobertura sin compararla contra algo no cambia nada: el informe se
 * mira, se asiente y se cierra. Este filtro hace una sola cosa —lee la tabla
 * que `node --test --experimental-test-coverage` imprime por la tubería y
 * compara los tres porcentajes de la fila `all files` contra un piso escrito
 * en `scripts/ci/umbrales-cobertura.json`— y falla si el número cae por
 * debajo.
 *
 * Por qué no se usa `--test-coverage-lines`: funciona (Node 22 sale con 1 si
 * no se llega) pero no existe en Node 20, que es el runtime de este CI. Un
 * filtro propio mide lo mismo en cualquier versión y, encima, deja explicar
 * el porqué en la salida.
 *
 * El piso está un punto por debajo de lo medido a propósito: no se escribe
 * para que hoy dé verde exacto, sino para que una caída real se note y una
 * subida no obligue a tocar nada. Cuando la cobertura sube, el informe lo
 * dice y el piso se puede levantar; bajarlo exige borrar la prueba que lo
 * sostenía, que es justo el caso que queremos incómodo.
 *
 * Uso:
 *   cd server && npm run coverage
 *   node --test --experimental-test-coverage ... | node scripts/ci/cobertura-minima.mjs --suite=server
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONFIG = path.join(RAIZ, "scripts", "ci", "umbrales-cobertura.json");

const VERDE = "\u001b[32m";
const ROJO = "\u001b[31m";
const AMARILLO = "\u001b[33m";
const GRIS = "\u001b[90m";
const FIN = "\u001b[0m";

function parsear(args) {
  const opciones = { suite: "", json: false };

  for (const arg of args) {
    if (arg.startsWith("--suite=")) opciones.suite = arg.slice("--suite=".length);
    else if (arg === "--json") opciones.json = true;
  }

  return opciones;
}

/**
 * Fila `all files` de la tabla de Node.
 *
 * El reportero por defecto la imprime como comentario TAP (`# all files ...`),
 * el `spec` como línea de resumen (`ℹ all files ...`). Se aceptan las dos, y
 * el orden de las columnas es el que publica Node: lines, branch, functions.
 */
function leerTabla(texto) {
  const limpio = texto.replace(/\u001b\[[0-9;]*m/g, "");
  const fila = /^[#>\u2139\s]*all files\s*\|([^\n]*)$/im.exec(limpio);

  if (!fila) return null;

  // Node escribe la fila como `# all files | 62.09 | 75.55 | 52.04 |` —sin
  // signo de porcentaje, que solo aparece en algunas versiones del reportero—,
  // así que se leen los números celda por celda en lugar de exigir `%`.
  const celdas = fila[1].split("|").map((celda) => /^\s*(\d+(?:\.\d+)?)\s*%?\s*$/.exec(celda)).filter(Boolean);
  const numeros = celdas.map((m) => Number(m[1]));

  if (numeros.length < 3) return null;

  return { lineas: numeros[0], ramas: numeros[1], funciones: numeros[2] };
}

function main() {
  const opciones = parsear(process.argv.slice(2));

  if (!fs.existsSync(CONFIG)) {
    console.error(`${ROJO}FALLO${FIN} no existe ${path.relative(RAIZ, CONFIG)}`);

    return 2;
  }

  const configuracion = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  const entrada = opciones.suite ? configuracion.suites?.[opciones.suite] : null;

  if (!entrada) {
    console.error(
      `${ROJO}FALLO${FIN} suite ${opciones.suite ? `«${opciones.suite}»` : "sin nombre"} no declarada en ${path.relative(RAIZ, CONFIG)}. Suites: ${Object.keys(configuracion.suites || {}).join(", ")}`
    );

    return 2;
  }

  const texto = fs.readFileSync(0, "utf8");
  const medido = leerTabla(texto);

  if (!medido) {
    console.error(`${ROJO}FALLO${FIN} no se encontró la fila «all files» en la tabla de cobertura.`);
    console.error(`${GRIS}Sin tabla no hay veredicto: revisa que la corrida haya usado --experimental-test-coverage y que Node sea 20 o más.${FIN}`);

    return 2;
  }

  const pisos = { lineas: entrada.lineas, ramas: entrada.ramas, funciones: entrada.funciones };
  const porDebajo = Object.keys(pisos).filter((clave) => medido[clave] < pisos[clave]);
  const porEncima = Object.keys(pisos).filter((clave) => medido[clave] > pisos[clave] + 3);

  if (opciones.json) {
    console.log(JSON.stringify({ suite: opciones.suite, medido, pisos, ok: porDebajo.length === 0 }, null, 2));

    return porDebajo.length ? 1 : 0;
  }

  console.log("");
  console.log(`  COBERTURA · ${opciones.suite}`);

  for (const clave of Object.keys(pisos)) {
    const marca = medido[clave] < pisos[clave] ? ROJO : medido[clave] > pisos[clave] + 3 ? AMARILLO : VERDE;
    const flecha = medido[clave] < pisos[clave] ? "por debajo del piso" : medido[clave] > pisos[clave] + 3 ? "por encima: se puede levantar el piso" : "en su piso";

    console.log(`  ${marca}${clave.padEnd(9)}${FIN} ${String(medido[clave]).padStart(6)} %  · piso ${pisos[clave]} %  ${GRIS}${flecha}${FIN}`);
  }

  if (entrada.como_se_mide) console.log(`  ${GRIS}${entrada.como_se_mide}${FIN}`);

  if (porDebajo.length) {
    console.log("");
    console.log(`${ROJO}BAJA EL PISO${FIN} ${porDebajo.join(", ")} cayeron por debajo de lo declarado.`);
    console.log(`${GRIS}Si la caída es correcta —se fue código, se fusionó una prueba—, reescribe el piso y explica en el commit qué se llevó${FIN}`);
    console.log("");

    return 1;
  }

  if (porEncima.length) {
    console.log("");
    console.log(`${AMARILLO}El piso queda corto en ${porEncima.join(", ")}: levántalo en ${path.relative(RAIZ, CONFIG)} para que la próxima caída se note antes.${FIN}`);
  }

  console.log("");

  return 0;
}

process.exit(main());
