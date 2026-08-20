/**
 * Content Generation Service
 * Uses Cloudflare Workers AI (free tier) to generate brand-aligned content
 * for Dev.to articles, LinkedIn updates, and weekly content calendars.
 */

const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const LINKEDIN_MAX_CHARS = 3000;

// ─── Types ────────────────────────────────────────────────────────

export interface ContentBrand {
	name: string;
	tagline?: string | null;
	voice_tone?: string | null;
	target_audience?: string | null;
	niche?: string | null;
}

export interface DevToPost {
	title: string;
	body: string;
	tags: string[];
}

export interface LinkedInUpdate {
	text: string;
}

export interface CalendarEntry {
	week: number;
	topic: string;
	platforms: string[];
}

export interface VideoScript {
	title: string;
	script: string;
	durationSeconds: number;
}

export interface AiBinding {
	run(
		model: string,
		inputs: Record<string, unknown>
	): Promise<{ response?: string; [k: string]: unknown }>;
}

// ─── Prompt Builders ──────────────────────────────────────────────

function brandContext(brand: ContentBrand): string {
	const lines: string[] = [`Brand: ${brand.name}`];
	if (brand.tagline) lines.push(`Tagline: ${brand.tagline}`);
	if (brand.niche) lines.push(`Niche: ${brand.niche}`);
	if (brand.target_audience) lines.push(`Target audience: ${brand.target_audience}`);
	if (brand.voice_tone) lines.push(`Voice & tone: ${brand.voice_tone}`);
	return lines.join('\n');
}

function buildDevToPrompt(brand: ContentBrand, topic: string): { system: string; user: string } {
	return {
		system: [
			'You are a technical content writer. Produce content that matches the brand voice exactly.',
			'Return ONLY valid JSON with keys: title (string), body (markdown string), tags (array of 3-5 lowercase strings).',
			'No explanation, no markdown wrapper, just the JSON object.'
		].join(' '),
		user: [
			`Write a Dev.to article about: "${topic}"`,
			'',
			brandContext(brand),
			'',
			'Requirements:',
			'- Title: compelling, SEO-friendly, under 100 characters',
			'- Body: 600-900 words of markdown, include code examples if relevant, use ## headings',
			'- Tags: 3-5 relevant lowercase tags (e.g. ["javascript","webdev","productivity"])',
			'',
			'Return as JSON: {"title":"...","body":"...","tags":["..."]}'
		].join('\n')
	};
}

function buildLinkedInPrompt(brand: ContentBrand, topic: string): { system: string; user: string } {
	return {
		system: [
			'You are a LinkedIn content strategist. Write engaging professional updates.',
			'Return ONLY valid JSON with key: text (string, max 3000 chars).',
			'No explanation, just JSON.'
		].join(' '),
		user: [
			`Write a LinkedIn post about: "${topic}"`,
			'',
			brandContext(brand),
			'',
			'Requirements:',
			'- Hook in the first line (no hashtag opening)',
			'- 150-300 words, conversational but professional',
			'- 3-5 relevant hashtags at the end',
			`- Strict maximum: ${LINKEDIN_MAX_CHARS} characters`,
			'',
			'Return as JSON: {"text":"..."}'
		].join('\n')
	};
}

function buildCalendarPrompt(brand: ContentBrand, weeks: number): { system: string; user: string } {
	return {
		system: [
			'You are a content strategist. Plan a realistic, brand-aligned content calendar.',
			`Return ONLY a JSON array of ${weeks} objects, each with: week (number 1-${weeks}), topic (string), platforms (array of strings from: devto, linkedin, twitter, email).`,
			'No explanation, just the JSON array.'
		].join(' '),
		user: [
			`Plan a ${weeks}-week content calendar.`,
			'',
			brandContext(brand),
			'',
			'Requirements:',
			'- Each week gets one distinct topic relevant to the niche',
			'- Assign 1-3 platforms per week based on content type (articles → devto, updates → linkedin)',
			'- Topics should build on each other naturally',
			'',
			`Return as JSON array: [{"week":1,"topic":"...","platforms":["devto","linkedin"]},...]`
		].join('\n')
	};
}

