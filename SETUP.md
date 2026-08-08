# NebulaKit Setup Guide

## Prerequisites

- Node.js 18+ installed
- npm
- Cloudflare account (for deployment)
- Wrangler CLI installed: `npm install -g wrangler`

## Installation

### Option 1: Use the GitHub Template (Recommended)

The easiest way to get started is to use the **"Use this template"** button on GitHub:

1. Go to the [NebulaKit repository](https://github.com/starspacegroup/NebulaKit)
2. Click the green **"Use this template"** button
3. Choose one of:
   - **Create a new repository** - Creates your own copy of NebulaKit in your GitHub account
   - **Open in a codespace** - Instantly spin up a cloud development environment
4. If you created a new repository, clone it:

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME
```

### Option 2: Clone the Repository

Alternatively, clone the repository directly:

```bash
git clone https://github.com/starspacegroup/NebulaKit.git
cd NebulaKit
```

## Next Steps

1. Install dependencies:

```bash
npm install
```

2. Configure Cloudflare bindings:
   - Copy `wrangler.toml` and update with your Cloudflare resource IDs
   - Create D1 database: `wrangler d1 create nebulakit-db`
   - Create KV namespace: `wrangler kv:namespace create "KV"`
   - Create R2 bucket: `wrangler r2 bucket create nebulakit-files`
   - Set up Turnstile at https://dash.cloudflare.com/

## Development

Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:4239`

## Building

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Deployment to Cloudflare Pages

1. Authenticate with Wrangler:

```bash
wrangler login
```

2. Deploy to Cloudflare Pages:

```bash
npm run deploy
```

Or connect your GitHub repository to Cloudflare Pages for automatic deployments.

## Cloudflare Configuration

### D1 Database

Apply database migrations:

```bash
# Apply migrations to remote D1
npm run db:migrate

# Apply migrations to local D1 (for development)
npm run db:migrate:local

# Check which migrations have been applied
npm run db:migrate:list
```

D1 automatically tracks which migrations have been applied and skips them on subsequent runs. See `migrations/README.md` for details on creating new migrations.

### KV Namespace

Used for caching and session storage. No additional setup required.

### R2 Bucket

Used for file uploads. Configure CORS if needed:

```json
[
	{
		"AllowedOrigins": ["*"],
		"AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
		"AllowedHeaders": ["*"]
	}
]
```

### Queues

Configure background job processing. Messages are automatically processed by the worker.

### Turnstile

1. Create a Turnstile site at https://dash.cloudflare.com/
2. Configure both the site key and secret key, or leave both absent
3. Partial configuration fails closed

## Environment Variables

Create a `.env` file for local development:

```
SESSION_SECRET=generate-a-random-session-secret
SETUP_SECRET=generate-a-different-bootstrap-secret
TURNSTILE_SITE_KEY=your-site-key
TURNSTILE_SECRET_KEY=your-secret-key
```

For production, set these in Cloudflare Pages settings.

## Project Structure

```
Nabu/
├── src/
│   ├── lib/
│   │   ├── components/     # Reusable UI components
│   │   ├── stores/         # Svelte stores
│   │   ├── server/         # Server-side utilities
│   │   ├── types/          # TypeScript types
│   │   └── utils/          # Utility functions
│   ├── routes/             # SvelteKit routes
│   │   ├── auth/          # Authentication pages
│   │   ├── chat/          # Chat interface
│   │   └── demo/          # Feature demos
│   ├── app.css            # Global styles
│   ├── app.html           # HTML template
│   └── app.d.ts           # Type definitions
├── static/                 # Static assets
├── wrangler.toml          # Cloudflare configuration
└── svelte.config.js       # SvelteKit configuration
```

## Next Steps

- Configure authentication providers in your auth flow
- Connect the chat UI to your LLM API
- Customize the theme system
- Add your database schema and migrations
- Set up CI/CD with GitHub Actions
