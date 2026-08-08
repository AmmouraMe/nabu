/**
 * Tests for Attachment Utilities
 * Covers validation, type detection, size checks, and audio support
 */
import { describe, it, expect } from 'vitest';
import {
	ACCEPTED_IMAGE_TYPES,
	ACCEPTED_VIDEO_TYPES,
	ACCEPTED_AUDIO_TYPES,
	ALL_ACCEPTED_TYPES,
	MAX_IMAGE_SIZE,
	MAX_VIDEO_SIZE,
	MAX_AUDIO_SIZE,
	MAX_ATTACHMENTS,
	isValidAttachmentType,
	isValidAttachmentSize,
	getAttachmentType,
	formatFileSize,
	getAcceptString,
	validateAttachmentFile
} from '$lib/utils/attachments';

describe('Attachment Utilities', () => {
	// ─── Constants ───────────────────────────────────────────────

	describe('Constants', () => {
		it('should include standard image types', () => {
			expect(ACCEPTED_IMAGE_TYPES).toContain('image/jpeg');
			expect(ACCEPTED_IMAGE_TYPES).toContain('image/png');
			expect(ACCEPTED_IMAGE_TYPES).toContain('image/gif');
			expect(ACCEPTED_IMAGE_TYPES).toContain('image/webp');
		});

		it('should include standard video types', () => {
			expect(ACCEPTED_VIDEO_TYPES).toContain('video/mp4');
			expect(ACCEPTED_VIDEO_TYPES).toContain('video/webm');
			expect(ACCEPTED_VIDEO_TYPES).toContain('video/quicktime');
		});

		it('should include standard audio types', () => {
			expect(ACCEPTED_AUDIO_TYPES).toContain('audio/mpeg');
			expect(ACCEPTED_AUDIO_TYPES).toContain('audio/mp4');
			expect(ACCEPTED_AUDIO_TYPES).toContain('audio/wav');
			expect(ACCEPTED_AUDIO_TYPES).toContain('audio/webm');
			expect(ACCEPTED_AUDIO_TYPES).toContain('audio/ogg');
			expect(ACCEPTED_AUDIO_TYPES).toContain('audio/aac');
		});

		it('should combine all types in ALL_ACCEPTED_TYPES', () => {
			const total =
				ACCEPTED_IMAGE_TYPES.length + ACCEPTED_VIDEO_TYPES.length + ACCEPTED_AUDIO_TYPES.length;
			expect(ALL_ACCEPTED_TYPES).toHaveLength(total);
		});

		it('should define reasonable size limits', () => {
			expect(MAX_IMAGE_SIZE).toBe(20 * 1024 * 1024); // 20MB
			expect(MAX_VIDEO_SIZE).toBe(100 * 1024 * 1024); // 100MB
			expect(MAX_AUDIO_SIZE).toBe(25 * 1024 * 1024); // 25MB
		});

		it('should allow up to 5 attachments per message', () => {
			expect(MAX_ATTACHMENTS).toBe(5);
		});
	});

	// ─── isValidAttachmentType ───────────────────────────────────

	describe('isValidAttachmentType', () => {
		it('should accept image types', () => {
			expect(isValidAttachmentType('image/jpeg')).toBe(true);
			expect(isValidAttachmentType('image/png')).toBe(true);
		});

		it('should accept video types', () => {
			expect(isValidAttachmentType('video/mp4')).toBe(true);
			expect(isValidAttachmentType('video/webm')).toBe(true);
		});

		it('should accept audio types', () => {
			expect(isValidAttachmentType('audio/mpeg')).toBe(true);
			expect(isValidAttachmentType('audio/wav')).toBe(true);
			expect(isValidAttachmentType('audio/ogg')).toBe(true);
			expect(isValidAttachmentType('audio/aac')).toBe(true);
		});

		it('should reject unsupported types', () => {
			expect(isValidAttachmentType('application/pdf')).toBe(false);
			expect(isValidAttachmentType('text/plain')).toBe(false);
			expect(isValidAttachmentType('image/svg+xml')).toBe(false);
			expect(isValidAttachmentType('')).toBe(false);
		});
	});

	// ─── isValidAttachmentSize ───────────────────────────────────

	describe('isValidAttachmentSize', () => {
		it('should allow images under 20MB', () => {
			expect(isValidAttachmentSize(1024, 'image')).toBe(true);
			expect(isValidAttachmentSize(MAX_IMAGE_SIZE, 'image')).toBe(true);
		});

		it('should reject images over 20MB', () => {
			expect(isValidAttachmentSize(MAX_IMAGE_SIZE + 1, 'image')).toBe(false);
		});

		it('should allow videos under 100MB', () => {
			expect(isValidAttachmentSize(50 * 1024 * 1024, 'video')).toBe(true);
			expect(isValidAttachmentSize(MAX_VIDEO_SIZE, 'video')).toBe(true);
		});

		it('should reject videos over 100MB', () => {
			expect(isValidAttachmentSize(MAX_VIDEO_SIZE + 1, 'video')).toBe(false);
		});

		it('should allow audio under 25MB', () => {
			expect(isValidAttachmentSize(10 * 1024 * 1024, 'audio')).toBe(true);
			expect(isValidAttachmentSize(MAX_AUDIO_SIZE, 'audio')).toBe(true);
		});

		it('should reject audio over 25MB', () => {
			expect(isValidAttachmentSize(MAX_AUDIO_SIZE + 1, 'audio')).toBe(false);
		});

		it('should allow zero-size files', () => {
			expect(isValidAttachmentSize(0, 'image')).toBe(true);
			expect(isValidAttachmentSize(0, 'video')).toBe(true);
			expect(isValidAttachmentSize(0, 'audio')).toBe(true);
		});
	});

	// ─── getAttachmentType ───────────────────────────────────────

	describe('getAttachmentType', () => {
		it('should return "image" for image MIME types', () => {
			expect(getAttachmentType('image/jpeg')).toBe('image');
			expect(getAttachmentType('image/png')).toBe('image');
			expect(getAttachmentType('image/gif')).toBe('image');
			expect(getAttachmentType('image/webp')).toBe('image');
		});

		it('should return "video" for video MIME types', () => {
			expect(getAttachmentType('video/mp4')).toBe('video');
			expect(getAttachmentType('video/webm')).toBe('video');
			expect(getAttachmentType('video/quicktime')).toBe('video');
		});

		it('should return "audio" for audio MIME types', () => {
			expect(getAttachmentType('audio/mpeg')).toBe('audio');
			expect(getAttachmentType('audio/mp4')).toBe('audio');
			expect(getAttachmentType('audio/wav')).toBe('audio');
			expect(getAttachmentType('audio/webm')).toBe('audio');
			expect(getAttachmentType('audio/ogg')).toBe('audio');
			expect(getAttachmentType('audio/aac')).toBe('audio');
		});

		it('should return null for unsupported MIME types', () => {
			expect(getAttachmentType('application/json')).toBeNull();
			expect(getAttachmentType('text/html')).toBeNull();
			expect(getAttachmentType('')).toBeNull();
		});
	});

	// ─── formatFileSize ──────────────────────────────────────────

	describe('formatFileSize', () => {
		it('should format bytes', () => {
			expect(formatFileSize(500)).toBe('500 B');
		});

		it('should format kilobytes', () => {
			expect(formatFileSize(2048)).toBe('2.0 KB');
		});

		it('should format megabytes', () => {
			expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
		});

		it('should handle zero', () => {
			expect(formatFileSize(0)).toBe('0 B');
		});

		it('should show one decimal place for KB', () => {
			expect(formatFileSize(1536)).toBe('1.5 KB');
		});

		it('should show one decimal place for MB', () => {
			expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
		});
	});

	// ─── getAcceptString ─────────────────────────────────────────

	describe('getAcceptString', () => {
		it('should return a comma-separated list of all MIME types', () => {
			const accept = getAcceptString();
			expect(accept).toContain('image/jpeg');
			expect(accept).toContain('video/mp4');
			expect(accept).toContain('audio/mpeg');
			expect(accept).toContain('audio/wav');
			expect(accept.split(',')).toHaveLength(ALL_ACCEPTED_TYPES.length);
		});
	});

	// ─── validateAttachmentFile ──────────────────────────────────

	describe('validateAttachmentFile', () => {
		function fakeFile(name: string, type: string, size: number): File {
			// Create a plain object that satisfies the File interface
			// Blob's size/type are read-only getters, so we use defineProperties
			const file = Object.create(null);
			Object.defineProperties(file, {
				name: { value: name, enumerable: true },
				type: { value: type, enumerable: true },
				size: { value: size, enumerable: true },
				lastModified: { value: Date.now(), enumerable: true },
				webkitRelativePath: { value: '', enumerable: true }
			});
			return file as File;
		}

		it('should return null for a valid image', () => {
			expect(validateAttachmentFile(fakeFile('photo.jpg', 'image/jpeg', 1024))).toBeNull();
		});

		it('should return null for a valid video', () => {
			expect(validateAttachmentFile(fakeFile('clip.mp4', 'video/mp4', 1024))).toBeNull();
		});

		it('should return null for a valid audio', () => {
			expect(validateAttachmentFile(fakeFile('song.mp3', 'audio/mpeg', 1024))).toBeNull();
		});

		it('should return error for unsupported type', () => {
			const err = validateAttachmentFile(fakeFile('doc.pdf', 'application/pdf', 100));
			expect(err).not.toBeNull();
			expect(err).toContain('Unsupported file type');
		});

		it('should return error for oversized image', () => {
			const err = validateAttachmentFile(fakeFile('huge.png', 'image/png', MAX_IMAGE_SIZE + 1));
			expect(err).not.toBeNull();
			expect(err).toContain('File too large');
		});

		it('should return error for oversized audio', () => {
			const err = validateAttachmentFile(fakeFile('huge.wav', 'audio/wav', MAX_AUDIO_SIZE + 1));
			expect(err).not.toBeNull();
			expect(err).toContain('File too large');
		});
	});
});
