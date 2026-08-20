/**
 * LinkedIn Publishing Integration
 * Uses the LinkedIn Share API v2 (free for personal use):
 * https://api.linkedin.com/v2/ugcPosts
 *
 * Access tokens are stored in KV under: linkedin:token:{userId}
 */

const LINKEDIN_BASE = 'https://api.linkedin.com/v2';

export interface LinkedInShareInput {
	text: string;
	authorUrn: string;
}

export interface LinkedInShareResult {
	id: string;
	shareUrl: string;
}

export async function sharePost(
	accessToken: string,
	share: LinkedInShareInput
): Promise<LinkedInShareResult> {
	const body = {
		author: share.authorUrn,
		lifecycleState: 'PUBLISHED',
		specificContent: {
			'com.linkedin.ugc.ShareContent': {
				shareCommentary: {
					text: share.text
				},
				shareMediaCategory: 'NONE'
			}
		},
		visibility: {
			'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
		}
	};

	const res = await fetch(`${LINKEDIN_BASE}/ugcPosts`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
			'X-Restli-Protocol-Version': '2.0.0'
		},
		body: JSON.stringify(body)
	});

	if (!res.ok) {
		const err = await res.text().catch(() => res.statusText);
		throw new Error(`LinkedIn API error ${res.status}: ${err}`);
	}

	const data = (await res.json()) as { id: string };
	const postId = encodeURIComponent(data.id ?? '');
	return {
		id: data.id,
		shareUrl: `https://www.linkedin.com/feed/update/${postId}/`
	};
}

export function linkedInKvKey(userId: string): string {
	return `linkedin:token:${userId}`;
}
