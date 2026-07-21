/**
 * Brand Onboarding Service
 * AI-driven brand building wizard that acts as an expert marketing consultant,
 * using psychology and philosophy to help users build or refine their brand.
 */

import type {
	BrandProfile,
	OnboardingMessage,
	OnboardingStep,
	OnboardingStepConfig,
	BrandStyleGuide
} from '$lib/types/onboarding';
import type { ChatMessage, ChatMessageContentPart } from '$lib/services/openai-chat';
import type { D1Database } from '@cloudflare/workers-types';
import type { BrandText, BrandAssetSummary } from '$lib/types/brand-assets';

/**
 * Supplementary brand content that gives the AI richer context.
 * Fetched from brand_texts and brand_media tables.
 */
export interface BrandContentContext {
	/** Text assets (names, messaging, descriptions, legal, social, voice) */
	texts: BrandText[];
	/** Summary counts of media assets */
	assetSummary: BrandAssetSummary;
}

/**
 * Marker the AI includes at the end of its response when the current step is complete.
 * This is stripped before display/storage and triggers automatic step advancement.
 */
export const STEP_COMPLETE_MARKER = '<<STEP_COMPLETE>>';

/**
 * Instruction appended to every step's system prompt to enable automatic step progression.
 */
const STEP_PROGRESSION_INSTRUCTION = `

AUTOMATIC STEP PROGRESSION:
When you are confident that you have gathered enough information for this step and are ready to move to the next phase, include the exact marker ${STEP_COMPLETE_MARKER} at the very END of your message (after your final sentence, on its own line). Only include this marker when:
1. You have asked the key questions for this step AND received adequate answers
2. You have summarized or confirmed what was discussed
3. You are transitioning naturally to the next topic

Do NOT include the marker on your first message in a step — always have at least one exchange with the user first. If the user seems to want to discuss more, continue the conversation without the marker.`;
export const ONBOARDING_STEPS: OnboardingStepConfig[] = [
	{
		id: 'welcome',
		title: 'Welcome',
		description: 'Introduction and brand assessment',
		extractionFields: [],
		systemPrompt: `You are NebulaKit's Brand Architect — a world-class brand strategist, marketing expert, and creative director rolled into one. You combine deep knowledge of consumer psychology, Jungian archetypes, behavioral economics, and design thinking to help people build extraordinary brands.

Your personality is warm, encouraging, and insightful. You ask thoughtful questions and make the process feel exciting, not overwhelming.

RIGHT NOW you are beginning the brand onboarding process. Your goal is to understand where this person is starting from.

Ask them ONE clear question: Do they already have a brand/business, or are they starting completely from scratch?

Based on their answer:
- If they HAVE an existing brand: Express excitement and explain you'll help them refine, strengthen, and elevate it. Ask them to tell you about their brand — name, what they do, and what they feel is working or not working.
- If they're STARTING FROM SCRATCH: Express enthusiasm about the blank canvas opportunity. Explain that you'll use principles from psychology, philosophy, and market research to help them discover and build a brand that truly resonates. Ask what kind of product, service, or idea they're thinking about — even if it's just a vague notion.
- If they have NOTHING AT ALL yet: That's perfectly fine! Tell them you'll start from their passions, skills, and values to find the perfect market fit. Ask them what they're passionate about, what skills they have, and what problems they notice in the world.

Keep your response concise (3-5 sentences max before the question). Be conversational, not corporate.`
	},
	{
		id: 'brand_assessment',
		title: 'Brand Assessment',
		description: 'Understanding what exists and what needs to be built',
		extractionFields: ['brandName', 'industry', 'elevatorPitch'],
		systemPrompt: `You are NebulaKit's Brand Architect continuing the brand assessment phase.

Your goal: Deeply understand what this person has (or doesn't have) and help them articulate their core business concept.

Key things to uncover through conversation:
1. What product/service/idea are they building around?
2. What industry/niche does this fall into?
3. Who do they imagine using/buying this? (rough idea is fine)
4. What problem does it solve or what desire does it fulfill?
5. If they have a name already, what is it? If not, that's fine — we'll create one later.

Use the Socratic method — ask probing questions that help them think deeper. If they're vague, help them get specific with examples and suggestions.

If they mention a brand name, acknowledge it. If they don't have one, reassure them — naming comes later in the process.

When you feel you have enough to work with (usually after 2-4 exchanges), summarize what you've understood and confirm before moving on. End with: "Ready to dive into building your brand identity?"

IMPORTANT: ALWAYS acknowledge what the user shared before asking the next question. Make them feel heard.`
	},
	{
		id: 'brand_identity',
		title: 'Brand Identity',
		description: 'Defining name, mission, vision, and core positioning',
		extractionFields: [
			'brandName',
			'tagline',
			'missionStatement',
			'visionStatement',
			'elevatorPitch'
		],
		systemPrompt: `You are NebulaKit's Brand Architect working on brand identity.

{BRAND_CONTEXT}

Now help them define:

1. **Brand Name** (if they don't have one): Use linguistic psychology — consider phonaesthetics (how sounds evoke feelings), memorability, cultural resonance, and market fit. Suggest 3-5 names with explanations of WHY each works psychologically. Ask which resonates.

2. **Mission Statement**: Guide them to articulate WHY their brand exists beyond making money. Use Simon Sinek's "Start with Why" framework. Keep it to 1-2 sentences.

3. **Vision Statement**: Help them envision the future their brand is creating. What does the world look like when they succeed? 1-2 sentences.

4. **Tagline**: Create 3-5 tagline options. Explain the psychology behind each — rhythm, memorability, emotional trigger. Let them choose or remix.

5. **Elevator Pitch**: Craft a 30-second pitch that captures the essence.

Work through these ONE AT A TIME. Don't overwhelm. After each is defined, briefly confirm before moving to the next.

When discussing names, consider:
- Sound symbolism (harsh vs soft consonants, vowel sounds)
- The Von Restorff effect (what makes things memorable)  
- Cultural/linguistic implications
- Domain/trademark availability awareness
- How it looks written and sounds spoken`
	},
	{
		id: 'target_audience',
		title: 'Target Audience',
		description: 'Identifying ideal customers using psychology and demographics',
		extractionFields: ['targetAudience', 'customerPainPoints', 'valueProposition'],
		systemPrompt: `You are NebulaKit's Brand Architect working on target audience definition.

{BRAND_CONTEXT}

Help them build a detailed customer avatar using psychological and demographic frameworks:

1. **Demographics**: Age range, gender, location, income level, education, occupation. Use market research thinking — who naturally gravitates toward this type of offering?

2. **Psychographics** (the deep stuff):
   - Values: What do they believe in? What matters to them?
   - Lifestyle: How do they spend their time and money?
   - Pain points: What frustrates them? What keeps them up at night?
   - Aspirations: What do they want to become or achieve?
   - Media consumption: Where do they spend attention?

3. **Behavioral Psychology**:
   - What triggers their buying decisions?
   - What objections would they have?
   - What social proof do they need?
   - Apply Maslow's hierarchy — which need level does your brand serve?

4. **Value Proposition**: Using the Jobs-to-be-Done framework, articulate: "When [situation], I want to [motivation], so I can [outcome]."

Guide them through this conversationally. Use examples from successful brands to illustrate points. Make it tangible, not theoretical.

IMPORTANT: If they struggle, draw from the brand info we already have to suggest audience profiles they can react to. It's easier to refine than to create from nothing.`
	},
	{
		id: 'brand_personality',
		title: 'Brand Personality',
		description: 'Defining brand archetype and psychological profile',
		extractionFields: [
			'brandArchetype',
			'brandPersonalityTraits',
			'toneOfVoice',
			'communicationStyle'
		],
		systemPrompt: `You are NebulaKit's Brand Architect working on brand personality and psychology.

{BRAND_CONTEXT}

Now for the most psychologically rich part — defining WHO your brand IS as a personality.

Use **Carl Jung's 12 Brand Archetypes** framework:

1. **The Innocent** (Coca-Cola) — Optimism, simplicity, trust
2. **The Sage** (Google) — Wisdom, knowledge, expertise  
3. **The Explorer** (Jeep) — Freedom, adventure, discovery
4. **The Outlaw** (Harley-Davidson) — Revolution, liberation, breaking rules
5. **The Magician** (Apple) — Transformation, innovation, imagination
6. **The Hero** (Nike) — Achievement, courage, mastery
7. **The Lover** (Chanel) — Passion, intimacy, elegance
8. **The Jester** (Old Spice) — Joy, humor, entertainment
9. **The Everyman** (IKEA) — Belonging, authenticity, reliability
10. **The Caregiver** (Johnson & Johnson) — Nurturing, protection, service
11. **The Ruler** (Mercedes-Benz) — Control, prestige, leadership
12. **The Creator** (LEGO) — Innovation, self-expression, artistry

Based on everything we know about the brand, suggest the top 2-3 archetypes that fit, explaining WHY. Ask them which resonates most.

Then define:
- **Personality Traits** (5 adjectives that describe the brand as if it were a person)
- **Tone of Voice** (how the brand speaks — e.g., authoritative but approachable)
- **Communication Style** (formal, casual, conversational, academic, playful)

Use the Big Five personality model (OCEAN) as a reference for traits:
- Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism

Make this FUN. Ask: "If your brand walked into a party, how would people describe them?"`
	},
	{
		id: 'visual_identity',
		title: 'Visual Identity',
		description: 'Colors, typography, and visual direction',
		extractionFields: [
			'primaryColor',
			'secondaryColor',
			'accentColor',
			'backgroundColor',
			'surfaceColor',
			'textColor',
			'textSecondaryColor',
			'borderColor',
			'successColor',
			'warningColor',
			'errorColor',
			'colorPalette',
			'typographyLogo',
			'typographyHeading',
			'typographyBody',
			'logoConcept'
		],
		systemPrompt: `You are NebulaKit's Brand Architect working on visual identity.

{BRAND_CONTEXT}

Now translate the brand personality into visual language using **Color Psychology** and **Design Theory**.

1. **Color Palette** — Use color psychology research:
   - Red: Energy, passion, urgency (Coca-Cola, YouTube)
   - Blue: Trust, stability, professionalism (Facebook, IBM)
   - Green: Growth, health, nature (Whole Foods, Spotify)
   - Yellow: Optimism, warmth, attention (McDonald's, IKEA)
   - Purple: Luxury, creativity, wisdom (Cadbury, Twitch)
   - Orange: Friendly, confident, adventurous (Fanta, Firefox)
   - Black: Sophistication, power, elegance (Chanel, Nike)
   - White: Purity, simplicity, cleanliness (Apple, Tesla)

   Based on the brand archetype and personality, suggest a primary color, secondary color, and accent color with hex codes. Explain the psychological reasoning behind each choice.

2. **Typography**:
   - Heading font: Should match brand personality (serif = traditional/trust, sans-serif = modern/clean, display = creative/bold)
   - Body font: Must be highly readable while supporting the brand feel
   - Suggest specific Google Fonts pairings with reasoning

3. **Logo Concept**:
   - Describe a logo concept (we'll generate it later)
   - Consider: Symbol vs wordmark vs combination mark
   - Apply Gestalt principles (proximity, similarity, closure, continuity)
   - Consider scalability, versatility, and memorability

Present color suggestions as specific hex codes. For the palette, suggest 5-7 colors (primary, secondary, accent, plus neutrals/tints).

Make this visual and exciting. Help them SEE the brand coming to life.`
	},
	{
		id: 'market_positioning',
		title: 'Market Position',
		description: 'Competitive analysis and market positioning',
		extractionFields: ['competitors', 'uniqueSellingPoints', 'marketPosition', 'industry'],
		systemPrompt: `You are NebulaKit's Brand Architect working on market positioning strategy.

{BRAND_CONTEXT}

Help them carve out their unique market position using proven strategic frameworks:

1. **Competitive Landscape**: 
   - Ask who their main competitors are (or suggest likely ones based on the industry)
   - For each competitor, briefly analyze strengths and weaknesses
   - Identify GAPS in the market — unserved or underserved needs

2. **Porter's Generic Strategies** — Where should they compete?
   - Cost Leadership (lowest price)
   - Differentiation (unique value)
   - Focus/Niche (specific segment)

3. **Blue Ocean Strategy**:
   - What can they ELIMINATE that the industry takes for granted?
   - What can they REDUCE below industry standard?
   - What can they RAISE above industry standard?  
   - What can they CREATE that the industry has never offered?

4. **Positioning Statement**: 
   "For [target audience] who [need], [brand name] is the [category] that [key benefit] because [reason to believe]."

5. **Market Position**: Budget, mid-range, premium, or luxury — and WHY.

6. **Unique Selling Points (USPs)**: 3-5 things that make them genuinely different.

Be strategic and realistic. Don't just validate — challenge their assumptions when needed. A good strategist pushes for clarity.`
	},
	{
		id: 'brand_story',
		title: 'Brand Story',
		description: 'Crafting the narrative, values, and brand promise',
		extractionFields: ['originStory', 'brandValues', 'brandPromise'],
		systemPrompt: `You are NebulaKit's Brand Architect working on brand story and narrative.

{BRAND_CONTEXT}

Every great brand has a compelling story. Help them craft theirs using narrative psychology and storytelling frameworks.

1. **Origin Story**: 
   - Use the Hero's Journey (Joseph Campbell) structure:
     - The Call: What problem/opportunity sparked this?
     - The Challenge: What obstacles exist?
     - The Transformation: How does the brand change things?
   - Even if starting from scratch, there's a story in WHY they want to build this
   - Authentic vulnerability creates connection — what personal experience drives this?

2. **Brand Values** (3-5 core values):
   - These aren't generic words — they should be specific and meaningful
   - BAD: "Quality, Innovation, Trust" (everyone says this)
   - GOOD: "Radical Transparency, Relentless Simplicity, Human-First Design"
   - Each value should guide real decisions
   - Ask: "If two options are equal in every way except one aligns with this value, would you choose it?"

3. **Brand Promise**:
   - One sentence that captures what customers can ALWAYS expect
   - Example: "Every interaction with [brand] will make you feel [emotion]"
   - This should be specific, measurable, and deliverable

4. **Narrative Voice**:
   - Using the archetype and personality, craft a sample paragraph showing how the brand tells its story
   - This becomes the template for all brand communications

Help them see that brand story isn't fiction — it's the authentic WHY woven into a compelling narrative.`
	},
	{
		id: 'style_guide',
		title: 'Style Guide',
		description: 'Generating the complete brand style guide',
		extractionFields: ['styleGuide'],
		systemPrompt: `You are NebulaKit's Brand Architect compiling the complete brand style guide.

{BRAND_CONTEXT}

Now compile everything into a comprehensive, actionable Brand Style Guide. Present it in a clear, organized format:

## 📋 BRAND STYLE GUIDE: [Brand Name]

### Brand Identity
- **Name**: [brand name]
- **Tagline**: [tagline]
- **Mission**: [mission statement]
- **Vision**: [vision statement]
- **Elevator Pitch**: [30-second pitch]

### Brand Personality
- **Archetype**: [archetype] — [brief explanation]
- **Personality Traits**: [5 traits]
- **Tone of Voice**: [description]
- **Communication Style**: [description]

### Visual Identity
- **Primary Color**: [hex] — [name and reasoning]
- **Secondary Color**: [hex] — [name and reasoning]
- **Accent Color**: [hex] — [name and reasoning]
- **Full Palette**: [all colors with hex codes]
- **Heading Font**: [font name] — [reasoning]
- **Body Font**: [font name] — [reasoning]
- **Logo Concept**: [description]

### Target Audience
- **Primary Audience**: [detailed description]
- **Pain Points**: [list]
- **Value Proposition**: [statement]

### Market Position
- **Industry**: [industry]
- **Position**: [budget/mid-range/premium/luxury]
- **USPs**: [list]
- **Key Competitors**: [list with differentiation]

### Brand Story
- **Origin**: [condensed story]
- **Values**: [list with descriptions]
- **Promise**: [brand promise]

### Voice & Tone Guidelines
- **DO**: [list of dos]
- **DON'T**: [list of don'ts]
- **Sample Messages**: [3-5 examples]

After presenting the guide, ask if they'd like to adjust anything. Once confirmed, congratulate them on completing their brand foundation!`
	},
	{
		id: 'complete',
		title: 'Complete',
		description: 'Onboarding complete — brand is ready',
		extractionFields: [],
		systemPrompt: `You are NebulaKit's Brand Architect. The brand building process is complete!

{BRAND_CONTEXT}

Congratulate them warmly on completing their brand foundation. Summarize the key elements:
- Brand name and tagline
- Core archetype and personality
- Key colors and visual direction
- Target audience summary
- Unique market position

Then explain what they can do next:
1. Use the brand style guide to maintain consistency across all touchpoints
2. Start creating content aligned with their brand voice
3. Come back anytime to refine or evolve their brand

End with an inspiring message about the journey from idea to brand. Make them feel proud and excited.

Keep it concise and celebratory.`
	}
];

