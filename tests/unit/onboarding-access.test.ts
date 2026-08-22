/**
 * Access-boundary regression tests for onboarding routes addressed by profile id.
 *
 * A profile id is not authority: callers need the same owner/grant relationship as
 * the rest of the brand surface. A refusal must also happen before the onboarding
 * service reads messages or mutates the profile.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	getBrandProfile,
	getOnboardingMessages,
	updateBrandProfile
} from '$lib/services/onboarding';

vi.mock('$lib/services/onboarding', () => ({
	getBrandProfile: vi.fn(),
	getOnboardingMessages: vi.fn(),
	updateBrandProfile: vi.fn()
}));

type Access = 'owner' | 'manager' | 'editor' | 'viewer' | null;

const PROFILE_ID = 'brand-1';
const USER_ID = 'user-1';
const user = {
	id: USER_ID,
	login: 'tester',
	email: 'tester@example.com',
	isOwner: false,
	isAdmin: false
};

function platformFor(access: Access) {
	const db = {
		prepare: vi.fn((sql: string) => ({
			bind: vi.fn(() => ({
				first: vi.fn(async () => {
					if (sql.includes('FROM brand_profiles')) {
						return { user_id: access === 'owner' ? USER_ID : 'another-user' };
					}
					if (sql.includes('FROM brand_access')) {
						return access && access !== 'owner' ? { role: access } : null;
					}
					return null;
				})
			}))
		}))
	};

	return { env: { DB: db } };
}

function messagesEvent(access: Access) {
	return {
		locals: { user },
		platform: platformFor(access),
		params: { profileId: PROFILE_ID },
		url: new URL(`http://localhost/api/onboarding/messages/${PROFILE_ID}`)
	};
}

function patchEvent(access: Access) {
	return {
		locals: { user },
		platform: platformFor(access),
		request: new Request('http://localhost/api/onboarding/profile', {
			method: 'PATCH',
			body: JSON.stringify({
				profileId: PROFILE_ID,
				updates: { brandName: 'Allowed Brand' }
			})
		})
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('GET /api/onboarding/messages/[profileId] access', () => {
	it('returns the standard non-enumerating 404 to an unrelated user before reading messages', async () => {
		const { GET } = await import('../../src/routes/api/onboarding/messages/[profileId]/+server');

		await expect(GET(messagesEvent(null) as never)).rejects.toMatchObject({
			status: 404,
			body: { message: 'Brand not found' }
		});
		expect(getOnboardingMessages).not.toHaveBeenCalled();
	});

	it.each(['viewer', 'owner'] as const)('allows a %s to read messages', async (access) => {
		vi.mocked(getOnboardingMessages).mockResolvedValueOnce([]);
		const { GET } = await import('../../src/routes/api/onboarding/messages/[profileId]/+server');
		const event = messagesEvent(access);

		const response = (await GET(event as never)) as Response;
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ messages: [] });
		expect(getOnboardingMessages).toHaveBeenCalledWith(
			event.platform.env.DB,
			PROFILE_ID,
			undefined
		);
	});
});

describe('PATCH /api/onboarding/profile access', () => {
	it('returns the standard non-enumerating 404 to an unrelated user before updating', async () => {
		const { PATCH } = await import('../../src/routes/api/onboarding/profile/+server');

		await expect(PATCH(patchEvent(null) as never)).rejects.toMatchObject({
			status: 404,
			body: { message: 'Brand not found' }
		});
		expect(updateBrandProfile).not.toHaveBeenCalled();
		expect(getBrandProfile).not.toHaveBeenCalled();
	});

	it('allows a viewer to read but refuses profile updates before mutation', async () => {
		const { PATCH } = await import('../../src/routes/api/onboarding/profile/+server');

		await expect(PATCH(patchEvent('viewer') as never)).rejects.toMatchObject({ status: 403 });
		expect(updateBrandProfile).not.toHaveBeenCalled();
		expect(getBrandProfile).not.toHaveBeenCalled();
	});

	it.each(['editor', 'manager', 'owner'] as const)(
		'allows a %s to update the profile',
		async (access) => {
			const updatedProfile = {
				id: PROFILE_ID,
				userId: access === 'owner' ? USER_ID : 'another-user'
			};
			vi.mocked(updateBrandProfile).mockResolvedValueOnce(undefined);
			vi.mocked(getBrandProfile).mockResolvedValueOnce(updatedProfile as never);
			const { PATCH } = await import('../../src/routes/api/onboarding/profile/+server');

			const response = (await PATCH(patchEvent(access) as never)) as Response;
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ profile: updatedProfile });
			expect(updateBrandProfile).toHaveBeenCalledWith(expect.anything(), PROFILE_ID, {
				brandName: 'Allowed Brand',
				brandNameConfirmed: true
			});
		}
	);
});
