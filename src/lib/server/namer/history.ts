/**
 * Saving generations, and keeping every suggested name unique.
 *
 * ── The privacy boundary ────────────────────────────────────────────────────
 * A brief describes an unlaunched business. It is the most sensitive thing this
 * feature touches, and it is stored, so the rule is simple and enforced in one
 * place: **`namer_generations` is only ever read filtered by `user_id`**, and
 * rows belonging to logged-out visitors have a NULL `user_id`, which no query
 * here will match. There is no "list all generations" function, because there is
 * no caller who should have one.
 *
 * The collision set is a separate table carrying no user reference and no brief.
 * That is what makes checking a name against *everybody's* history safe: the
 * table being consulted cannot say whose the name was or what they were
 * building, because those columns do not exist in it. A uniqueness check that
 * returns one bit — taken or not — leaks nothing beyond that bit.
 */

import type { D1Database } from '@cloudflare/workers-types';
import type { GeneratedName, NamingInput } from './naming';

/**
 * The comparison key for a name.
 *
 * Case and spacing are stripped so "Blue Bottle", "bluebottle" and "BlueBottle"
 * collide as one name rather than slipping past each other as three.
 */
export function nameKey(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Claim a name, or report that somebody already has it.
 *
 * A single conditional insert rather than a SELECT then an INSERT: two people
 * generating at the same moment would both read "free" and both be handed the
 * same name, which is precisely the collision this exists to prevent. The
 * primary key decides, and `changes` tells us who won.
 *
 * Returns true when the caller now owns the name. Fails **open** on a database
 * error — a reservation table that is down should cost uniqueness, not the whole
 * generator.
 */
export async function reserveName(db: D1Database, name: string): Promise<boolean> {
	const key = nameKey(name);
	if (!key) return false;

	try {
		const result = await db
			.prepare(
				'INSERT INTO namer_reserved_names (name_key, display_name) VALUES (?, ?) ON CONFLICT(name_key) DO NOTHING'
			)
			.bind(key, name)
			.run();
		return (result.meta?.changes ?? 0) > 0;
	} catch {
		return true;
	}
}

export interface SavedGeneration {
	id: string;
	description: string;
	audience: string | null;
	archetype: string | null;
	requireTlds: string[];
	names: GeneratedName[];
	createdAt: string;
}

/**
 * Record a finished generation.
 *
 * `userId` is null for a logged-out visitor: the row is written, as asked, but
 * no identifier is minted for somebody who did not ask for an account, and
 * nothing reads it back. Never throws — losing the audit row is not a reason to
 * fail a generation the user already watched arrive.
 */
export async function saveGeneration(
	db: D1Database,
	params: {
		id: string;
		userId: string | null;
		input: NamingInput;
		names: GeneratedName[];
	}
): Promise<void> {
	if (!params.names.length) return;

	try {
		await db
			.prepare(
				`INSERT INTO namer_generations
					(id, user_id, description, audience, archetype, require_tlds, names)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				params.id,
				params.userId,
				params.input.description,
				params.input.audience ?? null,
				params.input.archetype ?? null,
				JSON.stringify(params.input.requireTlds ?? []),
				JSON.stringify(params.names)
			)
			.run();
	} catch {
		// Best-effort history. The names were already delivered.
	}
}

/**
 * One user's own generations, newest first.
 *
 * `userId` is required and never optional-with-a-default: an accidental
 * `listGenerations(db)` must not compile into "everybody's". A falsy id returns
 * nothing rather than falling through to an unfiltered query, so a caller that
 * forgets to check for a session gets an empty list rather than the corpus.
 */
export async function listGenerations(
	db: D1Database,
	userId: string,
	limit = 20
): Promise<SavedGeneration[]> {
	if (!userId) return [];

	try {
		const { results } = await db
			.prepare(
				`SELECT id, description, audience, archetype, require_tlds, names, created_at
				 FROM namer_generations
				 WHERE user_id = ?
				 ORDER BY created_at DESC
				 LIMIT ?`
			)
			.bind(userId, Math.min(Math.max(limit, 1), 100))
			.all<{
				id: string;
				description: string;
				audience: string | null;
				archetype: string | null;
				require_tlds: string | null;
				names: string;
				created_at: string;
			}>();

		return (results ?? []).map((row) => ({
			id: row.id,
			description: row.description,
			audience: row.audience,
			archetype: row.archetype,
			requireTlds: parseJsonArray<string>(row.require_tlds),
			names: parseJsonArray<GeneratedName>(row.names),
			createdAt: row.created_at
		}));
	} catch {
		return [];
	}
}

/** Stored JSON that a bad write could have left unparseable. */
function parseJsonArray<T>(value: string | null): T[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? (parsed as T[]) : [];
	} catch {
		return [];
	}
}