/**
 * Get step configuration by step ID
 */
export function getStepConfig(stepId: OnboardingStep): OnboardingStepConfig | undefined {
	return ONBOARDING_STEPS.find((s) => s.id === stepId);
}

/**
 * Build a comprehensive brand context string from all known brand data.
 * Used to give the AI full awareness of what's already filled in.
 */
export function buildBrandContextString(brandData: Partial<BrandProfile>): string {
	const contextParts: string[] = [];

	// Identity
	if (brandData.brandName) contextParts.push(`Brand Name: ${brandData.brandName}`);
	if (brandData.industry) contextParts.push(`Industry: ${brandData.industry}`);
	if (brandData.tagline) contextParts.push(`Tagline: ${brandData.tagline}`);
	if (brandData.missionStatement) contextParts.push(`Mission: ${brandData.missionStatement}`);
	if (brandData.visionStatement) contextParts.push(`Vision: ${brandData.visionStatement}`);
	if (brandData.elevatorPitch) contextParts.push(`Elevator Pitch: ${brandData.elevatorPitch}`);

	// Personality
	if (brandData.brandArchetype) contextParts.push(`Brand Archetype: ${brandData.brandArchetype}`);
	if (brandData.toneOfVoice) contextParts.push(`Tone of Voice: ${brandData.toneOfVoice}`);
	if (brandData.communicationStyle)
		contextParts.push(`Communication Style: ${brandData.communicationStyle}`);
	if (brandData.brandPersonalityTraits)
		contextParts.push(`Personality Traits: ${brandData.brandPersonalityTraits}`);

	// Audience
	if (brandData.targetAudience) contextParts.push(`Target Audience: ${brandData.targetAudience}`);
	if (brandData.customerPainPoints)
		contextParts.push(`Customer Pain Points: ${brandData.customerPainPoints}`);
	if (brandData.valueProposition)
		contextParts.push(`Value Proposition: ${brandData.valueProposition}`);

	// Visual
	if (brandData.primaryColor) contextParts.push(`Primary Color: ${brandData.primaryColor}`);
	if (brandData.secondaryColor) contextParts.push(`Secondary Color: ${brandData.secondaryColor}`);
	if (brandData.accentColor) contextParts.push(`Accent Color: ${brandData.accentColor}`);
	if (brandData.colorPalette?.length)
		contextParts.push(`Color Palette: ${brandData.colorPalette.join(', ')}`);
	if (brandData.typographyLogo) contextParts.push(`Logo Font: ${brandData.typographyLogo}`);
	if (brandData.typographyHeading)
		contextParts.push(`Heading Font: ${brandData.typographyHeading}`);
	if (brandData.typographyBody) contextParts.push(`Body Font: ${brandData.typographyBody}`);
	if (brandData.logoConcept) contextParts.push(`Logo Concept: ${brandData.logoConcept}`);

	// Market
	if (brandData.marketPosition) contextParts.push(`Market Position: ${brandData.marketPosition}`);
	if (brandData.competitors) contextParts.push(`Competitors: ${brandData.competitors}`);
	if (brandData.uniqueSellingPoints) contextParts.push(`USPs: ${brandData.uniqueSellingPoints}`);

	// Story
	if (brandData.brandValues) contextParts.push(`Brand Values: ${brandData.brandValues}`);
	if (brandData.brandPromise) contextParts.push(`Brand Promise: ${brandData.brandPromise}`);
	if (brandData.originStory) contextParts.push(`Origin Story: ${brandData.originStory}`);

	return contextParts.length > 0 ? contextParts.join('\n') : '';
}

