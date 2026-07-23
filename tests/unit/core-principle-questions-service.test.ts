import { describe, expect, it } from 'vitest';
import {
	DEFAULT_CORE_PRINCIPLE_QUESTIONS,
	buildCorePrincipleQuestionsPromptBlock,
	type CorePrincipleQuestion
} from '$lib/services/core-principle-questions';

describe('Core principle questions service', () => {
	it('has 7 default questions', () => {
		expect(DEFAULT_CORE_PRINCIPLE_QUESTIONS).toHaveLength(7);
	});

	it('builds an empty prompt block when no questions are active', () => {
		const block = buildCorePrincipleQuestionsPromptBlock([]);
		expect(block).toBe('');
	});

	it('builds a numbered prompt block for active questions', () => {
		const questions: CorePrincipleQuestion[] = [
			{
				id: 'q1',
				question: 'Question one',
				is_active: 1,
				sort_order: 0,
				created_at: '',
				updated_at: ''
			},
			{
				id: 'q2',
				question: 'Question two',
				is_active: 1,
				sort_order: 1,
				created_at: '',
				updated_at: ''
			}
		];
		const block = buildCorePrincipleQuestionsPromptBlock(questions);

		expect(block).toContain('CORE PRINCIPLES DISCOVERY QUESTIONS');
		expect(block).toContain('1. Question one');
		expect(block).toContain('2. Question two');
	});
});
