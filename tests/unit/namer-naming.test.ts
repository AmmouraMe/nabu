/**
 * The naming logic behind the public name generator — the public brand-name generator.
 *
 * Lives in this repo's test suite rather than beside the app because the root
 * vitest config measures coverage across the whole project (workers/ and apps/
 * included), and the thresholds are 95%. Untested code in apps/ fails CI for
 * everyone, so the app's logic is tested here with everything else.
 *
 * The emphasis is on the two things that actually break: the arithmetic checks
 * (which are this repo's answer, not the model's) and the response parser
 * (which faces whatever a 70B model decides JSON means today).
 */

import { describe, it, expect } from 'vitest';
import {
	ARCHETYPES,
	nameList,
	tldList,
	MAX_AUDIENCE_LENGTH,
	MAX_DESCRIPTION_LENGTH,
	NAMING_HEURISTICS,
	NAMES_REQUESTED,
	alphabeticalRank,
	buildNamingPrompt,
	computeChecks,
	countSyllables,
	extractJsonArray,
	fallbackDomain,
	heuristicsAsPrompt,
	isEasilyTypable,
	normalizeArchetype,
	parseNames,
	validateInput
} from '../../src/lib/server/namer/naming';

describe('countSyllables', () => {
	it('counts vowel groups as one nucleus each', () => {
		expect(countSyllables('Nabu')).toBe(2);
		expect(countSyllables('Hermes')).toBe(2);
		expect(countSyllables('a')).toBe(1);
	});

	it('drops a silent trailing e', () => {
		expect(countSyllables('Forge')).toBe(1);
		expect(countSyllables('Stone')).toBe(1);
	});

	it('keeps the trailing e when it is the only vowel', () => {
		// "be" has one group; stripping it would leave zero, so the guard holds it at 1.
		expect(countSyllables('be')).toBe(1);
		expect(countSyllables('the')).toBe(1);
	});

	it('treats y as a vowel, since invented names lean on it', () => {
		expect(countSyllables('Byte')).toBe(1);
		expect(countSyllables('Lyra')).toBe(2);
	});

	it('counts each word separately, so a two-word name is not undercounted', () => {
		// Run together as "bluebottle" the final "-ttle" collapses and this reads 2.
		expect(countSyllables('Blue Bottle')).toBe(3);
		// A consonant before a final "le" is its own beat; a vowel before it is not.
		expect(countSyllables('Bottle')).toBe(2);
		expect(countSyllables('Whole')).toBe(1);
	});

	it('splits on punctuation as well as spaces', () => {
		expect(countSyllables('AB-CD')).toBe(2);
	});

	it('returns 0 for a string with no letters, and never 0 otherwise', () => {
		expect(countSyllables('')).toBe(0);
		expect(countSyllables('123')).toBe(0);
		// No vowels at all, but it is still a word someone typed.
		expect(countSyllables('brr')).toBe(1);
	});
});

describe('alphabeticalRank', () => {
	it('maps A to 1 and Z to 26, case-insensitively', () => {
		expect(alphabeticalRank('Apex')).toBe(1);
		expect(alphabeticalRank('apex')).toBe(1);
		expect(alphabeticalRank('Zephyr')).toBe(26);
	});

	it('ignores leading whitespace', () => {
		expect(alphabeticalRank('  Basil')).toBe(2);
	});

	it('sorts non-letters last, at 27', () => {
		expect(alphabeticalRank('7Eleven')).toBe(27);
		expect(alphabeticalRank('')).toBe(27);
		expect(alphabeticalRank('!bang')).toBe(27);
	});
});

describe('isEasilyTypable', () => {
	it('accepts plain letters, and spaces between words', () => {
		expect(isEasilyTypable('Nabu')).toBe(true);
		expect(isEasilyTypable('Blue Bottle')).toBe(true);
	});

	it('rejects what needs a modifier key or gets mistyped', () => {
		expect(isEasilyTypable('Café')).toBe(false);
		expect(isEasilyTypable('Go-Go')).toBe(false);
		expect(isEasilyTypable('Web3')).toBe(false);
		expect(isEasilyTypable('')).toBe(false);
	});
});