/**
 * Build a human-readable summary of brand text assets grouped by category.
 * Gives the AI awareness of what copy/content has been created.
 */
export function buildBrandContentContextString(content: BrandContentContext): string {
	const parts: string[] = [];

	// Group texts by category
	if (content.texts.length > 0) {
		const byCategory = new Map<string, BrandText[]>();
		for (const text of content.texts) {
			const existing = byCategory.get(text.category) || [];
			existing.push(text);
			byCategory.set(text.category, existing);
		}

		parts.push('EXISTING BRAND COPY & TEXT ASSETS:');
		for (const [category, texts] of byCategory) {
			const label = category.charAt(0).toUpperCase() + category.slice(1);
			parts.push(`  ${label}:`);
			for (const t of texts) {
				// Truncate very long values to keep context manageable
				const value = t.value.length > 300 ? t.value.slice(0, 300) + '…' : t.value;
				parts.push(`    - ${t.label}: ${value}`);
			}
		}
	}

	// Asset summary
	const s = content.assetSummary;
	if (s.totalCount > 0 || s.videoGenerationsCount > 0) {
		parts.push('BRAND ASSET INVENTORY:');
		if (s.imageCount > 0)
			parts.push(`  - ${s.imageCount} image(s) (logos, social, marketing, etc.)`);
		if (s.audioCount > 0)
			parts.push(`  - ${s.audioCount} audio asset(s) (sonic identity, music, voiceover)`);
		if (s.videoCount > 0) parts.push(`  - ${s.videoCount} video asset(s)`);
		if (s.videoGenerationsCount > 0)
			parts.push(`  - ${s.videoGenerationsCount} AI-generated video(s)`);
	}

	return parts.join('\n');
}

