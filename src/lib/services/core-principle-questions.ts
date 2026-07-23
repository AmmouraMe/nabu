import type { D1Database } from '@cloudflare/workers-types';

export interface CorePrincipleQuestion {
	id: string;
	question: string;
	is_active: number;
	sort_order: number;
	created_at: string;
	updated_at: string;
}

export const DEFAULT_CORE_PRINCIPLE_QUESTIONS = [
	'What values will your brand protect, even when it is costly?',
	'What kind of impact should people consistently feel after engaging with your brand?',
	'Which customer beliefs or assumptions is your brand trying to challenge?',
	'What standards are non-negotiable in your products, services, or experiences?',
	'How should your team make trade-offs when growth conflicts with integrity?',
	'What behaviors should your brand never reward, even if they drive short-term results?',
	'If your brand disappeared tomorrow, what principle would your audience miss the most?'
] as const;

export async function listCorePrincipleQuestions(
	db: D1Database,
	onlyActive = false
): Promise<CorePrincipleQuestion[]> {
	let query =
		'SELECT id, question, is_active, sort_order, created_at, updated_at FROM core_principle_questions';

	if (onlyActive) {
		query += ' WHERE is_active = 1';
	}

	query += ' ORDER BY sort_order ASC, created_at ASC';

	const result = await db.prepare(query).all<CorePrincipleQuestion>();
	return result.results || [];
}

export function buildCorePrincipleQuestionsPromptBlock(
	questions: Array<Pick<CorePrincipleQuestion, 'question'>>
): string {
	if (!questions.length) {
		return '';
	}

	const numberedQuestions = questions
		.map((question, index) => `${index + 1}. ${question.question}`)
		.join('\n');

	return `CORE PRINCIPLES DISCOVERY QUESTIONS:
Use these as a flexible question bank to uncover the brand's core principles and values. Ask only what fits naturally in the conversation, and adapt wording to the user's context.
${numberedQuestions}`;
}