describe('computeChecks', () => {
	it('reports every arithmetic heuristic for a name', () => {
		expect(computeChecks('Nabu')).toEqual({
			syllables: 2,
			alphabeticalRank: 14,
			initial: 'N',
			typable: true
		});
	});

	it('trims before measuring', () => {
		expect(computeChecks('  Apex  ')).toEqual({
			syllables: 2,
			alphabeticalRank: 1,
			initial: 'A',
			typable: true
		});
	});

	it('falls back to ? for an empty name rather than throwing', () => {
		expect(computeChecks('').initial).toBe('?');
	});
});

describe('normalizeArchetype', () => {
	it('accepts a known id, case- and space-insensitively', () => {
		expect(normalizeArchetype('sage')).toBe('sage');
		expect(normalizeArchetype('  MAGICIAN ')).toBe('magician');
	});

	it('returns undefined for anything else — "not sure" is a real answer', () => {
		expect(normalizeArchetype('wizard')).toBeUndefined();
		expect(normalizeArchetype('')).toBeUndefined();
		expect(normalizeArchetype(42)).toBeUndefined();
		expect(normalizeArchetype(undefined)).toBeUndefined();
	});
});

describe('validateInput', () => {
	it('accepts a description on its own', () => {
		const result = validateInput({ description: 'A coffee subscription box' });
		expect(result).toEqual({
			ok: true,
			value: { description: 'A coffee subscription box', audience: undefined, archetype: undefined }
		});
	});

	it('carries audience and archetype through when given', () => {
		const result = validateInput({
			description: 'A coffee subscription box',
			audience: 'Home baristas',
			archetype: 'explorer'
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.audience).toBe('Home baristas');
		expect(result.value.archetype).toBe('explorer');
	});

	it('rejects a body that is not an object', () => {
		expect(validateInput(null).ok).toBe(false);
		expect(validateInput('a string').ok).toBe(false);
		expect(validateInput(7).ok).toBe(false);
	});

	it('rejects a description that is missing, blank, or too short to be a brief', () => {
		expect(validateInput({}).ok).toBe(false);
		expect(validateInput({ description: '   ' }).ok).toBe(false);
		expect(validateInput({ description: 'coffee' }).ok).toBe(false);
		expect(validateInput({ description: 12345678 }).ok).toBe(false);
	});

	it('accepts a genuinely detailed brief, not just two sentences', () => {
		// The page asks for as much detail as you can give; capping at 400 chars
		// contradicted that in the same breath.
		const result = validateInput({ description: 'x'.repeat(3500) });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.description).toHaveLength(3500);
	});

	it('truncates past the limit rather than refusing, so a paste is not lost', () => {
		const result = validateInput({
			description: 'x'.repeat(9000),
			audience: 'y'.repeat(9000)
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.description).toHaveLength(MAX_DESCRIPTION_LENGTH);
		expect(result.value.audience).toHaveLength(MAX_AUDIENCE_LENGTH);
	});

	it('drops an unknown archetype instead of failing the request', () => {
		const result = validateInput({ description: 'A coffee box', archetype: 'wizard' });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.archetype).toBeUndefined();
	});

	it('treats a blank audience as absent', () => {
		const result = validateInput({ description: 'A coffee box', audience: '   ' });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.audience).toBeUndefined();
	});
});

describe('buildNamingPrompt', () => {
	it("puts every one of David's heuristics in the system prompt", () => {
		const { system } = buildNamingPrompt({ description: 'A coffee box' });
		for (const heuristic of NAMING_HEURISTICS) {
			expect(system).toContain(heuristic.label);
		}
	});

	it('asks for the number of names the endpoint expects', () => {
		const { system, user } = buildNamingPrompt({ description: 'A coffee box' });
		expect(system).toContain(String(NAMES_REQUESTED));
		expect(user).toContain(String(NAMES_REQUESTED));
	});

	it('names the chosen archetype and its exemplar', () => {
		const { user } = buildNamingPrompt({ description: 'A coffee box', archetype: 'magician' });
		expect(user).toContain('The Magician');
		expect(user).toContain('Apple');
	});

	it('tells the model to infer an archetype rather than ask, when none is chosen', () => {
		const { user } = buildNamingPrompt({ description: 'A coffee box' });
		expect(user).toContain('not chosen yet');
		expect(user).toContain('do not ask');
	});

	it('includes the audience only when there is one', () => {
		const withAudience = buildNamingPrompt({
			description: 'A coffee box',
			audience: 'Home baristas'
		});
		expect(withAudience.user).toContain('Home baristas');
		expect(buildNamingPrompt({ description: 'A coffee box' }).user).not.toContain('Who it is for');
	});

	it('carries the naming psychology, not just the heuristics', () => {
		const { system } = buildNamingPrompt({ description: 'A coffee box' });
		expect(system).toContain('Phonaesthetics');
		expect(system).toContain('Von Restorff');
	});
});