/**
 * Get the system prompt for a specific step, optionally incorporating brand data
 */
export function getSystemPromptForStep(
	stepId: OnboardingStep,
	brandData?: Partial<BrandProfile>,
	contentContext?: BrandContentContext
): string {
	const step = getStepConfig(stepId);
	if (!step) return '';

	let prompt = step.systemPrompt;

	// Replace brand context placeholder
	if (brandData && prompt.includes('{BRAND_CONTEXT}')) {
		const contextStr = buildBrandContextString(brandData);

		const contextBlock = contextStr
			? `Here's what we know about the brand so far:\n${contextStr}\n\nBuild on this foundation. The user may have already set some of these fields on their Brand page — acknowledge what's filled in and offer to refine or improve any existing values.`
			: 'We are starting fresh — no brand details have been defined yet.';

		prompt = prompt.replace('{BRAND_CONTEXT}', contextBlock);
	}

	// Add brand awareness instruction to all prompts when we have data
	if (brandData) {
		const contextStr = buildBrandContextString(brandData);
		if (contextStr) {
			prompt += `

BRAND FIELD AWARENESS:
The user's brand profile currently has these fields filled in:
${contextStr}

You can reference, build upon, or suggest improvements to any of these existing values. If the user asks you to change or refine any field, do so and explicitly mention what you're updating. The system will track all changes with version history, so the user can always revert.`;
		}
	}

	// Add generated content awareness when we have content context
	if (contentContext) {
		const contentStr = buildBrandContentContextString(contentContext);
		if (contentStr) {
			prompt += `

GENERATED CONTENT AWARENESS:
The following content and assets have already been created for this brand:
${contentStr}

Use this knowledge to maintain consistency across all brand touchpoints. Reference existing copy, acknowledge created assets, and ensure any new suggestions align with what's already established.`;
		}
	}

	// Append auto-progression instruction for all steps except 'complete'
	if (stepId !== 'complete') {
		prompt += STEP_PROGRESSION_INSTRUCTION;
	}

	return prompt;
}

