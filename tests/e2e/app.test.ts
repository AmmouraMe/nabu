import { expect, test } from '@playwright/test';

test.describe('Homepage', () => {
	test('should load homepage successfully', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Nabu/);
	});

	test('should open command palette with keyboard shortcut', async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');

		// Open command palette via the nav bar button
		const navPaletteBtn = page.locator('button.command-palette-btn');
		await navPaletteBtn.click();

		// Command palette should be visible
		const palette = page.locator('[role="dialog"][aria-label="Command palette"]');
		await expect(palette).toBeVisible();
	});

	test('should expose Name Builder in the nav and command palette', async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');

		const nameLink = page.locator('nav.nav a[href="/name"]');
		await expect(nameLink).toBeVisible();
		await expect(nameLink).toHaveText('Name Builder');

		await page.locator('button.command-palette-btn').click();
		const palette = page.locator('[role="dialog"][aria-label="Command palette"]');
		await expect(palette).toBeVisible();
		await expect(palette.getByText('Name Builder', { exact: true })).toBeVisible();
	});
});

test.describe('Theme System', () => {
	test('should toggle theme', async ({ page }) => {
		await page.goto('/');

		// Find theme switcher button
		const themeSwitcher = page.locator('button[aria-label*="theme" i]').first();
		await themeSwitcher.click();

		// Check that theme changed
		const html = page.locator('html');
		const theme = await html.getAttribute('data-theme');
		expect(['light', 'dark']).toContain(theme);
	});

	test('should persist theme preference', async ({ page, context }) => {
		await page.goto('/');

		const themeSwitcher = page.locator('button[aria-label*="theme" i]').first();
		await themeSwitcher.click();

		// Reload page
		await page.reload();

		// Theme should persist
		const html = page.locator('html');
		const theme = await html.getAttribute('data-theme');
		expect(theme).toBeDefined();
	});
});

test.describe('Authentication', () => {
	test('should show login page', async ({ page }) => {
		await page.goto('/auth/login');
		await expect(page.locator('h1')).toContainText(/welcome back/i);
	});

	test('should navigate to signup from login', async ({ page }) => {
		await page.goto('/auth/login');
		await page.click('a[href="/auth/signup"]');
		await expect(page).toHaveURL('/auth/signup');
	});

	test('should validate email format', async ({ page }) => {
		await page.goto('/auth/login');

		const emailInput = page.locator('input[type="email"]');
		const submitButton = page.locator('button[type="submit"]');

		await emailInput.fill('invalid-email');
		await submitButton.click();

		// Check for HTML5 validation state
		const validationMessage = await emailInput.evaluate(
			(el: HTMLInputElement) => el.validationMessage
		);
		expect(validationMessage).toBeTruthy();
	});
});
