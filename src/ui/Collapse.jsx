import React from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <Collapse> — animates height open/closed using the
// grid-template-rows 0fr→1fr trick (smooth, no height measuring).
const Collapse = React.forwardRef( function Collapse(
	{ in: inProp, timeout, unmountOnExit, orientation, children, sx, className, ...rest },
	ref
) {
	const r = sxResolve( sx );
	if ( unmountOnExit && ! inProp ) {
		return null;
	}
	return (
		<div
			ref={ ref }
			className={ cx( 'dk-collapse', inProp && 'dk-collapse--in', className, r.className ) }
			style={ r.style }
			{ ...rest }
		>
			<div className="dk-collapse__inner">{ children }</div>
		</div>
	);
} );

export default Collapse;
