import React from 'react';

/**
 * Last line of defence: a render crash anywhere in the app used to leave a
 * white screen with no way back. Plain inline styles only — the fallback must
 * render even if the theme/ui layer is what broke.
 */
export default class ErrorBoundary extends React.Component {
	constructor( props ) {
		super( props );
		this.state = { error: null };
	}

	static getDerivedStateFromError( error ) {
		return { error };
	}

	componentDidCatch( error, info ) {
		// eslint-disable-next-line no-console
		console.error( 'DineKit admin crashed:', error, info && info.componentStack );
	}

	render() {
		if ( ! this.state.error ) {
			return this.props.children;
		}
		return (
			<div style={ { maxWidth: 560, margin: '80px auto', padding: '32px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', textAlign: 'center', background: '#fff', border: '1px solid #e6e8ee', borderRadius: 16 } }>
				<div style={ { fontSize: 40, marginBottom: 8 } }>😵</div>
				<h2 style={ { margin: '0 0 8px', fontSize: 20, color: '#0f172a' } }>Something went wrong</h2>
				<p style={ { margin: '0 0 20px', fontSize: 14, color: '#64748b', lineHeight: 1.5 } }>
					That’s a bug on our side, not yours — nothing was lost. Reload to carry on where you were.
				</p>
				<button
					onClick={ () => window.location.reload() }
					style={ { fontSize: 14, fontWeight: 600, color: '#fff', background: '#0f172a', border: 0, borderRadius: 10, padding: '10px 22px', cursor: 'pointer' } }
				>
					Reload the page
				</button>
				<p style={ { margin: '20px 0 0', fontSize: 12, color: '#94a3b8' } }>
					Keeps happening? Tell us via DineKit → Support and paste this: <code style={ { fontSize: 11 } }>{ String( this.state.error && this.state.error.message ) }</code>
				</p>
			</div>
		);
	}
}
