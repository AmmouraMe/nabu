/**
 * Tests for the unified onboarding progress header.
 *
 * Replaces the tests for OnboardingProgress and the meter it was stacked with. The
 * behaviour that mattered is kept — ten steps, past ones navigable, the current one
 * marked, future ones inert — and asserted against the segmented bar that took the
 * place of the circle rail. Added on top: that the two measures stay separate, since
 * conflating "where you are" with "how complete the brand is" is what the redesign
 * set out to fix.
 */
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import BrandProgressHeader from '../../src/lib/components/BrandProgressHeader.svelte';
import type { BrandProfile } from '../../src/lib/types/onboarding';

/** A profile with whatever foundation fields a test needs filled in. */
function profileWith(fields: Record<string, unknown> = {}): BrandProfile {
	return {
		id: 'bp-1',
		userId: 'u1',
		currentStep: 'brand_identity',
		status: 'in_progress',
		createdAt: 'now',
		updatedAt: 'now',
		...fields
	} as unknown as BrandProfile;
}

function segments() {
	return document.querySelectorAll('.journey-track button.seg');
}

describe('BrandProgressHeader — the journey', () => {
	it('names the current step and its position in words', () => {
		render(BrandProgressHeader, { props: { currentStep: 'brand_personality' } });

		expect(screen.getByText('Personality')).toBeTruthy();
		expect(screen.getByText('Step 5 of 10')).toBeTruthy();
	});

	it('draws one segment per step', () => {
		render(BrandProgressHeader, { props: { currentStep: 'welcome' } });
		expect(segments().length).toBe(10);
	});

	it('marks past, current and future steps distinctly', () => {
		render(BrandProgressHeader, { props: { currentStep: 'brand_personality' } });
		const segs = segments();

		// brand_personality is index 4: four behind it, one current, five ahead.
		expect(document.querySelectorAll('.seg.completed').length).toBe(4);
		expect(segs[4].classList.contains('active')).toBe(true);
		expect(segs[5].classList.contains('completed')).toBe(false);
		expect(segs[5].classList.contains('active')).toBe(false);
	});

	it('sets aria-current on the step you are on', () => {
		render(BrandProgressHeader, { props: { currentStep: 'target_audience' } });

		const active = screen.getByLabelText(/Audience — current step/);
		expect(active.getAttribute('aria-current')).toBe('step');
	});

	it('leaves only past steps clickable', () => {
		render(BrandProgressHeader, { props: { currentStep: 'brand_identity' } });
		const segs = segments();

		expect(segs[0].hasAttribute('disabled')).toBe(false); // completed
		expect(segs[2].hasAttribute('disabled')).toBe(true); // active
		expect(segs[3].hasAttribute('disabled')).toBe(true); // future
	});

	it('offers to go back from a completed step', () => {
		render(BrandProgressHeader, { props: { currentStep: 'brand_identity' } });

		const completed = screen.getByLabelText(/Welcome — completed, click to go back/);
		expect(completed.getAttribute('title')).toContain('Go back to');
	});

	it('dispatches stepClick when a past step is clicked', async () => {
		const { component } = render(BrandProgressHeader, { props: { currentStep: 'brand_identity' } });
		const handler = vi.fn();
		component.$on('stepClick', handler);

		await fireEvent.click(screen.getByLabelText(/Welcome — completed, click to go back/));

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler.mock.calls[0][0].detail).toBe('welcome');
	});

	it('stays silent when the current step is clicked', async () => {
		const { component } = render(BrandProgressHeader, { props: { currentStep: 'brand_identity' } });
		const handler = vi.fn();
		component.$on('stepClick', handler);

		await fireEvent.click(screen.getByLabelText(/Identity — current step/));

		expect(handler).not.toHaveBeenCalled();
	});

	it('falls back to the first step when given one it does not know', () => {
		render(BrandProgressHeader, { props: { currentStep: 'nonsense' as never } });

		// Rather than rendering "Step 0 of 10" off a -1 index.
		expect(screen.getByText('Step 1 of 10')).toBeTruthy();
	});
});

describe('BrandProgressHeader — the foundation', () => {
	it('renders at 0% rather than hiding while the profile loads', () => {
		render(BrandProgressHeader, { props: { currentStep: 'welcome', profile: null } });

		const bar = screen.getByRole('progressbar', { name: 'Brand foundation completion' });
		expect(bar.getAttribute('aria-valuenow')).toBe('0');
	});

	it('draws one dot per foundation item', () => {
		render(BrandProgressHeader, { props: { currentStep: 'welcome' } });
		expect(document.querySelectorAll('.dots button.dot').length).toBe(24);
	});

	it('groups the dots into the six sections the checklist actually has', () => {
		render(BrandProgressHeader, { props: { currentStep: 'welcome' } });
		expect(document.querySelectorAll('.dots .dot-group').length).toBe(6);
	});

	it('fills in the dots that are done', () => {
		render(BrandProgressHeader, {
			props: {
				currentStep: 'brand_identity',
				profile: profileWith({ brandName: 'Acme', brandNameConfirmed: true, tagline: 'Onward' })
			}
		});

		expect(document.querySelectorAll('.dot.done').length).toBeGreaterThan(0);
	});

	it('rings exactly one dot as the next thing to do, and names it', () => {
		render(BrandProgressHeader, { props: { currentStep: 'welcome', profile: profileWith() } });

		expect(document.querySelectorAll('.dot.next').length).toBe(1);
		// The ringed dot and the written nudge have to point at the same item.
		const action = document.querySelector('.nudge-action');
		expect(action?.textContent?.trim().length).toBeGreaterThan(0);
	});

	it('dispatches resolve with the item behind a dot', async () => {
		const { component } = render(BrandProgressHeader, {
			props: { currentStep: 'welcome', profile: profileWith() }
		});
		const handler = vi.fn();
		component.$on('resolve', handler);

		await fireEvent.click(document.querySelector('.dots button.dot') as HTMLElement);

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler.mock.calls[0][0].detail).toHaveProperty('key');
	});

	it('dispatches resolve from the nudge button too', async () => {
		const { component } = render(BrandProgressHeader, {
			props: { currentStep: 'welcome', profile: profileWith() }
		});
		const handler = vi.fn();
		component.$on('resolve', handler);

		await fireEvent.click(document.querySelector('.nudge-action') as HTMLElement);

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it('keeps the two measures apart — a finished conversation is not a finished brand', () => {
		render(BrandProgressHeader, { props: { currentStep: 'complete', profile: profileWith() } });

		// Last step reached, but the brand is still nearly empty: the foundation bar must
		// not follow the step rail. Conflating these is what the redesign removed.
		expect(screen.getByText('Step 10 of 10')).toBeTruthy();
		const bar = screen.getByRole('progressbar', { name: 'Brand foundation completion' });
		expect(Number(bar.getAttribute('aria-valuenow'))).toBeLessThan(50);
	});

	it('gives every dot an accessible name saying what it is and whether it is done', () => {
		render(BrandProgressHeader, {
			props: {
				currentStep: 'welcome',
				profile: profileWith({ brandName: 'Acme', brandNameConfirmed: true })
			}
		});

		expect(screen.getByLabelText(/Brand name — done, click to revise/)).toBeTruthy();
		expect(screen.getByLabelText(/Tagline — not filled in yet/)).toBeTruthy();
	});
});
