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

	// Hold onClose in a ref: call sites pass inline arrows, so a new identity every
	// render. Depending on it would re-run the effects below on every parent render
	// — and the initial-focus effect would then yank the caret out of whatever the
	// user is typing in (each keystroke saves, which re-renders the parent).
	const onCloseRef = React.useRef( onClose );
	onCloseRef.current = onClose;

	useEffect( () => {
		if ( ! open ) {
			return;
		}
		const onKey = ( e ) => {
			if ( e.key === 'Escape' && onCloseRef.current ) {
				onCloseRef.current( e, 'escapeKeyDown' );
			}
		};
		document.addEventListener( 'keydown', onKey );
		return () => document.removeEventListener( 'keydown', onKey );
	}, [ open ] );

	// Move initial focus onto the panel only when the drawer opens.
	useEffect( () => {
		if ( open && paperRef.current ) {
			paperRef.current.focus();
		}
	}, [ open ] );

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
