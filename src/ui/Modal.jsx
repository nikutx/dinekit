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
	useEffect( () => {
		if ( ! open ) {
			return;
		}
		const onKey = ( e ) => { if ( e.key === 'Escape' && onClose ) { onClose( e, 'escapeKeyDown' ); } };
		document.addEventListener( 'keydown', onKey );
		return () => document.removeEventListener( 'keydown', onKey );
	}, [ open, onClose ] );

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
