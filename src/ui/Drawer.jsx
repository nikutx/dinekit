import React, { useEffect } from 'react';
import Portal from './Portal';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <Drawer> — a backdrop + panel sliding from `anchor`.
// Closes on Escape / backdrop click. We intentionally don't trap focus (the app
// sets disableEnforceFocus so nested popovers keep working), just move initial
// focus onto the panel.
const Drawer = React.forwardRef( function Drawer(
	{ anchor = 'left', open, onClose, children, PaperProps = {}, variant, disableEnforceFocus, sx, className, ...rest },
	ref
) {
	const paperRef = React.useRef( null );

	useEffect( () => {
		if ( ! open ) {
			return;
		}
		const onKey = ( e ) => { if ( e.key === 'Escape' && onClose ) { onClose( e, 'escapeKeyDown' ); } };
		document.addEventListener( 'keydown', onKey );
		if ( paperRef.current ) {
			paperRef.current.focus();
		}
		return () => document.removeEventListener( 'keydown', onKey );
	}, [ open, onClose ] );

	if ( ! open ) {
		return null;
	}
	const r = sxResolve( sx );
	const paper = sxResolve( PaperProps.sx );
	return (
		<Portal>
			<div ref={ ref } className={ cx( 'dk-drawer', className, r.className ) } style={ r.style }>
				<div className="dk-drawer__backdrop" onClick={ ( e ) => onClose && onClose( e, 'backdropClick' ) } />
				<div
					ref={ paperRef }
					role="dialog"
					aria-modal="true"
					tabIndex={ -1 }
					className={ cx( 'dk-drawer__paper', 'dk-drawer__paper--' + anchor, paper.className ) }
					style={ paper.style }
				>
					{ children }
				</div>
			</div>
		</Portal>
	);
} );

export default Drawer;