/**
 * Convert a JSON-encoded DB value to a human-readable string.
 * Handles backward compatibility where fields were previously stored as JSON arrays/objects
 * but are now treated as plain text.
 */
function jsonToReadableString(raw: string): string {
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return parsed
				.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
				.join(', ');
		}
		if (typeof parsed === 'string') return parsed;
		// Object — return raw JSON for user to re-edit in text system
		return raw;
	} catch {
		return raw;
	}
}

/**
 * Map a database row to a BrandProfile object
 */
export function mapRowToProfile(row: Record<string, unknown>): BrandProfile {
	return {
		id: row.id as string,
		userId: row.user_id as string,
		status: row.status as BrandProfile['status'],
		brandName: (row.brand_name as string) || undefined,
		brandNameConfirmed: !!row.brand_name_confirmed,
		tagline: (row.tagline as string) || undefined,
		missionStatement: (row.mission_statement as string) || undefined,
		visionStatement: (row.vision_statement as string) || undefined,
		elevatorPitch: (row.elevator_pitch as string) || undefined,
		brandArchetype: (row.brand_archetype as BrandProfile['brandArchetype']) || undefined,
		brandPersonalityTraits: row.brand_personality_traits
			? jsonToReadableString(row.brand_personality_traits as string)
			: undefined,
		toneOfVoice: (row.tone_of_voice as string) || undefined,
		communicationStyle: (row.communication_style as string) || undefined,
		targetAudience: row.target_audience
			? jsonToReadableString(row.target_audience as string)
			: undefined,
		customerPainPoints: row.customer_pain_points
			? jsonToReadableString(row.customer_pain_points as string)
			: undefined,
		valueProposition: (row.value_proposition as string) || undefined,
		primaryColor: (row.primary_color as string) || undefined,
		secondaryColor: (row.secondary_color as string) || undefined,
		accentColor: (row.accent_color as string) || undefined,
		brandColor4: (row.brand_color_4 as string) || undefined,
		brandColor5: (row.brand_color_5 as string) || undefined,
		backgroundColor: (row.background_color as string) || undefined,
		surfaceColor: (row.surface_color as string) || undefined,
		textColor: (row.text_color as string) || undefined,
		textSecondaryColor: (row.text_secondary_color as string) || undefined,
		borderColor: (row.border_color as string) || undefined,
		successColor: (row.success_color as string) || undefined,
		warningColor: (row.warning_color as string) || undefined,
		errorColor: (row.error_color as string) || undefined,
		colorPalette: row.color_palette ? JSON.parse(row.color_palette as string) : undefined,
		typographyLogo: (row.typography_logo as string) || undefined,
		typographyHeading: (row.typography_heading as string) || undefined,
		typographyBody: (row.typography_body as string) || undefined,
		logoConcept: (row.logo_concept as string) || undefined,
		logoUrl: (row.logo_url as string) || undefined,
		logoHorizontalUrl: (row.logo_horizontal_url as string) || undefined,
		logoVerticalUrl: (row.logo_vertical_url as string) || undefined,
		industry: (row.industry as string) || undefined,
		competitors: row.competitors ? jsonToReadableString(row.competitors as string) : undefined,
		uniqueSellingPoints: row.unique_selling_points
			? jsonToReadableString(row.unique_selling_points as string)
			: undefined,
		marketPosition: (row.market_position as BrandProfile['marketPosition']) || undefined,
		originStory: (row.origin_story as string) || undefined,
		brandValues: row.brand_values ? jsonToReadableString(row.brand_values as string) : undefined,
		brandPromise: (row.brand_promise as string) || undefined,
		styleGuide: row.style_guide ? JSON.parse(row.style_guide as string) : undefined,
		sortOrder: (row.sort_order as number) ?? 0,
		onboardingStep: row.onboarding_step as OnboardingStep,
		conversationId: (row.conversation_id as string) || undefined,
		createdAt: row.created_at as string,
		updatedAt: row.updated_at as string
	};
}

/**
 * Map a database row to an OnboardingMessage
 */
