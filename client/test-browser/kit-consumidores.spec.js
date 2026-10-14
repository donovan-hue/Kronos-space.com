import { test, expect } from '@playwright/test';

/*
 * CONSUMIDORES DEL KIT — geometria y tipografia medidas en navegador real.
 *
 * El proyecto escribe clases de Tailwind en su kit (dialogos, menus,
 * recortador) y, hasta el 2026-10-13, no tenia motor que las convirtiera en
 * CSS: geometrias enteras dependian de parches escritos a mano. Con el motor
 * encendido quedan dos formas de que una clase no haga lo que dice:
 *
 *   1. la utilidad no compila (clase inerte), o
 *   2. la utilidad compila pero otra regla le gana la cascada.
 *
 * El caso 1 lo vigila `scripts/ci/barrido-utilidades.mjs` contra el CSS
 * construido. El caso 2 solo se ve midiendo: por eso esta spec abre cada
 * consumidor y comprueba el valor efectivo que pide el codigo. Los dos casos
 * ya ocurrieron de verdad: `gap-3` rendia 12.8px por un `.grid` del tema y el
 * reseteo `*{margin:0}` anulaba todo margen declarado con utilidad.
 */

const CUENTA = {
  _id: 'owner',
  id: 'owner',
  username: 'owner',
  displayName: 'Cuenta de prueba',
  email: 'test@example.com',
  emailVerified: true,
  avatar: '',
  cover: '',
  followersCount: 2,
  followingCount: 3,
  followers: [],
  following: [],
  profilePrivacy: { profileVisibility: 'public' }
};

const OTRA = {
  _id: 'other',
  id: 'other',
  username: 'other',
  displayName: 'Otra cuenta',
  email: 'other@example.com',
  followers: [],
  following: [],
  profilePrivacy: { profileVisibility: 'public' }
};

const PUBLICACION_AJENA = {
  _id: 'post-ajeno',
  author: OTRA,
  content: 'Publicacion de otra cuenta, para poder reportarla.',
  media: { url: '', mimeType: '' },
  audience: { type: 'public' },
  createdAt: new Date().toISOString(),
  reactions: [],
  comments: []
};

const IMAGEN = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHUlEQVR42mP8z8BQz0AEYBxVSFeFjIyM/xkYGAoAJ8wF/Wn0GKsAAAAASUVORK5CYII=',
  'base64'
);

async function fixture(page) {
  await page.route('**/socket.io/**', (r) =>
    r.fulfill({ body: '0{"sid":"kit","upgrades":[],"pingInterval":1000000,"pingTimeout":1000000}' })
  );
  await page.route('**/api/**', (route) => {
    const { pathname } = new URL(route.request().url());
    const path = pathname.replace('/api', '');
    if (path === '/auth/me') return route.fulfill({ json: { user: CUENTA } });
    if (path === '/auth/google/config') return route.fulfill({ json: { enabled: false } });
    if (path === `/users/${OTRA._id}`) return route.fulfill({ json: OTRA });
    if (path === '/users/me') return route.fulfill({ json: CUENTA });
    if (path.startsWith('/users/')) return route.fulfill({ json: OTRA });
    if (path.startsWith('/posts')) {
      return route.fulfill({ json: { posts: [PUBLICACION_AJENA], hasMore: false, page: 1 } });
    }
    return route.fulfill({ json: {} });
  });
  await page.addInitScript((user) => {
    localStorage.setItem('kronos_token', `e30.${btoa(JSON.stringify({ exp: 2000000000 }))}.test`);
    localStorage.setItem('kronos_user', JSON.stringify(user));
    localStorage.setItem('kronos_refresh_token', 'refresco-de-prueba');
    localStorage.setItem('kronos_refresh_expires_at', new Date(Date.now() + 86400000).toISOString());
  }, CUENTA);
}

// En el CI la app tarda mas en montar: antes de tocar nada se espera a que
// el armazon este en pie.
const abrirApp = async (page, ruta) => {
  await page.goto(ruta, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 30000 });
};

const medir = (page, selector, propiedad) =>
  page.$eval(
    selector,
    (el, prop) => getComputedStyle(el).getPropertyValue(prop),
    propiedad
  );

// Los dialogos y el cajon entran con animacion (0.14-0.22s). Medir a mitad de
// la animacion da una caja encogida: se espera a que asiente.
const asentar = (page) => page.waitForTimeout(450);

const caja = async (page, selector) => {
  const elemento = page.locator(selector).first();
  await expect(elemento).toBeVisible();
  const rect = await elemento.boundingBox();
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    ancho: Math.round(rect.width),
    alto: Math.round(rect.height)
  };
};

