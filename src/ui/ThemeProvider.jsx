// Our drop-in for MUI's <ThemeProvider>. Our components read design tokens
// directly (via theme.js + scoped CSS), so no runtime theme context is needed —
// this just renders its children. Kept so main.jsx's JSX is unchanged.
export default function ThemeProvider( { children } ) {
	return children;
}
