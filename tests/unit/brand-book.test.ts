/**
 * Unit tests for the Brand Book HTML generator service.
 */
import { describe, it, expect } from 'vitest';
import { generateBrandBookHtml, brandBookR2Key } from '$lib/services/brand-book';
import type { BrandBookProfile } from '$lib/services/brand-book';

const FULL_PROFILE: BrandBookProfile = {
  id: 'profile-1',
  brand_name: 'Stellar Co',
  tagline: 'Where innovation meets clarity.',
  mission_statement: 'We exist to make complex things simple.',
  primary_color: '#2563eb',
  secondary_color: '#e11d48',
  accent_color: '#f59e0b',
  color_palette: JSON.stringify(['#2563eb', '#e11d48', '#f59e0b', '#10b981']),
  background_color: '#f8fafc',
  surface_color: '#f1f5f9',
  text_color: '#0f172a',
  text_secondary_color: '#475569',
  border_color: '#e2e8f0',
  typography_heading: 'Playfair Display',
  typography_body: 'Inter',
  typography_logo: null,
  logo_url: 'https://example.com/logo.png',
  logo_horizontal_url: null,
  tone_of_voice: 'professional',
  communication_style: 'conversational',
  brand_personality_traits: JSON.stringify(['innovative', 'trustworthy', 'bold']),
  target_audience: 'Software teams at growing companies',
  value_proposition: 'We reduce complexity so teams can ship faster.',
  unique_selling_points: JSON.stringify(['5-minute setup', 'No vendor lock-in', 'Real-time insights']),
  brand_values: JSON.stringify(['Transparency', 'Reliability', 'Simplicity']),
  brand_archetype: 'sage',
  industry: 'Technology'
};

const MINIMAL_PROFILE: BrandBookProfile = {
  id: 'profile-min',
  brand_name: 'Minimal Brand',
  tagline: null,
  mission_statement: null,
  primary_color: null,
  secondary_color: null,
  accent_color: null,
  color_palette: null,
  background_color: null,
  surface_color: null,
  text_color: null,
  text_secondary_color: null,
  border_color: null,
  typography_heading: null,
  typography_body: null,
  typography_logo: null,
  logo_url: null,
  logo_horizontal_url: null,
  tone_of_voice: null,
  communication_style: null,
  brand_personality_traits: null,
  target_audience: null,
  value_proposition: null,
  unique_selling_points: null,
  brand_values: null,
  brand_archetype: null,
  industry: null
};

describe('generateBrandBookHtml — light mode', () => {
  let html: string;
  beforeAll(() => {
    html = generateBrandBookHtml(FULL_PROFILE, 'light');
  });

  it('returns a valid HTML document', () => {
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('</html>');
  });

  it('includes Google Fonts import', () => {
    expect(html).toContain('fonts.googleapis.com');
    expect(html).toContain('Sacramento');
    expect(html).toContain('Fraunces');
    expect(html).toContain('Inter');
  });

  it('includes print CSS directives', () => {
    expect(html).toContain('@page');
    expect(html).toContain('size: letter');
    expect(html).toContain('-webkit-print-color-adjust: exact');
    expect(html).toContain('print-color-adjust: exact');
  });

  it('includes brand name', () => {
    expect(html).toContain('Stellar Co');
  });

  it('includes tagline on cover', () => {
    expect(html).toContain('Where innovation meets clarity.');
  });

  it('includes logo img tag when logo_url is set', () => {
    expect(html).toContain('<img class="cover-logo"');
    expect(html).toContain('https://example.com/logo.png');
  });

  it('includes primary color in CSS variables', () => {
    expect(html).toContain('#2563eb');
  });

  it('includes secondary color', () => {
    expect(html).toContain('#e11d48');
  });

  it('includes accent color', () => {
    expect(html).toContain('#f59e0b');
  });

  it('includes custom heading font', () => {
    expect(html).toContain('Playfair Display');
  });

  it('includes color palette page with color chips', () => {
    expect(html).toContain('chip-swatch');
    expect(html).toContain('chip-hex');
    expect(html).toContain('Color Palette');
  });

  it('includes typography page', () => {
    expect(html).toContain('Typography');
    expect(html).toContain('type-specimen');
    expect(html).toContain('Display &amp; Headings');
  });

  it('includes voice and tone section', () => {
    expect(html).toContain('Voice &amp; Tone');
    expect(html).toContain('voice-card');
    expect(html).toContain('voice-avoid');
    expect(html).toContain('voice-prefer');
  });

  it('includes content strategy section', () => {
    expect(html).toContain('Content Strategy');
    expect(html).toContain('strategy-card');
  });

  it('includes divider pages with numeral ghost text', () => {
    expect(html).toContain('divider-numeral');
    expect(html).toContain('divider-orbit');
  });

  it('includes star field elements on cover', () => {
    expect(html).toContain('cover-stars');
  });

  it('includes personality traits as tags', () => {
    expect(html).toContain('innovative');
    expect(html).toContain('trustworthy');
  });

  it('includes unique selling points in strategy', () => {
    expect(html).toContain('5-minute setup');
    expect(html).toContain('No vendor lock-in');
  });

  it('includes brand archetype with description', () => {
    expect(html).toContain('Sage');
    expect(html).toContain('Knowledge-first');
  });

  it('includes mission statement as pull quote', () => {
    expect(html).toContain('pull-quote');
    expect(html).toContain('We exist to make complex things simple.');
  });

  it('includes print hint overlay', () => {
    expect(html).toContain('print-hint');
    expect(html).toContain('Save as PDF');
  });
});

