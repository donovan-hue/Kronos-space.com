import { test, expect } from '@playwright/test';
import { fixture, abrirApp, PUBLICACION_AJENA } from './helpers/kit.js';
import { MAPA_PANTALLAS } from '../src/lib/screenIndex.js';

const totalFunciones = MAPA_PANTALLAS.reduce((total, area) => total + area.pantallas.length, 0);
const projectId = '65f600000000000000000001';

// Mismo contrato HTTP que Proyectos; no toca cuentas ni crea datos externos.
async function projectsFixture(page) {
  const created = [];
  let project = null;
  await page.route('**/api/projects**', route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api', '');
    if (path === '/projects' && request.method() === 'POST') {
      const body = request.postDataJSON();
      created.push(body);
      project = { ...body, _id: projectId, musicTitle: '', musicUrl: '', versions: [], versionsCount: 0,
        createdAt: '2026-10-21T10:00:00Z', updatedAt: '2026-10-21T10:00:00Z' };
      return route.fulfill({ status: 201, json: { project } });
    }
    if (path === '/projects' && request.method() === 'GET') return route.fulfill({ json: { projects: project ? [project] : [] } });
    if (path === `/projects/${projectId}` && request.method() === 'GET' && project) return route.fulfill({ json: { project } });
    return route.fulfill({ status: 404, json: { error: 'Recurso de prueba no encontrado' } });
  });
  return created;
}

for (const width of [320, 390, 1280]) {
  test(`directorio accesible, destinos concretos y Proyectos operativo a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await fixture(page);
    const created = await projectsFixture(page);
    await abrirApp(page, '/pantallas');
    await expect(page.getByRole('heading', { name: 'Todas las pantallas' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver todas las funciones' })).toBeVisible();
    await expect(page.locator('.k-indice-enlace')).toHaveCount(totalFunciones);
    const links = await page.locator('.k-indice-enlace').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
    expect(links.every(href => href && !/[:*]/.test(href))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByLabel('Buscar una pantalla').fill('proyectos');
    await page.locator('.k-indice-enlace[href="/projects"]').click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole('heading', { name: 'Nuevo proyecto', exact: true })).toBeVisible();
    expect(created).toHaveLength(0);
    await page.getByLabel('Nombre', { exact: true }).fill('Proyecto desde el directorio');
    await page.getByRole('button', { name: 'Crear proyecto', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));
    expect(created).toHaveLength(1);
    expect(created[0].title).toBe('Proyecto desde el directorio');
    await expect(page.getByLabel('Nombre del proyecto')).toHaveValue('Proyecto desde el directorio');
    await expect(page.getByRole('tab')).toHaveCount(3);
    await page.getByRole('tab', { name: /Versiones/ }).click();
    await expect(page.getByRole('button', { name: 'Guardar versión', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}

// Las páginas duplicadas se retiraron por decisión de navegación. Comprobar
// tanto el 404 de la URL antigua como la herramienta real que sigue disponible.
for (const [path, key] of [['/atajos', '?'], ['/mapa', 'g'], ['/busqueda', 'Control+k']]) {
  test(`sin página duplicada ${path}; su capa sigue abriendo y cerrando`, async ({ page }) => {
    await fixture(page);
    await abrirApp(page, path);
    await expect(page.getByRole('heading', { level: 1, name: 'Esta órbita no existe' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('link', { name: 'Volver al inicio', exact: true }).click();
    await expect(page).toHaveURL(/\/home$/);
    await page.keyboard.press(key);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/home$/);
  });
}

test('la ficha completa una ruta con el recurso elegido y carga su publicación', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/posts/post-ajeno', route => route.fulfill({ json: { post: PUBLICACION_AJENA } }));
  await abrirApp(page, '/funciones/publicacion');
  await page.getByLabel('Identificador de publicación', { exact: true }).fill('post-ajeno');
  await page.getByRole('button', { name: 'Abrir función' }).click();
  await expect(page).toHaveURL(/\/post\/post-ajeno$/);
  await expect(page.getByText(PUBLICACION_AJENA.content, { exact: true })).toBeVisible();
});

test('administración restringida no solicita datos privilegiados', async ({ page }) => {
  await fixture(page);
  let solicitudes = 0;
  await page.route('**/api/admin/**', route => { solicitudes++; return route.fulfill({ status: 403, json: {} }); });
  await abrirApp(page, '/admin');
  await expect(page.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible();
  expect(solicitudes).toBe(0);
});

for (const path of ['/kairos/audio', '/projects', '/projects/plantillas', `/projects/${projectId}`]) {
  test(`la ruta ${path} sigue exigiendo sesión`, async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({ json: { enabled: false } }));
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  });
}
