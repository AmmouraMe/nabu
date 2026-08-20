<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import PricingSection from '$lib/components/PricingSection.svelte';

	export let data: { user: App.Locals['user'] };
</script>

<Seo
	path="/pricing"
	title="Pricing"
	description="Simple, per-brand pricing. Start free, and pick a plan for each brand independently so one project never subsidises another."
	image="pricing"
/>

<PricingSection isLoggedIn={!!data.user} />
