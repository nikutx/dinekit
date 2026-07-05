import React from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <Divider> — a hairline rule. Vertical dividers render a
// div (with role=separator) so they work inside flex rows.
const Divider = React.forwardRef( function Divider(
	{ orientation = 'horizontal', flexItem, sx, className, ...rest },
	ref
) {
	const r = sxResolve( sx );
	const cls = cx(
		'dk-divider',
		orientation === 'vertical' && 'dk-divider--vertical',
		flexItem && 'dk-divider--flex',
		className,
		r.className
	);
	if ( orientation === 'vertical' ) {
		return <div ref={ ref } role="separator" aria-orientation="vertical" className={ cls } style={ r.style } { ...rest } />;
	}
	return <hr ref={ ref } className={ cls } style={ r.style } { ...rest } />;
} );

export default Divider;