describe('heuristicsAsPrompt', () => {
	it('numbers every heuristic', () => {
		const text = heuristicsAsPrompt();
		expect(text.split('\n')).toHaveLength(NAMING_HEURISTICS.length);
		expect(text).toMatch(/^1\. /);
	});
});

describe('fallbackDomain', () => {
	it('slugs a name down to what a registrar would accept', () => {
		expect(fallbackDomain('Blue Bottle')).toBe('bluebottle.com');
		expect(fallbackDomain('Café-Noir')).toBe('cafnoir.com');
	});

	it('returns empty rather than a bare dot-com for an unusable name', () => {
		expect(fallbackDomain('!!!')).toBe('');
	});
});

describe('extractJsonArray', () => {
	it('parses a bare array', () => {
		expect(extractJsonArray('[{"name":"Apex"}]')).toEqual([{ name: 'Apex' }]);
	});

	it('parses one inside a markdown fence', () => {
		expect(extractJsonArray('```json\n[{"name":"Apex"}]\n```')).toEqual([{ name: 'Apex' }]);
		expect(extractJsonArray('```\n[{"name":"Apex"}]\n```')).toEqual([{ name: 'Apex' }]);
	});

	it('digs the array out of a preamble the model was told not to write', () => {
		expect(extractJsonArray('Here are six names:\n[{"name":"Apex"}]\nHope that helps!')).toEqual([
			{ name: 'Apex' }
		]);
	});

	it('falls back to the raw text when the fence itself is unparseable', () => {
		// A truncated fence, with a valid array outside it.
		const raw = '```json\n[{"name": broken\n```\nActually: [{"name":"Apex"}]';
		expect(extractJsonArray(raw)).toEqual([{ name: 'Apex' }]);
	});

	it('salvages the complete objects from a reply truncated mid-array', () => {
		// What a generation that hit max_tokens actually looks like: no closing
		// brace on the last object, no closing bracket. Losing six good names over
		// a seventh that never finished is the failure this prevents.
		const truncated =
			'[{"name":"Ardor","meaning":"A burning."},{"name":"Alba","meaning":"Dawn."},{"name":"Ember","dom';
		expect(extractJsonArray(truncated)).toEqual([
			{ name: 'Ardor', meaning: 'A burning.' },
			{ name: 'Alba', meaning: 'Dawn.' }
		]);
	});

	it('is not fooled by braces inside strings when salvaging', () => {
		const truncated = '[{"name":"Ardor","meaning":"Uses a { brace } inside"},{"name":"Alb';
		expect(extractJsonArray(truncated)).toEqual([
			{ name: 'Ardor', meaning: 'Uses a { brace } inside' }
		]);
	});

	it('is not fooled by an escaped quote when salvaging', () => {
		const truncated = '[{"name":"Ardor","meaning":"They said \\"go\\" once"},{"name":"Al';
		expect(extractJsonArray(truncated)).toEqual([
			{ name: 'Ardor', meaning: 'They said "go" once' }
		]);
	});

	it('returns null when not even one object completed', () => {
		expect(extractJsonArray('[{"name":"Ard')).toBeNull();
	});

	it('returns null when the braces balance but the content is not JSON', () => {
		expect(extractJsonArray('[{"name":"Ardor"} then some prose {"name":"Alba"}')).toBeNull();
	});

	it('returns null when there is no array to find', () => {
		expect(extractJsonArray('I cannot help with that.')).toBeNull();
		expect(extractJsonArray('')).toBeNull();
		expect(extractJsonArray('[not json at all')).toBeNull();
		expect(extractJsonArray('] backwards [')).toBeNull();
	});

	it("reaches into a wrapper object, which is the model's commonest deviation", () => {
		expect(extractJsonArray('{"names":[{"name":"Apex"}]}')).toEqual([{ name: 'Apex' }]);
	});

	it('returns null for a non-string input', () => {
		expect(extractJsonArray(undefined as unknown as string)).toBeNull();
	});
});

