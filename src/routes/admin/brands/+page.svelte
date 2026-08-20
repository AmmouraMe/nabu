<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	let brands = data.brands || [];
	let searchQuery = '';
	let statusFilter: string = 'all';

	$: filteredBrands = brands.filter((b: any) => {
		const matchesSearch =
			!searchQuery ||
			b.brandName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
			b.ownerLogin?.toLowerCase().includes(searchQuery.toLowerCase()) ||
			b.ownerEmail?.toLowerCase().includes(searchQuery.toLowerCase());
		const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
		return matchesSearch && matchesStatus;
	});

	function formatDate(dateStr: string): string {
		if (!dateStr) return '—';
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="brands-admin">
	<div class="page-header">
		<h1>Brands</h1>
		<p class="subtitle">Manage all brands, delegate access, and view activity logs.</p>
	</div>

	<div class="controls">
		<div class="search-box">
			<svg
				class="search-icon"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<circle cx="11" cy="11" r="8" />
				<line x1="21" y1="21" x2="16.65" y2="16.65" />
			</svg>
			<input
				type="text"
				placeholder="Search brands or owners..."
				bind:value={searchQuery}
				class="search-input"
			/>
		</div>
		<select bind:value={statusFilter} class="filter-select">
			<option value="all">All statuses</option>
			<option value="completed">Completed</option>
			<option value="in_progress">In Progress</option>
			<option value="archived">Archived</option>
		</select>
	</div>

	{#if filteredBrands.length === 0}
		<div class="empty-state">
			<svg
				width="48"
				height="48"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
			>
				<rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
				<line x1="8" y1="21" x2="16" y2="21" />
				<line x1="12" y1="17" x2="12" y2="21" />
			</svg>
			<p>No brands found</p>
		</div>
	{:else}
		<div class="brands-table-wrapper">
			<table class="brands-table">
				<thead>
					<tr>
						<th>Brand</th>
						<th>Owner</th>
						<th>Status</th>
						<th>Collaborators</th>
						<th>Updated</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredBrands as brand}
						<tr>
							<td class="brand-cell">
								<span class="brand-name">{brand.brandName || 'Unnamed Brand'}</span>
								<span class="brand-id">{brand.id.slice(0, 8)}...</span>
							</td>
							<td class="owner-cell">
								<div class="owner-info">
									{#if brand.ownerAvatar}
										<img src={brand.ownerAvatar} alt={brand.ownerLogin} class="owner-avatar" />
									{:else}
										<div class="owner-avatar-placeholder">
											{(brand.ownerName || brand.ownerLogin || '?').charAt(0).toUpperCase()}
										</div>
									{/if}
									<div>
										<span class="owner-name">{brand.ownerName || brand.ownerLogin}</span>
										<span class="owner-email">{brand.ownerEmail}</span>
									</div>
								</div>
							</td>
							<td>
								<span class="status-badge status-{brand.status}">
									{brand.status === 'in_progress' ? 'In Progress' : brand.status}
								</span>
							</td>
							<td class="count-cell">{brand.collaboratorCount}</td>
							<td class="date-cell">{formatDate(brand.updatedAt)}</td>
							<td class="action-cell">
								<a href="/admin/brands/{brand.id}" class="action-btn">
									Manage
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<polyline points="9 18 15 12 9 6" />
									</svg>
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.brands-admin {
		width: 100%;
	}

	.page-header {
		margin-bottom: var(--spacing-lg);
	}

	.page-header h1 {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: var(--spacing-xs);
	}

	.subtitle {
		color: var(--color-text-secondary);
		font-size: 0.85rem;
	}

	.controls {
		display: flex;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-lg);
		flex-direction: column;
	}

	.search-box {
		flex: 1;
		min-width: 200px;
		position: relative;
	}

	.search-icon {
		position: absolute;
		left: 12px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--color-text-secondary);
	}

	.search-input {
		width: 100%;
		padding: var(--spacing-sm) var(--spacing-sm) var(--spacing-sm) 36px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text);
		font-size: 0.9rem;
	}

	.search-input::placeholder {
		color: var(--color-text-secondary);
	}

	.search-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.filter-select {
		padding: var(--spacing-sm) var(--spacing-xl) var(--spacing-sm) var(--spacing-md);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text);
		font-size: 0.9rem;
	}

	.filter-select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.empty-state {
		text-align: center;
		padding: var(--spacing-3xl);
		color: var(--color-text-secondary);
	}

	.empty-state svg {
		margin-bottom: var(--spacing-md);
		opacity: 0.5;
	}

	.brands-table-wrapper {
		overflow-x: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.brands-table {
		width: 100%;
		border-collapse: collapse;
	}

	.brands-table th {
		text-align: left;
		padding: var(--spacing-sm) var(--spacing-md);
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.brands-table td {
		padding: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
		vertical-align: middle;
	}

	.brands-table tr:last-child td {
		border-bottom: none;
	}

	.brands-table tr:hover td {
		background: var(--color-surface);
	}

	.brand-cell {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.brand-name {
		font-weight: 600;
		color: var(--color-text);
	}

	.brand-id {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		font-family: monospace;
	}

	.owner-cell {
		min-width: 150px;
	}

	.owner-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.owner-avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		object-fit: cover;
	}

	.owner-avatar-placeholder {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--color-primary);
		color: var(--color-background);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 0.85rem;
	}

	.owner-name {
		display: block;
		font-weight: 500;
		color: var(--color-text);
		font-size: 0.9rem;
	}

	.owner-email {
		display: block;
		font-size: 0.75rem;
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

	.count-cell {
		text-align: center;
		font-weight: 500;
		color: var(--color-text);
	}

	.date-cell {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	.action-cell {
		text-align: right;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-md);
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--color-primary);
		text-decoration: none;
		transition: background var(--transition-fast);
	}

	.action-btn:hover {
		background: var(--color-surface);
	}

	@media (max-width: 768px) {
		.brands-table th:nth-child(2),
		.brands-table td:nth-child(2),
		.brands-table th:nth-child(4),
		.brands-table td:nth-child(4),
		.brands-table th:nth-child(5),
		.brands-table td:nth-child(5) {
			display: none;
		}
	}

	@media (max-width: 480px) {
		.brands-table th:nth-child(3),
		.brands-table td:nth-child(3) {
			display: none;
		}
	}

	@media (min-width: 640px) {
		.controls {
			flex-direction: row;
		}
	}

	@media (min-width: 769px) {
		.page-header h1 {
			font-size: 1.75rem;
		}

		.subtitle {
			font-size: 0.9375rem;
		}

		.page-header {
			margin-bottom: var(--spacing-xl);
		}
	}
</style>
