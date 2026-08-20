import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import VideoCard from '../../src/lib/components/VideoCard.svelte';

describe('VideoCard', () => {
	describe('Generating state', () => {
		it('should show generating animation', () => {
			render(VideoCard, {
				props: {
					media: { type: 'video', status: 'generating', progress: 0 },
					prompt: 'A sunset'
				}
			});

			expect(screen.getByText('Generating video...')).toBeInTheDocument();
		});

		it('should show progress percentage when progress > 0', () => {
			render(VideoCard, {
				props: {
					media: { type: 'video', status: 'generating', progress: 45 },
					prompt: 'A sunset'
				}
			});

			expect(screen.getByText('45%')).toBeInTheDocument();
		});

		it('should show indeterminate progress when progress is 0', () => {
			const { container } = render(VideoCard, {
				props: {
					media: { type: 'video', status: 'generating', progress: 0 },
					prompt: 'A sunset'
				}
			});

			const indeterminate = container.querySelector('.progress-bar.indeterminate');
			expect(indeterminate).toBeInTheDocument();
		});
	});

	describe('Complete state', () => {
		it('should show video player when complete', () => {
			const { container } = render(VideoCard, {
				props: {
					media: {
						type: 'video',
						status: 'complete',
						url: 'https://example.com/video.mp4'
					},
					prompt: 'A sunset'
				}
			});

			const video = container.querySelector('video');
			expect(video).toBeInTheDocument();
		});

		it('should show duration badge when duration > 0', () => {
			render(VideoCard, {
				props: {
					media: {
						type: 'video',
						status: 'complete',
						url: 'https://example.com/video.mp4',
						duration: 65
					},
					prompt: 'A sunset'
				}
			});

			expect(screen.getByText('1:05')).toBeInTheDocument();
		});

		it('should set poster from thumbnail url', () => {
			const { container } = render(VideoCard, {
				props: {
					media: {
						type: 'video',
						status: 'complete',
						url: 'https://example.com/video.mp4',
						thumbnailUrl: 'https://example.com/thumb.jpg'
					},
					prompt: 'A sunset'
				}
			});

			const video = container.querySelector('video');
			expect(video?.getAttribute('poster')).toBe('https://example.com/thumb.jpg');
		});
	});

	describe('Error state', () => {
		it('should show error message', () => {
			render(VideoCard, {
				props: {
					media: {
						type: 'video',
						status: 'error',
						error: 'Content policy violation'
					},
					prompt: 'A sunset'
				}
			});

			expect(screen.getByText('Content policy violation')).toBeInTheDocument();
		});

		it('should show default error message when none provided', () => {
			render(VideoCard, {
				props: {
					media: {
						type: 'video',
						status: 'error'
					},
					prompt: 'A sunset'
				}
			});

			expect(screen.getByText('Video generation failed')).toBeInTheDocument();
		});

		it('should show retry button', () => {
			render(VideoCard, {
				props: {
					media: {
						type: 'video',
						status: 'error',
						error: 'Failed'
					},
					prompt: 'A sunset'
				}
			});

			expect(screen.getByText('Retry')).toBeInTheDocument();
		});

		it('should dispatch retry event with prompt on click', async () => {
			const { component } = render(VideoCard, {
				props: {
					media: {
						type: 'video',
						status: 'error',
						error: 'Failed'
					},
					prompt: 'A beautiful sunset'
				}
			});

			const retryHandler = vi.fn();
			component.$on('retry', retryHandler);

			const retryButton = screen.getByText('Retry');
			await fireEvent.click(retryButton);

			expect(retryHandler).toHaveBeenCalledTimes(1);
			expect(retryHandler.mock.calls[0][0].detail).toEqual({
				prompt: 'A beautiful sunset'
			});
		});
	});

	describe('Duration formatting', () => {
		it('should format seconds correctly', () => {
			render(VideoCard, {
				props: {
					media: {
						type: 'video',
						status: 'complete',
						url: 'https://example.com/video.mp4',
						duration: 5
					},
					prompt: 'Test'
				}
			});

			expect(screen.getByText('0:05')).toBeInTheDocument();
		});

		it('should format minutes and seconds', () => {
			render(VideoCard, {
				props: {
					media: {
						type: 'video',
						status: 'complete',
						url: 'https://example.com/video.mp4',
						duration: 125
					},
					prompt: 'Test'
				}
			});

			expect(screen.getByText('2:05')).toBeInTheDocument();
		});
	});
});
