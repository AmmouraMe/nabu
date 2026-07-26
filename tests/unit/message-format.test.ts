import { describe, expect, it } from 'vitest';
import { escapeHtml, renderMessageHtml } from '../../src/lib/utils/message-format';

describe('renderMessageHtml - colour swatches', () => {
	it('renders a swatch for a 6-digit hex and keeps the code as text', () => {
		const html = renderMessageHtml('Primary color: #3498db');
		expect(html).toContain('<span class="color-swatch" style="background-color: #3498db">');
		// The code itself must survive — it is what the user copies.
		expect(html).toContain('#3498db</span>');
	});

	it('renders a swatch for the 3-digit shorthand', () => {
		const html = renderMessageHtml('Try #abc here');
		expect(html).toContain('style="background-color: #abc"');
	});

	it('does not truncate a 6-digit hex into the 3-digit form', () => {
		// The regression the alternation order guards: #349 + stray "8db".
		const html = renderMessageHtml('#3498db');
		expect(html).toContain('background-color: #3498db');
		expect(html).not.toContain('background-color: #349"');
	});

	it('still swatches a hex wrapped in bold, as the palette lists are written', () => {
		const html = renderMessageHtml('* Primary color: **#f1c40f** (warm orange)');
		expect(html).toContain('background-color: #f1c40f');
		expect(html).toContain('<strong>');
	});

	it('handles several colours in one message', () => {
		const html = renderMessageHtml('#3498db then #2ecc71 then #9b59b6');
		expect(html.match(/color-swatch/g)).toHaveLength(3);
	});

	it('ignores a longer token that merely starts with hex characters', () => {
		const html = renderMessageHtml('build #abcdef123456 ok');
		expect(html).not.toContain('color-swatch');
	});

	it('does not treat markdown headers as colours', () => {
		const html = renderMessageHtml('## Color Palette');
		expect(html).toContain('<h3>Color Palette</h3>');
		expect(html).not.toContain('color-swatch');
	});

	it('does not re-match the hex it just wrote into the style attribute', () => {
		const html = renderMessageHtml('#3498db');
		// One swatch, not a nested one.
		expect(html.match(/color-swatch/g)).toHaveLength(1);
	});
});

describe('escapeHtml / renderMessageHtml - injection safety', () => {
	it('escapes angle brackets so message text cannot inject markup', () => {
		const html = renderMessageHtml('<img src=x onerror=alert(1)>');
		expect(html).not.toContain('<img');
		expect(html).toContain('&lt;img');
	});

	it('neutralises a script tag in a message', () => {
		const html = renderMessageHtml('<script>alert(1)</script>');
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
	});

	it('escapes ampersands and quotes', () => {
		expect(escapeHtml('a & b')).toBe('a &amp; b');
		expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
	});

	it('escapes before generating markup, so entities cannot forge a tag', () => {
		// If escaping ran after the markdown pass, this would close the strong early.
		const html = renderMessageHtml('**bold</strong><b>x**');
		expect(html).not.toContain('<b>x');
		expect(html).toContain('&lt;b&gt;');
	});

	it('cannot break out of the swatch style attribute', () => {
		const html = renderMessageHtml('#3498db" onmouseover="alert(1)');
		// The quote came from message text, so it is escaped, not attribute syntax.
		expect(html).not.toContain('onmouseover="alert(1)"');
		expect(html).toContain('&quot;');
	});
});

describe('renderMessageHtml - existing formatting still works', () => {
	it('renders bold, italic and headers', () => {
		expect(renderMessageHtml('**b**')).toContain('<strong>b</strong>');
		expect(renderMessageHtml('*i*')).toContain('<em>i</em>');
		expect(renderMessageHtml('### h')).toContain('<h4>h</h4>');
	});

	it('renders list items and line breaks', () => {
		expect(renderMessageHtml('- one')).toContain('<li>one</li>');
		expect(renderMessageHtml('1. one')).toContain('<li>one</li>');
		expect(renderMessageHtml('a\nb')).toContain('<br>');
		expect(renderMessageHtml('a\n\nb')).toContain('</p><p>');
	});
});
