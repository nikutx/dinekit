
// Design language v2 — distinctive premium SaaS (Linear/Stripe craft, warm
// hospitality touches): cool-neutral canvas, white surfaces, hairline borders,
// ONE deep-indigo brand accent + a small categorical tint set for icon chips,
// avatars and charts. Token NAMES are unchanged so the whole app re-skins from
// here. Typeface: bundled InterVariable (enqueued by PHP, no CDN).
export const tokens = {
	ink: '#18181b',
	ink2: '#3f3f46',
	muted: '#71717a',
	muted2: '#a1a1aa',
	bg: '#f9f9fb',
	surface: '#ffffff',
	soft: '#f4f4f5',
	border: '#e8e8ec',
	border2: '#d9d9e0',
	// Brand accent — deep indigo.
	accent: '#4f46e5',
	accentDark: '#4338ca',
	accentSoft: '#eef2ff',
	// Semantics.
	green: '#059669',
	greenSoft: '#ecfdf5',
	amber: '#d97706',
	amberSoft: '#fffbeb',
	red: '#e11d48',
	redSoft: '#fff1f2',
	// Categorical tints (icon chips, avatars, chart series) — never for status.
	violet: '#7c3aed',
	violetSoft: '#f5f3ff',
	sky: '#0284c7',
	skySoft: '#f0f9ff',
	// Shell.
	sidebar: '#101014',
	sidebarText: '#9d9da8',
	sidebarHover: '#1c1c22',
	// Elevation: sm = resting cards, md = hover lift, shadow = floating layers.
	shadow: '0 12px 32px rgba(24, 24, 27, 0.12), 0 2px 8px rgba(24, 24, 27, 0.06)',
	shadowMd: '0 4px 14px rgba(24, 24, 27, 0.07), 0 1px 3px rgba(24, 24, 27, 0.05)',
	shadowSm: '0 1px 2px rgba(24, 24, 27, 0.05)',
};

// One content width everywhere — pages never vary this.
export const CONTENT_WIDTH = 1120;

// Categorical fg/bg pairs for avatars, icon chips and chart series.
export const TINTS = [
	{ fg: tokens.accent, bg: tokens.accentSoft },
	{ fg: tokens.violet, bg: tokens.violetSoft },
	{ fg: tokens.sky, bg: tokens.skySoft },
	{ fg: tokens.green, bg: tokens.greenSoft },
	{ fg: tokens.amber, bg: tokens.amberSoft },
	{ fg: tokens.red, bg: tokens.redSoft },
];

// Stable tint for a name/email — used to colour guest avatars consistently.
export function hashTint( str ) {
	let h = 0;
	const s = String( str || '' );
	for ( let i = 0; i < s.length; i++ ) {
		h = ( h * 31 + s.charCodeAt( i ) ) | 0;
	}
	return TINTS[ Math.abs( h ) % TINTS.length ];
}

// Kept for API parity — our ThemeProvider ignores it (components read tokens
// directly). The visual language now lives entirely in tokens + ui.css.
export default { tokens, CONTENT_WIDTH, TINTS };