function mapRowToMessage(row: Record<string, unknown>): OnboardingMessage {
	let attachments;
	if (row.attachments) {
		try {
			attachments = JSON.parse(row.attachments as string);
		} catch {
			attachments = undefined;
		}
	}
	return {
		id: row.id as string,
		brandProfileId: row.brand_profile_id as string,
		userId: row.user_id as string,
		role: row.role as OnboardingMessage['role'],
		content: row.content as string,
		step: (row.step as OnboardingStep) || undefined,
		metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
		attachments,
		createdAt: row.created_at as string
	};
}

/** Adjectives for placeholder brand names */
const PLACEHOLDER_ADJECTIVES = [
	'Amber',
	'Azure',
	'Bold',
	'Bright',
	'Cedar',
	'Cobalt',
	'Coral',
	'Crimson',
	'Crystal',
	'Dusk',
	'Ember',
	'Fern',
	'Frost',
	'Golden',
	'Harbor',
	'Indigo',
	'Iron',
	'Ivory',
	'Jade',
	'Lunar',
	'Maple',
	'Midnight',
	'Noble',
	'Opal',
	'Pearl',
	'Pine',
	'Prism',
	'Quartz',
	'Radiant',
	'Raven',
	'Rustic',
	'Sable',
	'Sage',
	'Scarlet',
	'Shadow',
	'Silver',
	'Solar',
	'Sterling',
	'Stone',
	'Summit',
	'Swift',
	'Velvet',
	'Verdant',
	'Vivid',
	'Wild',
	'Zenith'
];

/** Nouns for placeholder brand names */
const PLACEHOLDER_NOUNS = [
	'Anchor',
	'Arrow',
	'Atlas',
	'Aurora',
	'Beacon',
	'Bloom',
	'Bridge',
	'Canyon',
	'Crest',
	'Crown',
	'Dawn',
	'Echo',
	'Edge',
	'Ember',
	'Falcon',
	'Fable',
	'Forge',
	'Fox',
	'Grove',
	'Harbor',
	'Haven',
	'Horizon',
	'Iris',
	'Lark',
	'Lotus',
	'Lynx',
	'Mesa',
	'Moss',
	'Nexus',
	'Nova',
	'Orbit',
	'Osprey',
	'Peak',
	'Phoenix',
	'Plume',
	'Pulse',
	'Reef',
	'Ridge',
	'River',
	'Root',
	'Sequoia',
	'Spark',
	'Spire',
	'Tide',
	'Vale',
	'Vortex',
	'Wave',
	'Wren'
];

/**
 * Generate a creative placeholder brand name (e.g. "Cobalt Phoenix").
 * Used to identify new brand profiles until the user chooses a real name.
 */
export function generatePlaceholderBrandName(): string {
	const adjIdx = Math.floor(Math.random() * PLACEHOLDER_ADJECTIVES.length);
	const nounIdx = Math.floor(Math.random() * PLACEHOLDER_NOUNS.length);
	return `${PLACEHOLDER_ADJECTIVES[adjIdx]} ${PLACEHOLDER_NOUNS[nounIdx]}`;
}

/**
 * Create a new brand profile for a user
 */
export async function createBrandProfile(db: D1Database, userId: string): Promise<BrandProfile> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const placeholderName = generatePlaceholderBrandName();

	await db
		.prepare(
			`INSERT INTO brand_profiles (id, user_id, brand_name, brand_name_confirmed, status, onboarding_step, created_at, updated_at)
			 VALUES (?, ?, ?, 0, 'in_progress', 'welcome', ?, ?)`
		)
		.bind(id, userId, placeholderName, now, now)
		.run();

	return {
		id,
		userId,
		brandName: placeholderName,
		brandNameConfirmed: false,
		status: 'in_progress',
		onboardingStep: 'welcome',
		createdAt: now,
		updatedAt: now
	};
}

/**
 * Get a brand profile by ID
 */
export async function getBrandProfile(
	db: D1Database,
	profileId: string
): Promise<BrandProfile | null> {
	const row = await db.prepare('SELECT * FROM brand_profiles WHERE id = ?').bind(profileId).first();

	if (!row) return null;
	return mapRowToProfile(row as Record<string, unknown>);
}

/**
 * Get the active (in_progress or completed) brand profile for a user
 */
export async function getBrandProfileByUser(
	db: D1Database,
	userId: string
): Promise<BrandProfile | null> {
	const row = await db
		.prepare(
			`SELECT * FROM brand_profiles 
			 WHERE user_id = ? AND status IN ('in_progress', 'completed')
			 ORDER BY updated_at DESC LIMIT 1`
		)
		.bind(userId)
		.first();

	if (!row) return null;
	return mapRowToProfile(row as Record<string, unknown>);
}

/**
 * Update a brand profile with new data
 */
