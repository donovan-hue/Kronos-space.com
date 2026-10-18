import { expect } from '@playwright/test';

/*
 * Antesala compartida por las specs del kit (`kit-consumidores`, `kit-accesibilidad`).
 *
 * Aqui vive lo que no cambia entre casos: la cuenta de prueba, las rutas de API
 * simuladas (la app no habla con backend real en esta suite), la espera de
 * montaje y los ayudantes de medida. Cada spec aporta lo suyo: una mide
 * geometria, la otra comportamiento de teclado y foco.
 */

export const CUENTA = {
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

export const OTRA = {
  _id: 'other',
  id: 'other',
  username: 'other',
  displayName: 'Otra cuenta',
  email: 'other@example.com',
  followers: [],
  following: [],
  profilePrivacy: { profileVisibility: 'public' }
};

export const PUBLICACION_AJENA = {
  _id: 'post-ajeno',
  author: OTRA,
  content: 'Publicacion de otra cuenta, para poder reportarla.',
  media: { url: '', mimeType: '' },
  audience: { type: 'public' },
  createdAt: new Date().toISOString(),
  reactions: [],
  comments: []
};

export const IMAGEN = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHUlEQVR42mP8z8BQz0AEYBxVSFeFjIyM/xkYGAoAJ8wF/Wn0GKsAAAAASUVORK5CYII=',
  'base64'
);

export async function fixture(page) {
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
export const abrirApp = async (page, ruta) => {
  await page.goto(ruta, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 30000 });
};

export const medir = (page, selector, propiedad) =>
  page.$eval(
    selector,
    (el, prop) => getComputedStyle(el).getPropertyValue(prop),
    propiedad
  );

// Los dialogos y el cajon entran con animacion (0.14-0.22s). Medir a mitad de
// la animacion da una caja encogida: se espera a que asiente.
export const asentar = (page) => page.waitForTimeout(450);

export const caja = async (page, selector) => {
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
