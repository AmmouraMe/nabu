/**
 * Pricing Configuration
 * Defines tier structures, feature availability, and pricing utilities
 * for the Nabu brand-building & marketing automation platform.
 */

export interface TierLimits {
	aiTextGenerations: number;
	aiImageGenerations: number;
	aiAudioGenerations: number;
	aiVideoGenerations: number;
	storageGB: number;
	scheduledPosts: number;
	teamMembers: number;
}

/** Social accounts included free per brand, across all tiers */
export const FREE_SOCIAL_ACCOUNTS_PER_BRAND = 3;

export interface PricingTier {
	id: 'starter' | 'pro' | 'business';
	name: string;
	description: string;
	monthlyPrice: number;
	annualPrice: number;
	highlighted: boolean;
	cta: string;
	limits: TierLimits;
}

export interface PricingFeature {
	name: string;
	category: 'brand' | 'content' | 'publishing' | 'support';
	tooltip?: string;
	tiers: {
		starter: boolean | string;
		pro: boolean | string;
		business: boolean | string;
	};
}

export type TierId = PricingTier['id'];

// ─── Tiers ───────────────────────────────────────────────────────────
export const PRICING_TIERS: PricingTier[] = [
	{
		id: 'starter',
		name: 'Starter',
		description: 'Everything you need to get a brand identity off the ground.',
		monthlyPrice: 0,
		annualPrice: 0,
		highlighted: false,
		cta: 'Get Started Free',
		limits: {
			aiTextGenerations: 50,
			aiImageGenerations: 10,
			aiAudioGenerations: 5,
			aiVideoGenerations: 2,
			storageGB: 1,
			scheduledPosts: 20,
			teamMembers: 1
		}
	},
	{
		id: 'pro',
		name: 'Pro',
		description: 'More AI power, storage, and automated publishing for each brand.',
		monthlyPrice: 29,
		annualPrice: 288,
		highlighted: true,
		cta: 'Start Pro Trial',
		limits: {
			aiTextGenerations: 500,
			aiImageGenerations: 100,
			aiAudioGenerations: 50,
			aiVideoGenerations: 20,
			storageGB: 25,
			scheduledPosts: 500,
			teamMembers: 3
		}
	},
	{
		id: 'business',
		name: 'Business',
		description: 'Priority AI, dedicated support, and maximum capacity per brand.',
		monthlyPrice: 79,
		annualPrice: 790,
		highlighted: false,
		cta: 'Contact Sales',
		limits: {
			aiTextGenerations: 5000,
			aiImageGenerations: 1000,
			aiAudioGenerations: 500,
			aiVideoGenerations: 200,
			storageGB: 100,
			scheduledPosts: 5000,
			teamMembers: 10
		}
	}
];

