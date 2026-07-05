import React from 'react';
import { cx } from './sx';

// Our drop-in for MUI's <Slide> transition. Enough for the app's use (toast
// entry): wraps its child and runs a CSS slide-in from `direction` on mount.
// `unmountOnExit` is honoured by the caller removing the element.
const Slide = React.forwardRef( function Slide(
	{ in: inProp, direction = 'left', children, timeout, mountOnEnter, unmountOnExit, ...rest },
	ref
) {
	if ( unmountOnExit && inProp === false ) {
		return null;
	}
	return (
		<div ref={ ref } className={ cx( 'dk-slide', 'dk-slide--' + direction ) } { ...rest }>
			{ children }
		</div>
	);
} );

export default Slide;
