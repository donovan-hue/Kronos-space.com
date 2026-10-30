#!/usr/bin/env node
"use strict";

/**
 * BARRIDO NO-MOCK
 *
 * La pregunta que responde es estrecha y molesta a propósito: ¿una prueba que se
 * hace llamar «E2E» o «de navegador contra el build» está realmente hablando con
 * el backend, o le sustituyeron la red? Un `page.route` que contesta en lugar del
 * servidor, o un `t.mock.method` sobre un modelo dentro de un E2E, miden otra cosa
 * —el manejo del cliente, o la rama de error— y cuentan como si midieran el contrato.
 *
 * Regla: una sustitución de red o de base de datos en un archivo de estos **no
 * está prohibida**, pero tiene que estar declarada en el propio archivo, en una
 * línea que empiece por `KRONOS-NO-MOCK` y que diga qué se sustituye y qué se
 * está midiendo en cambio. El marcador vive junto al código porque es la única
 * forma de que quien lo lea sepa qué está mirando.
 *
 * Uso:
 *   node scripts/ci/barrido-no-mock.mjs            # informe
 *   node scripts/ci/barrido-no-mock.mjs --estricto # además, marcador sin coincidencias = fallo
 *   node scripts/ci/barrido-no-mock.mjs --json      # resumen máquina, para el paso de CI
 *
 * Salida: por archivo, `OK` (sin sustituciones), `DECLARA` (las tiene y están
 * declaradas, con su cuenta visible) o `FALTA` (sustituye sin declarar).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const VERDE = "\u001b[32m";
const ROJO = "\u001b[31m";
const AMARILLO = "\u001b[33m";
const GRIS = "\u001b[90m";
const FIN = "\u001b[0m";

/** Archivos que afirman algo sobre el sistema real, no sobre un componente aislado. */
const ALCANCE = [
  { directorio: "server/test", patron: /\.e2e\.test\.(js|mjs)$/, porque: "E2E del servidor: su contrato es el backend con MongoDB real" },
  { directorio: "client/test-browser", patron: /\.spec\.(js|mjs)$/, porque: "prueba de navegador sobre el build: su contrato es la app sirviendo de verdad" }
];

/**
 * Ayudantes compartidos que ya sustituyen la red por su cuenta. Un spec que los
 * importa no está hablando con el backend, aunque su archivo no tenga un solo
 * `page.route`: la sustitución está a un `import` de distancia. Se detectan
 * leyendo los propios ayudantes, no adivinando nombres.
 */
const DIRECTORIO_AYUDANTES = "client/test-browser/helpers";

