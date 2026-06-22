/**
 * Dev.to Publishing Integration
 * Uses the free Dev.to API: https://dev.to/api/articles
 *
 * API key is stored in KV under: devto:apikey:{userId}
 */

const DEVTO_BASE = 'https://dev.to/api';

export interface DevToArticleInput {
  title: string;
  body: string;
  tags?: string[];
  published?: boolean;
}

export interface DevToArticle {
  id: number;
  title: string;
  url: string;
  published: boolean;
  published_at: string | null;
  body_markdown: string;
  tag_list: string[];
}

export interface DevToPublishResult {
  id: number;
  url: string;
  published: boolean;
}

export async function publishArticle(
  apiKey: string,
  article: DevToArticleInput
): Promise<DevToPublishResult> {
  const res = await fetch(`${DEVTO_BASE}/articles`, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      article: {
        title: article.title,
        body_markdown: article.body,
        tags: article.tags ?? [],
        published: article.published ?? false
      }
    })
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Dev.to API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as DevToArticle;
  return {
    id: data.id,
    url: data.url,
    published: data.published
  };
}

export async function getArticles(apiKey: string): Promise<DevToArticle[]> {
  const res = await fetch(`${DEVTO_BASE}/articles/me/all?per_page=30`, {
    headers: { 'api-key': apiKey }
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Dev.to API error ${res.status}: ${err}`);
  }

  return (await res.json()) as DevToArticle[];
}

export function devtoKvKey(userId: string): string {
  return `devto:apikey:${userId}`;
}
