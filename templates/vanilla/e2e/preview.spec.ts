import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('previews typed text through the browser entry', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Text preview');
  await expect(page.getByRole('heading', { level: 1, name: 'Text preview' })).toBeVisible();

  const source = page.getByRole('textbox', { name: 'Source text' });
  await source.click();
  await source.pressSequentially('  a   b  ');

  await expect(source).toHaveValue('  a   b  ');
  await expect(page.getByRole('status', { name: 'Preview text' })).toHaveText('a b');
});

test('supports keyboard reset and keeps a useful empty state', async ({ page }) => {
  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Source text' });
  const reset = page.getByRole('button', { name: 'Reset' });
  const preview = page.getByRole('status', { name: 'Preview text' });

  await expect(preview).toHaveText('Enter text to see a preview.');
  await page.keyboard.press('Tab');
  await expect(source).toBeFocused();
  await page.keyboard.type('  A draft  ');
  await expect(preview).toHaveText('A draft');
  await page.keyboard.press('Tab');
  await expect(reset).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(source).toHaveValue('');
  await expect(source).toBeFocused();
  await expect(preview).toHaveText('Enter text to see a preview.');
  await page.keyboard.type('   ');
  await expect(preview).toHaveText('Enter text to see a preview.');
  await page.keyboard.press('Tab');
  await expect(reset).toBeFocused();
});

for (const colorScheme of ['light', 'dark'] satisfies ('light' | 'dark')[]) {
  test(`${colorScheme} layout stays usable at 320 pixels`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');

    const source = page.getByRole('textbox', { name: 'Source text' });
    await source.click();
    await source.pressSequentially('A narrow window still leaves room to read and edit.');
    await expect(page.getByRole('status', { name: 'Preview text' })).toHaveText(
      'A narrow window still leaves room to read and edit.',
    );
    await expect(source).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );

    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`preview-${colorScheme}-320.png`),
      fullPage: true,
    });
  });
}
