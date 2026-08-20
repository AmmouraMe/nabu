/**
 * Brand-name generation, as Nabu does it.
 *
 * The guidelines below are David's, copied from the planning repo's
 * `design/brand/naming.md` (established 2026-07-16). They live here as a literal
 * because the planning repo is a separate git repo that this one deliberately
 * ignores — there is no import path between them. If that file changes, change
 * `NAMING_HEURISTICS` to match; the wording is load-bearing, since it is what the
 * model is actually told.
 *
 * The psychology framing (phonaesthetics, Von Restorff, Jung's archetypes) is the
 * same one the Brand Architect uses in `src/lib/services/onboarding.ts` — the
 * `brand_identity` step. Kept consistent on purpose: a name this tool suggests
 * should survive the conversation the full product would have about it.
 *
 * ── The split that matters ──────────────────────────────────────────────────
 * Some heuristics are arithmetic and some are judgement. Syllable count and
 * alphabetical rank are *computed here*, never asked of the model — an LLM
 * scoring its own output against a checklist grades itself generously, and these
 * two are cheap to get exactly right. The model is only asked for what genuinely
 * needs language sense: meaning, sound, and translation risk.
 */

// ─── The guidelines ───────────────────────────────────────────────────────────

/** One heuristic from `design/brand/naming.md`. */
export interface NamingHeuristic {
	key: string;
	label: string;
	/** How it is phrased to the model. */
	guidance: string;
	/** True when this repo checks it arithmetically rather than trusting the model. */
	computed: boolean;
}

/**
 * David's nine, verbatim in substance. "Weights, not gates" is not decoration —
 * it is why nothing here rejects a name for missing one, and why the UI shows a
 * scorecard rather than a pass/fail.
 */
export const NAMING_HEURISTICS: NamingHeuristic[] = [
	{
		key: 'syllables',
		label: 'Few syllables',
		guidance: 'Fewer syllables the better. One or two beats a three.',
		computed: true
	},
	{
		key: 'alphabetical',
		label: 'Early letter',
		guidance:
			'First letter as close to A as possible — it wins the alphabetical-sort advantage in directories and lists.',
		computed: true
	},
	{
		key: 'radio',
		label: 'Radio test',
		guidance:
			'Pass the radio test — heard once aloud, a listener can spell it and find it. No ambiguous homophones, no "is that an F or a PH".',
		computed: false
	},
	{
		key: 'represents',
		label: 'Represents the work',
		guidance: 'Represent what the brand does, at least metaphorically.',
		computed: false
	},
	{
		key: 'unique',
		label: 'Ownable spelling',
		guidance:
			'Unique in spelling, ideally — ownable in search results rather than drowned by a common word.',
		computed: false
	},
	{
		key: 'origin',
		label: 'Origin story',
		guidance:
			'Some history or meaning tied to the originator or origination is a plus — Nabu itself is the Babylonian god of writing and scribes.',
		computed: false
	},
	{
		key: 'domain',
		label: 'Domain',
		guidance: 'Available as a .com and/or other TLDs.',
		computed: false
	},
	{
		key: 'typable',
		label: 'Easy to type',
		guidance:
			'Easy to type on a keyboard — the easier the better. No punctuation, no numerals, no accents.',
		computed: true
	},
	{
		key: 'translation',
		label: 'Travels well',
		guidance: "Doesn't translate to something bad in another language.",
		computed: false
	}
];

/**
 * Jung's twelve, with the exemplar brands — the same list and the same examples
 * the onboarding chat uses, so the vocabulary matches across both surfaces.
 */
export const ARCHETYPES = [
	{
		id: 'innocent',
		label: 'The Innocent',
		example: 'Coca-Cola',
		traits: 'Optimism, simplicity, trust'
	},
	{ id: 'sage', label: 'The Sage', example: 'Google', traits: 'Wisdom, knowledge, expertise' },
	{
		id: 'explorer',
		label: 'The Explorer',
		example: 'Jeep',
		traits: 'Freedom, adventure, discovery'
	},
	{
		id: 'outlaw',
		label: 'The Outlaw',
		example: 'Harley-Davidson',
		traits: 'Revolution, liberation, breaking rules'
	},
	{
		id: 'magician',
		label: 'The Magician',
		example: 'Apple',
		traits: 'Transformation, innovation, imagination'
	},
	{ id: 'hero', label: 'The Hero', example: 'Nike', traits: 'Achievement, courage, mastery' },
	{ id: 'lover', label: 'The Lover', example: 'Chanel', traits: 'Passion, intimacy, elegance' },
	{ id: 'jester', label: 'The Jester', example: 'Old Spice', traits: 'Joy, humor, entertainment' },
	{
		id: 'everyman',
		label: 'The Everyman',
		example: 'IKEA',
		traits: 'Belonging, authenticity, reliability'
	},
	{
		id: 'caregiver',
		label: 'The Caregiver',
		example: 'Johnson & Johnson',
		traits: 'Nurturing, protection, service'
	},
	{
		id: 'ruler',
		label: 'The Ruler',
		example: 'Mercedes-Benz',
		traits: 'Control, prestige, leadership'
	},
	{
		id: 'creator',
		label: 'The Creator',
		example: 'LEGO',
		traits: 'Innovation, self-expression, artistry'
	}
] as const;

