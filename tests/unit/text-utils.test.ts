/**
 * Tests for Text Utility Functions
 * TDD: labelToKey and keyToLabel helpers used for brand asset auto-key generation
 */
import { describe, it, expect } from 'vitest';
import { labelToKey, keyToLabel } from '$lib/utils/text';

describe('Text Utilities', () => {
	describe('labelToKey', () => {
		it('should convert a simple label to snake_case', () => {
			expect(labelToKey('Primary Brand Name')).toBe('primary_brand_name');
		});

		it('should handle single word', () => {
			expect(labelToKey('Tagline')).toBe('tagline');
		});

		it('should handle already lowercase input', () => {
			expect(labelToKey('elevator pitch')).toBe('elevator_pitch');
		});

		it('should strip special characters and replace with spaces', () => {
			expect(labelToKey('Twitter/X Bio')).toBe('twitter_x_bio');
		});

		it('should collapse multiple spaces and special chars', () => {
			expect(labelToKey('Some  --  Key!!')).toBe('some_key');
		});

		it('should trim whitespace', () => {
			expect(labelToKey('  Padded Label  ')).toBe('padded_label');
		});

		it('should handle empty string', () => {
			expect(labelToKey('')).toBe('');
		});

		it('should handle string with only special characters', () => {
			expect(labelToKey('---')).toBe('');
		});

		it('should preserve numbers', () => {
			expect(labelToKey('Section 2 Header')).toBe('section_2_header');
		});

		it('should handle mixed case with numbers', () => {
			expect(labelToKey('ISO 9001 Compliance')).toBe('iso_9001_compliance');
		});
	});

	describe('keyToLabel', () => {
		it('should convert snake_case to Title Case', () => {
			expect(keyToLabel('primary_brand_name')).toBe('Primary Brand Name');
		});

		it('should handle single word', () => {
			expect(keyToLabel('tagline')).toBe('Tagline');
		});

		it('should handle abbreviations/short words', () => {
			expect(keyToLabel('twitter_x_bio')).toBe('Twitter X Bio');
		});

		it('should handle empty string', () => {
			expect(keyToLabel('')).toBe('');
		});

		it('should handle key with numbers', () => {
			expect(keyToLabel('section_2_header')).toBe('Section 2 Header');
		});
	});
});
