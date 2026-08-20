/**
 * Brand Onboarding Types
 * Types for the AI-driven brand building onboarding process
 */

/** The steps in the onboarding wizard */
export type OnboardingStep =
	| 'welcome'
	| 'brand_assessment'
	| 'brand_identity'
	| 'target_audience'
	| 'brand_personality'
	| 'visual_identity'
	| 'market_positioning'
	| 'brand_story'
	| 'style_guide'
	| 'complete';

/** Brand archetype based on Jungian psychology */
export type BrandArchetype =
	| 'innocent'
	| 'sage'
	| 'explorer'
	| 'outlaw'
	| 'magician'
	| 'hero'
	| 'lover'
	| 'jester'
	| 'everyman'
	| 'caregiver'
	| 'ruler'
	| 'creator';

/** Market positioning tier */
export type MarketPosition = 'budget' | 'mid-range' | 'premium' | 'luxury';

/** Brand profile status */
export type BrandProfileStatus = 'in_progress' | 'completed' | 'archived';

/** Complete brand profile */
export interface BrandProfile {
	id: string;
	userId: string;
	status: BrandProfileStatus;

	// Brand identity
	brandName?: string;
	/** Whether the user has explicitly chosen or confirmed the brand name.
	 *  When false, the name is a system-generated codename. */
	brandNameConfirmed: boolean;
	tagline?: string;
	missionStatement?: string;
	visionStatement?: string;
	elevatorPitch?: string;

	// Personality & psychology
	brandArchetype?: BrandArchetype;
	brandPersonalityTraits?: string;
	toneOfVoice?: string;
	communicationStyle?: string;

	// Target audience
	targetAudience?: string;
	customerPainPoints?: string;
	valueProposition?: string;

	// Visual identity
	primaryColor?: string;
	secondaryColor?: string;
	accentColor?: string;
	brandColor4?: string;
	brandColor5?: string;
	backgroundColor?: string;
	surfaceColor?: string;
	textColor?: string;
	textSecondaryColor?: string;
	borderColor?: string;
	successColor?: string;
	warningColor?: string;
	errorColor?: string;
	colorPalette?: string[];
	typographyLogo?: string;
	typographyHeading?: string;
	typographyBody?: string;
	sortOrder?: number;
	logoConcept?: string;
	logoUrl?: string;
	logoHorizontalUrl?: string;
	logoVerticalUrl?: string;

	// Market positioning
	industry?: string;
	competitors?: string;
	uniqueSellingPoints?: string;
	marketPosition?: MarketPosition;

	// Brand story
	originStory?: string;
	brandValues?: string;
	brandPromise?: string;

	// Style guide
	styleGuide?: BrandStyleGuide;

	// Metadata
	onboardingStep: OnboardingStep;
	conversationId?: string;
	createdAt: string;
	updatedAt: string;
}

/** Target audience definition */
export interface TargetAudience {
	demographics?: {
		ageRange?: string;
		gender?: string;
		location?: string;
		income?: string;
		education?: string;
		occupation?: string;
	};
	psychographics?: {
		values?: string[];
		interests?: string[];
		lifestyle?: string;
		personality?: string;
		attitudes?: string[];
	};
}

/** Complete brand style guide output */
export interface BrandStyleGuide {
	brandName: string;
	tagline?: string;
	mission?: string;
	vision?: string;
	colors: {
		primary: string;
		secondary: string;
		accent: string;
		palette: string[];
	};
	typography: {
		heading: string;
		body: string;
	};
	tone: string;
	archetype: string;
	doList: string[];
	dontList: string[];
	voiceExamples: {
		scenario: string;
		example: string;
	}[];
}

/** Onboarding message */
export interface OnboardingMessage {
	id: string;
	brandProfileId: string;
	userId: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	step?: OnboardingStep;
	metadata?: Record<string, unknown>;
	attachments?: OnboardingAttachment[];
	createdAt: string;
}

/** Attachment on an onboarding message */
export interface OnboardingAttachment {
	id: string;
	type: 'image' | 'video' | 'audio';
	name: string;
	url: string;
	r2Key: string;
	mimeType: string;
	size: number;
	archiveId?: string;
}

/** Step configuration for the onboarding wizard */
export interface OnboardingStepConfig {
	id: OnboardingStep;
	title: string;
	description: string;
	systemPrompt: string;
	extractionFields: string[];
}

/** Data extracted from an AI response */
export interface ExtractedBrandData {
	[key: string]: string | string[] | Record<string, unknown> | undefined;
}
