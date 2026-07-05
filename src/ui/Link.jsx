import React from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <Link> — a styled anchor. `component` lets it render a
// button for in-app actions.
const Link = React.forwardRef( function Link(
	{ underline = 'hover', component, sx, className, children, ...rest },
	ref
) {
	const Comp = component || 'a';
	const r = sxResolve( sx );
	return (
		<Comp
			ref={ ref }
			className={ cx( 'dk-link', 'dk-link--' + underline, className, r.className ) }
			style={ r.style }
			{ ...rest }
		>
			{ children }
		</Comp>
	);
} );

export default Link;
