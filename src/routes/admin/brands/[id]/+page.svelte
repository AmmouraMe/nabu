<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	let brand = data.brand;
	let accessList: any[] = data.access || [];
	let logs: any[] = data.logs || [];
	let logsTotal = data.logsTotal || 0;
	let allUsers: any[] = data.users || [];
	let activeTab: 'access' | 'logs' = 'access';

	// Grant access form
	let showGrantForm = false;
	let selectedUserId = '';
	let selectedRole: 'viewer' | 'editor' | 'manager' = 'viewer';
	let grantError = '';
	let grantLoading = false;

	// Filter users not already having access and not the brand owner
	$: availableUsers = allUsers.filter(
		(u: any) => !accessList.some((a: any) => a.userId === u.id) && u.id !== brand?.ownerId
	);

	function formatDate(dateStr: string): string {
		if (!dateStr) return '—';
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatAction(action: string): string {
		const labels: Record<string, string> = {
			access_granted: 'Granted access',
			access_updated: 'Updated access',
			access_revoked: 'Revoked access',
			profile_updated: 'Updated profile',
			field_updated: 'Updated field',
			text_created: 'Created text asset',
			text_updated: 'Updated text asset',
			media_uploaded: 'Uploaded media',
			media_deleted: 'Deleted media'
		};
		return labels[action] || action.replace(/_/g, ' ');
	}

	function roleLabel(role: string): string {
		return role.charAt(0).toUpperCase() + role.slice(1);
	}

	async function grantAccess() {
		if (!selectedUserId || !brand) return;
		grantLoading = true;
		grantError = '';

		try {
			const response = await fetch(`/api/admin/brands/${brand.id}/access`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId: selectedUserId, role: selectedRole })
			});

			if (!response.ok) {
				const err = await response.json().catch(() => ({}));
				throw new Error(err.message || 'Failed to grant access');
			}

			await reloadAccess();
			showGrantForm = false;
			selectedUserId = '';
			selectedRole = 'viewer';
		} catch (err: any) {
			grantError = err.message || 'Failed to grant access';
		} finally {
			grantLoading = false;
		}
	}

	async function updateRole(accessId: string, newRole: string) {
		if (!brand) return;

		try {
			const response = await fetch(`/api/admin/brands/${brand.id}/access`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accessId, role: newRole })
			});

			if (response.ok) {
				await reloadAccess();
			}
		} catch (err) {
			console.error('Failed to update role:', err);
		}
	}

	async function revokeAccess(accessId: string, userName: string) {
		if (!brand) return;
		if (!confirm(`Revoke access for ${userName}?`)) return;

		try {
			const response = await fetch(`/api/admin/brands/${brand.id}/access`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accessId })
			});

			if (response.ok) {
				await reloadAccess();
			}
		} catch (err) {
			console.error('Failed to revoke access:', err);
		}
	}

	async function reloadAccess() {
		if (!brand) return;
		try {
			const response = await fetch(`/api/admin/brands/${brand.id}/access`);
			if (response.ok) {
				const data = await response.json();
				accessList = data.access || [];
			}
		} catch (err) {
			console.error('Failed to reload access:', err);
		}
	}

	async function loadMoreLogs() {
		if (!brand || logs.length >= logsTotal) return;

		try {
			const response = await fetch(
				`/api/admin/brands/${brand.id}/logs?limit=25&offset=${logs.length}`
			);
			if (response.ok) {
				const data = await response.json();
				logs = [...logs, ...(data.entries || [])];
				logsTotal = data.total;
			}
		} catch (err) {
			console.error('Failed to load more logs:', err);
		}
	}
</script>