// ─── AI Call Helper ────────────────────────────────────────────────

async function runAi(ai: AiBinding, system: string, user: string): Promise<string> {
	const result = await ai.run(AI_MODEL, {
		messages: [
			{ role: 'system', content: system },
			{ role: 'user', content: user }
		]
	});
	const text = typeof result.response === 'string' ? result.response : '';
	return text.trim();
}

function parseJson<T>(raw: string): T {
	const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
	const clean = fenced ? fenced[1].trim() : raw.trim();
	return JSON.parse(clean) as T;
}

// ─── Public API ────────────────────────────────────────────────────

export async function generateDevToPost(
	ai: AiBinding,
	brand: ContentBrand,
	topic: string
): Promise<DevToPost> {
	const { system, user } = buildDevToPrompt(brand, topic);
	const raw = await runAi(ai, system, user);
	const parsed = parseJson<{ title?: string; body?: string; tags?: unknown }>(raw);

	return {
		title: String(parsed.title ?? topic),
		body: String(parsed.body ?? ''),
		tags: Array.isArray(parsed.tags) ? (parsed.tags as unknown[]).slice(0, 5).map(String) : []
	};
}

export async function generateLinkedInUpdate(
	ai: AiBinding,
	brand: ContentBrand,
	topic: string
): Promise<LinkedInUpdate> {
	const { system, user } = buildLinkedInPrompt(brand, topic);
	const raw = await runAi(ai, system, user);
	const parsed = parseJson<{ text?: string }>(raw);
	const text = String(parsed.text ?? '').slice(0, LINKEDIN_MAX_CHARS);
	return { text };
}

export async function generateContentCalendar(
	ai: AiBinding,
	brand: ContentBrand,
	weeks = 4
): Promise<CalendarEntry[]> {
	const { system, user } = buildCalendarPrompt(brand, weeks);
	const raw = await runAi(ai, system, user);
	const parsed = parseJson<CalendarEntry[]>(raw);

	if (!Array.isArray(parsed)) return [];

	return parsed.slice(0, weeks).map((entry, i) => ({
		week: typeof entry.week === 'number' ? entry.week : i + 1,
		topic: String(entry.topic ?? ''),
		platforms: Array.isArray(entry.platforms)
			? (entry.platforms as unknown[]).map(String)
			: ['linkedin']
	}));
}

export async function generateVideoScript(
	ai: AiBinding,
	brand: ContentBrand,
	topic: string,
	durationSeconds = 5
): Promise<VideoScript> {
	const system = [
		'You are a video script writer. Write concise, visual video scripts.',
		`Return ONLY valid JSON with keys: title (string), script (string, a visual description/narration for a ${durationSeconds}-second video), durationSeconds (number).`,
		'No explanation, just JSON.'
	].join(' ');

	const user = [
		`Write a ${durationSeconds}-second video script about: "${topic}"`,
		'',
		brandContext(brand),
		'',
		'Requirements:',
		`- Title: concise, under 60 characters`,
		`- Script: vivid visual description suitable as a video generation prompt, ${durationSeconds * 20}-${durationSeconds * 30} words`,
		'- Focus on visual elements, motion, and atmosphere',
		'',
		`Return as JSON: {"title":"...","script":"...","durationSeconds":${durationSeconds}}`
	].join('\n');

	const raw = await runAi(ai, system, user);
	const parsed = parseJson<{ title?: string; script?: string; durationSeconds?: number }>(raw);

	return {
		title: String(parsed.title ?? topic),
		script: String(parsed.script ?? topic),
		durationSeconds:
			typeof parsed.durationSeconds === 'number' ? parsed.durationSeconds : durationSeconds
	};
}

// ─── Prompt Builders (exported for testing) ───────────────────────

export { buildDevToPrompt, buildLinkedInPrompt, buildCalendarPrompt };
