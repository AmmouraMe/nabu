import BrandLogoCard from '$lib/components/BrandLogoCard.svelte';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const BASE_PROPS = { brandProfileId: 'b1', onboardingStep: 'visual_identity' };

function fileOfSize(bytes: number, type = 'image/png', name = 'logo.png') {
	const file = new File(['x'], name, { type });
	// File size is read-only, so define it rather than fabricating a huge buffer.
	Object.defineProperty(file, 'size', { value: bytes });
	return file;
}

describe('BrandLogoCard', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('renders the upload affordance', () => {
		render(BrandLogoCard, BASE_PROPS);
		expect(screen.getByRole('button', { name: /upload an image/i })).toBeInTheDocument();
	});

	it('links out to AI generation rather than reproducing it inline', () => {
		render(BrandLogoCard, BASE_PROPS);
		const link = screen.getByRole('link', { name: /generate one with ai/i });
		expect(link).toHaveAttribute('href', '/brand/b1?tab=images');
	});

	it('shows the existing logo when there is one', () => {
		render(BrandLogoCard, { ...BASE_PROPS, currentLogoUrl: '/api/archive/file?key=abc' });
		expect(screen.getByAltText(/current brand logo/i)).toBeInTheDocument();
	});

	it('rejects a non-image without uploading', async () => {
		render(BrandLogoCard, BASE_PROPS);
		const input = screen.getByLabelText(/upload a logo image/i);
		await fireEvent.change(input, {
			target: { files: [fileOfSize(100, 'application/pdf', 'a.pdf')] }
		});

		expect(await screen.findByText(/needs to be an image/i)).toBeInTheDocument();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('rejects an oversized file without uploading', async () => {
		render(BrandLogoCard, BASE_PROPS);
		const input = screen.getByLabelText(/upload a logo image/i);
		await fireEvent.change(input, { target: { files: [fileOfSize(6 * 1024 * 1024)] } });

		expect(await screen.findByText(/over 5MB/i)).toBeInTheDocument();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('emits save with the uploaded url on success', async () => {
		(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => ({ url: '/api/archive/file?key=xyz', id: 'a1', r2Key: 'xyz' })
		});

		const { component } = render(BrandLogoCard, BASE_PROPS);
		let saved: { field: string; value: string } | null = null;
		component.$on('save', (e) => (saved = e.detail));

		const input = screen.getByLabelText(/upload a logo image/i);
		await fireEvent.change(input, { target: { files: [fileOfSize(1000)] } });

		await waitFor(() => expect(saved).not.toBeNull());
		// Uploading stores the file; the profile field is what makes it the logo.
		expect(saved!.field).toBe('logoUrl');
		expect(saved!.value).toBe('/api/archive/file?key=xyz');
	});

	it('surfaces an upload failure instead of failing silently', async () => {
		(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: false,
			statusText: 'Payload Too Large',
			json: async () => ({ message: 'Storage rejected the file' })
		});

		const { component } = render(BrandLogoCard, BASE_PROPS);
		let saved = false;
		component.$on('save', () => (saved = true));

		const input = screen.getByLabelText(/upload a logo image/i);
		await fireEvent.change(input, { target: { files: [fileOfSize(1000)] } });

		expect(await screen.findByText(/storage rejected the file/i)).toBeInTheDocument();
		expect(saved).toBe(false);
	});

	it('emits dismiss when closed', async () => {
		const { component } = render(BrandLogoCard, BASE_PROPS);
		let dismissed = false;
		component.$on('dismiss', () => (dismissed = true));
		await fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
		expect(dismissed).toBe(true);
	});
});