describe('parseNames', () => {
	const full = JSON.stringify([
		{
			name: 'Apex',
			meaning: 'The summit.',
			sound: 'Hard stops, fast.',
			radio: 'Spells itself.',
			translation: 'No collisions found in major languages.',
			domain: 'apex.com'
		}
	]);

	it('maps a well-formed entry straight through', () => {
		const [name] = parseNames(full);
		expect(name.name).toBe('Apex');
		expect(name.meaning).toBe('The summit.');
		expect(name.domain).toBe('apex.com');
	});

	it('always recomputes the checks rather than trusting the model', () => {
		// The model claims one syllable and an A-rank; the arithmetic disagrees.
		const lying = JSON.stringify([
			{ name: 'Zephyr', checks: { syllables: 1, alphabeticalRank: 1, typable: false } }
		]);
		const [name] = parseNames(lying);
		expect(name.checks).toEqual({
			syllables: 2,
			alphabeticalRank: 26,
			initial: 'Z',
			typable: true
		});
	});

	it('drops entries with no usable name instead of rendering a blank card', () => {
		const raw = JSON.stringify([{ meaning: 'orphaned' }, { name: '   ' }, { name: 'Apex' }]);
		expect(parseNames(raw).map((n) => n.name)).toEqual(['Apex']);
	});

	it('skips non-object entries', () => {
		const raw = JSON.stringify(['Apex', null, 7, { name: 'Basil' }]);
		expect(parseNames(raw).map((n) => n.name)).toEqual(['Basil']);
	});

	it('deduplicates by name, case-insensitively', () => {
		const raw = JSON.stringify([{ name: 'Apex' }, { name: 'APEX' }, { name: 'Basil' }]);
		expect(parseNames(raw).map((n) => n.name)).toEqual(['Apex', 'Basil']);
	});

	it('defaults the prose fields rather than dropping the name over them', () => {
		const [name] = parseNames(JSON.stringify([{ name: 'Apex' }]));
		expect(name.meaning).toBe('No rationale returned.');
		expect(name.sound).toBe('');
		expect(name.radio).toBe('');
		expect(name.translation).toBe('');
	});

	it('derives a domain when the model omits one', () => {
		const [name] = parseNames(JSON.stringify([{ name: 'Blue Bottle' }]));
		expect(name.domain).toBe('bluebottle.com');
	});

	it('normalises a domain the model dressed up as a URL', () => {
		const [name] = parseNames(JSON.stringify([{ name: 'Apex', domain: 'HTTPS://Apex.com' }]));
		expect(name.domain).toBe('apex.com');
	});

	it('returns an empty list when nothing parses, so the endpoint can 502', () => {
		expect(parseNames('I cannot help with that.')).toEqual([]);
		expect(parseNames('[]')).toEqual([]);
	});
});

describe('the guideline data itself', () => {
	it('has all twelve Jungian archetypes, each with an exemplar', () => {
		expect(ARCHETYPES).toHaveLength(12);
		for (const archetype of ARCHETYPES) {
			expect(archetype.example.length).toBeGreaterThan(0);
			expect(archetype.traits.length).toBeGreaterThan(0);
		}
	});

	it("has all nine of David's heuristics, with unique keys", () => {
		expect(NAMING_HEURISTICS).toHaveLength(9);
		expect(new Set(NAMING_HEURISTICS.map((h) => h.key)).size).toBe(9);
	});

	it('marks exactly the three heuristics this repo checks arithmetically', () => {
		const computed = NAMING_HEURISTICS.filter((h) => h.computed).map((h) => h.key);
		expect(computed).toEqual(['syllables', 'alphabetical', 'typable']);
	});
});