test('el estado de carga de una ruta diferida conserva su geometria', async ({ page }) => {
  // La ruta diferida tarda a proposito: asi se puede medir el estado de carga.
  await page.route(/(assets|src)\/.*Capsules/i, async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    return route.continue();
  });
  await fixture(page);
  await abrirApp(page, '/home');

  // Se viaja a una ruta diferida: mientras su trozo baja, la app muestra el
  // estado de carga. Ese instante es el que se mide, y se mide TODO de una vez:
  // entre una consulta y la siguiente el trozo puede llegar y la pantalla
  // cambiar (medirlo por partes dio valores vacios en el CI).
  await page.getByRole('link', { name: /Cápsulas/ }).first().click();
  const contenedor = 'div[role="status"][aria-busy="true"]:has(> span[aria-hidden="true"])';
  await expect(page.locator(contenedor)).toBeVisible({ timeout: 15000 });
  // La transicion de ruta escala el plano entrante: medir a media transicion da
  // el giro a 45px en vez de 32. Se espera a que asiente.
  await asentar(page);

  const medida = await page.evaluate((sel) => {
    const caja = document.querySelector(sel);
    const cs = getComputedStyle(caja);
    const giro = caja.querySelector(':scope > span[aria-hidden="true"]');
    const csGiro = getComputedStyle(giro);
    const r = caja.getBoundingClientRect();
    const g = giro.getBoundingClientRect();
    const etiqueta = caja.querySelector(':scope > span.sr-only');
    return {
      display: cs.display,
      alignItems: cs.alignItems,
      justifyContent: cs.justifyContent,
      minAlto: parseFloat(cs.minHeight),
      caja: { x: r.x, y: r.y, ancho: r.width, alto: r.height },
      giro: {
        x: g.x, y: g.y, ancho: g.width, alto: g.height,
        // El tamano medido por estilo computado no lo altera el escalado de la
        // transicion de ruta; el rectangulo si. El tamano se afirma con este.
        anchoCalculado: parseFloat(csGiro.width),
        altoCalculado: parseFloat(csGiro.height),
        radio: parseFloat(csGiro.borderTopLeftRadius),
        animacion: csGiro.animationName
      },
      etiquetaAncho: etiqueta ? etiqueta.getBoundingClientRect().width : null
    };
  }, contenedor);

  const altura = page.viewportSize().height;
  expect(medida.display).toBe('flex');
  expect(medida.alignItems).toBe('center');
  expect(medida.justifyContent).toBe('center');
  expect(medida.minAlto).toBeCloseTo(altura / 2, 0);
  expect(medida.caja.alto).toBeGreaterThanOrEqual(altura / 2 - 40);

  // El giro: 32px, redondo y girando.
  expect(medida.giro.anchoCalculado).toBeCloseTo(32, 0);
  expect(medida.giro.altoCalculado).toBeCloseTo(32, 0);
  expect(medida.giro.radio).toBeGreaterThanOrEqual(16);
  expect(medida.giro.animacion).not.toBe('none');

  // Queda centrado en su contenedor (el margen es amplio porque comparte la
  // fila con la etiqueta para lectores de pantalla, que mide 1px).
  expect(Math.abs(medida.giro.x + medida.giro.ancho / 2 - (medida.caja.x + medida.caja.ancho / 2))).toBeLessThanOrEqual(60);
  expect(Math.abs(medida.giro.y + medida.giro.alto / 2 - (medida.caja.y + medida.caja.alto / 2))).toBeLessThanOrEqual(2);

  // La etiqueta para lectores de pantalla sigue existiendo y sigue oculta.
  expect(medida.etiquetaAncho).not.toBeNull();
  expect(medida.etiquetaAncho).toBeLessThanOrEqual(1);
});

test('el panel de atajos toma el ancho, el hueco y el centrado que pide', async ({ page }) => {
  await fixture(page);
  await abrirApp(page, '/home');
  await page.keyboard.press('?');
  await asentar(page);

  const cajaDialogo = '[data-slot="dialog-content"]';
  const rect = await caja(page, cajaDialogo);
  const ancho = page.viewportSize().width;
  const alto = page.viewportSize().height;

  expect(await medir(page, cajaDialogo, 'position')).toBe('fixed');
  expect(await medir(page, cajaDialogo, 'z-index')).toBe('60');
  expect(rect.ancho).toBe(Math.min(520, ancho - 40));
  expect(Math.abs(rect.x + rect.ancho / 2 - ancho / 2)).toBeLessThanOrEqual(2);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.y + rect.alto).toBeLessThanOrEqual(alto);

  // `gap-3` del kit: 12px en la escala del proyecto.
  expect(parseFloat(await medir(page, cajaDialogo, 'row-gap'))).toBeCloseTo(12, 0);
  expect(await medir(page, cajaDialogo, 'padding-top')).toBe('24px');
  expect(await medir(page, '[data-slot="dialog-title"]', 'font-size')).toBe('18px');

  const fondo = await caja(page, '[data-slot="dialog-overlay"]');
  expect(fondo.ancho).toBe(ancho);
  expect(fondo.alto).toBe(alto);
  expect(await medir(page, '[data-slot="dialog-overlay"]', 'z-index')).toBe('59');
});

