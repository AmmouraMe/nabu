/**
 * Tests for Logo Variants feature
 * TDD: Tests written first, then implementation
 *
 * Logo variants add horizontal (icon + name side-by-side) and
 * vertical (icon above name) layout URLs alongside the existing
 * square icon logo URL.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BRAND_FIELD_LABELS, getBrandFieldsSummary } from '$lib/services/brand';
import type { BrandProfile } from '$lib/types/onboarding';

describe('Logo Variants', () => {
	describe('BrandProfile type includes logo variant fields', () => {
		it('should accept logoHorizontalUrl and logoVerticalUrl', () => {
			const profile: Partial<BrandProfile> = {
				id: 'test-1',
				userId: 'user-1',
				logoUrl: 'https://r2.example.com/logo-icon.png',
				logoHorizontalUrl: 'https://r2.example.com/logo-horizontal.png',
				logoVerticalUrl: 'https://r2.example.com/logo-vertical.png'
			};

			expect(profile.logoUrl).toBe('https://r2.example.com/logo-icon.png');
			expect(profile.logoHorizontalUrl).toBe('https://r2.example.com/logo-horizontal.png');
			expect(profile.logoVerticalUrl).toBe('https://r2.example.com/logo-vertical.png');
		});

		it('should allow undefined logo variant URLs', () => {
			const profile: Partial<BrandProfile> = {
				id: 'test-2',
				userId: 'user-1',
				logoUrl: 'https://r2.example.com/logo-icon.png'
			};

			expect(profile.logoHorizontalUrl).toBeUndefined();
			expect(profile.logoVerticalUrl).toBeUndefined();
		});
	});

	describe('BRAND_FIELD_LABELS', () => {
		it('should include labels for logo variant fields', () => {
			expect(BRAND_FIELD_LABELS.logoUrl).toBe('Logo (Icon)');
			expect(BRAND_FIELD_LABELS.logoHorizontalUrl).toBe('Logo (Horizontal)');
			expect(BRAND_FIELD_LABELS.logoVerticalUrl).toBe('Logo (Vertical)');
		});
	});

	describe('getBrandFieldsSummary', () => {
		it('should include logo variant URLs in the visual identity section', () => {
			const profile = {
				id: 'test-1',
				userId: 'user-1',
				status: 'in_progress' as const,
				brandNameConfirmed: false,
				onboardingStep: 'visual_identity' as const,
				createdAt: '2025-01-01',
				updatedAt: '2025-01-01',
				logoUrl: 'https://r2.example.com/logo-icon.png',
				logoHorizontalUrl: 'https://r2.example.com/logo-horizontal.png',
				logoVerticalUrl: 'https://r2.example.com/logo-vertical.png'
			} as BrandProfile;

			const sections = getBrandFieldsSummary(profile);
			const visual = sections.find((s) => s.id === 'visual');
			expect(visual).toBeDefined();

			const logoIconField = visual!.fields.find((f) => f.key === 'logoUrl');
			expect(logoIconField).toBeDefined();
			expect(logoIconField!.value).toBe('https://r2.example.com/logo-icon.png');
			expect(logoIconField!.type).toBe('image');

			const logoHField = visual!.fields.find((f) => f.key === 'logoHorizontalUrl');
			expect(logoHField).toBeDefined();
			expect(logoHField!.value).toBe('https://r2.example.com/logo-horizontal.png');
			expect(logoHField!.type).toBe('image');

			const logoVField = visual!.fields.find((f) => f.key === 'logoVerticalUrl');
			expect(logoVField).toBeDefined();
			expect(logoVField!.value).toBe('https://r2.example.com/logo-vertical.png');
			expect(logoVField!.type).toBe('image');
		});
	});
});
