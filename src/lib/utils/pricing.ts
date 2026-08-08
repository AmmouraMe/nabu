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

// ─── Utility functions ───────────────────────────────────────────────

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
