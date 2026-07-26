import BrandColorCard from '$lib/components/BrandColorCard.svelte';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { BrandProfile } from '../../src/lib/types/onboarding';

function profile(overrides: Partial<BrandProfile> = {}): BrandProfile {
	return {
		id: 'b1',
		userId: 'u1',
		status: 'in_progress',
		brandNameConfirmed: true,
		onboardingStep: 'visual_identity',
		createdAt: '',
		updatedAt: '',
		...overrides
	} as BrandProfile;
}

describe('BrandColorCard', () => {
	it('renders the field it is resolving', () => {
		render(BrandColorCard, { field: 'accentColor', label: 'Accent color', profile: profile() });
		expect(screen.getByText(/choose your accent color/i)).toBeInTheDocument();
	});

	it('shows the colours already chosen, excluding the one being edited', () => {
		render(BrandColorCard, {
			field: 'accentColor',
			label: 'Accent color',
			profile: profile({
				primaryColor: '#3498db',
				secondaryColor: '#f1c40f',
				accentColor: '#111111'
			})
		});
		expect(screen.getByText('Primary')).toBeInTheDocument();
		expect(screen.getByText('Secondary')).toBeInTheDocument();
		// The field under edit must not be listed as prior context.
		expect(screen.queryByText('Accent')).not.toBeInTheDocument();
	});

	it('offers harmony suggestions derived from an existing colour', () => {
		render(BrandColorCard, {
			field: 'accentColor',
			label: 'Accent color',
			profile: profile({ primaryColor: '#3498db' })
		});
		expect(screen.getByText(/goes with what you have/i)).toBeInTheDocument();
	});

	it('offers no suggestions when the palette is empty', () => {
		// Harmony is only meaningful relative to an existing colour.
		render(BrandColorCard, { field: 'primaryColor', label: 'Primary color', profile: profile() });
		expect(screen.queryByText(/goes with what you have/i)).not.toBeInTheDocument();
	});

	it('rejects a non-hex value and disables saving', async () => {
		render(BrandColorCard, { field: 'primaryColor', label: 'Primary color', profile: profile() });
		const input = screen.getByLabelText(/hex value/i);
		await fireEvent.input(input, { target: { value: 'a warm orange' } });

		expect(screen.getByText(/not a hex colour/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
	});

	it('emits the normalised hex on save', async () => {
		const { component } = render(BrandColorCard, {
			field: 'primaryColor',
			label: 'Primary color',
			profile: profile()
		});

		let saved: { field: string; value: string } | null = null;
		component.$on('save', (e) => (saved = e.detail));

		const input = screen.getByLabelText(/hex value/i);
		await fireEvent.input(input, { target: { value: '#ABCDEF' } });
		await fireEvent.click(screen.getByRole('button', { name: /save/i }));

		expect(saved).not.toBeNull();
		expect(saved!.field).toBe('primaryColor');
		// Normalised, so the stored value does not depend on how it was typed.
		expect(saved!.value.toLowerCase()).toBe('#abcdef');
	});

	it('does not emit save while a save is already in flight', async () => {
		const { component } = render(BrandColorCard, {
			field: 'primaryColor',
			label: 'Primary color',
			profile: profile({ primaryColor: '#3498db' }),
			saving: true
		});

		let calls = 0;
		component.$on('save', () => calls++);
		await fireEvent.click(screen.getByRole('button', { name: /saving/i }));
		expect(calls).toBe(0);
	});

	it('emits dismiss when closed', async () => {
		const { component } = render(BrandColorCard, {
			field: 'primaryColor',
			label: 'Primary color',
			profile: profile()
		});

		let dismissed = false;
		component.$on('dismiss', () => (dismissed = true));
		await fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
		expect(dismissed).toBe(true);
	});
});
