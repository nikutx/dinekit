import React, { useEffect } from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <Snackbar> — a fixed-position transient notification.
// Auto-hides after autoHideDuration; renders nothing when closed.
const Snackbar = React.forwardRef( function Snackbar(
	{ open, onClose, autoHideDuration, message, action, anchorOrigin = { vertical: 'bottom', horizontal: 'left' }, sx, className, children, ...rest },
	ref
) {
	useEffect( () => {
		if ( open && autoHideDuration && onClose ) {
			const t = setTimeout( () => onClose( null, 'timeout' ), autoHideDuration );
			return () => clearTimeout( t );
		}
	}, [ open, autoHideDuration, onClose ] );

	if ( ! open ) {
		return null;
	}
	const r = sxResolve( sx );
	return (
		<div
			ref={ ref }
			className={ cx(
				'dk-snackbar',
				'dk-snackbar--v-' + anchorOrigin.vertical,
				'dk-snackbar--h-' + anchorOrigin.horizontal,
				className,
				r.className
			) }
			style={ r.style }
			{ ...rest }
		>
			{ children || (
				<div className="dk-snackbar__content">
					<span className="dk-snackbar__msg">{ message }</span>
					{ action }
				</div>
			) }
		</div>
	);
} );

export default Snackbar;
