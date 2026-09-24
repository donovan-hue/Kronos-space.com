import { test, expect } from '@playwright/test';

const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const account = { _id: 'owner', username: 'owner', displayName: 'Cuenta de prueba', email: 'test@example.com', emailVerified: true, avatar: '', cover: '', followersCount: 2, followingCount: 3 };
async function fixture(page, { failFirst = false, failPublish = false } = {}) {
  const user = { ...account };
  const uploads = [];
  uploads.posts = [];
  uploads.privacy = [];
  await page.route('**/socket.io/**', r => r.fulfill({ body: '0{"sid":"audit","upgrades":[],"pingInterval":1000000,"pingTimeout":1000000}' }));
  await page.route('**/uploads/test-*', r => r.fulfill({ contentType: 'image/png', body: image }));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api', '');
    const target = path.match(/^\/users\/me\/(avatar|cover)$/)?.[1];
    if (target && request.method() === 'POST') {
      uploads.push({ target, type: request.headers()['content-type'], body: request.postDataBuffer().toString('latin1') });
      if (failFirst) { failFirst = false; return route.fulfill({ status: 503, json: { error: 'No se pudo guardar. Reintenta.' } }); }
      user[target] = `/uploads/test-${target}.png`;
      return route.fulfill({ json: user });
    }
    if (path === '/users/me/privacy' && request.method() === 'PATCH') {
      user.profilePrivacy = request.postDataJSON(); uploads.privacy.push(user.profilePrivacy);
      return route.fulfill({ json: { privacy: user.profilePrivacy } });
    }
    if (path === '/users/me/preferences' && request.method() === 'PATCH') {
      user.preferences = request.postDataJSON();
      return route.fulfill({ json: { preferences: user.preferences } });
    }
    if (path === '/posts' && request.method() === 'POST') {
      const payload = request.postDataJSON(); uploads.posts.push(payload);
      if (failPublish) { failPublish = false; return route.fulfill({ status: 503, json: { error: 'No se pudo publicar. Reintenta.' } }); }
      return route.fulfill({ json: { post: { _id: 'created-post', ...payload, author: user, createdAt: new Date().toISOString() } } });
    }
    if (path === '/auth/me') return route.fulfill({ json: { user } });
    if (path === '/users/me') return route.fulfill({ json: user });
    if (path === '/users/username/other') return route.fulfill({ json: { ...account, _id: 'other', username: 'other', isFollowing: false } });
    if (path.endsWith('/follow')) return route.fulfill({ json: { following: true } });
    return route.fulfill({ json: { posts: [], sessions: [], users: [], flags: {}, items: [], notifications: [] } });
  });
  await page.addInitScript(user => {
    localStorage.setItem('kronos_token', `e30.${btoa(JSON.stringify({ exp: 2000000000 }))}.test`);
    localStorage.setItem('kronos_user', JSON.stringify(user));
  }, user);
  return uploads;
}

