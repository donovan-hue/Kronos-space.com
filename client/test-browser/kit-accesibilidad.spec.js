import { test, expect } from '@playwright/test';
import { fixture, abrirApp, asentar, IMAGEN, OTRA } from './helpers/kit.js';

/*
 * ACCESIBILIDAD DEL KIT — los cuatro comportamientos que el dialogo promete,
 * uno por uno sobre los siete consumidores reales (el mismo septeto que mide
 * `kit-consumidores.spec.js`):
 *
 *   1. bloqueo de scroll del documento mientras el panel esta abierto,
 *   2. foco atrapado: Tab no se escapa del panel,
 *   3. Escape cierra,
 *   4. al cerrar, el documento se suelta y el foco NO muere en el cuerpo:
 *      vuelve al disparador o, si el disparador ya no existe, al contenedor
 *      principal (`#main-content`).
 *
 * El cuarto punto tenia un hueco real: el dialogo se apoya en Radix para todo,
 * pero los consumidores de KRONOS son controlados (no montan `Dialog.Trigger`)
 * y el ayudante de restauracion leia `document.activeElement` al montar el
 * contenido — cuando Radix ya habia movido el foco adentro. El destino tomado
 * era un nodo del propio dialogo y, al desmontarse, el foco moria en <body>.
 * Ahora el ayudante recuerda el ultimo foco de FUERA del dialogo.
 */

const DIALOGO = '[data-slot="dialog-content"]';

const estadoDelFoco = (page) =>
  page.evaluate(() => {
    const activo = document.activeElement;
    return {
      tag: activo?.tagName || '',
      id: activo?.id || '',
      clase: typeof activo?.className === 'string' ? activo.className : '',
      etiqueta: activo?.getAttribute?.('aria-label') || '',
      texto: (activo?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      esCuerpo: activo === document.body || activo === document.documentElement,
      esPrincipal: activo?.id === 'main-content' || !!activo?.closest?.('#main-content')
    };
  });

// El destino se revisa por sondeo: entre el desmonte del panel y la devolucion
// del foco hay un fotograma, y afirmar en ese hueco da falsos rojos.
function describirDestino(foco, vuelve) {
  if (foco.esCuerpo) return 'cuerpo';
  if (vuelve.tipo === 'principal') return foco.esPrincipal ? 'ok' : `otro: ${foco.tag}.${foco.clase}`;
  if (vuelve.tipo === 'clase') return foco.clase.includes(vuelve.valor) ? 'ok' : `otro: ${foco.clase}`;
  if (vuelve.tipo === 'etiqueta') return foco.etiqueta === vuelve.valor ? 'ok' : `otro: ${foco.etiqueta}`;
  if (vuelve.tipo === 'texto') return foco.texto.includes(vuelve.valor) ? 'ok' : `otro: ${foco.texto}`;
  return 'ok';
}

const documentoBloqueado = (page) =>
  page.evaluate(() => {
    const cuerpo = getComputedStyle(document.body).overflow;
    const raiz = getComputedStyle(document.documentElement).overflow;
    return cuerpo === 'hidden' || raiz === 'hidden';
  });

async function tabNoEscapa(page, selector, vueltas = 8) {
  for (let i = 0; i < vueltas; i += 1) {
    await page.keyboard.press('Tab');
    const dentro = await page.evaluate(
      (sel) => document.querySelector(sel)?.contains(document.activeElement) ?? false,
      selector
    );
    if (!dentro) return { dentro, vuelta: i + 1 };
  }
  return { dentro: true, vuelta: vueltas };
}

async function revisar(page, { abrir, selector = DIALOGO, vuelve = { tipo: 'principal' } }) {
  await abrir();
  await asentar(page);
  const panel = page.locator(selector).first();
  await expect(panel).toBeVisible();

  // 1. El documento no se desplaza mientras el panel esta abierto.
  expect(await documentoBloqueado(page), 'el documento no quedo bloqueado').toBe(true);

  // 2. Tab no se escapa del panel.
  const tab = await tabNoEscapa(page, selector);
  expect(tab, `el foco se escapo en la tabulacion ${tab.vuelta}`).toMatchObject({ dentro: true });

  // 3. Escape cierra.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden({ timeout: 5000 });

  // 4. El documento se suelta y el foco vuelve a la pagina (nunca al cuerpo).
  await expect.poll(() => documentoBloqueado(page), { timeout: 5000 }).toBe(false);
  await expect
    .poll(async () => describirDestino(await estadoDelFoco(page), vuelve), { timeout: 5000 })
    .toBe('ok');
  const foco = await estadoDelFoco(page);
  expect(foco.esCuerpo, 'el foco murio en el cuerpo del documento').toBe(false);
}

test('el panel de atajos atrapa el foco, cierra con Escape y lo devuelve', async ({ page }) => {
  await fixture(page);
  await abrirApp(page, '/home');
  await revisar(page, { abrir: () => page.keyboard.press('?') });
});

test('el dialogo de reporte atrapa el foco, cierra con Escape y lo devuelve', async ({ page }) => {
  await fixture(page);
  await abrirApp(page, '/home');
  await revisar(page, {
    abrir: async () => {
      await page.getByLabel('Más opciones de la publicación').first().click();
      await page.getByRole('menuitem', { name: 'Reportar' }).first().click();
    }
  });
});

test('el dialogo de seguidores atrapa el foco, cierra con Escape y lo devuelve al boton', async ({ page }) => {
  await fixture(page);
  await abrirApp(page, '/profile');
  await revisar(page, {
    abrir: () => page.locator('.k-profile-stat-button').first().click(),
    vuelve: { tipo: 'clase', valor: 'k-profile-stat-button' }
  });
});

test('el dialogo de apoyo atrapa el foco, cierra con Escape y lo devuelve al boton', async ({ page }) => {
  await fixture(page);
  await abrirApp(page, `/users/${OTRA._id}`);
  await revisar(page, {
    abrir: () => page.getByRole('button', { name: 'Apoyar' }).first().click(),
    vuelve: { tipo: 'texto', valor: 'Apoyar' }
  });
});

test('el recortador atrapa el foco, cierra con Escape y lo devuelve a la pagina', async ({ page }) => {
  await fixture(page);
  await abrirApp(page, '/profile');
  await revisar(page, {
    abrir: () =>
      page.locator('input[type="file"]').first().setInputFiles({
        name: 'portada.png',
        mimeType: 'image/png',
        buffer: IMAGEN
      }),
    selector: '.k-image-editor-dialog'
  });
});

test('el cajon de secciones atrapa el foco, cierra con Escape y lo devuelve al disparador', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await abrirApp(page, '/home');
  await revisar(page, {
    abrir: () => page.getByLabel('Abrir más secciones').first().click(),
    selector: '.k-drawer-panel',
    vuelve: { tipo: 'etiqueta', valor: 'Abrir más secciones' }
  });
});

test('el mapa orbital atrapa el foco, cierra con Escape y lo devuelve a la pagina', async ({ page }) => {
  await fixture(page);
  await abrirApp(page, '/home');
  await revisar(page, {
    abrir: () => page.keyboard.press('g'),
    selector: '.k-orbit-stage'
  });
});
