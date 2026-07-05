// Our drop-in for MUI's <CssBaseline>. The reset/base styles live in index.css
// and ui.css (scoped to #dinekit-root), so this renders nothing — it exists only
// so main.jsx can drop the MUI import without changing its JSX.
export default function CssBaseline() {
	return null;
}
