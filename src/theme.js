import { createTheme } from '@mui/material/styles';

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

const FONT_STACK =
	'"InterVariable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const theme = createTheme( {
	palette: {
		mode: 'light',
		primary: { main: tokens.accent, dark: tokens.accentDark },
		success: { main: tokens.green },
		warning: { main: tokens.amber },
		error: { main: tokens.red },
		background: { default: tokens.bg, paper: tokens.surface },
		text: { primary: tokens.ink, secondary: tokens.muted },
		divider: tokens.border,
	},
	shape: { borderRadius: 8 },
	typography: {
		fontFamily: FONT_STACK,
		fontWeightRegular: 400,
		fontWeightMedium: 500,
		fontWeightBold: 600,
		// Page title.
		h5: { fontSize: 23, fontWeight: 650, letterSpacing: '-0.022em', lineHeight: 1.2, color: tokens.ink },
		// Section heading.
		h6: { fontSize: 17, fontWeight: 600, letterSpacing: '-0.014em', lineHeight: 1.25, color: tokens.ink },
		subtitle2: { fontSize: 14, fontWeight: 600, letterSpacing: '-0.006em' },
		body1: { fontSize: 14, lineHeight: 1.55 },
		body2: { fontSize: 13, lineHeight: 1.5 },
		button: { textTransform: 'none', fontWeight: 550 },
	},
	components: {
		MuiPaper: {
			defaultProps: { elevation: 0 },
			styleOverrides: {
				root: { backgroundImage: 'none' },
			},
		},
		MuiButton: {
			defaultProps: { disableElevation: true },
			styleOverrides: {
				root: {
					borderRadius: 8,
					paddingInline: 16,
					minHeight: 36,
					fontWeight: 550,
					letterSpacing: '-0.006em',
				},
				// Primary: subtle top highlight + soft indigo glow — the "pressed
				// from glass" premium button.
				contained: {
					background: `linear-gradient(180deg, #5a52ea 0%, ${ tokens.accent } 100%)`,
					boxShadow: 'inset 0 1px 0 rgba(255,255,255,.14), 0 1px 2.5px rgba(79,70,229,.36)',
					'&:hover': {
						background: `linear-gradient(180deg, ${ tokens.accent } 0%, ${ tokens.accentDark } 100%)`,
						boxShadow: 'inset 0 1px 0 rgba(255,255,255,.10), 0 1px 2px rgba(79,70,229,.30)',
					},
				},
				outlined: {
					borderColor: tokens.border2,
					backgroundColor: tokens.surface,
					color: tokens.ink2,
					'&:hover': { borderColor: tokens.muted2, backgroundColor: tokens.soft },
				},
			},
		},
		MuiIconButton: {
			styleOverrides: {
				root: { borderRadius: 8 },
			},
		},
		MuiOutlinedInput: {
			styleOverrides: {
				root: {
					borderRadius: 8,
					backgroundColor: tokens.surface,
					transition: 'box-shadow .15s ease',
					'& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.border },
					'&:hover .MuiOutlinedInput-notchedOutline': { borderColor: tokens.border2 },
					'&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: tokens.accent, borderWidth: 1 },
					'&.Mui-focused': { boxShadow: `0 0 0 3px ${ tokens.accent }1f` },
				},
			},
		},
		MuiTextField: {
			defaultProps: { size: 'small' },
		},
		// Quieter, more legible field labels + helper text — the outlined-input
		// density read as noisy. Labels sit muted/calm; helper text is small and
		// unobtrusive so packed setting grids stay tidy.
		MuiInputLabel: {
			styleOverrides: {
				root: {
					color: tokens.muted,
					fontWeight: 500,
					'&.Mui-focused': { color: tokens.accent },
				},
			},
		},
		MuiFormHelperText: {
			styleOverrides: {
				root: {
					marginLeft: 2,
					marginTop: 3,
					fontSize: 11.5,
					lineHeight: 1.35,
					color: tokens.muted2,
				},
			},
		},
		MuiChip: {
			styleOverrides: {
				root: { fontWeight: 550, borderRadius: 6 },
			},
		},
		// Segmented-control look for every ToggleButtonGroup (range pickers,
		// filters): soft track, selected = white pill with a whisper of shadow.
		MuiToggleButtonGroup: {
			styleOverrides: {
				root: {
					backgroundColor: tokens.soft,
					borderRadius: 9,
					padding: 3,
					gap: 2,
				},
			},
		},
		MuiToggleButton: {
			styleOverrides: {
				root: {
					border: 'none',
					borderRadius: '7px !important',
					textTransform: 'none',
					fontWeight: 550,
					fontSize: 13,
					color: tokens.muted,
					paddingBlock: 4,
					'&:hover': { backgroundColor: 'rgba(24,24,27,.04)' },
					'&.Mui-selected': {
						backgroundColor: tokens.surface,
						color: tokens.ink,
						boxShadow: tokens.shadowSm,
						'&:hover': { backgroundColor: tokens.surface },
					},
				},
			},
		},
		MuiSwitch: {
			styleOverrides: {
				root: { padding: 6 },
				thumb: { boxShadow: '0 1px 2px rgba(24,24,27,.2)' },
				track: { borderRadius: 999, opacity: 1, backgroundColor: tokens.border2 },
				switchBase: {
					'&.Mui-checked + .MuiSwitch-track': { backgroundColor: tokens.accent, opacity: 1 },
				},
			},
		},
		MuiLinearProgress: {
			styleOverrides: {
				root: { borderRadius: 999, backgroundColor: tokens.soft },
				bar: { borderRadius: 999 },
			},
		},
		MuiMenu: {
			styleOverrides: {
				paper: { borderRadius: 12, border: `1px solid ${ tokens.border }`, boxShadow: tokens.shadow },
			},
		},
		MuiPopover: {
			styleOverrides: {
				paper: { borderRadius: 12, boxShadow: tokens.shadow },
			},
		},
		MuiDialog: {
			styleOverrides: {
				paper: { borderRadius: 16, boxShadow: tokens.shadow },
			},
		},
		MuiDrawer: {
			styleOverrides: {
				paper: { boxShadow: tokens.shadow },
			},
		},
		MuiTooltip: {
			styleOverrides: {
				tooltip: {
					backgroundColor: tokens.ink,
					fontSize: 12,
					fontWeight: 500,
					borderRadius: 8,
					padding: '6px 10px',
				},
			},
		},
	},
} );

export default theme;
