import { createTheme } from '@mui/material/styles';

// WLU hub design language: slate palette, flat white cards, hairline #e2e8f0
// borders, blue accent, sentence-case bold buttons, soft shadows.
export const tokens = {
	ink: '#0f172a',
	ink2: '#334155',
	muted: '#64748b',
	muted2: '#94a3b8',
	bg: '#f8fafc',
	surface: '#ffffff',
	soft: '#f1f5f9',
	border: '#e2e8f0',
	border2: '#cbd5e1',
	accent: '#3b82f6',
	accentDark: '#2563eb',
	accentSoft: '#dbeafe',
	green: '#16a34a',
	greenSoft: '#dcfce7',
	amber: '#d97706',
	amberSoft: '#fef3c7',
	red: '#dc2626',
	redSoft: '#fee2e2',
	sidebar: '#0f172a',
	sidebarText: '#cbd5e1',
	sidebarHover: '#1e293b',
};

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
	shape: { borderRadius: 12 },
	typography: {
		fontFamily:
			'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
		button: { textTransform: 'none', fontWeight: 700 },
		h5: { fontWeight: 800, color: tokens.ink },
		h6: { fontWeight: 800, color: tokens.ink },
		subtitle2: { fontWeight: 700 },
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
				root: { borderRadius: 10, paddingInline: 16 },
			},
		},
		MuiChip: {
			styleOverrides: {
				root: { fontWeight: 700, borderRadius: 8 },
			},
		},
		MuiTextField: {
			defaultProps: { size: 'small' },
		},
		MuiTooltip: {
			styleOverrides: {
				tooltip: {
					backgroundColor: tokens.ink,
					fontSize: 12,
					fontWeight: 600,
					borderRadius: 8,
				},
			},
		},
	},
} );

export default theme;
