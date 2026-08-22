import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Navigation from './Navigation.svelte';

// SvelteKit's real `page` store refuses to be subscribed to outside a component
// context during SSR — which is exactly what @testing-library/svelte does here.
// A plain readable store with the shape Navigation reads is enough.
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return {
		page: readable({
			url: new URL('http://localhost/'),
			params: {},
			route: { id: '/' },
			status: 200,
			error: null,
			data: {},
			form: null
		}),
		navigating: readable(null),
		updated: { ...readable(false), check: async () => false }
	};
});

const signedInUser = {
	id: '1',
	login: 'tester',
	email: 'tester@test.com',
	name: 'Tester',
	isOwner: false
};

function nameBuilderLinks(): HTMLAnchorElement[] {
	return screen.getAllByRole('link', { name: 'Name Builder' }) as HTMLAnchorElement[];
}

describe('Navigation', () => {
	it('should offer Name Builder to signed-out visitors', () => {
		render(Navigation, { props: { user: null } });

		const links = nameBuilderLinks();
		expect(links).toHaveLength(1);
		expect(links[0].getAttribute('href')).toBe('/name');
	});

	it('should offer Name Builder to signed-in users', () => {
		render(Navigation, { props: { user: signedInUser } });

		const links = nameBuilderLinks();
		expect(links).toHaveLength(1);
		expect(links[0].getAttribute('href')).toBe('/name');
	});

	it('should keep signed-out destinations next to Name Builder', () => {
		render(Navigation, { props: { user: null } });

		expect(screen.getByRole('link', { name: 'Pricing' }).getAttribute('href')).toBe('/pricing');
		expect(screen.getByRole('link', { name: 'Sign In' }).getAttribute('href')).toBe('/auth/login');
		expect(screen.queryByRole('link', { name: 'Brands' })).toBeNull();
	});

	it('should keep signed-in destinations next to Name Builder', () => {
		render(Navigation, { props: { user: signedInUser } });

		expect(screen.getByRole('link', { name: 'Brands' }).getAttribute('href')).toBe('/brand');
		expect(screen.queryByRole('link', { name: 'Pricing' })).toBeNull();
		expect(screen.queryByRole('link', { name: 'Sign In' })).toBeNull();
	});
});
