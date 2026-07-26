/**
 * Brand completion model.
 *
 * Answers "how far is this brand from done, and what is the single best thing to do
 * next" — the spine of the guided-to-100% experience in the chat.
 *
 * Scope is the brand **foundation**: the profile fields plus visual identity (colors,
 * typography, logo). Content assets (generated text, images, audio, video) are
 * deliberately excluded: they are open-ended, so counting them would make 100% a
 * moving target that can never be reached, which is the opposite of motivating.
 *
 * Weights are coarse on purpose — 3 for load-bearing, 2 for valuable, 1 for
 * nice-to-have. Finer gradations would imply a precision this does not have.
 */

import type { BrandProfile } from '$lib/types/onboarding';

/** Which inline chat card can resolve an item. */
export type CompletionCard = 'text' | 'color' | 'typography' | 'logo' | 'choice';

/** Grouping used for the section breakdown in the UI. */
export type CompletionGroup =
	| 'identity'
	| 'audience'
	| 'personality'
	| 'visual'
	| 'positioning'
	| 'story';

export interface CompletionItem {
	/** Profile field this tracks; also the key an editor writes back to. */
	key: string;
	label: string;
	group: CompletionGroup;
	/** 3 = load-bearing, 2 = valuable, 1 = nice to have. */
	weight: 1 | 2 | 3;
	/** Which inline card the chat should offer to resolve this. */
	card: CompletionCard;
	/** Short, second-person nudge. Kept gentle: an invitation, not a scold. */
	prompt: string;
	isComplete: (profile: BrandProfile) => boolean;
}

/** Non-empty once trimmed. Guards against whitespace-only values from free text. */
function hasText(value: unknown): boolean {
	return typeof value === 'string' && value.trim().length > 0;
}

/**
 * A usable colour, not merely a non-empty string. Extraction can leave prose like
 * "a warm orange" in a colour field, which must not count as chosen.
 */