export async function updateBrandProfile(
	db: D1Database,
	profileId: string,
	updates: Partial<BrandProfile>
): Promise<void> {
	const setClauses: string[] = [];
	const values: unknown[] = [];

	const fieldMap: Record<string, string> = {
		brandName: 'brand_name',
		brandNameConfirmed: 'brand_name_confirmed',
		tagline: 'tagline',
		missionStatement: 'mission_statement',
		visionStatement: 'vision_statement',
		elevatorPitch: 'elevator_pitch',
		brandArchetype: 'brand_archetype',
		toneOfVoice: 'tone_of_voice',
		communicationStyle: 'communication_style',
		valueProposition: 'value_proposition',
		primaryColor: 'primary_color',
		secondaryColor: 'secondary_color',
		accentColor: 'accent_color',
		typographyLogo: 'typography_logo',
		typographyHeading: 'typography_heading',
		typographyBody: 'typography_body',
		logoConcept: 'logo_concept',
		logoUrl: 'logo_url',
		logoHorizontalUrl: 'logo_horizontal_url',
		logoVerticalUrl: 'logo_vertical_url',
		industry: 'industry',
		marketPosition: 'market_position',
		originStory: 'origin_story',
		brandPromise: 'brand_promise',
		brandPersonalityTraits: 'brand_personality_traits',
		brandValues: 'brand_values',
		competitors: 'competitors',
		uniqueSellingPoints: 'unique_selling_points',
		customerPainPoints: 'customer_pain_points',
		targetAudience: 'target_audience',
		onboardingStep: 'onboarding_step',
		conversationId: 'conversation_id',
		status: 'status'
	};

	const jsonFields: Record<string, string> = {
		colorPalette: 'color_palette'
	};

	const objectFields: Record<string, string> = {
		styleGuide: 'style_guide'
	};

	// Simple string fields
	for (const [key, column] of Object.entries(fieldMap)) {
		if (key in updates) {
			setClauses.push(`${column} = ?`);
			const val = (updates as Record<string, unknown>)[key];
			// Convert booleans to integers for SQLite
			values.push(typeof val === 'boolean' ? (val ? 1 : 0) : (val ?? null));
		}
	}

	// JSON array fields
	for (const [key, column] of Object.entries(jsonFields)) {
		if (key in updates) {
			setClauses.push(`${column} = ?`);
			const val = (updates as Record<string, unknown>)[key];
			values.push(val ? JSON.stringify(val) : null);
		}
	}

	// JSON object fields
	for (const [key, column] of Object.entries(objectFields)) {
		if (key in updates) {
			setClauses.push(`${column} = ?`);
			const val = (updates as Record<string, unknown>)[key];
			values.push(val ? JSON.stringify(val) : null);
		}
	}

	if (setClauses.length === 0) return;

	// Always update the timestamp
	setClauses.push("updated_at = datetime('now')");
	values.push(profileId);

	await db
		.prepare(`UPDATE brand_profiles SET ${setClauses.join(', ')} WHERE id = ?`)
		.bind(...values)
		.run();
}

/**
 * Add a message to the onboarding conversation
 */