test('el dialogo de reporte conserva su formulario en rejilla', async ({ page }) => {
  await fixture(page);
  await abrirApp(page, '/home');
  await page.getByLabel('Más opciones de la publicación').first().click();
  await page.getByRole('menuitem', { name: 'Reportar' }).first().click();
  await asentar(page);

  const cajaDialogo = '[data-slot="dialog-content"]';
  const rect = await caja(page, cajaDialogo);
  expect(await medir(page, cajaDialogo, 'position')).toBe('fixed');
  expect(rect.ancho).toBe(Math.min(520, page.viewportSize().width - 40));
  expect(await medir(page, `${cajaDialogo} form`, 'display')).toBe('grid');
  // `gap-4` del kit: 16px, no el 12.8px que rendia con la cascada vieja.
  expect(parseFloat(await medir(page, `${cajaDialogo} form`, 'row-gap'))).toBeCloseTo(16, 0);
  expect(rect.y + rect.alto).toBeLessThanOrEqual(page.viewportSize().height);
});

test('el dialogo de seguidores respeta el ancho y el hueco que pide la pantalla', async ({ page }) => {
  await fixture(page);
  await abrirApp(page, '/profile');
  await page.locator('.k-profile-stat-button').first().click();
  await asentar(page);

  const cajaDialogo = '[data-slot="dialog-content"]';
  const rect = await caja(page, cajaDialogo);
  const pedido = Math.min(620, page.viewportSize().width - 40);
  expect(rect.ancho).toBe(pedido);
  expect(Math.abs(rect.x + rect.ancho / 2 - page.viewportSize().width / 2)).toBeLessThanOrEqual(2);
  expect(parseFloat(await medir(page, cajaDialogo, 'row-gap'))).toBeCloseTo(16, 0);
  expect(await medir(page, cajaDialogo, 'overflow-y')).toBe('auto');
  // Su tope de alto queda utilizable en la pantalla.
  expect(rect.y + rect.alto).toBeLessThanOrEqual(page.viewportSize().height);
});

test('el dialogo de apoyo del perfil ajeno conserva ancho y pie', async ({ page }) => {
  await fixture(page);
  await abrirApp(page, `/users/${OTRA._id}`);
  await page.getByRole('button', { name: 'Apoyar' }).first().click();
  await asentar(page);

  const cajaDialogo = '[data-slot="dialog-content"]';
  const rect = await caja(page, cajaDialogo);
  expect(await medir(page, cajaDialogo, 'position')).toBe('fixed');
  expect(rect.ancho).toBe(Math.min(440, page.viewportSize().width - 32));
  expect(Math.abs(rect.x + rect.ancho / 2 - page.viewportSize().width / 2)).toBeLessThanOrEqual(2);

  const pie = `${cajaDialogo} [data-slot="dialog-footer"]`;
  expect(await medir(page, pie, 'justify-content')).toBe('flex-end');
  // `mt-1` del pie: el reseteo global lo anulaba en silencio antes del arreglo.
  expect(parseFloat(await medir(page, pie, 'margin-top'))).toBeCloseTo(4, 0);
});

test('el recortador centra su caja una sola vez', async ({ page }) => {
  await fixture(page);
  await abrirApp(page, '/profile');
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'portada.png',
    mimeType: 'image/png',
    buffer: IMAGEN
  });

  await asentar(page);
  const cajaEditor = '.k-image-editor-dialog';
  const rect = await caja(page, cajaEditor);
  expect(rect.ancho).toBeGreaterThan(300);
  // El centrado no se duplica: el motor traduce y la regla a mano neutraliza.
  expect(await medir(page, cajaEditor, 'translate')).toBe('none');
  expect(Math.abs(rect.x + rect.ancho / 2 - page.viewportSize().width / 2)).toBeLessThanOrEqual(2);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.y + rect.alto).toBeLessThanOrEqual(page.viewportSize().height + 1);
});

test('el cajon de secciones del telefono conserva su ancho declarado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await abrirApp(page, '/home');
  await page.getByLabel('Abrir más secciones').first().click();
  await asentar(page);

  const panel = await caja(page, '.k-drawer-panel');
  expect(await medir(page, '.k-drawer-panel', 'position')).toBe('fixed');
  expect(panel.x).toBe(0);
  expect(panel.ancho).toBe(Math.round(Math.min(340, 390 * 0.86)));
  expect(panel.alto).toBeLessThanOrEqual(845);
});

test('el mapa orbital abre con la tecla G y entra en pantalla', async ({ page }) => {
  await fixture(page);
  await abrirApp(page, '/home');
  await page.keyboard.press('g');
  await asentar(page);

  const escenario = await caja(page, '.k-orbit-stage');
  expect(await medir(page, '.k-orbit-stage', 'position')).toBe('fixed');
  expect(escenario.ancho).toBeGreaterThan(0);
  expect(escenario.alto).toBeGreaterThan(0);
  expect(escenario.x).toBeGreaterThanOrEqual(0);
  expect(escenario.y).toBeGreaterThanOrEqual(0);
});