export type ArchetypeId = (typeof ARCHETYPES)[number]['id'];

/** Valid archetype id, or undefined for "not sure yet" — which is a real answer. */
export function normalizeArchetype(value: unknown): ArchetypeId | undefined {
	if (typeof value !== 'string') return undefined;
	const match = ARCHETYPES.find((a) => a.id === value.trim().toLowerCase());
	return match?.id;
}

// ─── The computed checks ──────────────────────────────────────────────────────

/**
 * Vowel-group syllable estimate.
 *
 * Deliberately a heuristic, not a dictionary: invented names are the whole point
 * here, and no pronunciation dictionary contains them. Counts runs of vowels as
 * one nucleus, drops a silent trailing "e", and never returns less than 1 for a
 * word with letters in it.
 */
export function countSyllables(name: string): number {
	// Per word, then summed. Counting the letters of "Blue Bottle" as one run
	// loses the boundary and undercounts it as two.
	const words = name.toLowerCase().match(/[a-z]+/g);
	if (!words) return 0;
	return words.reduce((total, word) => total + syllablesInWord(word), 0);
}

function syllablesInWord(word: string): number {
	const groups = word.match(/[aeiouy]+/g);
	let count = groups ? groups.length : 0;

	// "Forge" drops its silent e to one; "Bottle" keeps both, because a
	// consonant before a final "le" is its own nucleus (bot-tle, ap-ple) while a
	// vowel before it is not (whole). Only ever silent when another vowel group
	// remains, so "be" and "the" stay at 1.
	const consonantLe = /[^aeiouy]le$/.test(word);
	if (count > 1 && /[^aeiouy]e$/.test(word) && !consonantLe) count -= 1;

	// A name with no vowel at all is still one beat to say.
	return Math.max(1, count);
}

/**
 * 1 for A through 26 for Z; 27 when the name does not start with a letter.
 * 27 sorts last, which is exactly what a leading digit or symbol deserves under
 * a heuristic about alphabetical advantage.
 */
export function alphabeticalRank(name: string): number {
	const first = name.trim().toLowerCase().charCodeAt(0);
	if (Number.isNaN(first)) return 27;
	const rank = first - 96;
	return rank >= 1 && rank <= 26 ? rank : 27;
}

/**
 * Letters only, nothing that needs a modifier key or a compose sequence.
 * A space is allowed — "Blue Bottle" is two easy words — but hyphens, digits and
 * accented characters are the things that get mistyped and misheard.
 */
export function isEasilyTypable(name: string): boolean {
	return /^[A-Za-z]+(?: [A-Za-z]+)*$/.test(name.trim());
}

export interface ComputedChecks {
	syllables: number;
	alphabeticalRank: number;
	/** The first letter, uppercased, for display. */
	initial: string;
	typable: boolean;
}

/** Every heuristic this repo can settle without asking the model. */
export function computeChecks(name: string): ComputedChecks {
	const trimmed = name.trim();
	return {
		syllables: countSyllables(trimmed),
		alphabeticalRank: alphabeticalRank(trimmed),
		initial: (trimmed[0] ?? '?').toUpperCase(),
		typable: isEasilyTypable(trimmed)
	};
}

// ─── The request ──────────────────────────────────────────────────────────────

export interface NamingInput {
	/** What they are building. The only required field. */
	description: string;
	audience?: string;
	archetype?: ArchetypeId;
}

/** Long enough to be a brief, short enough that nobody pastes a novel into it. */
export const MAX_FIELD_LENGTH = 400;
const MIN_DESCRIPTION_LENGTH = 8;