function hasColor(value: unknown): boolean {
	return typeof value === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

/**
 * The checklist, in the order the brand naturally comes together. Ties in the
 * next-best calculation fall back to this order, so the nudges follow that arc
 * instead of jumping around.
 */
export const BRAND_COMPLETION_ITEMS: CompletionItem[] = [
	// Identity
	{
		key: 'brandName',
		label: 'Brand name',
		group: 'identity',
		weight: 3,
		card: 'text',
		prompt: 'Your brand still has a placeholder name — want to settle on the real one?',
		// A system-generated codename is not a decision. Until it is confirmed this
		// stays incomplete, however non-empty the column looks.
		isComplete: (p) => hasText(p.brandName) && p.brandNameConfirmed === true
	},
	{
		key: 'tagline',
		label: 'Tagline',
		group: 'identity',
		weight: 2,
		card: 'text',
		prompt: 'A short tagline would give your brand a line people can repeat.',
		isComplete: (p) => hasText(p.tagline)
	},
	{
		key: 'missionStatement',
		label: 'Mission statement',
		group: 'identity',
		weight: 3,
		card: 'text',
		prompt: 'What is this brand here to do? A mission statement anchors everything else.',
		isComplete: (p) => hasText(p.missionStatement)
	},
	{
		key: 'elevatorPitch',
		label: 'Elevator pitch',
		group: 'identity',
		weight: 2,
		card: 'text',
		prompt: 'Shall we write the one-breath version of what you do?',
		isComplete: (p) => hasText(p.elevatorPitch)
	},
	{
		key: 'visionStatement',
		label: 'Vision statement',
		group: 'identity',
		weight: 1,
		card: 'text',
		prompt: 'Where is this all heading? A vision statement is a good north star.',
		isComplete: (p) => hasText(p.visionStatement)
	},

	// Audience
	{
		key: 'targetAudience',
		label: 'Target audience',
		group: 'audience',
		weight: 3,
		card: 'text',
		prompt: 'Who is this for? Naming the audience sharpens every other choice.',
		isComplete: (p) => hasText(p.targetAudience)
	},
	{
		key: 'valueProposition',
		label: 'Value proposition',
		group: 'audience',
		weight: 3,
		card: 'text',
		prompt: 'What do they get from you that they cannot get elsewhere?',
		isComplete: (p) => hasText(p.valueProposition)
	},
	{
		key: 'customerPainPoints',
		label: 'Customer pain points',
		group: 'audience',
		weight: 2,
		card: 'text',
		prompt: 'What problem are they living with before they find you?',
		isComplete: (p) => hasText(p.customerPainPoints)
	},

	// Personality
	{
		key: 'brandArchetype',
		label: 'Brand archetype',
		group: 'personality',
		weight: 2,
		card: 'choice',
		prompt: 'Picking an archetype makes the voice much easier to keep consistent.',
		isComplete: (p) => hasText(p.brandArchetype)
	},
	{
		key: 'toneOfVoice',
		label: 'Tone of voice',
		group: 'personality',
		weight: 3,
		card: 'text',
		prompt: 'How should your brand sound when it speaks?',
		isComplete: (p) => hasText(p.toneOfVoice)
	},
	{
		key: 'brandPersonalityTraits',
		label: 'Personality traits',
		group: 'personality',
		weight: 2,
		card: 'text',
		prompt: 'A few personality traits would round out the character.',
		isComplete: (p) => hasText(p.brandPersonalityTraits)
	},

	// Visual identity
	{
		key: 'primaryColor',
		label: 'Primary color',
		group: 'visual',
		weight: 3,
		card: 'color',
		prompt: 'Let us pick your primary color — the one people will remember.',
		isComplete: (p) => hasColor(p.primaryColor)
	},
	{
		key: 'secondaryColor',
		label: 'Secondary color',
		group: 'visual',
		weight: 2,
		card: 'color',
		prompt: 'A secondary color gives the palette somewhere to breathe.',
		isComplete: (p) => hasColor(p.secondaryColor)
	},
	{
		key: 'accentColor',
		label: 'Accent color',
		group: 'visual',
		weight: 2,
		card: 'color',
		prompt: 'An accent color gives you something to draw the eye with.',
		isComplete: (p) => hasColor(p.accentColor)
	},
	{
		key: 'typographyHeading',
		label: 'Heading font',
		group: 'visual',
		weight: 2,
		card: 'typography',
		prompt: 'Shall we choose a heading font?',
		isComplete: (p) => hasText(p.typographyHeading)
	},
	{
		key: 'typographyBody',
		label: 'Body font',
		group: 'visual',
		weight: 2,
		card: 'typography',
		prompt: 'A body font to pair with your headings would round out the type.',
		isComplete: (p) => hasText(p.typographyBody)
	},
	{
		key: 'logoUrl',
		label: 'Logo',
		group: 'visual',
		weight: 3,
		card: 'logo',
		prompt: 'Ready to give the brand a logo? We can generate one or you can upload it.',
		// A written concept is genuinely progress, but only an actual mark finishes
		// this — otherwise a brand reaches 100% with nothing to put on anything.
		isComplete: (p) => hasText(p.logoUrl)
	},

	// Positioning
	{
		key: 'industry',
		label: 'Industry',
		group: 'positioning',
		weight: 2,
		card: 'text',
		prompt: 'Which industry are you positioning in?',
		isComplete: (p) => hasText(p.industry)
	},
	{
		key: 'uniqueSellingPoints',
		label: 'Unique selling points',
		group: 'positioning',
		weight: 2,
		card: 'text',
		prompt: 'What makes you the obvious choice over the alternatives?',
		isComplete: (p) => hasText(p.uniqueSellingPoints)
	},
	{
		key: 'marketPosition',
		label: 'Market position',
		group: 'positioning',
		weight: 1,
		card: 'choice',
		prompt: 'Where do you sit — budget, mid-range, premium, or luxury?',
		isComplete: (p) => hasText(p.marketPosition)
	},
	{
		key: 'competitors',
		label: 'Competitors',
		group: 'positioning',
		weight: 1,
		card: 'text',
		prompt: 'Knowing who you are up against helps sharpen the difference.',
		isComplete: (p) => hasText(p.competitors)
	},

	// Story
	{
		key: 'originStory',
		label: 'Origin story',
		group: 'story',
		weight: 2,
		card: 'text',
		prompt: 'Where did this begin? Origin stories do a lot of work.',
		isComplete: (p) => hasText(p.originStory)
	},
	{
		key: 'brandValues',
		label: 'Brand values',
		group: 'story',
		weight: 2,
		card: 'text',
		prompt: 'What does this brand refuse to compromise on?',
		isComplete: (p) => hasText(p.brandValues)
	},
	{
		key: 'brandPromise',
		label: 'Brand promise',
		group: 'story',
		weight: 1,
		card: 'text',
		prompt: 'What can every customer count on, every time?',
		isComplete: (p) => hasText(p.brandPromise)
	}
];

export interface GroupCompletion {
	group: CompletionGroup;
	label: string;
	earned: number;
	total: number;
	percent: number;
}

export interface BrandCompletion {
	/** 0-100, rounded. Only 100 when nothing is outstanding — see `percent`. */
	percent: number;
	earned: number;
	total: number;
	completed: CompletionItem[];
	missing: CompletionItem[];
	/** Highest-weight outstanding item, or null when finished. */
	nextBest: CompletionItem | null;
	groups: GroupCompletion[];
}

const GROUP_LABELS: Record<CompletionGroup, string> = {
	identity: 'Identity',
	audience: 'Audience',
	personality: 'Personality',
	visual: 'Visual identity',
	positioning: 'Positioning',
	story: 'Story'
};

const GROUP_ORDER: CompletionGroup[] = [
	'identity',
	'audience',
	'personality',
	'visual',
	'positioning',
	'story'
];

/**
 * Score a profile against the checklist.
 *
 * A null/absent profile scores zero rather than throwing — the chat renders before
 * the profile has loaded, and a progress meter is not worth a crash.
 */
export function computeBrandCompletion(profile: BrandProfile | null | undefined): BrandCompletion {
	const completed: CompletionItem[] = [];
	const missing: CompletionItem[] = [];

	for (const item of BRAND_COMPLETION_ITEMS) {
		let done = false;
		if (profile) {
			try {
				done = item.isComplete(profile);
			} catch {
				// A malformed field must not take the whole meter down with it.
				done = false;
			}
		}
		(done ? completed : missing).push(item);
	}

	const total = BRAND_COMPLETION_ITEMS.reduce((sum, i) => sum + i.weight, 0);
	const earned = completed.reduce((sum, i) => sum + i.weight, 0);

	// Floor, not round: rounding lets 99.5% display as "100%" while items are still
	// outstanding, which reads as a bug. Only a genuinely finished brand shows 100.
	const percent = total === 0 ? 0 : Math.floor((earned / total) * 100);

	const groups: GroupCompletion[] = GROUP_ORDER.map((group) => {
		const items = BRAND_COMPLETION_ITEMS.filter((i) => i.group === group);
		const groupTotal = items.reduce((sum, i) => sum + i.weight, 0);
		const groupEarned = items
			.filter((i) => completed.includes(i))
			.reduce((sum, i) => sum + i.weight, 0);
		return {
			group,
			label: GROUP_LABELS[group],
			earned: groupEarned,
			total: groupTotal,
			percent: groupTotal === 0 ? 0 : Math.floor((groupEarned / groupTotal) * 100)
		};
	});

	// Heaviest outstanding item wins; ties fall back to checklist order, which follows
	// the natural arc of building a brand.
	const nextBest =
		missing.length === 0
			? null
			: missing.reduce((best, item) => (item.weight > best.weight ? item : best), missing[0]);

	return { percent, earned, total, completed, missing, nextBest, groups };
}
