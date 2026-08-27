import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import PricingSection from './PricingSection.svelte';

function headlinePrice(plan: string): HTMLElement {
	const card = screen.getByLabelText(`${plan} plan`);
	return card.querySelector('.price-amount') as HTMLElement;
}

describe('PricingSection billing period', () => {
	it('updates the headline monthly equivalent when the billing period changes', async () => {
		render(PricingSection);

		expect(headlinePrice('Pro')).toHaveTextContent('$24');
		expect(headlinePrice('Business')).toHaveTextContent('$65.83');

		await fireEvent.click(screen.getByRole('radio', { name: 'Monthly' }));
		expect(headlinePrice('Pro')).toHaveTextContent('$29');
		expect(headlinePrice('Business')).toHaveTextContent('$79');

		await fireEvent.click(screen.getByRole('radio', { name: /^Annual/ }));
		expect(headlinePrice('Pro')).toHaveTextContent('$24');
		expect(headlinePrice('Business')).toHaveTextContent('$65.83');
	});

	it('keeps the billing controls exposed as one accessible radio group', () => {
		render(PricingSection);

		const group = screen.getByRole('radiogroup', { name: 'Billing period' });
		expect(within(group).getAllByRole('radio')).toHaveLength(2);
		expect(within(group).getByRole('radio', { name: /^Annual/ })).toHaveAttribute(
			'aria-checked',
			'true'
		);
	});
});
