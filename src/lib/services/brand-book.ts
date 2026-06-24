/**
 * Brand Book HTML Generator
 *
 * Generates a self-contained HTML file styled as a multi-page brand book.
 * Designed to be opened in a browser and printed to PDF via Cmd+P / Save as PDF.
 *
 * Structure mirrors the AgapeVerse brand guide approach:
 *   cover → color palette → typography → voice & tone → content strategy
 *
 * Each "page" is an 8.5×11in div with @page { size: letter; margin: 0; }.
 * -webkit-print-color-adjust: exact ensures full color fidelity when printing.
 */

export interface BrandBookProfile {
  id: string;
  brand_name: string | null;
  tagline: string | null;
  mission_statement: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  color_palette: string | null;
  background_color: string | null;
  surface_color: string | null;
  text_color: string | null;
  text_secondary_color: string | null;
  border_color: string | null;
  typography_heading: string | null;
  typography_body: string | null;
  typography_logo: string | null;
  logo_url: string | null;
  logo_horizontal_url: string | null;
  tone_of_voice: string | null;
  communication_style: string | null;
  brand_personality_traits: string | null;
  target_audience: string | null;
  value_proposition: string | null;
  unique_selling_points: string | null;
  brand_values: string | null;
  brand_archetype: string | null;
  industry: string | null;
}

// ─── Color Utilities ──────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').slice(0, 6);
  const n = parseInt(h.padEnd(6, '0'), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  );
}

