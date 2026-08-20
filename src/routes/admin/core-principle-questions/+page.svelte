<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	let questions = data.questions || [];
	let newQuestionText = '';
	let saving = false;
	let errorMessage = '';

	function resetError() {
		errorMessage = '';
	}

	async function addQuestion() {
		resetError();
		const question = newQuestionText.trim();
		if (!question) {
			errorMessage = 'Question is required.';
			return;
		}

		saving = true;
		try {
			const response = await fetch('/api/admin/core-principle-questions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ question, isActive: true })
			});

			if (!response.ok) {
				const payload = await response.json().catch(() => ({}));
				errorMessage = payload.message || 'Failed to add question.';
				return;
			}

			const payload = await response.json();
			questions = [...questions, payload.question].sort((a, b) => a.sort_order - b.sort_order);
			newQuestionText = '';
		} catch (error) {
			console.error('Failed to add question:', error);
			errorMessage = 'Failed to add question.';
		} finally {
			saving = false;
		}
	}

	async function updateQuestion(
		id: string,
		patch: { question?: string; isActive?: boolean; sortOrder?: number }
	) {
		resetError();
		try {
			const response = await fetch(`/api/admin/core-principle-questions/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch)
			});

			if (!response.ok) {
				const payload = await response.json().catch(() => ({}));
				errorMessage = payload.message || 'Failed to update question.';
			}
		} catch (error) {
			console.error('Failed to update question:', error);
			errorMessage = 'Failed to update question.';
		}
	}

	async function removeQuestion(id: string) {
		resetError();
		if (!confirm('Delete this question?')) {
			return;
		}

		try {
			const response = await fetch(`/api/admin/core-principle-questions/${id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const payload = await response.json().catch(() => ({}));
				errorMessage = payload.message || 'Failed to delete question.';
				return;
			}

			questions = questions.filter((question) => question.id !== id);
		} catch (error) {
			console.error('Failed to delete question:', error);
			errorMessage = 'Failed to delete question.';
		}
	}

	async function toggleActive(id: string, current: boolean) {
		questions = questions.map((question) =>
			question.id === id ? { ...question, is_active: current ? 0 : 1 } : question
		);
		await updateQuestion(id, { isActive: !current });
	}

	async function saveQuestionText(id: string, questionText: string) {
		const question = questionText.trim();
		if (!question) {
			errorMessage = 'Question cannot be empty.';
			return;
		}
		await updateQuestion(id, { question });
	}

	async function moveQuestion(id: string, direction: -1 | 1) {
		const index = questions.findIndex((question) => question.id === id);
		const targetIndex = index + direction;
		if (index < 0 || targetIndex < 0 || targetIndex >= questions.length) {
			return;
		}

		const reordered = [...questions];
		[reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
		reordered.forEach((question, idx) => {
			question.sort_order = idx;
		});

		questions = reordered;
		await Promise.all(
			reordered.map((question, idx) =>
				updateQuestion(question.id, {
					sortOrder: idx
				})
			)
		);
	}
</script>

<div class="questions-page">
	<header class="page-header">
		<h1>Core Principles Questions</h1>
		<p class="page-description">
			Manage the question bank used by AI during onboarding to discover a brand's core principles.
		</p>
	</header>

	<section class="add-section">
		<label for="new-question">Add question</label>
		<div class="add-row">
			<input
				id="new-question"
				type="text"
				placeholder="Enter a new question"
				bind:value={newQuestionText}
				on:input={resetError}
			/>
			<button on:click={addQuestion} disabled={saving}>Add</button>
		</div>
	</section>

	{#if errorMessage}
		<p class="error">{errorMessage}</p>
	{/if}

	<section class="list-section">
		{#if questions.length === 0}
			<p class="empty-state">No questions configured.</p>
		{:else}
			<ul>
				{#each questions as question, index (question.id)}
					<li class="question-item" class:inactive={question.is_active === 0}>
						<div class="question-controls">
							<button
								on:click={() => moveQuestion(question.id, -1)}
								disabled={index === 0}
								aria-label={`Move ${question.question} up`}
							>
								↑
							</button>
							<button
								on:click={() => moveQuestion(question.id, 1)}
								disabled={index === questions.length - 1}
								aria-label={`Move ${question.question} down`}
							>
								↓
							</button>
						</div>

						<input
							type="text"
							value={question.question}
							on:change={(event) => saveQuestionText(question.id, event.currentTarget?.value ?? '')}
						/>

						<label class="toggle">
							<input
								type="checkbox"
								checked={question.is_active === 1}
								on:change={() => toggleActive(question.id, question.is_active === 1)}
							/>
							<span>Active</span>
						</label>

						<button class="delete" on:click={() => removeQuestion(question.id)}>Delete</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style>
	.questions-page {
		display: grid;
		gap: var(--spacing-lg);
	}

	.page-header h1 {
		margin: 0;
		color: var(--color-text);
	}

	.page-description {
		margin: var(--spacing-xs) 0 0;
		color: var(--color-text-secondary);
	}

	.add-section {
		display: grid;
		gap: var(--spacing-xs);
	}

	.add-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--spacing-sm);
	}

	input[type='text'] {
		width: 100%;
		padding: var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
	}

	button {
		padding: var(--spacing-sm) var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		background: var(--color-surface-hover);
	}

	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.error {
		color: var(--color-error);
		margin: 0;
	}

	.list-section ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--spacing-sm);
	}

	.question-item {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		gap: var(--spacing-sm);
		align-items: center;
		padding: var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}

	.question-item.inactive {
		opacity: 0.75;
	}

	.question-controls {
		display: grid;
		gap: 4px;
	}

	.toggle {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		color: var(--color-text-secondary);
	}

	.delete {
		color: var(--color-error);
	}

	.empty-state {
		color: var(--color-text-secondary);
	}

	@media (max-width: 900px) {
		.question-item {
			grid-template-columns: 1fr;
		}

		.question-controls {
			grid-auto-flow: column;
			justify-content: flex-start;
		}
	}
</style>
