# Nabu 🎬

> **Just as Nabu took the chaos of oral tradition and gave it structure through writing, your Nabu takes the chaos of content creation and gives it structure through automation.**

> _Named after the Babylonian god of writing and scribes_

Nabu is a comprehensive brand platform and marketing automation tool with optional AI-generated content and AI assistance for those looking to create a new product from scratch. It lets you create and manage a complete brand identity — mission statement, name, logo, colors, fonts, and a full brand style guide — then turns that brand into automated marketing. Part of the [Hermes](https://hermes.starspace.group) ecosystem.

---

## ✨ Vision

Nabu guides users from product conception to automated marketing:

1. **AI Onboarding** - Assess your existing product or build one from scratch with AI assistance
2. **Brand Creation** - Comprehensive brand platform: create and manage mission statement, name, logo, colors, fonts, voice, positioning, and a complete brand style guide
3. **Content Strategy** - Optional AI-generated calendar, topics, and campaigns
4. **Video Generation** - Optional AI-powered shorts/reels with voiceover
5. **Review & Publish** - Drafts for approval before going live

---

## 🚀 Features (Roadmap)

Boxes are checked where shipped code + migrations back them; they track
direction, not a claim of end-to-end polish. Two pivots happened as the product
matured (noted inline).

### Phase 1: AI Onboarding ✅

- [x] Clone NebulaKit base
- [x] AI chat interface for brand assessment (the "Brand Architect")
- [x] Brand profile creation (name, colors, voice; versioned fields)
- [x] Public Name Builder delivers five checked names: it streams survivors,
      shows every rejection, and uses bounded feedback-driven retries when a
      required domain is taken. One click remains one hourly quota unit; retry
      rounds are capped from Cloudflare's 50-subrequest request budget, and a
      registry that cannot be verified stops the search rather than being
      mistaken for availability.
- [x] Style guide generation (Brand Book generator)
- [x] Save to database (D1)

### Phase 2: Content Strategy ✅ (largely)

- [x] AI content calendar generation (weekly, via a cron trigger)
- [x] Topic/script creation
- [x] Voiceover text generation
- [x] Visual asset planning (AI image generation: FLUX on Workers AI, DALL·E)

### Phase 3: Video Generation Pipeline ✅ (approach pivoted)

- [x] Text-to-speech integration (OpenAI TTS-1 / TTS-1-HD)
- [x] Stock footage/AI image sourcing (AI image generation)
- [x] AI video generation — **Google Veo 3**, which replaced the planned FFmpeg
      composition step (full-clip generation, no FFmpeg runtime to host)
- [ ] Brand template system

### Phase 4: Publishing & Scheduling ◐ (targets pivoted)

- [x] Publishing integrations — **Dev.to** and **LinkedIn** (free APIs), chosen
      over the planned YouTube/TikTok video targets
- [x] Cron scheduling (Cloudflare cron trigger; video schedules)
- [ ] Background job queue — not used: Cloudflare Pages can't run queue
      consumers, so cron + `waitUntil` cover background work instead
- [ ] Additional platforms (YouTube / TikTok / Instagram)

### Phase 5: Review Dashboard ◐

- [x] Video preview UI (per-brand list + streaming status)
- [x] Edit/regenerate controls (media revisions + history)
- [x] Publish management (draft → publish through the publishers above)
- [ ] Unified review dashboard across all content types

### Phase 6: Accounts & Plans ◐

- [x] Sign up with email and password, or GitHub/Discord OAuth
- [x] Free (Starter) plan enforced server-side: monthly AI allowances, storage,
      seats, and the capabilities the pricing page reserves for paid tiers
- [x] Usage visible on the profile page and at `GET /api/account/usage`
- [ ] Billing — a plan is currently changed by writing `users.plan`

See [docs/PLANS_AND_LIMITS.md](docs/PLANS_AND_LIMITS.md) before touching anything
that spends money on a user's behalf.

---

## 🛠️ Tech Stack

- **Framework:** SvelteKit 2
- **Runtime:** Cloudflare Workers
- **Database:** Cloudflare D1
- **Storage:** Cloudflare R2 (media assets)
- **Queues:** Cloudflare Queues (background jobs)
- **AI:** LLM for content generation
- **Video:** FFmpeg + TTS

Built on [NebulaKit](https://github.com/starspacegroup/NebulaKit)

---

## 🏁 Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Visit http://localhost:4239
```

Full setup instructions (migrations, KV, OAuth, deployment): see
[docs/SETUP.md](docs/SETUP.md).

---

## 🤝 Contribution Workflow

Every repository in the **AmmouraMe** organization follows the same four steps —
`Ammoura-Svelte`, `nabu`, `teaser`, and anything added later. Humans and AI
agents work the same way.

1. **Start from an issue, and claim it.** Work is tracked in GitHub Issues.
   Before writing code, take the issue: assign yourself, or comment that you
   are picking it up. This is what stops two people — or two agents — landing
   on the same work.
2. **Work on a branch.** Never commit to `main`. Cut `feature/<short-name>` for
   new work or `fix/<short-name>` for a bug. Include the issue number when it
   helps: `fix/12-uspto-trademark-check`.
3. **Open a draft PR early.** As soon as there is a first commit, open the pull
   request **as a draft**. Do not wait until the work is done. An early draft
   shows what is in flight, gives CI somewhere to run, and lets reviewers
   comment before the design hardens. Link the issue in the body (`Closes #12`)
   so it closes on merge.
4. **Finish, then mark ready for review.** When the feature or fix is complete
   and the quality gates are green, update the PR description to say what
   actually landed, then take it out of draft and mark it **Ready for review**.

In short: the issue says _what_, the branch holds _how_, the draft PR shows
_progress_, and "ready for review" means _done_.

## 📦 Development

```bash
# Run tests
npm run test

# Check types
npm run check

# Build for production
npm run build

# Deploy to Cloudflare Pages
npm run deploy
```

---

## 🎨 Brand Story

> "Nabu, the Babylonian god of scribes and wisdom, gave humanity the gift of writing. Today, Nabu gives merchants the power to craft and share their message across the digital world."

Part of the Hermes ecosystem — inspired by ancient Babylon's legacy of commerce and communication.

---

## 📄 License

MIT
