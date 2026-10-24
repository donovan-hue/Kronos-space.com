#!/usr/bin/env node
/**
 * INVENTARIO DE ESTILOS —Generate una pantalla para revisar cada regla CSS
 * del repo: vista previa real, uso real en el código y duplicados.
 *
 *   node scripts/styles/style-inventory.js
 *   node scripts/styles/style-inventory.js --out docs/ESTILOS-INVENTARIO.html
 *
 * No necesita MongoDB ni navegador: solo lee las hojas y el código.
 * La página resultante es un HTML autónomo: se abre con doble clic y
 * funciona sin servidor.
 */

const fs = require("node:fs");
const path = require("node:path");
const postcss = require("postcss");

const ROOT = path.resolve(__dirname, "..", "..");
const RAIZES_CSS = ["client/src", "client/demo"];
const RAIZES_CODIGO = ["client/src", "client/demo", "client/test-ui", "client/test"];

/* ------------------------------------------------------------------ */
/* 1 · Hojas CSS                                                        */
/* ------------------------------------------------------------------ */
function walk(dir, filtro) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", "build", ".git"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, filtro));
    else if (!filtro || filtro(p)) out.push(p);
  }
  return out;
}

const hojas = RAIZES_CSS
  .flatMap((r) => walk(path.join(ROOT, r), (p) => p.endsWith(".css")))
  .sort();

/* ------------------------------------------------------------------ */
/* 2 · Clases que el código realmente usa                               */
/* ------------------------------------------------------------------ */
const codigo = RAIZES_CODIGO
  .flatMap((r) => walk(path.join(ROOT, r), (p) => /\.(jsx?|mjs|tsx?)$/.test(p)))
  .map((p) => fs.readFileSync(p, "utf8"))
  .join("\n");

