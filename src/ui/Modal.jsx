import React, { useEffect } from 'react';
import Portal from './Portal';
import { sxResolve, cx } from './sx';

// A centered dialog popup — backdrop + card, portalled above everything (incl.
// drawers/menus). Closes on Escape and backdrop click. The child provides its
// own content/chrome; pass sx to size the panel.
const Modal = React.forwardRef( function Modal(
	{ open, onClose, children, closeOnBackdrop = true, sx, className, ...rest },
	ref
) {
	// See Drawer: call sites pass inline arrows, so keep onClose in a ref rather
	// than re-running this effect on every parent render.
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

	if ( ! open ) {
		return null;
	}
	const r = sxResolve( sx );
	return (
		<Portal>
			<div className="dk-modal">
				<div
					className="dk-modal__backdrop"
					onClick={ closeOnBackdrop ? ( e ) => onClose && onClose( e, 'backdropClick' ) : undefined }
				/>
				<div
					ref={ ref }
					role="dialog"
					aria-modal="true"
					className={ cx( 'dk-modal__panel', className, r.className ) }
					style={ r.style }
					{ ...rest }
				>
					{ children }
				</div>
			</div>
		</Portal>
	);
} );

export default Modal;