function mixHex(colorHex: string, targetHex: string, targetAmount: number): string {
  const [cr, cg, cb] = hexToRgb(colorHex);
  const [tr, tg, tb] = hexToRgb(targetHex);
  return rgbToHex(
    cr + (tr - cr) * targetAmount,
    cg + (tg - cg) * targetAmount,
    cb + (tb - cb) * targetAmount
  );
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function textFor(hex: string): string {
  return luminance(hex) > 0.5 ? '#1a1320' : '#f5f2fa';
}

function rgbStr(hex: string): string {
  return hexToRgb(hex).join(', ');
}

function safeHex(val: string | null | undefined, fallback: string): string {
  if (!val) return fallback;
  const trimmed = val.trim();
  return /^#[0-9a-fA-F]{3,6}$/.test(trimmed) ? trimmed : fallback;
}

// ─── Palette Construction ─────────────────────────────────────────

interface Palette {
  bg: string;
  bg2: string;
  surface: string;
  text: string;
  text_secondary: string;
  border: string;
  primary: string;
  primary_rgb: string;
  secondary: string;
  accent: string;
}

function buildPalette(p: BrandBookProfile, mode: 'light' | 'dark'): Palette {
  const primary = safeHex(p.primary_color, '#4b2d76');
  const secondary = safeHex(p.secondary_color, '#e7406a');
  const accent = safeHex(p.accent_color, '#f1b527');

  if (mode === 'light') {
    return {
      bg: safeHex(p.background_color, mixHex(primary, '#ffffff', 0.93)),
      bg2: mixHex(primary, '#ffffff', 0.87),
      surface: safeHex(p.surface_color, mixHex(primary, '#ffffff', 0.89)),
      text: safeHex(p.text_color, mixHex(primary, '#000000', 0.18)),
      text_secondary: safeHex(p.text_secondary_color, mixHex(primary, '#000000', 0.48)),
      border: safeHex(p.border_color, mixHex(primary, '#ffffff', 0.76)),
      primary,
      primary_rgb: rgbStr(primary),
      secondary,
      accent
    };
  } else {
    const lightPrimary = mixHex(primary, '#ffffff', 0.4);
    return {
      bg: mixHex(primary, '#000000', 0.88),
      bg2: mixHex(primary, '#000000', 0.82),
      surface: mixHex(primary, '#000000', 0.78),
      text: mixHex(primary, '#ffffff', 0.88),
      text_secondary: mixHex(primary, '#ffffff', 0.62),
      border: mixHex(primary, '#000000', 0.62),
      primary: lightPrimary,
      primary_rgb: rgbStr(lightPrimary),
      secondary,
      accent
    };
  }
}

// ─── JSON Parse Helpers ───────────────────────────────────────────

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

// ─── Star Field ───────────────────────────────────────────────────

const STAR_POSITIONS = [
  { top: '8%', left: '15%', size: 4 },
  { top: '12%', left: '72%', size: 5 },
  { top: '18%', left: '88%', size: 3 },
  { top: '22%', left: '38%', size: 4 },
  { top: '32%', left: '6%', size: 5 },
  { top: '38%', left: '95%', size: 3 },
  { top: '45%', left: '62%', size: 4 },
  { top: '52%', left: '20%', size: 3 },
  { top: '60%', left: '78%', size: 5 },
  { top: '68%', left: '48%', size: 3 },
  { top: '72%', left: '10%', size: 4 },
  { top: '80%', left: '88%', size: 4 },
  { top: '85%', left: '32%', size: 3 },
  { top: '90%', left: '55%', size: 5 },
  { top: '92%', left: '78%', size: 3 },
  { top: '15%', left: '52%', size: 4 },
  { top: '42%', left: '82%', size: 3 },
  { top: '28%', left: '28%', size: 5 },
];

function starsHtml(): string {
  return STAR_POSITIONS.map(
    (s) =>
      `<span style="top:${s.top};left:${s.left};width:${s.size}px;height:${s.size}px;"></span>`
  ).join('\n    ');
}

// ─── Voice & Tone Card Logic ──────────────────────────────────────

interface VoiceCard {
  situation: string;
  avoid: string;
  prefer: string;
}

function buildVoiceCards(p: BrandBookProfile): VoiceCard[] {
  const tone = (p.tone_of_voice ?? 'professional').toLowerCase();
  const style = (p.communication_style ?? 'conversational').toLowerCase();
  const name = p.brand_name ?? 'our brand';

  const isProfessional = tone.includes('professional') || tone.includes('authoritative') || tone.includes('formal');
  const isPlayful = tone.includes('playful') || tone.includes('fun') || tone.includes('casual') || tone.includes('witty');
  const isBold = tone.includes('bold') || tone.includes('confident') || tone.includes('direct');
  const isWarm = tone.includes('warm') || tone.includes('friendly') || tone.includes('empathetic') || tone.includes('caring');

  const preferStyle = isPlayful
    ? 'upbeat and engaging'
    : isProfessional
      ? 'clear and authoritative'
      : isBold
        ? 'direct and confident'
        : 'warm and genuine';

  return [
    {
      situation: 'Introducing a feature or product',
      avoid: `"We are excited to announce the new ${name} feature that allows users to..."`,
      prefer: isPlayful
        ? `"Here's something you'll love — [Feature] means you can finally [outcome] without [friction]."`
        : `"[Feature] gives you [specific outcome]. Here's how it works."`
    },
    {
      situation: 'Writing an error or failure message',
      avoid: '"An error has occurred. Please try again later. Error code: 500."',
      prefer: isWarm
        ? '"Something went wrong on our end — we\'re on it. Please try again in a moment."'
        : isProfessional
          ? '"We\'re experiencing a technical issue. Please retry or contact support if this persists."'
          : '"That didn\'t work. Try again, or reach out if it keeps happening."'
    },
    {
      situation: 'Welcoming a new customer or subscriber',
      avoid: '"Thank you for signing up. Your account has been created successfully."',
      prefer: isPlayful
        ? `"Welcome aboard! You're officially part of the ${name} family — let's make something great."`
        : isWarm
          ? `"We're glad you're here. ${name} is all about [value] — and that starts right now."`
          : `"You're in. Here's what to do first to get the most out of ${name}."`
    },
    {
      situation: 'Talking about your pricing or value',
      avoid: '"Our premium plan offers enterprise-grade features at a competitive price point."',
      prefer: isBold
        ? '"Straight talk: [price]. That gets you [concrete value]. No fluff."'
        : isPlayful
          ? '"For less than your daily coffee, you get [feature list]. Not bad."'
          : `"${name} [price] includes everything you need to [achieve goal] — no surprises."`
    },
    {
      situation: 'Handling a customer complaint',
      avoid: '"We apologize for any inconvenience this may have caused you."',
      prefer: isWarm
        ? `"That's genuinely frustrating, and we're sorry. Let's fix this together — here's what we'll do:"`
        : `"We got this wrong. Here's what happened, and here's how we're making it right:"`
    }
  ];
}

// ─── Google Fonts URL ─────────────────────────────────────────────

function buildFontsUrl(headingFont: string | null, bodyFont: string | null): string {
  const families: string[] = [
    'Sacramento',
    'Caveat:wght@400;600',
    'Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900',
    'Inter:wght@400;500;600;700;800'
  ];

  const addIfCustom = (font: string | null, defaults: string[]) => {
    if (!font) return;
    const clean = font.replace(/['"]/g, '').trim();
    if (!defaults.some((d) => d.toLowerCase().startsWith(clean.toLowerCase()))) {
      const encoded = clean.replace(/ /g, '+');
      families.push(`${encoded}:wght@400;600;700`);
    }
  };

  addIfCustom(headingFont, ['Fraunces', 'fraunces']);
  addIfCustom(bodyFont, ['Inter', 'inter']);

  const familyParams = families.map((f) => `family=${f}`).join('&');
  return `https://fonts.googleapis.com/css2?${familyParams}&display=swap`;
}

// ─── CSS ──────────────────────────────────────────────────────────

function buildCss(c: Palette, headingFont: string | null, bodyFont: string | null, fontsUrl: string): string {
  const display = headingFont ? `'${headingFont}', 'Fraunces', serif` : "'Fraunces', serif";
  const body = bodyFont ? `'${bodyFont}', 'Inter', sans-serif` : "'Inter', sans-serif";

  return `
@import url("${fontsUrl}");

:root {
  --color-primary: ${c.primary};
  --color-primary-rgb: ${c.primary_rgb};
  --color-secondary: ${c.secondary};
  --color-accent: ${c.accent};
  --color-bg: ${c.bg};
  --color-bg2: ${c.bg2};
  --color-surface: ${c.surface};
  --color-text: ${c.text};
  --color-text-secondary: ${c.text_secondary};
  --color-border: ${c.border};
  --font-display: ${display};
  --font-sans: ${body};
}

* { box-sizing: border-box; margin: 0; padding: 0; }

@page { size: letter; margin: 0; }

html, body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.page {
  position: relative;
  width: 8.5in;
  min-height: 11in;
  page-break-after: always;
  break-after: page;
  overflow: hidden;
  background: var(--color-bg);
}

/* ── Cover ─────────────────────────────────────────── */
.cover-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: linear-gradient(160deg, var(--color-bg) 0%, var(--color-bg2) 55%, var(--color-bg) 100%);
}
.cover-glow {
  position: absolute;
  top: 18%;
  left: 50%;
  width: 9in;
  height: 9in;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle, rgba(var(--color-primary-rgb), 0.22) 0%, rgba(var(--color-primary-rgb), 0) 60%);
  pointer-events: none;
}
.cover-stars span {
  position: absolute;
  border-radius: 50%;
  background: var(--color-accent);
  opacity: 0.55;
  box-shadow: 0 0 6px rgba(var(--color-primary-rgb), 0.5);
}
.cover-body { position: relative; z-index: 1; padding: 0 0.75in; }
.cover-logo {
  width: 120px;
  height: 120px;
  object-fit: contain;
  margin-bottom: 1.5rem;
}
.cover-logo-placeholder {
  width: 120px;
  height: 120px;
  border-radius: 24px;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1.5rem;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 2.8rem;
  color: ${textFor(c.primary)};
}
.cover-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 4.2rem;
  letter-spacing: 0.005em;
  margin: 0 0 0.35rem;
  color: var(--color-primary);
  line-height: 1.05;
}
.cover-subtitle {
  font-family: var(--font-sans);
  font-weight: 600;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  font-size: 0.9rem;
  color: var(--color-text-secondary);
  margin: 0;
}
.cover-tagline {
  font-family: 'Sacramento', cursive;
  font-size: 2.4rem;
  color: var(--color-secondary);
  margin: 1.5rem 0 0;
}
.cover-footer {
  position: absolute;
  bottom: 0.85in;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 0.72rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

/* ── Showcase (color / typography) ──────────────────── */
.showcase-page { padding: 1in 0.95in; }
.eyebrow {
  font-family: var(--font-sans);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
  border-bottom: 2px solid var(--color-accent);
  display: inline-block;
  padding-bottom: 0.5rem;
  margin-bottom: 1.5rem;
}
.showcase-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 2.6rem;
  color: var(--color-primary);
  margin: 0 0 0.75rem;
}
.showcase-intro {
  font-size: 1rem;
  color: var(--color-text-secondary);
  max-width: 34rem;
  margin: 0 0 2.25rem;
  line-height: 1.7;
}

/* ── Color grid ─────────────────────────────────────── */
.color-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.85rem;
}
.chip-swatch {
  border-radius: 14px;
  height: 1.55in;
  display: flex;
  align-items: flex-end;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--color-border);
}
.chip-hex {
  font-family: var(--font-sans);
  font-weight: 700;
  font-size: 0.75rem;
  letter-spacing: 0.04em;
}
.chip-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.95rem;
  margin-top: 0.5rem;
  color: var(--color-primary);
}
.chip-role { font-size: 0.72rem; color: var(--color-text-secondary); }

/* ── Typography ─────────────────────────────────────── */
.type-specimen {
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-surface);
  padding: 1.5rem 1.75rem;
  margin-bottom: 1.25rem;
}
.type-specimen-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
}
.type-specimen.small { padding: 1.25rem 1.5rem; }
.type-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.type-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.15rem;
  color: var(--color-primary);
}
.type-role {
  font-size: 0.7rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}
.type-display {
  font-size: 3.25rem;
  line-height: 1;
  color: var(--color-text);
  margin-bottom: 0.5rem;
}
.type-sample { font-size: 1.15rem; color: var(--color-text); }
.type-sample.muted { color: var(--color-text-secondary); margin-top: 0.35rem; }

/* ── Divider pages ──────────────────────────────────── */
.divider-page {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 1in 0.95in;
  background: linear-gradient(135deg, var(--color-bg) 0%, var(--color-bg2) 100%);
}
.divider-orbit {
  position: absolute;
  bottom: -4.5in;
  right: -3.5in;
  width: 9in;
  height: 9in;
  border: 2px solid rgba(var(--color-primary-rgb), 0.12);
  border-radius: 50%;
  z-index: 0;
}
.divider-orbit::before {
  content: "";
  position: absolute;
  top: 50%;
  left: -3px;
  width: 8px;
  height: 8px;
  margin-top: -4px;
  border-radius: 50%;
  background: var(--color-accent);
  opacity: 0.7;
}
.divider-numeral {
  position: absolute;
  top: -1.1in;
  right: -0.6in;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 22rem;
  line-height: 1;
  color: rgba(var(--color-primary-rgb), 0.08);
  z-index: 0;
  user-select: none;
}
.divider-body {
  position: relative;
  z-index: 1;
  max-width: 5.6in;
  margin-top: 1in;
}
.divider-mark {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  margin-bottom: 1.25rem;
}
.divider-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 3.4rem;
  line-height: 1.05;
  color: var(--color-primary);
  margin: 0 0 0.75rem;
}
.divider-tagline {
  font-family: 'Sacramento', cursive;
  font-size: 1.9rem;
  color: var(--color-secondary);
  margin: 0;
}
.divider-footer { position: relative; z-index: 1; }
.divider-rule {
  width: 2.5in;
  height: 4px;
  background: var(--color-accent);
  border-radius: 2px;
  margin-bottom: 1rem;
}
.divider-label {
  font-family: var(--font-sans);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
  margin-bottom: 0.75rem;
}
.divider-list { list-style: none; max-width: 4.2in; }
.divider-list li {
  font-family: var(--font-display);
  font-size: 1.05rem;
  color: var(--color-text);
  padding: 0.4rem 0;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
}
.divider-list li:last-child { border-bottom: none; }
.divider-item-mark {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-secondary);
  margin-right: 0.85rem;
  flex-shrink: 0;
}

/* ── Content pages ──────────────────────────────────── */
.content-page { padding: 1in 0.95in; font-size: 15px; line-height: 1.65; }
.content-heading {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.9rem;
  color: var(--color-primary);
  margin: 0 0 1.25rem;
}
.content-body h3 {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1.2rem;
  color: var(--color-secondary);
  margin-top: 1.6rem;
  margin-bottom: 0.5rem;
}
.content-body p { margin: 0 0 0.9rem; }
.content-body strong { font-weight: 700; color: var(--color-text); }
.content-body ul, .content-body ol { margin: 0 0 0.9rem; padding-left: 1.3rem; }
.content-body li { margin-bottom: 0.4rem; }
.pull-quote {
  font-family: var(--font-display);
  font-style: italic;
  font-weight: 400;
  font-size: 1.65rem;
  line-height: 1.45;
  color: var(--color-primary);
  border-left: 4px solid var(--color-accent);
  padding: 0.25rem 0 0.25rem 1.25rem;
  margin: 1.5rem 0 2rem;
}
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.5rem 0 1.25rem;
}
.tag {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  background: rgba(var(--color-primary-rgb), 0.12);
  color: var(--color-primary);
  border: 1px solid rgba(var(--color-primary-rgb), 0.22);
}

/* ── Voice & tone cards ─────────────────────────────── */
.voice-cards { display: flex; flex-direction: column; gap: 0.85rem; margin: 0.5rem 0 1.2rem; }
.voice-card {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 0.85rem 1rem;
  background: var(--color-surface);
  break-inside: avoid;
}
.voice-situation {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--color-primary);
  margin-bottom: 0.6rem;
}
.voice-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.voice-cell { border-radius: 8px; padding: 0.5rem 0.65rem; background: var(--color-bg); }
.voice-cell p { margin: 0.3rem 0 0; font-size: 0.85em; }
.voice-label { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; }
.voice-avoid .voice-label { color: var(--color-secondary); }
.voice-avoid p { color: var(--color-text-secondary); text-decoration: line-through; text-decoration-color: rgba(var(--color-primary-rgb), 0.35); }
.voice-prefer .voice-label { color: var(--color-accent); filter: brightness(0.75); }
.voice-prefer p { color: var(--color-text); font-weight: 500; }

/* ── Content strategy ───────────────────────────────── */
.strategy-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 0.5rem 0 1.25rem; }
.strategy-card {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem 1.1rem;
  background: var(--color-surface);
}
.strategy-card-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--color-primary);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: 0.72rem;
  margin-bottom: 0.5rem;
}
.strategy-card-body {
  font-size: 0.87rem;
  color: var(--color-text);
  line-height: 1.55;
}

/* ── Print hint overlay (hidden when printing) ───────── */
.print-hint {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: var(--color-primary);
  color: ${textFor(c.primary)};
  border-radius: 12px;
  padding: 0.75rem 1.25rem;
  font-family: var(--font-sans);
  font-size: 0.85rem;
  font-weight: 600;
  box-shadow: 0 4px 24px rgba(0,0,0,0.18);
  z-index: 9999;
  max-width: 260px;
  line-height: 1.4;
}
@media print { .print-hint { display: none; } }
`;
}

// ─── Page: Cover ──────────────────────────────────────

function coverPage(p: BrandBookProfile, mode: 'light' | 'dark'): string {
  const name = p.brand_name ?? 'Brand Book';
  const initial = escHtml(name.charAt(0).toUpperCase());
  const logoHtml = p.logo_url
    ? `<img class="cover-logo" src="${escHtml(p.logo_url)}" alt="${escHtml(name)} logo" />`
    : `<div class="cover-logo-placeholder">${initial}</div>`;

  return `
<div class="page cover-page">
  <div class="cover-glow"></div>
  <div class="cover-stars">
    ${starsHtml()}
  </div>
  <div class="cover-body">
    ${logoHtml}
    <h1 class="cover-title">${escHtml(name)}</h1>
    <p class="cover-subtitle">Brand Style Guide</p>
    ${p.tagline ? `<p class="cover-tagline">${escHtml(p.tagline)}</p>` : ''}
  </div>
  <div class="cover-footer">
    <span>Edition ${new Date().toISOString().slice(0, 7).replace('-', '.')} &middot; ${mode === 'dark' ? 'Dark' : 'Light'} Mode</span>
  </div>
</div>`;
}

// ─── Page: Color Palette ──────────────────────────────

function colorPage(p: BrandBookProfile, c: Palette, mode: 'light' | 'dark'): string {
  const name = p.brand_name ?? 'Brand';
  const label = mode === 'light' ? 'Light Mode' : 'Dark Mode';

  const swatches: { name: string; role: string; hex: string }[] = [
    { name: 'Primary', role: 'Brand identity color', hex: c.primary },
    { name: 'Secondary', role: 'Accent & emphasis', hex: c.secondary },
    { name: 'Accent', role: 'Highlights & CTAs', hex: c.accent },
    { name: 'Background', role: 'Page background', hex: c.bg },
    { name: 'Surface', role: 'Cards & panels', hex: c.surface },
    { name: 'Text', role: 'Primary text', hex: c.text },
    { name: 'Text Secondary', role: 'Captions & labels', hex: c.text_secondary },
    { name: 'Border', role: 'Borders & dividers', hex: c.border }
  ];

  // Add extra colors from color_palette if available
  const extraColors = parseJsonArray(p.color_palette);
  if (extraColors.length) {
    extraColors.slice(0, 4).forEach((hex, i) => {
      const safe = safeHex(hex, '');
      if (safe) swatches.push({ name: `Color ${i + 5}`, role: 'Brand palette', hex: safe });
    });
  }

  const chips = swatches
    .slice(0, 8)
    .map(
      (s) => `
    <div class="color-chip">
      <div class="chip-swatch" style="background:${s.hex};color:${textFor(s.hex)};">
        <span class="chip-hex">${s.hex}</span>
      </div>
      <div class="chip-name">${escHtml(s.name)}</div>
      <div class="chip-role">${escHtml(s.role)}</div>
    </div>`
    )
    .join('');

  return `
<div class="page showcase-page">
  <div class="eyebrow">${escHtml(name)} Brand Style Guide</div>
  <h2 class="showcase-title">Color Palette &mdash; ${label}</h2>
  <p class="showcase-intro">The ${escHtml(name)} color system is built around a core primary hue,
  supported by a secondary emotional color and an accent for highlights and calls to action.
  Every color in this palette has been chosen to reinforce brand recognition across all touchpoints.</p>
  <div class="color-grid">
    ${chips}
  </div>
</div>`;
}

// ─── Page: Typography ─────────────────────────────────

function typographyPage(p: BrandBookProfile): string {
  const name = p.brand_name ?? 'Brand';
  const headingFont = p.typography_heading ?? 'Fraunces';
  const bodyFont = p.typography_body ?? 'Inter';
  const logoFont = p.typography_logo;
  const sample = p.tagline ?? `${name} — built with purpose.`;

  return `
<div class="page showcase-page">
  <div class="eyebrow">${escHtml(name)} Brand Style Guide</div>
  <h2 class="showcase-title">Typography</h2>
  <p class="showcase-intro">Consistent typography builds trust and reinforces personality.
  The ${escHtml(name)} type system pairs a distinctive display face for headlines with a clean,
  legible body face for all running text.</p>

  <div class="type-specimen">
    <div class="type-meta">
      <div class="type-name">${escHtml(headingFont)}</div>
      <div class="type-role">Display &amp; Headings</div>
    </div>
    <div class="type-display" style="font-family:'${escHtml(headingFont)}',serif;font-weight:700;">Aa Bb Cc</div>
    <div class="type-sample" style="font-family:'${escHtml(headingFont)}',serif;font-weight:600;">${escHtml(sample)}</div>
    <div class="type-sample muted" style="font-family:'${escHtml(headingFont)}',serif;font-style:italic;font-weight:400;">The story behind every great brand starts here.</div>
  </div>

  <div class="type-specimen">
    <div class="type-meta">
      <div class="type-name">${escHtml(bodyFont)}</div>
      <div class="type-role">Body &amp; UI</div>
    </div>
    <div class="type-display" style="font-family:'${escHtml(bodyFont)}',sans-serif;font-weight:700;">Aa Bb Cc</div>
    <div class="type-sample" style="font-family:'${escHtml(bodyFont)}',sans-serif;">Clear, confident prose that keeps readers engaged and informed.</div>
  </div>

  <div class="type-specimen-row">
    ${
      logoFont
        ? `<div class="type-specimen small">
      <div class="type-meta">
        <div class="type-name">${escHtml(logoFont)}</div>
        <div class="type-role">Logo / Brand mark</div>
      </div>
      <div class="type-sample" style="font-family:'${escHtml(logoFont)}',serif;font-size:1.6rem;font-weight:600;">${escHtml(name)}</div>
    </div>`
        : `<div class="type-specimen small">
      <div class="type-meta">
        <div class="type-name">Caveat</div>
        <div class="type-role">Script &amp; accents</div>
      </div>
      <div class="type-sample" style="font-family:'Caveat',cursive;font-size:1.6rem;font-weight:600;">a note, just for you</div>
    </div>`
    }
    <div class="type-specimen small">
      <div class="type-meta">
        <div class="type-name">Sacramento</div>
        <div class="type-role">Tagline &amp; signatures</div>
      </div>
      <div class="type-sample" style="font-family:'Sacramento',cursive;font-size:1.8rem;">${escHtml(p.tagline ?? 'with all my heart')}</div>
    </div>
  </div>
</div>`;
}

// ─── Page: Divider ────────────────────────────────────

function dividerPage(
  number: string,
  title: string,
  tagline: string,
  items: string[]
): string {
  const itemsHtml = items
    .map((item) => `<li><span class="divider-item-mark"></span>${escHtml(item)}</li>`)
    .join('');

  return `
<div class="page divider-page">
  <div class="divider-orbit"></div>
  <div class="divider-numeral">${number.padStart(2, '0')}</div>
  <div class="divider-body">
    <div class="divider-mark"></div>
    <h1 class="divider-title">${escHtml(title)}</h1>
    <p class="divider-tagline">${escHtml(tagline)}</p>
  </div>
  <div class="divider-footer">
    <div class="divider-rule"></div>
    <div class="divider-label">In this section</div>
    <ul class="divider-list">${itemsHtml}</ul>
  </div>
</div>`;
}

// ─── Page: Voice & Tone ───────────────────────────────

function voiceTonePage(p: BrandBookProfile): string {
  const name = p.brand_name ?? 'Brand';
  const tone = p.tone_of_voice ?? 'professional';
  const style = p.communication_style ?? 'conversational';
  const traits = parseJsonArray(p.brand_personality_traits);
  const cards = buildVoiceCards(p);

  const cardsHtml = cards
    .map(
      (card) => `
    <div class="voice-card">
      <div class="voice-situation">${escHtml(card.situation)}</div>
      <div class="voice-pair">
        <div class="voice-cell voice-avoid">
          <span class="voice-label">Avoid</span>
          <p>${escHtml(card.avoid)}</p>
        </div>
        <div class="voice-cell voice-prefer">
          <span class="voice-label">Prefer</span>
          <p>${escHtml(card.prefer)}</p>
        </div>
      </div>
    </div>`
    )
    .join('');

  return `
<div class="page content-page">
  <div class="eyebrow">${escHtml(name)} Brand Style Guide &middot; Voice &amp; Tone</div>
  <h2 class="content-heading">Voice &amp; Tone</h2>
  <div class="content-body">
    <p><strong>${escHtml(name)}</strong> speaks in a ${escHtml(tone)}, ${escHtml(style)} voice.
    Every piece of communication should feel unmistakably ${escHtml(name)}.</p>
    ${
      traits.length
        ? `<div class="tag-row">${traits.map((t) => `<span class="tag">${escHtml(t)}</span>`).join('')}</div>`
        : ''
    }
    <div class="voice-cards">
      ${cardsHtml}
    </div>
  </div>
</div>`;
}

// ─── Page: Content Strategy ───────────────────────────

function contentStrategyPage(p: BrandBookProfile): string {
  const name = p.brand_name ?? 'Brand';
  const usps = parseJsonArray(p.unique_selling_points);
  const values = parseJsonArray(p.brand_values);
  const audience = p.target_audience ?? 'our target audience';
  const archetype = p.brand_archetype;

  const pillars = usps.length
    ? usps.slice(0, 4)
    : values.length
      ? values.slice(0, 4)
      : ['Brand authority', 'Audience connection', 'Product value', 'Community'];

  const cards = [
    {
      title: 'Content Pillars',
      body: pillars.map((u) => `• ${escHtml(u)}`).join('<br />')
    },
    {
      title: 'Target Audience',
      body: typeof audience === 'string' && audience.length > 0
        ? escHtml(audience.slice(0, 250))
        : 'Primary customers and stakeholders'
    },
    {
      title: 'Brand Archetype',
      body: archetype
        ? `<strong>${escHtml(archetype.charAt(0).toUpperCase() + archetype.slice(1))}</strong><br />${escHtml(archetypeDescription(archetype))}`
        : 'Authentic and purposeful'
    },
    {
      title: 'Value Proposition',
      body: p.value_proposition
        ? escHtml(p.value_proposition.slice(0, 200))
        : `${escHtml(name)} helps our audience achieve meaningful outcomes through focused, intentional work.`
    }
  ];

  const cardsHtml = cards
    .map(
      (card) => `
    <div class="strategy-card">
      <div class="strategy-card-title">${escHtml(card.title)}</div>
      <div class="strategy-card-body">${card.body}</div>
    </div>`
    )
    .join('');

  const missionHtml = p.mission_statement
    ? `<div class="pull-quote">${escHtml(p.mission_statement)}</div>`
    : '';

  return `
<div class="page content-page">
  <div class="eyebrow">${escHtml(name)} Brand Style Guide &middot; Content Strategy</div>
  <h2 class="content-heading">Content Strategy</h2>
  <div class="content-body">
    ${missionHtml}
    <div class="strategy-grid">
      ${cardsHtml}
    </div>
    <h3>Channel Guidance</h3>
    <p>Adapt the ${escHtml(name)} voice to each channel while keeping the core personality consistent:</p>
    <ul>
      <li><strong>Long-form (articles, docs):</strong> Lead with insight, use subheadings, include concrete examples.</li>
      <li><strong>Social (LinkedIn, Twitter/X):</strong> Hook in the first sentence, keep it scannable, one strong idea per post.</li>
      <li><strong>Email:</strong> Conversational subject lines, clear single CTA, respect reader time.</li>
      <li><strong>Video scripts:</strong> Write for the ear — short sentences, active voice, natural pauses.</li>
    </ul>
  </div>
</div>`;
}

// ─── Helpers ──────────────────────────────────────────

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function archetypeDescription(archetype: string): string {
  const map: Record<string, string> = {
    hero: 'Courageous, results-driven, inspires others to overcome challenges.',
    sage: 'Knowledge-first, analytical, builds trust through expertise.',
    explorer: 'Adventurous, independent, champions discovery and freedom.',
    creator: 'Imaginative, expressive, values originality above all.',
    ruler: 'Authoritative, structured, creates order and reliability.',
    caregiver: 'Nurturing, empathetic, puts customer needs first.',
    everyman: 'Relatable, humble, speaks to universal human experiences.',
    jester: 'Playful, irreverent, finds joy in the everyday.',
    lover: 'Passionate, devoted, creates emotional connection.',
    magician: 'Transformative, visionary, turns the ordinary extraordinary.',
    outlaw: 'Disruptive, bold, challenges the status quo.',
    innocent: 'Optimistic, honest, believes in inherent goodness.'
  };
  return map[archetype.toLowerCase()] ?? 'Distinctive and purpose-driven.';
}

// ─── Main Export ──────────────────────────────────────

export function generateBrandBookHtml(profile: BrandBookProfile, mode: 'light' | 'dark'): string {
  const c = buildPalette(profile, mode);
  const headingFont = profile.typography_heading;
  const bodyFont = profile.typography_body;
  const fontsUrl = buildFontsUrl(headingFont, bodyFont);
  const css = buildCss(c, headingFont, bodyFont, fontsUrl);
  const name = profile.brand_name ?? 'Brand Book';

  const pages = [
    coverPage(profile, mode),
    colorPage(profile, c, mode),
    typographyPage(profile),
    dividerPage('3', 'Voice & Tone', `How ${name} speaks to the world.`, [
      'Tone descriptors',
      'Avoid vs. Prefer',
      'Channel guidance'
    ]),
    voiceTonePage(profile),
    dividerPage('4', 'Content Strategy', `The blueprint for consistent, compelling content.`, [
      'Content pillars',
      'Target audience',
      'Channel guidance'
    ]),
    contentStrategyPage(profile)
  ];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(name)} — Brand Style Guide</title>
<style>
${css}
</style>
</head>
<body>
${pages.join('\n')}
<div class="print-hint">
  <strong>To save as PDF:</strong><br>
  File &rarr; Print &rarr; Destination: Save as PDF
</div>
</body>
</html>`;
}

export function brandBookR2Key(profileId: string, mode: 'light' | 'dark'): string {
  return `brand-books/${profileId}/${mode}.html`;
}
