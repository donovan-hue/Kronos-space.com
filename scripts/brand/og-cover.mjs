#!/usr/bin/env node
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUBLICO = path.join(RAIZ, "client", "public");
const FUENTES = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf"].filter((ruta) => fs.existsSync(ruta));

/**
 * Tarjeta para compartir, trazada con las MISMAS piezas que la portada del
 * repo: los `path` de `KronosClock.jsx`, los degradados de `MirrorMetalDefs.jsx`
 * y el rótulo de `MirrorWordmark.jsx`. Nada de otro dibujo: si la portada
 * cambia, esto se vuelve a generar con lo nuevo.
 *
 *   node scripts/brand/og-cover.mjs
 */

const W = 1200;
const H = 630;

// Misma geometría y misma hora que la portada (reloj de 320, centrado).
const T = 1.74;                 // escala del reloj
const CX = 600;
const CY = 206;
const HORA = 10, MINUTO = 10;  // 10:10, la hora de los catálogos

const clockAngles = (h, m) => ({ hour: ((h % 12) + m / 60) * 30, minute: m * 6 });

const metal = (id) => `
  <defs>
    <linearGradient id="${id}-face" x1="0" y1="0" x2="0.03" y2="1">
      <stop offset="0" stop-color="#d0d0d0"/><stop offset=".16" stop-color="#bdbdbd"/>
      <stop offset=".32" stop-color="#c7c7c7"/><stop offset=".40" stop-color="#d5d5d5"/>
      <stop offset=".455" stop-color="#7c7c7c"/><stop offset=".48" stop-color="#1c1c1c"/>
      <stop offset=".53" stop-color="#080808"/><stop offset=".63" stop-color="#181818"/>
      <stop offset=".73" stop-color="#343434"/><stop offset=".79" stop-color="#181818"/>
      <stop offset="1" stop-color="#080808"/>
    </linearGradient>
    <linearGradient id="${id}-edge" x1="0" y1="0" x2=".75" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset=".22" stop-color="#a3a3a3"/>
      <stop offset=".43" stop-color="#eeeeee"/><stop offset=".49" stop-color="#303030"/>
      <stop offset=".65" stop-color="#777777"/><stop offset=".83" stop-color="#e5e5e5"/>
      <stop offset="1" stop-color="#3b3b3b"/>
    </linearGradient>
    <linearGradient id="${id}-rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f5f5f5"/><stop offset=".25" stop-color="#9a9a9a"/>
      <stop offset=".47" stop-color="#ffffff"/><stop offset=".51" stop-color="#121212"/>
      <stop offset=".78" stop-color="#b8b8b8"/><stop offset="1" stop-color="#fafafa"/>
    </linearGradient>
    <radialGradient id="${id}-sphere" cx=".32" cy=".2" r=".8">
      <stop offset="0" stop-color="#ffffff"/><stop offset=".18" stop-color="#ededed"/>
      <stop offset=".34" stop-color="#777777"/><stop offset=".44" stop-color="#090909"/>
      <stop offset=".57" stop-color="#141414"/><stop offset=".76" stop-color="#c7c7c7"/>
      <stop offset=".83" stop-color="#f5f5f5"/><stop offset="1" stop-color="#161616"/>
    </radialGradient>
    <!-- El bisel de las letras: mismo filtro que MirrorMetalDefs. -->
    <filter id="${id}-bevel" x="-4%" y="-10%" width="108%" height="125%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation=".7" result="edge"/>
      <feSpecularLighting in="edge" surfaceScale="2.8" specularConstant="1.15" specularExponent="28" lighting-color="#ffffff" result="light">
        <feDistantLight azimuth="230" elevation="48"/>
      </feSpecularLighting>
      <feComposite in="light" in2="SourceAlpha" operator="in" result="clipped"/>
      <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="clipped"/></feMerge>
    </filter>
  </defs>`;

// Órbita: un semianillo detrás y otro delante, como en el componente.
const ringPath = (dir) => dir === 'back'
  ? 'M-132 0 A132 42 0 0 1 132 0'
  : 'M132 0 A132 42 0 0 1 -132 0';

const planet = (id, front) => `
  <g transform="translate(160 160) rotate(-30) translate(${front ? 120 : -120} 0)" opacity="${front ? 1 : .9}">
    <circle r="13" fill="url(#${id}-sphere)" stroke="url(#${id}-edge)" stroke-width=".75"/>
    <ellipse cx="-3.8" cy="-7.2" rx="6.4" ry="2.5" fill="#ffffff" opacity=".85" transform="rotate(-22)"/>
    <path d="M-11 1 Q0 -3 11 1 M-8 7 Q0 3 8 7" fill="none" stroke="#080808" stroke-width="1.5" opacity=".8"/>
    <path d="M-7 -10 Q-12 -3 -9 4" fill="none" stroke="#ffffff" stroke-width="1"/>
  </g>`;

