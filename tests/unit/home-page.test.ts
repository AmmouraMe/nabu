import { showCommandPalette } from '$lib/stores/commandPalette';
import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '../../src/routes/+page.svelte';

// Mock $app/navigation
vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

// SvelteKit's real `page` store refuses to be subscribed to outside a component
// context during SSR — which is exactly what @testing-library/svelte does here.
// A plain readable store with the shape the page reads is enough.
// See: https://svelte.dev/docs/kit/state-management#avoid-shared-state-on-the-server
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

describe('Home Page – Marketing Landing', () => {
	beforeEach(() => {
		showCommandPalette.set(false);
	});

	afterEach(() => {
		showCommandPalette.set(false);
	});

	it('should render the hero title', () => {
		render(Page, { props: { data: { user: undefined, hasAIProviders: false } } });
		const title = screen.getByText(/Got Brand/i);
		expect(title).toBeTruthy();
	});

	it('should render the hero description', () => {
		render(Page, { props: { data: { user: undefined, hasAIProviders: false } } });
		const description = screen.getByText(/Whether you're starting from zero/i);
		expect(description).toBeTruthy();
	});

	it('should render the badge', () => {
		render(Page, { props: { data: { user: undefined, hasAIProviders: false } } });
		const badge = screen.getByText(/Brand Building & Marketing Automation/i);
		expect(badge).toBeTruthy();
	});

	it('should render CTA buttons for unauthenticated users', () => {
		render(Page, { props: { data: { user: undefined, hasAIProviders: false } } });
		expect(screen.getByText('Start Building Your Brand')).toBeTruthy();
		// "Sign In" appears in both the hero and the closing CTA section.
		expect(screen.getAllByText('Sign In')).toHaveLength(2);
	});

	it('should render app buttons for authenticated users', () => {
		const user = { id: '1', login: 'testuser', email: 'test@test.com', isOwner: false };
		render(Page, { props: { data: { user, hasAIProviders: false } } });
		// "Build Your Brand" likewise appears in the hero and the closing CTA.
		expect(screen.getAllByText('Build Your Brand')).toHaveLength(2);
		expect(screen.getByText('Go to Dashboard')).toBeTruthy();
	});

	it('should render admin link for admin users', () => {
		const user = { id: '1', login: 'admin', email: 'admin@test.com', isOwner: true, isAdmin: true };
		render(Page, { props: { data: { user, hasAIProviders: false } } });
		expect(screen.getByText('Admin Dashboard')).toBeTruthy();
	});

	it('should render brand identity feature cards', () => {
		render(Page, { props: { data: { user: undefined, hasAIProviders: false } } });
		expect(screen.getByText('Start From Scratch')).toBeTruthy();
		expect(screen.getByText('Colors & Visual Identity')).toBeTruthy();
		expect(screen.getByText('Logo & Typography')).toBeTruthy();
		expect(screen.getByText('Brand Voice & Copy')).toBeTruthy();
		expect(screen.getByText('Media & Asset Library')).toBeTruthy();
		expect(screen.getByText('Version History & Multi-Brand')).toBeTruthy();
	});

	it('should render content type cards', () => {
		render(Page, { props: { data: { user: undefined, hasAIProviders: false } } });
		expect(screen.getByText('Text & Copy')).toBeTruthy();
		expect(screen.getByText('Audio')).toBeTruthy();
		expect(screen.getByText('Images')).toBeTruthy();
		expect(screen.getByText('Videos')).toBeTruthy();
	});

	it('should render the auto-publish banner', () => {
		render(Page, { props: { data: { user: undefined, hasAIProviders: false } } });
		expect(screen.getByText('Schedule & auto-publish to social media')).toBeTruthy();
	});

	it('should render how-it-works steps', () => {
		render(Page, { props: { data: { user: undefined, hasAIProviders: false } } });
		expect(screen.getByText('Create Your Brand')).toBeTruthy();
		expect(screen.getByText('Create Your Content')).toBeTruthy();
		expect(screen.getByText('Automate & Publish')).toBeTruthy();
	});

	it('should render the audience section', () => {
		render(Page, { props: { data: { user: undefined, hasAIProviders: false } } });
		expect(screen.getByText('New Founders')).toBeTruthy();
		expect(screen.getByText('Small Business Owners')).toBeTruthy();
		expect(screen.getByText('Content Creators')).toBeTruthy();
	});

	it('should render the CTA section', () => {
		render(Page, { props: { data: { user: undefined, hasAIProviders: false } } });
		expect(screen.getByText('Your brand starts here')).toBeTruthy();
	});

	it('should render the search trigger with keyboard shortcut', () => {
		render(Page, { props: { data: { user: undefined, hasAIProviders: false } } });
		const searchButton = screen.getByLabelText('Open command palette');
		expect(searchButton).toBeTruthy();
		expect(screen.getByText('Ctrl+K')).toBeTruthy();
	});

	it('should render value prop stats', () => {
		render(Page, { props: { data: { user: undefined, hasAIProviders: false } } });
		expect(screen.getByText('Zero')).toBeTruthy();
		expect(screen.getByText('Brand Required to Start')).toBeTruthy();
		expect(screen.getByText('Complete')).toBeTruthy();
		expect(screen.getByText('Auto')).toBeTruthy();
		expect(screen.getByText('All-in-One')).toBeTruthy();
	});

	it('should have proper meta description', () => {
		render(Page, { props: { data: { user: undefined, hasAIProviders: false } } });
		const meta = document.querySelector('meta[name="description"]');
		expect(meta?.getAttribute('content')).toContain('No brand? No problem');
	});
});