/** Sustituciones de red o de base que cambian lo que una prueba mide. */
const SUSTITUCIONES = [
  { patron: /\bpage\.route\s*\(/, nombre: "page.route (intercepta peticiones reales)" },
  { patron: /\broute\.fulfill\s*\(/, nombre: "route.fulfill (responde en lugar del servidor)" },
  { patron: /\broute\.abort\s*\(/, nombre: "route.abort (corta la red)" },
  { patron: /globalThis\.(fetch|WebSocket)\s*=/, nombre: "reasignación de globalThis.fetch/WebSocket" },
  { patron: /\bglobal\.(fetch)\s*=/, nombre: "reasignación de global.fetch" },
  { patron: /\brequire\.cache\b/, nombre: "manipulación de require.cache" },
  { patron: /\b(?:t|test)\.mock\.(method|getter)\s*\(/, nombre: "t.mock.method (sustituye una función real)" },
  { patron: /\b(?:vi|jest)\.mock\s*\(/, nombre: "vi.mock / jest.mock" },
  { patron: /mock\.method\s*\(/, nombre: "mock.method" },
  { patron: /\bmongoose\.(?:connect|model)\s*=\s*(?:async\s*)?(?:\(|function)/, nombre: "reasignación de mongoose.connect/model" }
];

const MARCADOR = /^\s*\/\/?\s*KRONOS-NO-MOCK\b/;

function archivosEn(directorio) {
  const absoluto = path.join(RAIZ, directorio);

  if (!fs.existsSync(absoluto)) return [];

  return fs
    .readdirSync(absoluto)
    .filter((nombre) => /\.(js|mjs)$/.test(nombre))
    .map((nombre) => path.join(directorio, nombre));
}

function sinComentariosDeTexto(texto) {
  return texto.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function sinComentarios(linea) {
  return linea.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
}

function ayudantesQueSustituyen() {
  const absolutos = path.join(RAIZ, DIRECTORIO_AYUDANTES);

  if (!fs.existsSync(absolutos)) return new Set();

  const nombres = new Set();

  for (const nombre of fs.readdirSync(absolutos)) {
    if (!/\.(js|mjs)$/.test(nombre)) continue;
    const codigo = fs.readFileSync(path.join(absolutos, nombre), "utf8");

    if (SUSTITUCIONES.some((s) => s.patron.test(sinComentariosDeTexto(codigo)))) nombres.add(nombre.replace(/\.(js|mjs)$/, ""));
  }

  return nombres;
}

function analizar() {
  const ayudantes = ayudantesQueSustituyen();
  const resultados = [];

  for (const grupo of ALCANCE) {
    for (const relativo of archivosEn(grupo.directorio)) {
      const nombreArchivo = path.basename(relativo);

      if (!grupo.patron.test(nombreArchivo)) continue;

      const lineas = fs.readFileSync(path.join(RAIZ, relativo), "utf8").split("\n");
      const cabecera = lineas.slice(0, 60);
      const declaracion = cabecera.findIndex((l) => MARCADOR.test(l));
      const coincidencias = [];

      for (let i = 0; i < lineas.length; i += 1) {
        const importacion = /^\s*import\s[^;]*from\s+["'][^"']*helpers\/([a-zA-Z0-9._-]+)["']/.exec(sinComentarios(lineas[i]));

        if (importacion && ayudantes.has(importacion[1])) {
          coincidencias.push({ linea: i + 1, que: `usa «helpers/${importacion[1]}», que ya sustituye la red` });
        }
      }

      lineas.forEach((linea, i) => {
        // El propio marcador no puede contar como sustitución.
        if (i === declaracion) return;
        const limpio = sinComentarios(linea);

        for (const s of SUSTITUCIONES) {
          if (s.patron.test(limpio)) {
            // Una línea puede casar con dos patrones que describen lo mismo
            // (`t.mock.method` y `mock.method`): se reporta una vez.
            if (!coincidencias.some((c) => c.linea === i + 1)) coincidencias.push({ linea: i + 1, que: s.nombre });
            break;
          }
        }
      });

      resultados.push({
        archivo: relativo,
        porque: grupo.porque,
        declaracion: declaracion >= 0 ? lineas[declaracion].trim() : null,
        lineaDeclaracion: declaracion >= 0 ? declaracion + 1 : 0,
        coincidencias
      });
    }
  }

  return resultados;
}

function main() {
  const estricto = process.argv.includes("--estricto");
  const resultados = analizar();
  const sinDeclarar = [];
  let declaradas = 0;
  let marcadoresHueros = 0;
  let limpios = 0;

  for (const r of resultados) {
    if (r.coincidencias.length && !r.declaracion) sinDeclarar.push(r);
    else if (r.coincidencias.length) declaradas += 1;
    else if (r.declaracion) marcadoresHueros += 1;
    else limpios += 1;
  }

  if (process.argv.includes("--json")) {
    const resumen = {
      ok: sinDeclarar.length === 0,
      revisados: resultados.length,
      limpios,
      declaradas,
      marcadoresSinUso: marcadoresHueros,
      archivos: resultados.map((r) => ({
        archivo: r.archivo,
        sustituciones: r.coincidencias.length,
        declarada: Boolean(r.declaracion)
      }))
    };

    console.log(JSON.stringify(resumen, null, 2));

    return sinDeclarar.length > 0 ? 1 : 0;
  }

  console.log("");
  console.log("  BARRIDO NO-MOCK");
  console.log(`  Archivos revisados: ${resultados.length} · sin sustituciones ${limpios} · declaradas ${declaradas} · sin declarar ${sinDeclarar.length} · marcadores sin uso ${marcadoresHueros}`);
  console.log("");

  for (const r of sinDeclarar) {
    console.log(`${ROJO}FALTA${FIN} ${r.archivo} — ${r.coincidencias.length} sustitución(es) de red o base sin declarar`);
    for (const c of r.coincidencias.slice(0, 6)) console.log(`      ${GRIS}línea ${String(c.linea).padStart(4)}: ${c.que}${FIN}`);
    if (r.coincidencias.length > 6) console.log(`      ${GRIS}… y ${r.coincidencias.length - 6} más${FIN}`);
    console.log(`      ${GRIS}por qué importa: ${r.porque}${FIN}`);
  }

  if (sinDeclarar.length === 0 && declaradas === 0 && marcadoresHueros === 0) {
    console.log(`${VERDE}Ningún E2E ni prueba de navegador sustituye la red o la base de datos.${FIN}`);
    console.log("");

    return 0;
  }

  if (declaradas > 0) {
    console.log(`${AMARILLO}AVISO${FIN} ${declaradas} archivo(s) declaran sustituciones: miden el manejo del error o del cliente, no el contrato del backend.`);
    for (const r of resultados.filter((x) => x.coincidencias.length && x.declaracion)) {
      console.log(`      ${GRIS}${r.archivo}: ${r.declaracion}${FIN}`);
    }
    console.log("");
  }

  if (marcadoresHueros > 0) {
    const mensaje = `${ROJO}FALTA${FIN} marcador KRONOS-NO-MOCK sin ninguna sustitución: o hay una línea que el barrido ya no ve, o el archivo ya no simula nada y el marcador sobra`;

    if (estricto) {
      for (const r of resultados.filter((x) => !x.coincidencias.length && x.declaracion)) {
        console.log(`${mensaje} (${r.archivo}:${r.lineaDeclaracion})`);
      }

      return 1;
    }
    console.log(`${GRIS}${mensaje} (se vuelve fallo con --estricto)${FIN}`);
    console.log("");
  }

  if (sinDeclarar.length > 0) {
    console.log(`${ROJO}Un verde con sustituciones sin declarar no dice nada del backend.${FIN} Decláralas en la cabecera del archivo con una línea \`KRONOS-NO-MOCK — qué se sustituye y qué se mide en cambio\`.`);
    console.log("");

    return 1;
  }

  return 0;
}

process.exit(main());