const marcas = Array.from({ length: 12 }, (_, i) =>
  `<path d="M158.8 67 L161.2 67 L161.6 77 L158.4 77 Z" transform="rotate(${i * 30} 160 160)" fill="url(#k-edge)" stroke="#b8b8b8" stroke-width=".35"/>`
).join('');

const angles = clockAngles(HORA, MINUTO);

const reloj = (id) => `
  <g transform="translate(${CX - 160 * T} ${CY - 160 * T}) scale(${T})">
    <g transform="translate(160 160) rotate(-30)">${''}
      <path d="${ringPath('back')}" fill="none" stroke="url(#${id}-rim)" stroke-width="2.1"/>
    </g>
    
    <circle cx="160" cy="160" r="104" fill="#000000" stroke="#242424" stroke-width="7"/>
    <circle cx="160" cy="160" r="104" fill="none" stroke="url(#${id}-edge)" stroke-width="5"/>
    <circle cx="160" cy="160" r="101.3" fill="none" stroke="#d0d0d0" stroke-width=".65"/>
    <circle cx="160" cy="160" r="106.4" fill="none" stroke="url(#${id}-rim)" stroke-width=".8"/>
    ${marcas}
    <g transform="rotate(${angles.hour} 160 160)">
      <path d="M157.7 168 L158.2 112 Q160 107 161.8 112 L162.3 168 Z" fill="url(#${id}-face)" stroke="#d0d0d0" stroke-width=".7"/>
    </g>
    <g transform="rotate(${angles.minute} 160 160)">
      <path d="M158.6 172 L159 84 Q160 80 161 84 L161.4 172 Z" fill="url(#${id}-edge)" stroke="#c7c7c7" stroke-width=".5"/>
    </g>
    <g transform="rotate(0 160 160)">
      <circle cx="160" cy="160" r="6" fill="url(#${id}-sphere)" stroke="#d0d0d0" stroke-width=".55"/>
    </g>
    <g transform="translate(160 160) rotate(-30)">
      <path d="${ringPath('front')}" fill="none" stroke="#242424" stroke-width="3.6"/>
      <path d="${ringPath('front')}" fill="none" stroke="url(#${id}-rim)" stroke-width="2.2"/>
      <path d="${ringPath('front')}" fill="none" stroke="#eeeeee" stroke-width=".45"/>
    </g>
    ${planet(id, true)}
  </g>`;

// Rótulo: mismo `MirrorWordmark`. KRONOS a 650 y -SPACE a 250 sobre 960 de
// ancho, con el mismo talón oscuro y el mismo bisel.
const rotulo = (id, y, escala) => {
  const letters = (extra) => `<tspan x="20" textLength="460" length-adjust="spacingAndGlyphs" font-weight="650" ${extra}>KRONOS</tspan><tspan x="480" textLength="460" length-adjust="spacingAndGlyphs" font-weight="250" ${extra}>-SPACE</tspan>`;
  return `
  <g transform="translate(${600 - 480 * escala} ${y}) scale(${escala})">
    <text y="100" transform="translate(1.3 1.8)" font-family="Kronos Brand, Arial, Helvetica, sans-serif" font-size="104" letter-spacing="2" fill="#080808" stroke="#383838" stroke-width="2.8">${letters('')}</text>
    <text y="100" font-family="Kronos Brand, Arial, Helvetica, sans-serif" font-size="104" letter-spacing="2" fill="url(#${id}-face)" stroke="url(#${id}-edge)" stroke-width="1.5" paint-order="stroke fill" filter="url(#${id}-bevel)">${letters('')}</text>
  </g>`;
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${metal('k')}
  <rect width="${W}" height="${H}" fill="#000000"/>
  ${reloj('k')}
  ${rotulo('k', 366, 1.05)}
  <text x="600" y="556" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="400" letter-spacing="9" fill="#9c9c9c">TU TIEMPO TU ESPACIO TU DOMINIO</text>
</svg>`;

// El SVG se guarda junto al PNG: es la fuente editable de la tarjeta y lo que
// revisa `client/test/share-card.test.mjs`.
fs.writeFileSync(path.join(PUBLICO, "brand", "og-cover.svg"), svg);
const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: W },
  font: { fontFiles: FUENTES, loadSystemFonts: true, defaultFontFamily: 'Arial' }
}).render().asPng();
fs.writeFileSync(path.join(PUBLICO, "og-cover.png"), png);
console.log(`Tarjeta generada: ${png.length} bytes (1200x630)`);