export type ValidationResult = { ok: true; value: NamingInput } | { ok: false; error: string };

/**
 * Validates and clamps whatever arrived on the wire. This endpoint is public and
 * unauthenticated, so nothing from the body is trusted: every field is
 * type-checked, trimmed, and hard-truncated before it can reach a prompt.
 */
export function validateInput(body: unknown): ValidationResult {
	if (typeof body !== 'object' || body === null) {
		return { ok: false, error: 'Expected a JSON object.' };
	}

	const raw = body as Record<string, unknown>;
	const description = typeof raw.description === 'string' ? raw.description.trim() : '';

	if (description.length < MIN_DESCRIPTION_LENGTH) {
		return {
			ok: false,
			error: `Tell us a bit more about what you're building — at least ${MIN_DESCRIPTION_LENGTH} characters.`
		};
	}

	const audience = typeof raw.audience === 'string' ? raw.audience.trim() : '';

	return {
		ok: true,
		value: {
			description: description.slice(0, MAX_FIELD_LENGTH),
			audience: audience ? audience.slice(0, MAX_FIELD_LENGTH) : undefined,
			archetype: normalizeArchetype(raw.archetype)
		}
	};
}

// ─── The prompt ───────────────────────────────────────────────────────────────

/** How many the model is asked for. Enough to choose between, few enough to read. */
export const NAMES_REQUESTED = 6;

/**
 * The heuristics as prompt text. Computed ones are still listed — the model
 * should be *aiming* at short, early-lettered, typable names, even though its
 * self-assessment of whether it hit them is discarded in favour of arithmetic.
 */
export function heuristicsAsPrompt(): string {
	return NAMING_HEURISTICS.map((h, i) => `${i + 1}. **${h.label}** — ${h.guidance}`).join('\n');
}

export function buildNamingPrompt(input: NamingInput): { system: string; user: string } {
	const archetype = input.archetype ? ARCHETYPES.find((a) => a.id === input.archetype) : undefined;

	const system = `You are Nabu's Brand Architect — a brand strategist who combines consumer psychology, linguistics, and Jungian archetypes to name things well.

Name brands by these guidelines. They are weights, not gates: a great name need not satisfy every one, but it should consciously trade them off.

${heuristicsAsPrompt()}

Also apply naming psychology:
- **Phonaesthetics** — how the sounds themselves feel. Soft consonants (l, m, n, s) read gentle and trustworthy; hard stops (k, t, x) read sharp, fast, technical. Vowel colour matters: bright "i" and "e" feel small and quick, open "o" and "a" feel large and steady.
- **The Von Restorff effect** — the distinctive item in a set is the one remembered. A name that breaks the pattern of its category is recalled; one that blends in is not.
- **Written and spoken** — the name has to survive both. Look at its shape as a wordmark and hear it said down a phone line.

Return ONLY a JSON array. No prose before or after it, no markdown fence. Exactly ${NAMES_REQUESTED} objects, each shaped:
{
  "name": "the name, capitalised as it should be written",
  "meaning": "where it comes from and what it evokes — one or two sentences, concrete, no filler",
  "sound": "how it sounds and why that suits this brand — phonaesthetics, one sentence",
  "radio": "how it fares heard once aloud — can a listener spell it? one short sentence, honest about the risk if there is one",
  "translation": "any meaning it collides with in another major language, or 'No collisions found in major languages.'",
  "domain": "the .com you would try first, lowercase, no protocol"
}

Prefer names that are genuinely ownable — invented words, unexpected compounds, borrowings from mythology or dead languages with a real link to the work. Avoid the exhausted startup patterns: no dropped vowels, no "-ly" or "-ify" suffixes, no "Get"/"Try" prefixes, no two-word portmanteaus of the category and a colour.`;

	const lines = [`What they are building: ${input.description}`];
	if (input.audience) lines.push(`Who it is for: ${input.audience}`);
	if (archetype) {
		lines.push(
			`Brand archetype: ${archetype.label} (${archetype.traits}; think ${archetype.example}). The names should feel like this archetype.`
		);
	} else {
		lines.push(
			'Brand archetype: not chosen yet. Infer the one that fits and name accordingly; do not ask.'
		);
	}
	lines.push(`\nGive me ${NAMES_REQUESTED} names as the JSON array described.`);

	return { system, user: lines.join('\n') };
}

// ─── The response ─────────────────────────────────────────────────────────────

