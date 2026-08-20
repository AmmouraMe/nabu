import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const response = await fetch('/api/admin/brands');
		if (response.ok) {
			const data = await response.json();
			return {
				brands: data.brands || []
			};
		}
	} catch (error) {
		console.error('Failed to load brands:', error);
	}

	return {
		brands: []
	};
};