// ─── Feature comparison matrix ───────────────────────────────────────
export const PRICING_FEATURES: PricingFeature[] = [
	// Brand
	{
		name: 'Brand onboarding wizard',
		category: 'brand',
		tiers: { starter: true, pro: true, business: true }
	},
	{
		name: 'Color & typography system',
		category: 'brand',
		tiers: { starter: true, pro: true, business: true }
	},
	{
		name: 'Logo management',
		category: 'brand',
		tiers: { starter: 'Upload only', pro: true, business: true }
	},
	{
		name: 'Brand voice definition',
		category: 'brand',
		tiers: { starter: true, pro: true, business: true }
	},
	{
		name: 'Version history',
		category: 'brand',
		tiers: { starter: '30 days', pro: '1 year', business: 'Unlimited' }
	},
	{
		name: 'Unlimited brands',
		category: 'brand',
		tiers: { starter: true, pro: true, business: true }
	},
	{
		name: 'Brand export & guidelines PDF',
		category: 'brand',
		tiers: { starter: false, pro: true, business: true }
	},
	// Content generation
	{
		name: 'AI text generation',
		category: 'content',
		tiers: { starter: '50/mo', pro: '500/mo', business: '5,000/mo' }
	},
	{
		name: 'AI image generation',
		category: 'content',
		tiers: { starter: '10/mo', pro: '100/mo', business: '1,000/mo' }
	},
	{
		name: 'AI audio generation',
		category: 'content',
		tiers: { starter: '5/mo', pro: '50/mo', business: '500/mo' }
	},
	{
		name: 'AI video generation',
		category: 'content',
		tiers: { starter: '2/mo', pro: '20/mo', business: '200/mo' }
	},
	{
		name: 'Chat with AI assistant',
		category: 'content',
		tiers: { starter: true, pro: true, business: true }
	},
	{
		name: 'Voice chat (realtime)',
		category: 'content',
		tiers: { starter: false, pro: true, business: true }
	},
	{
		name: 'Custom AI model selection',
		category: 'content',
		tooltip: 'Choose between models like GPT-5.2, GPT-5-mini, etc.',
		tiers: { starter: false, pro: true, business: true }
	},
	{
		name: 'Priority AI processing',
		category: 'content',
		tiers: { starter: false, pro: false, business: true }
	},
	// Publishing & automation
	{
		name: 'Social account connections',
		category: 'publishing',
		tiers: { starter: '3 per brand', pro: '3 per brand', business: '3 per brand' }
	},
	{
		name: 'Scheduled posts',
		category: 'publishing',
		tiers: { starter: '20/mo', pro: '500/mo', business: '5,000/mo' }
	},
	{
		name: 'Auto-publish to social',
		category: 'publishing',
		tiers: { starter: false, pro: true, business: true }
	},
	{
		name: 'Content calendar',
		category: 'publishing',
		tiers: { starter: false, pro: true, business: true }
	},
	{
		name: 'Analytics dashboard',
		category: 'publishing',
		tiers: { starter: false, pro: 'Basic', business: 'Advanced' }
	},
	// Support
	{
		name: 'Community support',
		category: 'support',
		tiers: { starter: true, pro: true, business: true }
	},
	{
		name: 'Email support',
		category: 'support',
		tiers: { starter: false, pro: true, business: true }
	},
	{
		name: 'Priority support',
		category: 'support',
		tiers: { starter: false, pro: false, business: true }
	},
	{
		name: 'Team members',
		category: 'support',
		tiers: { starter: '1', pro: '3', business: '10' }
	},
	{
		name: 'Storage',
		category: 'support',
		tiers: { starter: '1 GB', pro: '25 GB', business: '100 GB' }
	}
];

// ─── Machine-readable tier rules ─────────────────────────────────────
//
// Everything above this line is copy shown to visitors on /pricing. Everything
// below is the same promise in a form the server can enforce, because the two used
// to be unrelated: the matrix said Starter got 2 AI videos a month and no realtime
// voice, and the application checked neither.
//
// The matrix stays the source of truth for *what we advertise*; these tables are the
// source of truth for *what we allow*. `tests/unit/entitlements-drift.test.ts` fails
// the build when they disagree, so a price change cannot quietly leave the gate open.

/** The plan every account starts on, and the one an unrecognised value falls back to. */
export const FREE_TIER: TierId = 'starter';

/**
 * Allowances counted per calendar month, mapped to the matrix row that advertises
 * them. Anything here is enforced by a counter in `usage_counters`; anything not
 * here is either a boolean capability (below) or unlimited.
 *
 * `storageGB` and `teamMembers` are deliberately absent: they are ceilings on a
 * *current* total, not a monthly spend, so they are measured from live rows
 * (bytes stored, seats granted) instead of a counter that would never decrease.
 */
export const METERED_LIMITS = {
	aiTextGenerations: 'AI text generation',
	aiImageGenerations: 'AI image generation',
	aiAudioGenerations: 'AI audio generation',
	aiVideoGenerations: 'AI video generation',
	scheduledPosts: 'Scheduled posts'
} as const satisfies Partial<Record<keyof TierLimits, string>>;

export type MeteredMetric = keyof typeof METERED_LIMITS;

export const METERED_METRICS = Object.keys(METERED_LIMITS) as MeteredMetric[];

/**
 * Boolean capabilities the server gates on, mapped to the matrix row that advertises
 * them.
 */