export interface GeneratedName {
	name: string;
	meaning: string;
	sound: string;
	radio: string;
	translation: string;
	domain: string;
	checks: ComputedChecks;
}

/** Coerce to a trimmed string; anything non-string becomes the fallback. */
function text(value: unknown, fallback = ''): string {
	return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/**
 * A plausible .com for a name, used when the model omits one or returns junk.
 * Strips everything but letters, which is also what a registrar would do.
 */
export function fallbackDomain(name: string): string {
	const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
	return slug ? `${slug}.com` : '';
}

/**
 * Pull the JSON array out of whatever the model actually said.
 *
 * Instructing a 70B model to return bare JSON gets bare JSON most of the time,
 * and a markdown fence or a "Here are six names:" preamble the rest of the time.
 * Rather than fail the request on either, this finds the outermost array and
 * parses that.
 */
export function extractJsonArray(raw: string): unknown[] | null {
	if (typeof raw !== 'string') return null;

	// Fenced first — inside a ```json block the brackets are unambiguous.
	const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidates = [fenced?.[1], raw].filter((c): c is string => typeof c === 'string');

	for (const candidate of candidates) {
		const end = candidate.lastIndexOf(']');
		if (end === -1) continue;

		// Outermost first, so `{"names": [...]}` — a common deviation — yields the
		// inner array. Then innermost, which is what rescues a truncated fence
		// followed by a good array in the same reply.
		const starts = [candidate.indexOf('['), candidate.lastIndexOf('[', end)];

		for (const start of starts) {
			if (start === -1 || start >= end) continue;
			try {
				const parsed = JSON.parse(candidate.slice(start, end + 1));
				if (Array.isArray(parsed)) return parsed;
			} catch {
				// Fall through to the next slice, then the next candidate.
			}
		}
	}

	return salvageTruncatedArray(raw);
}

/**
 * Recover the complete objects from an array the model ran out of tokens
 * mid-way through.
 *
 * A generation cut off at the limit ends like `..."domain": "alba.co` — no
 * closing brace, no closing bracket, so the whole reply parses as nothing and
 * six good names are thrown away over a seventh that never finished. This walks
 * back to the last `}` that closes a top-level object and parses the array up to
 * there.
 *
 * Only ever called after the strict paths fail, so a well-formed reply never
 * touches it.
 */
function salvageTruncatedArray(raw: string): unknown[] | null {
	const start = raw.indexOf('[');
	if (start === -1) return null;

	// Walk forward tracking depth, remembering where each top-level object ends.
	let depth = 0;
	let inString = false;
	let escaped = false;
	let lastComplete = -1;

	for (let i = start + 1; i < raw.length; i++) {
		const ch = raw[i];

		if (escaped) {
			escaped = false;
			continue;
		}
		if (ch === '\\') {
			escaped = true;
			continue;
		}
		if (ch === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;

		if (ch === '{') depth++;
		else if (ch === '}') {
			depth--;
			if (depth === 0) lastComplete = i;
		}
	}

	if (lastComplete === -1) return null;

	try {
		// The slice always opens at '[', so anything that parses is an array —
		// no need to re-check the type.
		return JSON.parse(raw.slice(start, lastComplete + 1) + ']') as unknown[];
	} catch {
		// Braces balanced but the content between them is not JSON.
		return null;
	}
}

/**
 * Model output → the names the page renders.
 *
 * Entries without a usable `name` are dropped rather than repaired: a card with
 * no name on it is worse than a shorter list. Everything else is defaulted, so a
 * model that skips `translation` costs the user a sentence, not the result.
 * Checks are always recomputed here, so the arithmetic heuristics are this
 * repo's answer and not the model's.
 */
export function parseNames(raw: string): GeneratedName[] {
	const parsed = extractJsonArray(raw);
	if (!parsed) return [];

	const seen = new Set<string>();
	const names: GeneratedName[] = [];

	for (const entry of parsed) {
		if (typeof entry !== 'object' || entry === null) continue;
		const record = entry as Record<string, unknown>;

		const name = text(record.name);
		if (!name) continue;

		// The same name twice reads as a bug even when the rationales differ.
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);

		names.push({
			name,
			meaning: text(record.meaning, 'No rationale returned.'),
			sound: text(record.sound, ''),
			radio: text(record.radio, ''),
			translation: text(record.translation, ''),
			domain: text(record.domain, fallbackDomain(name))
				.toLowerCase()
				.replace(/^https?:\/\//, ''),
			checks: computeChecks(name)
		});
	}

	return names;
}
