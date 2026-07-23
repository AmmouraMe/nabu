import type { PageServerLoad } from './$types';
import type { CorePrincipleQuestion } from '$lib/services/core-principle-questions';

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const response = await fetch('/api/admin/core-principle-questions');
		if (response.ok) {
			const data = (await response.json()) as { questions?: CorePrincipleQuestion[] };
			return {
				questions: data.questions || []
			};
		}
	} catch (error) {
		console.error('Failed to load core principle questions:', error);
	}

	return {
		questions: []
	};
};
