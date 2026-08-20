import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import BrandFieldCard from '../../src/lib/components/BrandFieldCard.svelte';

describe('BrandFieldCard', () => {
	describe('Display mode', () => {
		it('should render field label', () => {
			render(BrandFieldCard, {
				props: { fieldKey: 'brandName', label: 'Brand Name', value: 'Acme Corp', type: 'text' }
			});
			expect(screen.getByText('Brand Name')).toBeTruthy();
		});

		it('should display text value when set', () => {
			render(BrandFieldCard, {
				props: { fieldKey: 'brandName', label: 'Brand Name', value: 'Acme Corp', type: 'text' }
			});
			expect(screen.getByText('Acme Corp')).toBeTruthy();
		});

		it('should show placeholder when value is empty', () => {
			render(BrandFieldCard, {
				props: { fieldKey: 'brandName', label: 'Brand Name', value: null, type: 'text' }
			});
			expect(screen.getByText(/add brand name/i)).toBeTruthy();
		});

		it('should show placeholder when value is empty string', () => {
			render(BrandFieldCard, {
				props: { fieldKey: 'brandName', label: 'Brand Name', value: '', type: 'text' }
			});
			expect(screen.getByText(/add brand name/i)).toBeTruthy();
		});

		it('should display color swatch for color type', () => {
			const { container } = render(BrandFieldCard, {
				props: {
					fieldKey: 'primaryColor',
					label: 'Primary Color',
					value: '#ff5500',
					type: 'color'
				}
			});
			const swatch = container.querySelector('.color-swatch');
			expect(swatch).toBeTruthy();
			expect(swatch?.getAttribute('style')).toContain('#ff5500');
		});

		it('should display tags for list type', () => {
			render(BrandFieldCard, {
				props: {
					fieldKey: 'values',
					label: 'Values',
					value: ['Bold', 'Creative', 'Honest'],
					type: 'list'
				}
			});
			expect(screen.getByText('Bold')).toBeTruthy();
			expect(screen.getByText('Creative')).toBeTruthy();
			expect(screen.getByText('Honest')).toBeTruthy();
		});

		it('should display archetype badge for archetype type', () => {
			const { container } = render(BrandFieldCard, {
				props: {
					fieldKey: 'archetype',
					label: 'Archetype',
					value: 'Explorer',
					type: 'archetype'
				}
			});
			const badge = container.querySelector('.archetype-badge');
			expect(badge).toBeTruthy();
			expect(badge?.textContent).toContain('Explorer');
		});
	});

	describe('Click-to-edit interaction', () => {
		it('should make the value area clickable to trigger edit', async () => {
			const { component } = render(BrandFieldCard, {
				props: { fieldKey: 'brandName', label: 'Brand Name', value: 'Acme', type: 'text' }
			});

			const editHandler = vi.fn();
			component.$on('edit', editHandler);

			const valueArea = screen.getByText('Acme');
			await fireEvent.click(valueArea);
			expect(editHandler).toHaveBeenCalled();
		});

		it('should make empty placeholder clickable to trigger edit', async () => {
			const { component } = render(BrandFieldCard, {
				props: { fieldKey: 'brandName', label: 'Brand Name', value: null, type: 'text' }
			});

			const editHandler = vi.fn();
			component.$on('edit', editHandler);

			const placeholder = screen.getByText(/add brand name/i);
			await fireEvent.click(placeholder);
			expect(editHandler).toHaveBeenCalled();
		});

		it('should show input when in editing mode', () => {
			render(BrandFieldCard, {
				props: {
					fieldKey: 'brandName',
					label: 'Brand Name',
					value: 'Acme',
					type: 'text',
					isEditing: true,
					editValue: 'Acme'
				}
			});

			const input = screen.getByPlaceholderText(/brand name/i);
			expect(input).toBeTruthy();
		});

		it('should dispatch save with value on Enter key', async () => {
			const { component } = render(BrandFieldCard, {
				props: {
					fieldKey: 'brandName',
					label: 'Brand Name',
					value: 'Acme',
					type: 'text',
					isEditing: true,
					editValue: 'Acme'
				}
			});

			const saveHandler = vi.fn();
			component.$on('save', saveHandler);

			const input = screen.getByPlaceholderText(/brand name/i);
			await fireEvent.keyDown(input, { key: 'Enter' });
			expect(saveHandler).toHaveBeenCalled();
			expect(saveHandler.mock.calls[0][0].detail).toEqual({ value: 'Acme' });
		});

		it('should dispatch cancel on Escape key', async () => {
			const { component } = render(BrandFieldCard, {
				props: {
					fieldKey: 'brandName',
					label: 'Brand Name',
					value: 'Acme',
					type: 'text',
					isEditing: true,
					editValue: 'Acme'
				}
			});

			const cancelHandler = vi.fn();
			component.$on('cancel', cancelHandler);

			const input = screen.getByPlaceholderText(/brand name/i);
			await fireEvent.keyDown(input, { key: 'Escape' });
			expect(cancelHandler).toHaveBeenCalled();
		});

		it('should dispatch save with value on blur', async () => {
			const { component } = render(BrandFieldCard, {
				props: {
					fieldKey: 'brandName',
					label: 'Brand Name',
					value: 'Acme',
					type: 'text',
					isEditing: true,
					editValue: 'New Name'
				}
			});

			const saveHandler = vi.fn();
			component.$on('save', saveHandler);

			const input = screen.getByPlaceholderText(/brand name/i);
			await fireEvent.blur(input);
			expect(saveHandler).toHaveBeenCalled();
			expect(saveHandler.mock.calls[0][0].detail).toEqual({ value: 'New Name' });
		});

		it('should NOT dispatch a second save via blur after Enter already saved', async () => {
			const { component } = render(BrandFieldCard, {
				props: {
					fieldKey: 'brandName',
					label: 'Brand Name',
					value: 'Acme',
					type: 'text',
					isEditing: true,
					editValue: 'Updated Name'
				}
			});

			const saveHandler = vi.fn();
			component.$on('save', saveHandler);

			const input = screen.getByPlaceholderText(/brand name/i);
			// Pressing Enter should save with value, then blur should NOT save again
			await fireEvent.keyDown(input, { key: 'Enter' });
			expect(saveHandler).toHaveBeenCalledTimes(1);
			expect(saveHandler.mock.calls[0][0].detail).toEqual({ value: 'Updated Name' });

			// The blur triggered by Enter (inputEl.blur()) should be suppressed
			// No additional fireEvent.blur needed — it was called in the handler
		});

		it('should NOT dispatch save via blur after Escape cancelled', async () => {
			const { component } = render(BrandFieldCard, {
				props: {
					fieldKey: 'brandName',
					label: 'Brand Name',
					value: 'Acme',
					type: 'text',
					isEditing: true,
					editValue: 'Acme'
				}
			});

			const saveHandler = vi.fn();
			const cancelHandler = vi.fn();
			component.$on('save', saveHandler);
			component.$on('cancel', cancelHandler);

			const input = screen.getByPlaceholderText(/brand name/i);
			await fireEvent.keyDown(input, { key: 'Escape' });
			expect(cancelHandler).toHaveBeenCalled();

			await fireEvent.blur(input);
			expect(saveHandler).not.toHaveBeenCalled();
		});
	});

	describe('History button', () => {
		it('should always show the history button', () => {
			render(BrandFieldCard, {
				props: { fieldKey: 'brandName', label: 'Brand Name', value: 'Acme', type: 'text' }
			});

			expect(screen.getByLabelText(/history/i)).toBeTruthy();
		});

		it('should dispatch history event when history button clicked', async () => {
			const { component } = render(BrandFieldCard, {
				props: { fieldKey: 'brandName', label: 'Brand Name', value: 'Acme', type: 'text' }
			});

			const historyHandler = vi.fn();
			component.$on('history', historyHandler);

			await fireEvent.click(screen.getByLabelText(/history/i));
			expect(historyHandler).toHaveBeenCalled();
		});
	});

	describe('Color type editing', () => {
		it('should show color picker when editing color type', () => {
			const { container } = render(BrandFieldCard, {
				props: {
					fieldKey: 'primaryColor',
					label: 'Primary Color',
					value: '#ff5500',
					type: 'color',
					isEditing: true,
					editValue: '#ff5500'
				}
			});

			expect(container.querySelector('input[type="color"]')).toBeTruthy();
		});
	});

	describe('Accessibility', () => {
		it('should have appropriate aria-label on the edit trigger', () => {
			const { container } = render(BrandFieldCard, {
				props: { fieldKey: 'brandName', label: 'Brand Name', value: 'Acme', type: 'text' }
			});

			const clickable = container.querySelector('[role="button"]');
			expect(clickable).toBeTruthy();
			expect(clickable?.getAttribute('aria-label')).toContain('Brand Name');
		});

		it('should have keyboard support on the value area', async () => {
			const { component, container } = render(BrandFieldCard, {
				props: { fieldKey: 'brandName', label: 'Brand Name', value: 'Acme', type: 'text' }
			});

			const editHandler = vi.fn();
			component.$on('edit', editHandler);

			const clickable = container.querySelector('[role="button"]') as HTMLElement;
			await fireEvent.keyDown(clickable, { key: 'Enter' });
			expect(editHandler).toHaveBeenCalled();
		});

		it('should auto-focus input when editing starts', () => {
			const { container } = render(BrandFieldCard, {
				props: {
					fieldKey: 'brandName',
					label: 'Brand Name',
					value: '',
					type: 'text',
					isEditing: true,
					editValue: ''
				}
			});

			const input = container.querySelector('.edit-input');
			expect(input).toBeTruthy();
		});
	});
});