for (const width of [320, 390, 1440]) {
  test(`profile uploads and compact settings at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const uploads = await fixture(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/profile');
    for (const target of ['avatar', 'cover']) {
      const mediaButton = page.getByRole('button', { name: target === 'avatar' ? 'Subir foto de perfil' : 'Subir foto al muro del perfil', exact: true });
      const mediaBox = await mediaButton.boundingBox();
      expect(mediaBox.height).toBeGreaterThanOrEqual(43.99);
      expect(mediaBox.width).toBeGreaterThanOrEqual(43.99);
      if (target === 'avatar') expect(Math.abs(mediaBox.width - mediaBox.height)).toBeLessThan(1);
      const chooserEvent = page.waitForEvent('filechooser');
      await mediaButton.click();
      const chooser = await chooserEvent;
      await chooser.setFiles({ name: 'selected.png', mimeType: 'image/png', buffer: image });
      const dialog = page.getByRole('dialog', { name: target === 'avatar' ? 'Recortar avatar' : 'Recortar portada' });
      await expect(dialog).toBeVisible();
      await expect(dialog).toBeInViewport();
      // Test original bytes and the real canvas conversion, not a mocked editor.
      await dialog.getByRole('button', { name: target === 'avatar' ? 'Usar original' : 'Aplicar imagen', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(mediaButton).toBeFocused();
      const saved = page.locator(target === 'avatar' ? '.profile-avatar img' : '.k-cover img');
      await expect(saved).toHaveAttribute('src', new RegExp(`test-${target}.png`));
      await expect.poll(() => saved.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      expect(uploads.at(-1).body).toContain(`name="${target}"`);
      expect(uploads.at(-1).type).toContain('multipart/form-data; boundary=');
    }
    expect(uploads).toHaveLength(2);
    await page.reload();
    await expect(page.locator('.profile-avatar img')).toHaveAttribute('src', /test-avatar.png/);
    await expect(page.locator('.k-cover img')).toHaveAttribute('src', /test-cover.png/);
    await page.screenshot({ path: info.outputPath('profile.png') });
    await page.goto('/profile/other');
    const follow = page.getByRole('button', { name: 'Seguir', exact: true });
    await expect(follow).toBeVisible();
    const box = await follow.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(88);
    expect(box.height).toBeGreaterThanOrEqual(43.99);
    expect(box.height).toBeLessThan(80);
    await follow.click();
    await expect(page.getByRole('button', { name: 'Dejar de seguir' })).toBeVisible();
    await page.goto('/settings');
    await expect(page.locator('.k-settings-disclosure')).toHaveCount(6);
    await expect(page.locator('.k-settings-disclosure[open]')).toHaveCount(0);
    const experience = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Notificaciones y apariencia' }) });
    await experience.locator('summary').click();
    await expect(experience.getByRole('checkbox').first()).toBeVisible();
    await experience.locator('summary').click();
    await expect(page.locator('.settings-page a[href="/profile"], .settings-page a[href="/home"], .settings-page a[href="/settings/security"]')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('settings.png') });
    await page.goto('/settings/profile');
    await expect(page).toHaveURL(/\/settings#privacy$/);
    const privacy = page.locator('#privacy');
    await expect(privacy).toHaveAttribute('open', '');
    await privacy.getByRole('checkbox', { name: /Mostrar mi biografía/ }).uncheck();
    await privacy.getByRole('button', { name: 'Guardar privacidad', exact: true }).click();
    await expect(privacy.getByRole('status')).toContainText('guardada');
    expect(uploads.privacy.at(-1).showBio).toBe(false);
    await privacy.locator('summary').click();
    await privacy.locator('summary').click();
    await expect(privacy.getByRole('checkbox', { name: /Mostrar mi biografía/ })).not.toBeChecked();
    await page.reload();
    await expect(privacy.getByRole('checkbox', { name: /Mostrar mi biografía/ })).not.toBeChecked();
    await expect(privacy.getByRole('button', { name: 'Descargar mis datos' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('failed upload keeps the selected file and allows retry or cancel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const uploads = await fixture(page, { failFirst: true });
  await page.goto('/profile');
  const input = page.locator('.profile-avatar input[type=file]');
  await input.setInputFiles({ name: 'selected.png', mimeType: 'image/png', buffer: image });
  const dialog = page.getByRole('dialog', { name: 'Recortar avatar' });
  await dialog.getByRole('button', { name: 'Usar original', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('No se pudo guardar');
  await expect(dialog.locator('img')).toBeVisible();
  await dialog.getByRole('button', { name: 'Usar original', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(uploads).toHaveLength(2);
  await input.setInputFiles({ name: 'selected.png', mimeType: 'image/png', buffer: image });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(uploads).toHaveLength(2);
  await expect(page.locator('body')).not.toHaveAttribute('data-scroll-locked');
});


for (const width of [320, 390, 1440]) {
  test(`wall plus, publisher and action sizes at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const requests = await fixture(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/home');
    const menu = page.locator('.k-create-menu');
    const plus = menu.locator('summary');
    await plus.click();
    await expect(menu).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(menu).not.toHaveAttribute('open', '');
    await expect(plus).toBeFocused();
    await plus.click();
    await page.getByRole('heading', { name: 'Inicio', exact: true }).click();
    await expect(menu).not.toHaveAttribute('open', '');
    await plus.click();
    await menu.locator('a[href="/create/post"]').click();
    await expect(page).toHaveURL(/\/create\/post$/);
    const publish = page.getByRole('button', { name: 'Publicar', exact: true });
    await expect(publish).toHaveCount(1);
    await expect(publish).toBeDisabled();
    await page.getByRole('textbox', { name: 'Contenido de la publicación' }).fill('Publicación de prueba de funcionamiento');
    await expect(publish).toBeEnabled();
    const chooserEvent = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Añadir imagen/video', exact: true }).click();
    await (await chooserEvent).setFiles([]);
    await expect(page.getByRole('textbox', { name: 'Contenido de la publicación' })).toHaveValue('Publicación de prueba de funcionamiento');
    for (const button of await page.locator('.k-create-page .k-button').all()) {
      if (!await button.isVisible()) continue;
      const box = await button.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(43.99);
      expect(box.height).toBeLessThan(96);
      expect(box.width).toBeGreaterThanOrEqual(43.99);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    }
    await page.locator('.k-composer-footer').scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('publish-actions.png') });
    await publish.click();
    await expect(page.getByRole('status').filter({ hasText: 'Publicación creada.' })).toBeVisible();
    expect(requests.posts).toHaveLength(1);
    expect(requests.posts[0].content).toBe('Publicación de prueba de funcionamiento');
    await expect(publish).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}


test('failed publish retains the draft and retries without duplicate submits', async ({ page }) => {
  const requests = await fixture(page, { failPublish: true });
  await page.goto('/create/post');
  const content = page.getByRole('textbox', { name: 'Contenido de la publicación' });
  await content.fill('Conservar este texto tras un error');
  const publish = page.getByRole('button', { name: 'Publicar', exact: true });
  await publish.click();
  await expect(page.getByRole('alert')).toContainText('No se pudo publicar');
  await expect(content).toHaveValue('Conservar este texto tras un error');
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.getByRole('status').filter({ hasText: 'Publicación creada.' })).toBeVisible();
  expect(requests.posts).toHaveLength(2);
  await expect(content).toHaveValue('');
});
