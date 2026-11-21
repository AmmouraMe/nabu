import { describe, expect, it } from 'vitest';
import { finalizeOAuthLogin } from '../../src/lib/server/oauth-finalization';
import { createSqliteD1 } from '../helpers/sqlite-d1';

const platform = { env: { SESSION_SECRET: 'secret' } } as any;

describe('finalizeOAuthLogin', () => {
	it('stamps users.last_login_at on every sign-in', async () => {
		const db = createSqliteD1();
		await db.prepare("INSERT INTO users (id, email, name) VALUES ('u','a@x.test','A')").run();
		await finalizeOAuthLogin({ db, platform, url: new URL('http://localhost/'), userId: 'u' });
		const row = await db
			.prepare('SELECT last_login_at FROM users WHERE id = ?')
			.bind('u')
			.first<{ last_login_at: string | null }>();
		expect(row?.last_login_at).not.toBeNull();
	});

	it('still signs in when the column is missing (migration 0031 not applied yet)', async () => {
		const db = createSqliteD1(
			(await import('node:fs'))
				.readdirSync('migrations')
				.filter((f) => /^00(0\d|[12]\d|30)_.*\.sql$/.test(f))
				.sort()
		);
		await db.prepare("INSERT INTO users (id, email, name) VALUES ('u','a@x.test','A')").run();
		const response = await finalizeOAuthLogin({
			db,
			platform,
			url: new URL('http://localhost/'),
			userId: 'u'
		});
		expect(response.status).toBe(302);
	});
});
