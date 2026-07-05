import React from 'react';
import { sxResolve, cx } from './sx';

// Default severity glyphs (overridable via the `icon` prop; icon={false} hides).
const ICON = { error: '⚠', warning: '⚠', info: 'ℹ', success: '✓' };

// Our drop-in for MUI's <Alert> (standard variant) — a soft tinted callout with
// a leading glyph. Severity colours live in ui.css.
const Alert = React.forwardRef( function Alert(
	{ severity = 'info', icon, onClose, sx, className, children, ...rest },
	ref
) {
	const r = sxResolve( sx );
	const glyph = icon === false ? null : ( icon || ICON[ severity ] );
	return (
		<div
			ref={ ref }
			role="alert"
			className={ cx( 'dk-alert', 'dk-alert--' + severity, className, r.className ) }
			style={ r.style }
			{ ...rest }
		>
			{ glyph && <span className="dk-alert__icon">{ glyph }</span> }
			<div className="dk-alert__msg">{ children }</div>
			{ onClose && (
				<button type="button" className="dk-alert__close" aria-label="Close" onClick={ onClose }>✕</button>
			) }
		</div>
	);
} );

export default Alert;