describe('nameList', () => {
	it('keeps order, trims, and drops non-strings', () => {
		expect(nameList([' Ardor ', 7, 'Alba', null], 10)).toEqual(['Ardor', 'Alba']);
	});

	it('deduplicates case-insensitively, keeping the first spelling', () => {
		expect(nameList(['Ardor', 'ARDOR', 'Alba'], 10)).toEqual(['Ardor', 'Alba']);
	});

	it('caps the list, because it all goes into the prompt', () => {
		expect(
			nameList(
				Array.from({ length: 40 }, (_, i) => `N${i}`),
				5
			)
		).toHaveLength(5);
	});

	it('is undefined rather than empty, so the prompt can just test presence', () => {
		expect(nameList([], 5)).toBeUndefined();
		expect(nameList(['   '], 5)).toBeUndefined();
		expect(nameList('not an array', 5)).toBeUndefined();
		expect(nameList(undefined, 5)).toBeUndefined();
	});
});

describe('tldList', () => {
	it('normalises a leading dot and case', () => {
		expect(tldList(['.COM', 'net'])).toEqual(['com', 'net']);
	});

	it('refuses TLDs this app cannot actually verify', () => {
		// Promising to enforce .io when no registry will answer for it would mean
		// silently dropping every name for a check that cannot be made.
		expect(tldList(['io', 'co', 'me', 'sh'])).toBeUndefined();
		expect(tldList(['com', 'io'])).toEqual(['com']);
	});

	it('deduplicates and returns undefined when nothing survives', () => {
		expect(tldList(['com', '.com'])).toEqual(['com']);
		expect(tldList(['nonsense'])).toBeUndefined();
		expect(tldList('com')).toBeUndefined();
	});
});

describe('buildNamingPrompt with preferences', () => {
	const base = { description: 'A coffee subscription box' };

	it('puts the ranking in, favourite first, and asks for the direction not the spelling', () => {
		const { user } = buildNamingPrompt({ ...base, liked: ['Ardor', 'Alba'] });
		expect(user).toContain('favourite first: Ardor, Alba');
		expect(user).toMatch(/not simply return variations/i);
	});

	it('lists what not to repeat', () => {
		const { user } = buildNamingPrompt({ ...base, avoid: ['Ardor', 'Alba'] });
		expect(user).toMatch(/do not repeat any of these: Ardor, Alba/i);
	});

	it('states the domain requirement, and pushes away from dictionary words', () => {
		const { user } = buildNamingPrompt({ ...base, requireTlds: ['com'] });
		expect(user).toContain('.com domain must be unregistered');
		expect(user).toMatch(/invented words/i);
	});

	it('feeds live rejection reasons back to a retry without confusing uncertainty with taken', () => {
		const { user } = buildNamingPrompt(base, [
			{ name: 'Ardor', reason: 'ardor.com already registered', kind: 'taken' },
			{ name: 'Alba', reason: 'could not verify alba.net', kind: 'unverifiable' }
		]);
		expect(user).toContain('Ardor — taken: ardor.com already registered');
		expect(user).toContain('Alba — unverifiable: could not verify alba.net');
		expect(user).toMatch(/different part of the naming space/i);
		expect(user).toMatch(/uncertainty, never proof/i);
	});

	it('says none of it when nothing was ranked or required', () => {
		const { user } = buildNamingPrompt(base);
		expect(user).not.toMatch(/favourite first|do not repeat|must be unregistered/i);
	});
});

describe('validateInput with preferences', () => {
	it('carries a sanitised ranking, avoid list and TLD requirement', () => {
		const result = validateInput({
			description: 'A coffee subscription box',
			liked: ['Ardor', 'Ardor', 'Alba'],
			avoid: ['Kafos'],
			requireTlds: ['.COM', 'io']
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.liked).toEqual(['Ardor', 'Alba']);
		expect(result.value.avoid).toEqual(['Kafos']);
		expect(result.value.requireTlds).toEqual(['com']);
	});

	it('leaves them undefined when absent or unusable', () => {
		const result = validateInput({ description: 'A coffee subscription box', liked: 'Ardor' });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.liked).toBeUndefined();
		expect(result.value.requireTlds).toBeUndefined();
	});
});
