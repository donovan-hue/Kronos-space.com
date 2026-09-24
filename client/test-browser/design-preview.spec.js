import { test, expect } from '@playwright/test';

test('the demo entry opens the metallic wordmark, not the archived pyramids', async ({ page }) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page).toHaveURL(/\/design-preview$/);
  await expect(page.locator('.wordmark-preview')).toBeVisible();
  await expect(page.getByRole('heading', { name: /KRONOS/ })).toBeVisible();
  await expect(page.locator('canvas[data-wordmark="floating-3d"]')).toHaveCount(1, { timeout: 45000 });
  await expect(page.getByText('SUPERFICIE DE PIRÁMIDES / KRONOS')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Ver el diseño de pirámides/ })).toHaveCount(0);
});
