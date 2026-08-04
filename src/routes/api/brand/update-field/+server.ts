/**
 * PATCH /api/brand/update-field - Update a brand field with version tracking
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBrandProfile } from '$lib/services/onboarding';
import { updateBrandFieldWithVersion } from '$lib/services/brand';

export const PATCH: RequestHandler = async ({ locals, platform, request }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  const body = await request.json();
  const { profileId, fieldName, newValue, changeSource, changeReason } = body;

  if (!profileId || !fieldName) {
    throw error(400, 'profileId and fieldName are required');
  }

  // Verify profile belongs to user
  const profile = await getBrandProfile(platform!.env.DB, profileId);
  if (!profile) {
    throw error(404, 'Profile not found');
  }
  if (profile.userId !== locals.user.id) {
    throw error(403, 'Forbidden');
  }

  await updateBrandFieldWithVersion(platform!.env.DB, {
    profileId,
    userId: locals.user.id,
    fieldName,
    newValue: newValue ?? null,
    changeSource: changeSource || 'manual',
    changeReason
  });

  // Return updated profile
  const updatedProfile = await getBrandProfile(platform!.env.DB, profileId);
  return json({ profile: updatedProfile });
};