const usadas = new Set();
// className="..." y className={`...`} (literal y con interpolaciones).
// El sufijo de la expresión (`.trim()`, `.toString()`…) no debe impedir
// reconocer la plantilla: `className={`k-scene ${x}`.trim()}` sí usa k-scene.
for (const m of codigo.matchAll(/class(?:Name)?\s*=\s*\{?\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g)) {
  const bruto = m[1] || m[2] || m[3] || "";
  for (const token of bruto.split(/\s+/)) {
    const clase = token.replace(/\$\{[^}]*\}/g, " ").trim();
    if (!clase || clase.includes(" ")) continue;
    usadas.add(clase);
  }
}
// Plantillas de clase construidas por concatenación: k-badge-, k-toast-, ...
for (const m of codigo.matchAll(/`([^`]*\$\{[^`]*`)/g)) {
  for (const pre of m[1].matchAll(/([a-zA-Z][\w-]*)-?\$\{/g)) {
    usadas.add(`${pre[1]}-*`);
  }
}
// Cualquier clase suelta que aparezca como cadena en el código.
for (const m of codigo.matchAll(/["'`]([a-zA-Z][\w-]{2,})["'`]/g)) {
  usadas.add(m[1]);
}

/* ------------------------------------------------------------------ */
/* 3 · Reglas                                                            */
/* ------------------------------------------------------------------ */
function clasesDe(selector) {
  const out = [];
  for (const m of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) out.push(m[1]);
  return out;
}

const reglas = [];
let id = 0;

for (const hoja of hojas) {
  const rel = path.relative(ROOT, hoja).replace(/\\/g, "/");
  const texto = fs.readFileSync(hoja, "utf8");
  let ast;
  try {
    ast = postcss.parse(texto, { from: hoja });
  } catch (error) {
    console.error(`hoja ilegible: ${rel}: ${error.message}`);
    continue;
  }

  ast.walkRules((rule) => {
    const decls = [];
    rule.each((child) => {
      if (child.type === "decl") {
        decls.push({ prop: child.prop, value: child.value, important: Boolean(child.important) });
      }
    });
    if (!decls.length) return;

    const contexto = [];
    let enKeyframes = false;
    for (let p = rule.parent; p && p.type !== "root"; p = p.parent) {
      if (p.type === "atrule") {
        if (p.name === "keyframes") enKeyframes = true;
        contexto.unshift(`@${p.name} ${p.params}`.trim());
      }
    }
    // Los pasos de una animación (`from`, `to`, `50%`) no son reglas: son
    // fotogramas. Se listan aparte como parte de su @keyframes.
    if (enKeyframes) return;

    const clases = clasesDe(rule.selector);
    const sinUso = clases.filter((c) => !usadas.has(c) && !usadas.has(`${c}-*`));

    const selector = rule.selector.replace(/\s+/g, " ").trim();
    // Qué tan fiel puede ser la vista previa: un selector de un solo
    // compuesto se aplica tal cual; con combinadores o pseudo-elementos
    // la muestra es orientativa, no exacta.
    const tienePseudo = /::/.test(selector);
    const tieneEstado = /:(hover|focus|active|visited|focus-visible|disabled|checked)\b/.test(selector);
    const tieneCombinador = /[ >+~]/.test(selector.replace(/\[[^\]]*\]/g, ""));
    const preview = tienePseudo ? "solo-texto"
      : (tieneCombinador || tieneEstado) ? "aproximada"
        : "exacta";

    reglas.push({
      id: id++,
      hoja: rel,
      linea: rule.source?.start?.line ?? 0,
      selector,
      contexto,
      decls,
      clases,
      sinUso,
      preview,
      estado: sinUso.length ? (sinUso.length === clases.length ? "sin-uso" : "parcial") : "usada"
    });
  });
}

/* ------------------------------------------------------------------ */
/* 4 · Duplicados: el mismo selector en más de una regla                */
/* ------------------------------------------------------------------ */
const porSelector = new Map();
for (const r of reglas) {
  const clave = r.selector.toLowerCase();
  if (!porSelector.has(clave)) porSelector.set(clave, []);
  porSelector.get(clave).push(r);
}
for (const lista of porSelector.values()) {
  if (lista.length < 2) continue;
  for (const r of lista) r.duplicado = lista.length;
}

/* ------------------------------------------------------------------ */
/* 5 · Hoja con su resumen                                              */
/* ------------------------------------------------------------------ */
const resumenHojas = hojas.map((hoja) => {
  const rel = path.relative(ROOT, hoja).replace(/\\/g, "/");
  const propias = reglas.filter((r) => r.hoja === rel);
  return {
    hoja: rel,
    reglas: propias.length,
    decls: propias.reduce((n, r) => n + r.decls.length, 0),
    sinUso: propias.filter((r) => r.estado === "sin-uso").length,
    duplicadas: propias.filter((r) => r.duplicado).length,
    lineas: fs.readFileSync(hoja, "utf8").split("\n").length
  };
});

/* ------------------------------------------------------------------ */
/* 6 · HTML                                                              */
/* ------------------------------------------------------------------ */
const datos = {
  generado: new Date().toISOString().slice(0, 10),
  hojas: resumenHojas,
  reglas: reglas.map((r) => ({
    id: r.id,
    hoja: r.hoja,
    linea: r.linea,
    selector: r.selector,
    contexto: r.contexto,
    decls: r.decls,
    estado: r.estado,
    preview: r.preview,
    sinUso: r.sinUso,
    duplicado: r.duplicado || 0
  }))
};

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Inventario de estilos · Kronos Space</title>
<style>
  :root {
    --fondo: #0a0a0a; --panel: #141414; --linea: #262626; --linea-fuerte: #3a3a3a;
    --texto: #ededed; --tenue: #9a9a9a; --apagado: #6d6d6d;
    --quitar: #ff6b6b; --quedarse: #5ad48a; --ojo: #ffc857;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--fondo); color: var(--texto);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  header { position: sticky; top: 0; z-index: 10; background: #0a0a0aee; backdrop-filter: blur(10px);
           border-bottom: 1px solid var(--linea); padding: 14px 20px; }
  h1 { margin: 0 0 4px; font-size: 17px; letter-spacing: .02em; }
  .sub { color: var(--tenue); font-size: 12px; }
  .cifras { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .cifra { background: var(--panel); border: 1px solid var(--linea); border-radius: 8px; padding: 5px 10px; font-size: 12px; }
  .cifra b { font-size: 14px; }
  .filtros { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
  input[type=search], select {
    background: #000; color: var(--texto); border: 1px solid var(--linea-fuerte);
    border-radius: 8px; padding: 7px 10px; font-size: 13px; min-width: 180px;
  }
  label.chk { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--tenue); cursor: pointer; }
  main { padding: 18px 20px 120px; }
  h2.hoja { margin: 30px 0 10px; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: var(--apagado);
            border-bottom: 1px solid var(--linea); padding-bottom: 6px; display: flex; gap: 10px; align-items: baseline; }
  h2.hoja span { font-family: var(--mono); font-size: 11px; color: var(--tenue); text-transform: none; letter-spacing: 0; }
  .regla { display: grid; grid-template-columns: 300px 1fr 220px; gap: 14px; padding: 12px 0; border-bottom: 1px solid #1b1b1b; }
  @media (max-width: 1000px) { .regla { grid-template-columns: 1fr; } }
  .sel { font-family: var(--mono); font-size: 12px; color: #d6d6d6; word-break: break-word; }
  .ctx { color: var(--apagado); font-family: var(--mono); font-size: 11px; margin-top: 4px; }
  .decls { font-family: var(--mono); font-size: 11.5px; color: #b9b9b9; white-space: pre-wrap; word-break: break-word; }
  .decls .p { color: #8fd3ff; } .decls .v { color: #d9d9d9; }
  .marco { padding: 10px; border: 1px dashed #2f2f2f; border-radius: 10px; background: #0e0e0e; }
  .muestra { border: 0; background: #000; color: #cfcfcf; padding: 10px 12px; min-height: 52px;
             display: flex; align-items: center; gap: 8px; border-radius: 8px; overflow: hidden; }
  .muestra .texto { font-size: 15px; }
  .muestra .caja { width: 34px; height: 34px; border: 1px dashed #555; flex: 0 0 auto; }
  .insignias { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
  .ins { font-size: 10.5px; padding: 2px 7px; border-radius: 999px; border: 1px solid var(--linea-fuerte); color: var(--apagado); }
  .ins.sin-uso { border-color: #6b2b2b; color: #ff9a9a; }
  .ins.parcial { border-color: #6b5a2b; color: #ffd88a; }
  .ins.duplicada { border-color: #2b4a6b; color: #9ad0ff; }
  .decision { display: flex; gap: 6px; margin-top: 8px; }
  .decision button { font: inherit; font-size: 12px; cursor: pointer; border-radius: 7px; padding: 5px 10px;
                     border: 1px solid var(--linea-fuerte); background: #000; color: var(--tenue); }
  .decision button.activo-quitar { border-color: var(--quitar); color: #ffd0d0; background: #2a0f0f; }
  .decision button.activo-quedar { border-color: var(--quedarse); color: #c9f5da; background: #0c2a18; }
  footer { position: fixed; bottom: 0; left: 0; right: 0; z-index: 20; background: #0a0a0aee; backdrop-filter: blur(10px);
           border-top: 1px solid var(--linea); padding: 10px 20px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  footer .info { font-size: 12px; color: var(--tenue); }
  footer button { font: inherit; font-size: 13px; cursor: pointer; border-radius: 8px; padding: 8px 14px;
                  border: 1px solid var(--linea-fuerte); background: #000; color: var(--texto); }
  footer button.primario { border-color: #4a6b8f; background: #101820; }
  #salida { position: fixed; inset: 6% 8%; z-index: 40; background: #000; border: 1px solid var(--linea-fuerte);
            border-radius: 12px; padding: 16px; overflow: auto; font-family: var(--mono); font-size: 12px; white-space: pre; display: none; }
  #salida.visible { display: block; }
  .oculto { display: none !important; }
  a { color: #8fd3ff; }
</style>
</head>
<body>
<header>
  <h1>Inventario de estilos · Kronos Space</h1>
  <div class="sub">Cada regla CSS del repo con su vista previa real, su uso en el código y sus duplicados. Marca <b>eliminar</b> o <b>conservar</b> y exporta la decisión.</div>
  <div class="sub" style="border:1px solid #2b3b2b;background:#0a140c;color:#c9f5da;padding:10px 12px;border-radius:10px;margin-top:10px">
    <b>Decisión ya aplicada:</b> el producto quedó con una sola identidad —negro profundo, cromo líquido y reloj 3D en movimiento constante—. Las 30 hojas de producto se fusionaron en <b>client/src/styles/kronos.css</b> y las reglas sin consumidor se eliminaron. Este inventario sirve para revisar y auditar ese resultado.
  </div>
  <div class="cifras" id="cifras"></div>
  <div class="filtros">
    <input type="search" id="buscar" placeholder="Buscar selector, propiedad o valor…">
    <select id="filtroHoja"><option value="">Todas las hojas</option></select>
    <select id="filtroEstado">
      <option value="">Todo</option>
      <option value="sin-uso">Solo sin uso</option>
      <option value="parcial">Uso parcial</option>
      <option value="duplicada">Solo duplicadas</option>
      <option value="importante">Con !important</option>
    </select>
    <label class="chk"><input type="checkbox" id="soloDecidir"> solo las que ya decidí</label>
    <label class="chk"><input type="checkbox" id="ocultarOk"> ocultar las usadas y sin duplicados</label>
    <button id="marcarSinUso" style="font:inherit;font-size:12px;cursor:pointer;background:#000;color:#ffd88a;border:1px solid #6b5a2b;border-radius:8px;padding:7px 10px">marcar todas las sin uso para eliminar</button>
  </div>
</header>
<main id="main"></main>
<footer>
  <span class="info" id="info">Sin decisiones todavía.</span>
  <button class="primario" id="exportar">Exportar selección</button>
  <button id="copiar">Copiar al portapapeles</button>
  <button id="limpiar">Limpiar decisiones</button>
</footer>
<div id="salida"></div>
<script type="application/json" id="datos">${JSON.stringify(datos).replace(/</g, "\\u003c")}</script>
<script>
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const DATOS = JSON.parse(document.getElementById("datos").textContent);
const CLAVE = "kronos:estilos:decision";
const decisiones = JSON.parse(localStorage.getItem(CLAVE) || "{}");
const $ = (s) => document.querySelector(s);
const main = $("#main");

/* ---- cifras ---- */
const totalDecls = DATOS.reglas.reduce((n, r) => n + r.decls.length, 0);
const sinUso = DATOS.reglas.filter((r) => r.estado === "sin-uso").length;
const parcial = DATOS.reglas.filter((r) => r.estado === "parcial").length;
const dup = DATOS.reglas.filter((r) => r.duplicado).length;
const imp = DATOS.reglas.reduce((n, r) => n + r.decls.filter((d) => d.important).length, 0);
$("#cifras").innerHTML = [
  ["Hojas", DATOS.hojas.length],
  ["Reglas", DATOS.reglas.length],
  ["Declaraciones", totalDecls],
  ["Sin uso", sinUso],
  ["Uso parcial", parcial],
  ["Duplicadas", dup],
  ["!important", imp]
].map(([k, v]) => '<span class="cifra">' + k + ' <b>' + v + '</b></span>').join("");

const selHoja = $("#filtroHoja");
for (const h of DATOS.hojas) {
  const o = document.createElement("option");
  o.value = h.hoja;
  o.textContent = h.hoja.replace("client/src/", "") + " (" + h.reglas + ")";
  selHoja.appendChild(o);
}

/* ---- muestra ---- */
function valorMuestra(d) {
  // Ajustes para que la muestra exista dentro de una caja y sea legible.
  if (d.prop === "position") return "relative";
  if (d.prop === "display" && /^none$/.test(d.value)) return "block";
  if (d.prop === "visibility" && /^hidden$/.test(d.value)) return "visible";
  if (d.prop === "opacity" && /^0(\\D|$)/.test(d.value)) return "1";
  if (d.prop === "z-index") return "auto";
  if (d.prop === "transform") return "none";
  if (d.prop === "filter") return "none";
  return d.value
    .replace(/(\\d*\\.?\\d+)vh/g, (m, n) => Math.round(parseFloat(n) * 8) + "px")
    .replace(/(\\d*\\.?\\d+)vw/g, (m, n) => Math.round(parseFloat(n) * 12) + "px")
    .replace(/(\\d*\\.?\\d+)rem/g, (m, n) => Math.round(parseFloat(n) * 16) + "px");
}

function cajaMuestra(r) {
  const decls = r.decls.map((d) => d.prop + ":" + valorMuestra(d) + (d.important ? " !important" : ""));
  const texto = decls.join(";");
  const tieneCaja = r.decls.some((d) => /^(padding|margin|width|height|display|grid|gap|border)/.test(d.prop));
  const oculto = r.decls.some((d) => (d.prop === "display" && /^none$/.test(d.value)) ||
    (d.prop === "visibility" && /^hidden$/.test(d.value)) || (d.prop === "opacity" && /^0(\\D|$)/.test(d.value)));
  const nota = r.preview === "exacta" ? "" :
    '<div class="ctx">vista previa ' + (r.preview === "solo-texto" ? "orientativa (pseudo-elemento)" : "orientativa (combinador o estado)") + '</div>';
  return '<div class="marco"><div class="muestra" id="prev-' + r.id + '" style="' + esc(texto) + '">' +
    (tieneCaja ? '<span class="caja"></span>' : '') +
    '<span class="texto">Aa 123 ' + esc(r.selector.split(",")[0].slice(0, 28)) + '</span>' +
    '</div>' + (oculto ? '<div class="ins sin-uso">oculta el contenido</div>' : '') + nota + '</div>' +
    '<div class="decls">' + r.decls.map((d) =>
      '<span class="p">' + esc(d.prop) + '</span>: <span class="v">' + esc(d.value) + '</span>' +
      (d.important ? ' <span class="ins">!important</span>' : '')).join(";\\n") + '</div>';
}

function insignia(r) {
  const out = [];
  if (r.estado === "sin-uso") out.push('<span class="ins sin-uso">sin uso</span>');
  if (r.estado === "parcial") out.push('<span class="ins parcial">uso parcial: ' + esc(r.sinUso.join(", ")) + '</span>');
  if (r.duplicado) out.push('<span class="ins duplicada">selector duplicado (' + r.duplicado + 'x)</span>');
  if (r.contexto.length) out.push('<span class="ins">' + esc(r.contexto.join(" ")) + '</span>');
  return out.join("");
}

function render() {
  const q = $("#buscar").value.trim().toLowerCase();
  const hoja = selHoja.value;
  const estado = $("#filtroEstado").value;
  const soloDecidir = $("#soloDecidir").checked;
  const ocultarOk = $("#ocultarOk").checked;

  main.innerHTML = "";
  const porHoja = new Map();
  for (const r of DATOS.reglas) {
    if (!porHoja.has(r.hoja)) porHoja.set(r.hoja, []);
    porHoja.get(r.hoja).push(r);
  }

  for (const [h, lista] of porHoja) {
    if (hoja && h !== hoja) continue;
    const visibles = lista.filter((r) => {
      if (q) {
        const texto = (r.selector + " " + r.decls.map((d) => d.prop + ":" + d.value).join(" ")).toLowerCase();
        if (!texto.includes(q)) return false;
      }
      if (estado === "sin-uso" && r.estado !== "sin-uso") return false;
      if (estado === "parcial" && r.estado !== "parcial") return false;
      if (estado === "duplicada" && !r.duplicado) return false;
      if (estado === "importante" && !r.decls.some((d) => d.important)) return false;
      if (soloDecidir && !decisiones[r.id]) return false;
      if (ocultarOk && r.estado === "usada" && !r.duplicado) return false;
      return true;
    });
    if (!visibles.length) continue;

    const titulo = document.createElement("h2");
    titulo.className = "hoja";
    titulo.innerHTML = esc(h.replace("client/src/", "")) + "<span>" + visibles.length + " reglas</span>" +
      '<span style="margin-left:auto;text-transform:none;letter-spacing:0">' +
      '<button data-hoja="' + esc(h) + '" data-accion-hoja="quitar" style="font:inherit;font-size:11px;cursor:pointer;background:#000;color:#ff9a9a;border:1px solid #6b2b2b;border-radius:6px;padding:2px 8px">marcar esta hoja para eliminar</button> ' +
      '<button data-hoja="' + esc(h) + '" data-accion-hoja="quedar" style="font:inherit;font-size:11px;cursor:pointer;background:#000;color:#c9f5da;border:1px solid #2b6b45;border-radius:6px;padding:2px 8px">conservar toda la hoja</button>' +
      '</span>';
    main.appendChild(titulo);

    for (const r of visibles) {
      const fila = document.createElement("div");
      fila.className = "regla";
      const d = decisiones[r.id];
      fila.innerHTML =
        '<div><div class="sel">' + esc(r.selector) + '</div>' +
          '<div class="ctx">' + esc(h) + ':' + r.linea + '</div>' +
          '<div class="insignias">' + insignia(r) + '</div>' +
          '<div class="decision">' +
            '<button data-accion="quitar" class="' + (d === "quitar" ? "activo-quitar" : "") + '">eliminar</button>' +
            '<button data-accion="quedar" class="' + (d === "quedar" ? "activo-quedar" : "") + '">conservar</button>' +
          '</div></div>' +
        '<div>' + cajaMuestra(r) + '</div>' +
        '<div class="ctx">' + (d ? "decisión: " + d : "sin decisión") + '</div>';
      main.querySelectorAll("button[data-accion-hoja]").forEach((b) => {
        if (b.dataset.hoja !== h) return;
        b.addEventListener("click", () => {
          for (const r of lista) {
            if (b.dataset.accionHoja === "quitar") decisiones[r.id] = "quitar";
            else delete decisiones[r.id];
          }
          localStorage.setItem(CLAVE, JSON.stringify(decisiones));
          render();
        });
      });
      fila.querySelectorAll(".decision button").forEach((b) => {
        b.addEventListener("click", () => {
          const accion = b.dataset.accion;
          if (decisiones[r.id] === accion) delete decisiones[r.id];
          else decisiones[r.id] = accion;
          localStorage.setItem(CLAVE, JSON.stringify(decisiones));
          render();
        });
      });
      main.appendChild(fila);
    }
  }
  const n = Object.keys(decisiones).length;
  $("#info").textContent = n
    ? n + " reglas decididas (" + (Object.values(decisiones).filter((v) => v === "quitar").length) + " eliminar, " +
      (Object.values(decisiones).filter((v) => v === "quedar").length) + " conservar)"
    : "Sin decisiones todavía.";
}

function exportar() {
  const quitar = DATOS.reglas.filter((r) => decisiones[r.id] === "quitar");
  const quedar = DATOS.reglas.filter((r) => decisiones[r.id] === "quedar");
  const linea = (r) => r.hoja + ":" + r.linea + "  " + r.selector + "  {" +
    r.decls.map((d) => d.prop + ":" + d.value + (d.important ? " !important" : "")).join("; ") + "}";
  const texto =
    "ELIMINAR (" + quitar.length + ")\\n" + quitar.map(linea).join("\\n") +
    "\\n\\nCONSERVAR (" + quedar.length + ")\\n" + quedar.map(linea).join("\\n");
  const salida = $("#salida");
  salida.textContent = texto;
  salida.classList.add("visible");
  const blob = new Blob([texto], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "estilos-decision.txt";
  a.click();
}

$("#buscar").addEventListener("input", render);
selHoja.addEventListener("change", render);
$("#filtroEstado").addEventListener("change", render);
$("#soloDecidir").addEventListener("change", render);
$("#ocultarOk").addEventListener("change", render);
$("#exportar").addEventListener("click", exportar);
$("#copiar").addEventListener("click", async () => {
  const quitar = DATOS.reglas.filter((r) => decisiones[r.id] === "quitar");
  const linea = (r) => r.hoja + ":" + r.linea + "  " + r.selector;
  const texto = "ELIMINAR (" + quitar.length + ")\\n" + quitar.map(linea).join("\\n");
  try { await navigator.clipboard.writeText(texto); $("#info").textContent = "Copiado: " + quitar.length + " reglas a eliminar."; }
  catch { $("#info").textContent = "El portapapeles no está disponible: usa «Exportar selección»."; }
});
$("#marcarSinUso").addEventListener("click", () => {
  for (const r of DATOS.reglas) if (r.estado === "sin-uso") decisiones[r.id] = "quitar";
  localStorage.setItem(CLAVE, JSON.stringify(decisiones));
  render();
});
$("#limpiar").addEventListener("click", () => {
  Object.keys(decisiones).forEach((k) => delete decisiones[k]);
  localStorage.setItem(CLAVE, JSON.stringify(decisiones));
  render();
});
render();
</script>
</body>
</html>
`;

const salida = process.argv.includes("--out")
  ? path.resolve(ROOT, process.argv[process.argv.indexOf("--out") + 1])
  : path.join(ROOT, "docs", "ESTILOS-INVENTARIO.html");

fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, html, "utf8");

console.log(`Inventario: ${salida}`);
console.log(`  hojas ....... ${hojas.length}`);
console.log(`  reglas ...... ${reglas.length}`);
console.log(`  sin uso ..... ${reglas.filter((r) => r.estado === "sin-uso").length}`);
console.log(`  uso parcial . ${reglas.filter((r) => r.estado === "parcial").length}`);
console.log(`  duplicadas .. ${reglas.filter((r) => r.duplicado).length}`);
console.log(`  peso ........ ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
