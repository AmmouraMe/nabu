/**
 * Text Utility Functions
 * Helpers for label/key conversion and text manipulation.
 */

/**
 * Convert a human-readable label to a snake_case key.
 * e.g. "Primary Brand Name" → "primary_brand_name"
 *      "Twitter/X Bio" → "twitter_x_bio"
 *      "elevator pitch" → "elevator_pitch"
 */
export function labelToKey(label: string): string {
	return label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ') // replace non-alphanumeric with space
		.replace(/\s+/g, '_') // collapse whitespace to underscore
		.replace(/^_+|_+$/g, ''); // trim leading/trailing underscores
}

/**
 * Convert a snake_case key to a human-readable label.
 * e.g. "primary_brand_name" → "Primary Brand Name"
 *      "twitter_x_bio" → "Twitter X Bio"
 */
export function keyToLabel(key: string): string {
	return key
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}
