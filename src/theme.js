import { createTheme } from '@mui/material/styles';

// Premium SaaS design language (Linear/Vercel/Stripe): neutral canvas, white
// surfaces, hairline borders (structure), one blue accent used sparingly,
// shadows only for floating things. Token NAMES are unchanged so the whole app
// re-skins from here.
export const tokens = {
	ink: '#171717',
	ink2: '#404040',
	muted: '#666666',
	muted2: '#a1a1a1',
	bg: '#fafafa',
	surface: '#ffffff',
	soft: '#f5f5f5',
	border: '#eaeaea',
	border2: '#dcdcdc',
	accent: '#3b82f6',
	accentDark: '#2563eb',
	accentSoft: '#eff6ff',
	green: '#16a34a',
	greenSoft: '#f0fdf4',
	amber: '#d97706',
	amberSoft: '#fffbeb',
	red: '#dc2626',
	redSoft: '#fef2f2',
	sidebar: '#18181b',
	sidebarText: '#a1a1aa',
	sidebarHover: '#27272a',
	// Elevation for floating surfaces only (menus, popovers, modals).
	shadow: '0 8px 28px rgba(15, 23, 42, 0.10)',
	shadowSm: '0 1px 2px rgba(15, 23, 42, 0.04)',
};

// One content width everywhere — pages never vary this.
export const CONTENT_WIDTH = 1120;

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
		fontFamily:
			'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Helvetica, Arial, sans-serif',
		fontWeightRegular: 400,
		fontWeightMedium: 500,
		fontWeightBold: 600,
		// Page title.
		h5: { fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2, color: tokens.ink },
		// Section heading.
		h6: { fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.25, color: tokens.ink },
		subtitle2: { fontSize: 14, fontWeight: 600, letterSpacing: '-0.005em' },
		body1: { fontSize: 14, lineHeight: 1.55 },
		body2: { fontSize: 13, lineHeight: 1.5 },
		button: { textTransform: 'none', fontWeight: 500 },
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
					fontWeight: 500,
				},
				contained: { boxShadow: 'none', '&:hover': { boxShadow: 'none' } },
				outlined: { borderColor: tokens.border2 },
			},
		},
		MuiOutlinedInput: {
			styleOverrides: {
				root: {
					borderRadius: 8,
					backgroundColor: tokens.surface,
					'& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.border },
					'&:hover .MuiOutlinedInput-notchedOutline': { borderColor: tokens.border2 },
					'&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: tokens.accent, borderWidth: 1 },
					'&.Mui-focused': { boxShadow: `0 0 0 3px ${ tokens.accent }22` },
				},
			},
		},
		MuiTextField: {
			defaultProps: { size: 'small' },
		},
		MuiChip: {
			styleOverrides: {
				root: { fontWeight: 600, borderRadius: 6 },
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
