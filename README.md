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

### Phase 1: AI Onboarding ✅ (In Progress)

- [x] Clone NebulaKit base
- [ ] AI chat interface for brand assessment
- [ ] Brand profile creation (name, colors, voice)
- [ ] Style guide generation
- [ ] Save to database

### Phase 2: Content Strategy

- [ ] AI content calendar generation
- [ ] Topic/script creation
- [ ] Voiceover text generation
- [ ] Visual asset planning

### Phase 3: Video Generation Pipeline

- [ ] Text-to-speech integration
- [ ] Stock footage/AI image sourcing
- [ ] Video composition (ffmpeg)
- [ ] Brand template system

### Phase 4: Publishing & Scheduling

- [ ] YouTube API (draft uploads)
- [ ] TikTok API integration
- [ ] Background job queue
- [ ] Cron scheduling

### Phase 5: Review Dashboard

- [ ] Video preview UI
- [ ] Edit/regenerate controls
- [ ] Publish management

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

# Visit http://localhost:4277
```

---

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
