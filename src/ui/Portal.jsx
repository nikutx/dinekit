import { createPortal } from 'react-dom';

// Render children into document.body so popovers/drawers escape overflow and
// stacking contexts (they carry their own z-index above the WP admin bar).
export default function Portal( { children } ) {
	if ( typeof document === 'undefined' ) {
		return null;
	}
	return createPortal( children, document.body );
}
