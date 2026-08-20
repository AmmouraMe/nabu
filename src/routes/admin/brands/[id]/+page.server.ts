import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, params }) => {
	const brandId = params.id;

	try {
		const [brandRes, accessRes, logsRes, usersRes] = await Promise.all([
			fetch('/api/admin/brands'),
			fetch(`/api/admin/brands/${brandId}/access`),
			fetch(`/api/admin/brands/${brandId}/logs?limit=25`),
			fetch('/api/admin/users')
		]);

		const brandsData = brandRes.ok ? await brandRes.json() : { brands: [] };
		const brand = brandsData.brands?.find((b: any) => b.id === brandId) || null;
		const accessData = accessRes.ok ? await accessRes.json() : { access: [] };
		const logsData = logsRes.ok ? await logsRes.json() : { entries: [], total: 0 };
		const usersData = usersRes.ok ? await usersRes.json() : { users: [] };

		return {
			brand,
			access: accessData.access || [],
			logs: logsData.entries || [],
			logsTotal: logsData.total || 0,
			users: usersData.users || []
		};
	} catch (error) {
		console.error('Failed to load brand detail:', error);
	}

	return {
		brand: null,
		access: [],
		logs: [],
		logsTotal: 0,
		users: []
	};
};