export async function addOnboardingMessage(
	db: D1Database,
	message: {
		brandProfileId: string;
		userId: string;
		role: 'user' | 'assistant' | 'system';
		content: string;
		step?: OnboardingStep;
		metadata?: Record<string, unknown>;
		attachments?: string | null;
	}
): Promise<OnboardingMessage> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	await db
		.prepare(
			`INSERT INTO onboarding_messages (id, brand_profile_id, user_id, role, content, step, metadata, attachments, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			id,
			message.brandProfileId,
			message.userId,
			message.role,
			message.content,
			message.step || null,
			message.metadata ? JSON.stringify(message.metadata) : null,
			message.attachments || null,
			now
		)
		.run();

	return {
		id,
		brandProfileId: message.brandProfileId,
		userId: message.userId,
		role: message.role,
		content: message.content,
		step: message.step,
		metadata: message.metadata,
		createdAt: now
	};
}

/**
 * Get onboarding messages for a brand profile, optionally filtered by step
 */
export async function getOnboardingMessages(
	db: D1Database,
	brandProfileId: string,
	step?: OnboardingStep
): Promise<OnboardingMessage[]> {
	let query = 'SELECT * FROM onboarding_messages WHERE brand_profile_id = ?';
	const params: unknown[] = [brandProfileId];

	if (step) {
		query += ' AND step = ?';
		params.push(step);
	}

	query += ' ORDER BY created_at ASC';

	const result = await db
		.prepare(query)
		.bind(...params)
		.all();

	return (result.results || []).map((row) => mapRowToMessage(row as Record<string, unknown>));
}

/**
 * Build the conversation context for an AI request
 * Combines system prompt with previous messages
 * Includes image attachments as multi-modal content for vision
 */
export function buildConversationContext(
	step: OnboardingStep,
	messages: OnboardingMessage[],
	brandData?: Partial<BrandProfile>,
	contentContext?: BrandContentContext
): ChatMessage[] {
	const systemPrompt = getSystemPromptForStep(step, brandData, contentContext);
	const result: ChatMessage[] = [{ role: 'system', content: systemPrompt }];

	for (const msg of messages) {
		if (msg.role === 'user' || msg.role === 'assistant') {
			// Check for image attachments to send as multi-modal content
			const imageAttachments = msg.attachments?.filter((a) => a.type === 'image') || [];
			const otherAttachments = msg.attachments?.filter((a) => a.type !== 'image') || [];

			if (imageAttachments.length > 0 && msg.role === 'user') {
				// Build multi-modal content with text + images
				const contentParts: ChatMessageContentPart[] = [];

				// Add text content
				let textContent = msg.content;
				if (otherAttachments.length > 0) {
					const attachmentList = otherAttachments
						.map((a) => `[Attached ${a.type}: ${a.name}]`)
						.join('\n');
					textContent += '\n\n' + attachmentList;
				}
				contentParts.push({ type: 'text', text: textContent });

				// Add image URLs for vision
				for (const img of imageAttachments) {
					contentParts.push({
						type: 'image_url',
						image_url: { url: img.url, detail: 'auto' }
					});
				}

				result.push({ role: 'user', content: contentParts });
			} else if (otherAttachments.length > 0 || imageAttachments.length > 0) {
				// Non-image attachments — mention them as text footnotes
				const attachmentList = [...imageAttachments, ...otherAttachments]
					.map((a) => `[Attached ${a.type}: ${a.name}]`)
					.join('\n');
				result.push({ role: msg.role, content: msg.content + '\n\n' + attachmentList });
			} else {
				result.push({ role: msg.role, content: msg.content });
			}
		}
	}

	return result;
}

/**
 * Archive a brand profile (soft delete)
 */
export async function archiveBrandProfile(db: D1Database, profileId: string): Promise<void> {
	await db
		.prepare(
			"UPDATE brand_profiles SET status = 'archived', updated_at = datetime('now') WHERE id = ?"
		)
		.bind(profileId)
		.run();
}

/**
 * Unarchive a brand profile (restore from archive)
 */
export async function unarchiveBrandProfile(db: D1Database, profileId: string): Promise<void> {
	await db
		.prepare(
			"UPDATE brand_profiles SET status = 'in_progress', updated_at = datetime('now') WHERE id = ?"
		)
		.bind(profileId)
		.run();
}

/**
 * Get the next step in the onboarding flow
 */
export function getNextStep(currentStep: OnboardingStep): OnboardingStep | null {
	const stepIds = ONBOARDING_STEPS.map((s) => s.id);
	const currentIndex = stepIds.indexOf(currentStep);
	if (currentIndex === -1 || currentIndex >= stepIds.length - 1) return null;
	return stepIds[currentIndex + 1];
}

/**
 * Get the previous step in the onboarding flow
 */
export function getPreviousStep(currentStep: OnboardingStep): OnboardingStep | null {
	const stepIds = ONBOARDING_STEPS.map((s) => s.id);
	const currentIndex = stepIds.indexOf(currentStep);
	if (currentIndex <= 0) return null;
	return stepIds[currentIndex - 1];
}

/**
 * Get step progress as a percentage
 */
export function getStepProgress(currentStep: OnboardingStep): number {
	const stepIds = ONBOARDING_STEPS.map((s) => s.id);
	const currentIndex = stepIds.indexOf(currentStep);
	if (currentIndex === -1) return 0;
	return Math.round((currentIndex / (stepIds.length - 1)) * 100);
}

// ──────────────────────────────────────────────────────────────────────────
// Brand Data Extraction from Conversation
// ──────────────────────────────────────────────────────────────────────────

/** All brand profile fields that can be extracted from conversations */
const KNOWN_EXTRACTION_FIELDS = new Set([
	'brandName',
	'industry',
	'elevatorPitch',
	'tagline',
	'missionStatement',
	'visionStatement',
	'brandArchetype',
	'brandPersonalityTraits',
	'toneOfVoice',
	'communicationStyle',
	'targetAudience',
	'customerPainPoints',
	'valueProposition',
	'primaryColor',
	'secondaryColor',
	'accentColor',
	'backgroundColor',
	'surfaceColor',
	'textColor',
	'textSecondaryColor',
	'borderColor',
	'successColor',
	'warningColor',
	'errorColor',
	'colorPalette',
	'typographyLogo',
	'typographyHeading',
	'typographyBody',
	'logoConcept',
	'competitors',
	'uniqueSellingPoints',
	'marketPosition',
	'originStory',
	'brandValues',
	'brandPromise'
]);

/** Type for extracted brand fields */
export type ExtractedFields = Partial<Record<string, string | string[] | Record<string, unknown>>>;

/**
 * Build an extraction prompt that asks a lightweight AI model to extract
 * structured brand data from the recent conversation.
 *
 * Returns an empty string for the 'complete' step (nothing to extract).
 */
export function buildExtractionPrompt(
	step: OnboardingStep,
	conversationMessages: Array<{ role: string; content: string }>
): string {
	if (step === 'complete') return '';

	const stepConfig = getStepConfig(step);
	// Always include brandName; merge with the step's declared fields
	const fieldsSet = new Set<string>(['brandName']);
	if (stepConfig?.extractionFields) {
		for (const f of stepConfig.extractionFields) {
			fieldsSet.add(f);
		}
	}
	const fields = Array.from(fieldsSet);

	// Build a condensed conversation transcript
	const transcript = conversationMessages
		.map(
			(m) =>
				`${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`
		)
		.join('\n');

	return `You are a data extraction assistant. Analyze the following brand onboarding conversation and extract any brand information that has been explicitly stated or clearly agreed upon by the user.

CONVERSATION:
${transcript}

FIELDS TO EXTRACT (return only fields that were clearly stated or confirmed):
${fields.map((f) => `- ${f}`).join('\n')}

RULES:
- Return a JSON object with ONLY the fields that have definitive values from the conversation
- Do NOT guess or infer values that weren't discussed
- If the user explicitly stated a brand name, include it as "brandName"
- Preserve exact spelling, capitalization, and special characters (e.g. "*Space" not "Space")
- For array fields (colorPalette), return JSON arrays
- For text fields (brandPersonalityTraits, brandValues, competitors, uniqueSellingPoints, customerPainPoints, targetAudience), return plain text strings (comma-separated if multiple values)
- For fields with no clear value from the conversation, omit them entirely
- Return ONLY valid JSON, no markdown, no explanation
- If nothing was clearly established, return an empty object {}`;
}

/**
 * Parse the extraction AI response into a typed object.
 * Returns null if the response is invalid, empty, or contains no known fields.
 */
export function parseExtractionResponse(response: string): ExtractedFields | null {
	if (!response || response.trim().length === 0) return null;

	let text = response.trim();

	// Strip markdown code block wrappers if present
	const codeBlockMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
	if (codeBlockMatch) {
		text = codeBlockMatch[1].trim();
	}

	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(text);
	} catch {
		return null;
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		return null;
	}

	// Filter to only known fields with non-empty values
	const result: ExtractedFields = {};
	let hasValue = false;

	for (const [key, value] of Object.entries(parsed)) {
		if (!KNOWN_EXTRACTION_FIELDS.has(key)) continue;
		if (value === null || value === undefined) continue;
		if (typeof value === 'string' && value.trim() === '') continue;

		result[key] = value as string | string[] | Record<string, unknown>;
		hasValue = true;
	}

	return hasValue ? result : null;
}