describe('generateBrandBookHtml — dark mode', () => {
  let html: string;
  beforeAll(() => {
    html = generateBrandBookHtml(FULL_PROFILE, 'dark');
  });

  it('includes Dark Mode label on cover', () => {
    expect(html).toContain('Dark Mode');
  });

  it('uses darker background derived from primary', () => {
    // Dark mode derives a near-black background from primary
    expect(html).toContain('--color-bg:');
  });

  it('still includes brand name', () => {
    expect(html).toContain('Stellar Co');
  });
});

describe('generateBrandBookHtml — minimal profile (null fields)', () => {
  let html: string;
  beforeAll(() => {
    html = generateBrandBookHtml(MINIMAL_PROFILE, 'light');
  });

  it('generates without errors', () => {
    expect(html).toBeTruthy();
    expect(html).toContain('<!doctype html>');
  });

  it('uses brand name', () => {
    expect(html).toContain('Minimal Brand');
  });

  it('shows initial placeholder when no logo_url', () => {
    expect(html).toContain('cover-logo-placeholder');
    expect(html).toContain('M'); // first letter of "Minimal Brand"
  });

  it('falls back to default fonts (Fraunces + Inter)', () => {
    expect(html).toContain("'Fraunces'");
    expect(html).toContain("'Inter'");
  });

  it('falls back to default primary color', () => {
    expect(html).toContain('#4b2d76');
  });

  it('generates voice cards with defaults', () => {
    expect(html).toContain('voice-card');
    expect(html).toContain('voice-avoid');
  });
});

describe('brandBookR2Key', () => {
  it('returns correct key for light mode', () => {
    expect(brandBookR2Key('profile-abc', 'light')).toBe('brand-books/profile-abc/light.html');
  });

  it('returns correct key for dark mode', () => {
    expect(brandBookR2Key('profile-abc', 'dark')).toBe('brand-books/profile-abc/dark.html');
  });

  it('uses profile ID verbatim', () => {
    const key = brandBookR2Key('my-brand-01', 'light');
    expect(key).toContain('my-brand-01');
  });
});

describe('HTML safety — XSS escaping', () => {
  it('escapes special characters in brand name', () => {
    const profile = { ...MINIMAL_PROFILE, brand_name: '<script>alert(1)</script>' };
    const html = generateBrandBookHtml(profile, 'light');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes angle brackets in tagline so no executable img tag appears', () => {
    const profile = { ...MINIMAL_PROFILE, tagline: '"><img src=x onerror=alert(1)>' };
    const html = generateBrandBookHtml(profile, 'light');
    // The < and > are escaped — no unescaped <img> tag can execute
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});
