/**
 * Attachment utilities for chat media uploads
 * Handles validation, conversion, and formatting for image/video attachments
 */

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

export const ACCEPTED_AUDIO_TYPES = [
	'audio/mpeg',
	'audio/mp4',
	'audio/wav',
	'audio/webm',
	'audio/ogg',
	'audio/aac'
] as const;

export const ALL_ACCEPTED_TYPES = [
	...ACCEPTED_IMAGE_TYPES,
	...ACCEPTED_VIDEO_TYPES,
	...ACCEPTED_AUDIO_TYPES
] as const;

/** Max image size: 20MB */
export const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

/** Max video size: 100MB */
export const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

/** Max audio size: 25MB */
export const MAX_AUDIO_SIZE = 25 * 1024 * 1024;

/** Max number of attachments per message */
export const MAX_ATTACHMENTS = 5;

/**
 * Check if a MIME type is a valid attachment type
 */
export function isValidAttachmentType(mimeType: string): boolean {
	return (ALL_ACCEPTED_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Check if a file size is within limits for the given type
 */
export function isValidAttachmentSize(size: number, type: 'image' | 'video' | 'audio'): boolean {
	const maxSize =
		type === 'image' ? MAX_IMAGE_SIZE : type === 'audio' ? MAX_AUDIO_SIZE : MAX_VIDEO_SIZE;
	return size <= maxSize;
}

/**
 * Get the attachment type from a MIME type
 */
export function getAttachmentType(mimeType: string): 'image' | 'video' | 'audio' | null {
	if ((ACCEPTED_IMAGE_TYPES as readonly string[]).includes(mimeType)) return 'image';
	if ((ACCEPTED_VIDEO_TYPES as readonly string[]).includes(mimeType)) return 'video';
	if ((ACCEPTED_AUDIO_TYPES as readonly string[]).includes(mimeType)) return 'audio';
	return null;
}

/**
 * Convert a File to a base64 data URL
 */
export function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(new Error('Failed to read file'));
		reader.readAsDataURL(file);
	});
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Generate the accept string for file inputs
 */
export function getAcceptString(): string {
	return ALL_ACCEPTED_TYPES.join(',');
}

/**
 * Validate a file for attachment and return error message if invalid
 */
export function validateAttachmentFile(file: File): string | null {
	if (!isValidAttachmentType(file.type)) {
		return `Unsupported file type: ${file.type}. Accepted: JPEG, PNG, GIF, WebP, MP4, WebM, MP3, WAV, OGG`;
	}

	const attachmentType = getAttachmentType(file.type);
	if (attachmentType && !isValidAttachmentSize(file.size, attachmentType)) {
		const maxSize = attachmentType === 'image' ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
		return `File too large (${formatFileSize(file.size)}). Maximum: ${formatFileSize(maxSize)}`;
	}

	return null;
}
