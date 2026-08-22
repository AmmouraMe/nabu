/**
 * The share-card tags.
 *
 * Worth testing precisely because nothing ever fails visibly when these are
 * wrong: the page renders fine, and you only discover the problem when someone
 * pastes a link into Slack and gets a grey box. The two things that actually
 * break are relative image URLs — which crawlers drop outright — and private
 * pages leaking a rich preview.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import Seo from '../../src/lib/components/Seo.svelte';
import { SITE_URL } from '../../src/lib/site';

// No store to mock: the component takes its host from $lib/site and its path as
// a prop, precisely so it can be rendered in isolation.

/** The content of a head tag, by attribute — how a crawler reads the page. */
function meta(selector: string): string | null {
	return document.head.querySelector(selector)?.getAttribute('content') ?? null;
}

function link(rel: string): string | null {
	return document.head.querySelector(`link[rel="${rel}"]`)?.getAttribute('href') ?? null;
}

const BASE = {
	title: 'Name your brand',
	description: 'Six names, nine heuristics.',
	path: '/name'
};

beforeEach(() => {
	document.head.innerHTML = '';
});

afterEach(() => {
	document.head.innerHTML = '';
});

describe('Seo — a public page', () => {
	it('emits a complete Open Graph set', () => {
		render(Seo, { props: { ...BASE, image: 'name' } });

		expect(meta('meta[property="og:site_name"]')).toBe('Nabu');
		expect(meta('meta[property="og:type"]')).toBe('website');
		expect(meta('meta[property="og:title"]')).toBe('Name your brand — Nabu');
		expect(meta('meta[property="og:description"]')).toBe('Six names, nine heuristics.');
		expect(meta('meta[property="og:url"]')).toBe(`${SITE_URL}/name`);
	});

	it('makes the image absolute, because a relative one is dropped', () => {
		render(Seo, { props: { ...BASE, image: 'name' } });

		const image = meta('meta[property="og:image"]');
		expect(image).toBe(`${SITE_URL}/og/name.png`);
		expect(image?.startsWith('https://')).toBe(true);
	});

	it('declares the image dimensions, so a card reserves its space', () => {
		render(Seo, { props: BASE });
		expect(meta('meta[property="og:image:width"]')).toBe('1200');
		expect(meta('meta[property="og:image:height"]')).toBe('630');
	});

	it('asks for the large Twitter card, not the square crop', () => {
		render(Seo, { props: BASE });
		expect(meta('meta[name="twitter:card"]')).toBe('summary_large_image');
		expect(meta('meta[name="twitter:image"]')).toBe(`${SITE_URL}/og/default.png`);
	});

	it('sets a canonical URL', () => {
		render(Seo, { props: BASE });
		expect(link('canonical')).toBe(`${SITE_URL}/name`);
	});

	it('appends the site name once, and never twice', () => {
		render(Seo, { props: { ...BASE, title: 'Pricing' } });
		expect(document.title).toBe('Pricing — Nabu');

		document.head.innerHTML = '';
		render(Seo, { props: { ...BASE, title: 'Nabu — Build your brand' } });
		expect(document.title).toBe('Nabu — Build your brand');
	});

	it('prefers a supplied image URL over the generated card', () => {
		render(Seo, { props: { ...BASE, imageUrl: 'https://cdn.example/post.png' } });
		expect(meta('meta[property="og:image"]')).toBe('https://cdn.example/post.png');
	});

	it('marks an article as one', () => {
		render(Seo, { props: { ...BASE, type: 'article' } });
		expect(meta('meta[property="og:type"]')).toBe('article');
	});
});

describe('Seo — a private page', () => {
	it('emits noindex and no share card at all', () => {
		render(Seo, { props: { ...BASE, noindex: true } });

		expect(meta('meta[name="robots"]')).toBe('noindex, nofollow');
		// A link to somebody's brand dashboard must not unfurl into a rich preview
		// wherever it gets pasted.
		expect(document.head.querySelector('meta[property="og:title"]')).toBeNull();
		expect(document.head.querySelector('meta[property="og:image"]')).toBeNull();
		expect(document.head.querySelector('meta[name="twitter:card"]')).toBeNull();
		expect(link('canonical')).toBeNull();
	});

	it('still sets a title and description, for the browser tab and history', () => {
		render(Seo, { props: { ...BASE, noindex: true } });
		expect(document.title).toBe('Name your brand — Nabu');
		expect(meta('meta[name="description"]')).toBe('Six names, nine heuristics.');
	});
});