export const FEATURE_MATRIX_ROW = {
	aiLogoGeneration: 'Logo management',
	brandExport: 'Brand export & guidelines PDF',
	voiceChat: 'Voice chat (realtime)',
	modelSelection: 'Custom AI model selection',
	priorityAI: 'Priority AI processing',
	autoPublish: 'Auto-publish to social',
	contentCalendar: 'Content calendar',
	analytics: 'Analytics dashboard',
	emailSupport: 'Email support',
	prioritySupport: 'Priority support'
} as const;

export type TierFeature = keyof typeof FEATURE_MATRIX_ROW;

/**
 * Who actually gets each capability.
 *
 * Spelled out per tier rather than derived from the matrix, because a matrix cell can
 * be a string and a string is not a decision. "Logo management: Upload only" means
 * Starter *may not* generate a logo with AI, while "Analytics dashboard: Basic" means
 * Pro *may* see analytics — identical shapes, opposite answers. Guessing between them
 * is exactly the sort of thing that fails open, so the grants are written down and the
 * drift test checks them against every cell the matrix states unambiguously.
 */
export const TIER_FEATURES: Record<TierFeature, Record<TierId, boolean>> = {
	// Starter is "Upload only": bring your own logo, no AI generation of one.
	aiLogoGeneration: { starter: false, pro: true, business: true },
	brandExport: { starter: false, pro: true, business: true },
	voiceChat: { starter: false, pro: true, business: true },
	modelSelection: { starter: false, pro: true, business: true },
	priorityAI: { starter: false, pro: false, business: true },
	autoPublish: { starter: false, pro: true, business: true },
	contentCalendar: { starter: false, pro: true, business: true },
	// "Basic" for Pro and "Advanced" for Business are both access; only Starter is out.
	analytics: { starter: false, pro: true, business: true },
	emailSupport: { starter: false, pro: true, business: true },
	prioritySupport: { starter: false, pro: false, business: true }
};

/**
 * Matrix cells that state a qualifier instead of yes/no, with the reading the grants
 * above encode. The drift test requires every string cell to be listed here, so a new
 * qualifier ("Logo management: 5/mo") cannot be added to the pricing page without
 * someone deciding what it means for the gate.
 */
export const FEATURE_STRING_READINGS: Array<{
	feature: TierFeature;
	tier: TierId;
	cell: string;
	granted: boolean;
}> = [
	{ feature: 'aiLogoGeneration', tier: 'starter', cell: 'Upload only', granted: false },
	{ feature: 'analytics', tier: 'pro', cell: 'Basic', granted: true },
	{ feature: 'analytics', tier: 'business', cell: 'Advanced', granted: true }
];

// ─── Utility functions ───────────────────────────────────────────────

/** The tier a stored plan value names, or the free tier if it names nothing valid. */
export function normalizeTier(value: string | null | undefined): TierId {
	return PRICING_TIERS.some((t) => t.id === value) ? (value as TierId) : FREE_TIER;
}

export function getTier(tier: TierId): PricingTier {
	return PRICING_TIERS.find((t) => t.id === tier) ?? PRICING_TIERS[0];
}

export function getTierLimits(tier: TierId): TierLimits {
	return getTier(tier).limits;
}

/** Whether a tier may use a gated capability. */
export function tierHasFeature(tier: TierId, feature: TierFeature): boolean {
	return TIER_FEATURES[feature][tier] === true;
}

/** The monthly allowance for a metered metric on a tier. */
export function tierAllowance(tier: TierId, metric: MeteredMetric): number {
	return getTierLimits(tier)[metric];
}

export function getFeatureAvailability(featureName: string, tier: TierId): boolean | string {
	const feature = PRICING_FEATURES.find((f) => f.name === featureName);
	if (!feature) return false;
	return feature.tiers[tier] ?? false;
}

export function formatPrice(price: number): string {
	if (price === 0) return 'Free';
	if (Number.isInteger(price)) return `$${price}`;
	return `$${price.toFixed(2)}`;
}

export function getAnnualPrice(tier: PricingTier): number {
	if (tier.annualPrice === 0) return 0;
	return Math.round((tier.annualPrice / 12) * 100) / 100;
}

export function getAnnualSavings(tier: PricingTier): number {
	if (tier.monthlyPrice === 0) return 0;
	const monthlyTotal = tier.monthlyPrice * 12;
	return Math.round(((monthlyTotal - tier.annualPrice) / monthlyTotal) * 100);
}