{#if !brand}
	<div class="not-found">
		<h1>Brand Not Found</h1>
		<p>The brand you're looking for doesn't exist.</p>
		<a href="/admin/brands" class="back-link">&larr; Back to brands</a>
	</div>
{:else}
	<div class="brand-detail">
		<div class="page-header">
			<a href="/admin/brands" class="back-link">&larr; All Brands</a>
			<h1>{brand.brandName || 'Unnamed Brand'}</h1>
			<div class="brand-meta">
				<span class="status-badge status-{brand.status}">
					{brand.status === 'in_progress' ? 'In Progress' : brand.status}
				</span>
				<span class="meta-separator">·</span>
				<span class="meta-text">
					Owner: <strong>{brand.ownerName || brand.ownerLogin}</strong>
				</span>
				<span class="meta-separator">·</span>
				<span class="meta-text">Updated {formatDate(brand.updatedAt)}</span>
			</div>
		</div>

		<div class="tabs">
			<button
				class="tab"
				class:active={activeTab === 'access'}
				on:click={() => (activeTab = 'access')}
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
					<circle cx="9" cy="7" r="4" />
					<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
					<path d="M16 3.13a4 4 0 0 1 0 7.75" />
				</svg>
				Access ({accessList.length})
			</button>
			<button class="tab" class:active={activeTab === 'logs'} on:click={() => (activeTab = 'logs')}>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<polyline points="14 2 14 8 20 8" />
					<line x1="16" y1="13" x2="8" y2="13" />
					<line x1="16" y1="17" x2="8" y2="17" />
				</svg>
				Audit Log ({logsTotal})
			</button>
		</div>

		{#if activeTab === 'access'}
			<div class="access-section">
				<div class="section-header">
					<h2>Collaborators</h2>
					<button class="btn btn-primary" on:click={() => (showGrantForm = !showGrantForm)}>
						{showGrantForm ? 'Cancel' : '+ Add User'}
					</button>
				</div>

				{#if showGrantForm}
					<div class="grant-form">
						<div class="form-row">
							<select bind:value={selectedUserId} class="form-select">
								<option value="" disabled>Select a user...</option>
								{#each availableUsers as user}
									<option value={user.id}>
										{user.name || user.github_login || user.email}
									</option>
								{/each}
							</select>
							<select bind:value={selectedRole} class="form-select role-select">
								<option value="viewer">Viewer</option>
								<option value="editor">Editor</option>
								<option value="manager">Manager</option>
							</select>
							<button
								class="btn btn-primary"
								on:click={grantAccess}
								disabled={!selectedUserId || grantLoading}
							>
								{grantLoading ? 'Granting...' : 'Grant Access'}
							</button>
						</div>
						{#if grantError}
							<p class="error-msg">{grantError}</p>
						{/if}
						<div class="role-descriptions">
							<p><strong>Viewer</strong> — Can view brand details</p>
							<p><strong>Editor</strong> — Can view and edit brand content</p>
							<p><strong>Manager</strong> — Can edit and manage collaborators</p>
						</div>
					</div>
				{/if}

				{#if accessList.length === 0}
					<div class="empty-state">
						<p>No collaborators yet. Add users to share access to this brand.</p>
					</div>
				{:else}
					<div class="access-list">
						{#each accessList as entry}
							<div class="access-card">
								<div class="access-user">
									{#if entry.userAvatar}
										<img src={entry.userAvatar} alt={entry.userLogin} class="user-avatar" />
									{:else}
										<div class="user-avatar-placeholder">
											{(entry.userName || entry.userLogin || '?').charAt(0).toUpperCase()}
										</div>
									{/if}
									<div class="user-details">
										<span class="user-name">{entry.userName || entry.userLogin}</span>
										<span class="user-email">{entry.userEmail}</span>
									</div>
								</div>
								<div class="access-actions">
									<select
										value={entry.role}
										class="role-badge-select"
										on:change={(e) => updateRole(entry.id, e.currentTarget.value)}
									>
										<option value="viewer">Viewer</option>
										<option value="editor">Editor</option>
										<option value="manager">Manager</option>
									</select>
									<button
										class="btn btn-danger-sm"
										on:click={() => revokeAccess(entry.id, entry.userName || entry.userLogin)}
										title="Revoke access"
									>
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<line x1="18" y1="6" x2="6" y2="18" />
											<line x1="6" y1="6" x2="18" y2="18" />
										</svg>
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<div class="logs-section">
				<h2>Activity Log</h2>

				{#if logs.length === 0}
					<div class="empty-state">
						<p>No activity recorded yet.</p>
					</div>
				{:else}
					<div class="log-timeline">
						{#each logs as entry}
							<div class="log-entry">
								<div class="log-dot"></div>
								<div class="log-content">
									<div class="log-header">
										{#if entry.userAvatar}
											<img src={entry.userAvatar} alt={entry.userLogin} class="log-avatar" />
										{/if}
										<span class="log-user">{entry.userName || entry.userLogin}</span>
										<span class="log-action">{formatAction(entry.action)}</span>
									</div>
									{#if entry.details}
										{@const parsed = (() => {
											try {
												return JSON.parse(entry.details);
											} catch {
												return null;
											}
										})()}
										{#if parsed}
											<div class="log-details">
												{#if parsed.role}
													<span class="detail-badge">{roleLabel(parsed.role)}</span>
												{/if}
												{#if parsed.oldRole && parsed.newRole}
													<span class="detail-change">
														{roleLabel(parsed.oldRole)} → {roleLabel(parsed.newRole)}
													</span>
												{/if}
											</div>
										{/if}
									{/if}
									<span class="log-time">{formatDate(entry.createdAt)}</span>
								</div>
							</div>
						{/each}
					</div>

					{#if logs.length < logsTotal}
						<button class="btn btn-secondary load-more" on:click={loadMoreLogs}>
							Load more ({logsTotal - logs.length} remaining)
						</button>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.brand-detail {
		max-width: 900px;
	}

	.not-found {
		text-align: center;
		padding: var(--spacing-3xl);
	}

	.not-found h1 {
		color: var(--color-text);
		margin-bottom: var(--spacing-md);
	}

	.not-found p {
		color: var(--color-text-secondary);
		margin-bottom: var(--spacing-lg);
	}

	.back-link {
		color: var(--color-text-secondary);
		text-decoration: none;
		font-size: 0.85rem;
		display: inline-block;
		margin-bottom: var(--spacing-sm);
		transition: color var(--transition-fast);
	}

	.back-link:hover {
		color: var(--color-primary);
	}

	.page-header {
		margin-bottom: var(--spacing-xl);
	}

	.page-header h1 {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: var(--spacing-sm);
	}

	.brand-meta {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.meta-separator {
		color: var(--color-border);
	}

	.meta-text {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}

	.status-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: capitalize;
	}

	.status-completed {
		background: var(--color-success);
		color: var(--color-background);
	}

	.status-in_progress {
		background: var(--color-warning);
		color: var(--color-background);
	}

	.status-archived {
		background: var(--color-border);
		color: var(--color-text-secondary);
	}

	/* Tabs */
	.tabs {
		display: flex;
		gap: 0;
		border-bottom: 1px solid var(--color-border);
		margin-bottom: var(--spacing-lg);
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm) var(--spacing-md);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast);
		white-space: nowrap;
	}

	.tab:hover {
		color: var(--color-text);
	}

	.tab.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	/* Access section */
	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--spacing-lg);
	}

	.section-header h2 {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.logs-section h2 {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-lg);
	}

	.grant-form {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-lg);
		margin-bottom: var(--spacing-lg);
	}

	.form-row {
		display: flex;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.form-select {
		flex: 1;
		min-width: 150px;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text);
		font-size: 0.9rem;
	}

	.form-select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.role-select {
		flex: 0 0 auto;
		min-width: 120px;
	}

	.error-msg {
		color: var(--color-error);
		font-size: 0.85rem;
		margin-top: var(--spacing-sm);
	}

	.role-descriptions {
		margin-top: var(--spacing-md);
		font-size: 0.8rem;
		color: var(--color-text-secondary);
	}

	.role-descriptions p {
		margin-bottom: 2px;
	}

	.empty-state {
		text-align: center;
		padding: var(--spacing-2xl);
		color: var(--color-text-secondary);
	}

	.access-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.access-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-md);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.access-user {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.user-avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		object-fit: cover;
	}

	.user-avatar-placeholder {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--color-primary);
		color: var(--color-background);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 0.9rem;
	}

	.user-details {
		display: flex;
		flex-direction: column;
	}

	.user-name {
		font-weight: 500;
		color: var(--color-text);
		font-size: 0.9rem;
	}

	.user-email {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.access-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.role-badge-select {
		padding: 4px 8px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-background);
		color: var(--color-text);
		font-size: 0.8rem;
	}

	.role-badge-select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	/* Buttons */
	.btn {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm) var(--spacing-md);
		border: none;
		border-radius: var(--radius-md);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background: var(--color-primary);
		color: var(--color-background);
	}

	.btn-primary:hover:not(:disabled) {
		opacity: 0.9;
	}

	.btn-secondary {
		background: var(--color-surface);
		color: var(--color-text);
		border: 1px solid var(--color-border);
	}

	.btn-secondary:hover {
		background: var(--color-background);
	}

	.btn-danger-sm {
		background: none;
		border: none;
		padding: var(--spacing-xs);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.btn-danger-sm:hover {
		color: var(--color-error);
		background: var(--color-surface);
	}

	/* Log timeline */
	.log-timeline {
		position: relative;
		padding-left: var(--spacing-xl);
	}

	.log-timeline::before {
		content: '';
		position: absolute;
		left: 7px;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--color-border);
	}

	.log-entry {
		position: relative;
		padding-bottom: var(--spacing-lg);
	}

	.log-entry:last-child {
		padding-bottom: 0;
	}

	.log-dot {
		position: absolute;
		left: calc(-1 * var(--spacing-xl) + 3px);
		top: 6px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--color-primary);
		border: 2px solid var(--color-background);
	}

	.log-content {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-sm) var(--spacing-md);
	}

	.log-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		margin-bottom: 2px;
	}

	.log-avatar {
		width: 20px;
		height: 20px;
		border-radius: 50%;
	}

	.log-user {
		font-weight: 600;
		font-size: 0.85rem;
		color: var(--color-text);
	}

	.log-action {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}

	.log-details {
		margin-top: 4px;
	}

	.detail-badge {
		display: inline-block;
		padding: 1px 6px;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		background: var(--color-primary);
		color: var(--color-background);
	}

	.detail-change {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
	}

	.log-time {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.load-more {
		display: block;
		width: 100%;
		margin-top: var(--spacing-lg);
		text-align: center;
	}

	@media (max-width: 600px) {
		.access-card {
			flex-direction: column;
			gap: var(--spacing-sm);
			align-items: flex-start;
		}

		.access-actions {
			width: 100%;
			justify-content: flex-end;
		}

		.form-row {
			flex-direction: column;
		}

		.log-timeline {
			padding-left: var(--spacing-lg);
		}

		.log-header {
			flex-wrap: wrap;
		}
	}

	@media (min-width: 769px) {
		.page-header h1 {
			font-size: 1.75rem;
		}

		.tabs {
			margin-bottom: var(--spacing-xl);
		}
	}
</style>
