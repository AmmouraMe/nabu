import * as xssModule from 'xss';
import type { ContentFieldDefinition } from './types';

const FilterXSS = ((xssModule as unknown as { default?: typeof xssModule }).default ?? xssModule)
	.FilterXSS as typeof xssModule.FilterXSS;

const filter = new FilterXSS({
	whiteList: {
		h2: ['class'],
		h3: ['class'],
		h4: ['class'],
		p: ['class'],
		a: ['href', 'title', 'target', 'rel'],
		strong: [],
		b: [],
		em: [],
		i: [],
		s: [],
		u: [],
		code: ['class'],
		pre: ['class'],
		blockquote: [],
		ul: [],
		ol: ['start'],
		li: [],
		hr: [],
		br: [],
		img: ['src', 'alt', 'title', 'width', 'height'],
		figure: [],
		figcaption: [],
		table: [],
		thead: [],
		tbody: [],
		tr: [],
		th: [],
		td: [],
		span: ['class'],
		div: ['class']
	},
	stripIgnoreTag: true,
	stripIgnoreTagBody: ['iframe', 'math', 'noscript', 'object', 'script', 'style', 'template'],
	onTagAttr(tag, name, value) {
		if (name === 'href' || name === 'src') {
			const safe = sanitizeCmsUrl(value, name === 'src');
			return safe ? `${name}="${safe.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"` : '';
		}
		if (name === 'target') return value.toLowerCase() === '_blank' ? 'target="_blank"' : '';
		if (name === 'rel') return 'rel="noopener noreferrer"';
		if (name === 'width' || name === 'height' || (tag === 'ol' && name === 'start')) {
			const number = Number(value);
			return Number.isInteger(number) && number > 0 && number <= 4096 ? `${name}="${number}"` : '';
		}
		return undefined;
	}
});

export function sanitizeCmsUrl(raw: string, image = false): string | null {
	const decoded = raw
		.replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi, (_match, hex: string, decimal: string) => {
			const codePoint = Number.parseInt(hex || decimal, hex ? 16 : 10);
			return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
				? String.fromCodePoint(codePoint)
				: '\uFFFD';
		})
		.replace(
			/&(amp|colon|newline|tab);/gi,
			(_match, entity: string) =>
				({ amp: '&', colon: ':', newline: '\n', tab: '\t' })[entity.toLowerCase()] || ''
		)
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
		.trim();
	if (!decoded || /^[\\/]{2}/.test(decoded)) return null;
	const compact = decoded.replace(/\s/g, '').toLowerCase();
	const colon = compact.indexOf(':');
	const firstPath = compact.search(/[/?#]/);
	if (colon >= 0 && (firstPath < 0 || colon < firstPath)) {
		const allowed = image ? ['http', 'https'] : ['http', 'https', 'mailto', 'tel'];
		if (!allowed.includes(compact.slice(0, colon))) return null;
	}
	return decoded;
}

export function sanitizeHtml(html: unknown): string {
	if (typeof html !== 'string' || !html) return '';
	return filter
		.process(html)
		.replace(/<a\b[^>]*target="_blank"[^>]*>/g, (tag) =>
			tag.replace(/\srel="[^"]*"/, '').replace(/>$/, ' rel="noopener noreferrer">')
		);
}

export function sanitizeContentFields(
	fields: Record<string, unknown>,
	definitions: ContentFieldDefinition[]
): Record<string, unknown> {
	const result = { ...fields };
	for (const definition of definitions) {
		const value = result[definition.name];
		if (definition.type === 'richtext') result[definition.name] = sanitizeHtml(value);
		if ((definition.type === 'url' || definition.type === 'image') && typeof value === 'string') {
			result[definition.name] = sanitizeCmsUrl(value, definition.type === 'image') || '';
		}
	}
	return result;
}
