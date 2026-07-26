/**
 * Chat message rendering: markdown-ish formatting plus colour swatches.
 *
 * Extracted from `OnboardingChat.svelte` so it can be tested directly. Its output is
 * injected with `{@html}`, so the escaping here is load-bearing rather than cosmetic.
 */

/**
 * Hex colours the Brand Architect proposes, e.g. `#3498db` or `#abc`.
 *
 * The 6-digit form is listed first so it wins the alternation — otherwise `#3498db`
 * would match as the 3-digit `#349` and leave `8db` behind as stray text. The
 * lookahead stops a longer token like `#abcdef123` from matching its first six
 * characters and mangling the rest.
 */
const HEX_COLOR = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w])/g;

/**
 * Escape HTML before any markup is generated.
 *
 * The rendered result goes straight into `{@html}`, and both assistant *and* user
 * messages pass through it — so without this, anything angle-bracketed in a message
 * is injected as live HTML. Brands are shareable (`brand_access`), which puts that
 * within reach of someone other than the message's author.
 */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * Render a chat message to HTML.
 *
 * Callers strip control markers (e.g. `STEP_COMPLETE_MARKER`) *before* calling this:
 * those markers are angle-bracketed, so stripping them afterwards would mean matching
 * against their escaped form.
 */
export function renderMessageHtml(content: string): string {
	return (
		escapeHtml(content)
			// Bold
			.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
			// Italic
			.replace(/\*(.*?)\*/g, '<em>$1</em>')
			// Headers
			.replace(/^### (.*$)/gm, '<h4>$1</h4>')
			.replace(/^## (.*$)/gm, '<h3>$1</h3>')
			// Lists
			.replace(/^- (.*$)/gm, '<li>$1</li>')
			.replace(/^(\d+)\. (.*$)/gm, '<li>$2</li>')
			// Colour swatches. Runs after the header rules so a heading's `##` is long
			// gone, and after bold so palette entries written as `**#3498db**` still get a
			// chip. `String.replace` does not rescan its own output, so the hex inside the
			// style attribute below cannot match again. The captured group is hex digits
			// only, by construction, so interpolating it into the attribute is safe.
			.replace(
				HEX_COLOR,
				(match, hex) =>
					`<span class="color-chip"><span class="color-swatch" style="background-color: #${hex}"></span>${match}</span>`
			)
			// Line breaks
			.replace(/\n\n/g, '</p><p>')
			.replace(/\n/g, '<br>')
	);
}
