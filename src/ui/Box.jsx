import React from 'react';
import { sxResolve, splitSystem, cx } from './sx';

// The generic styled container — our drop-in for MUI's <Box>. Renders a div by
// default; `component` swaps the element. Bare MUI system props (p, width, gap…)
// are folded into sx, then resolved by our own resolver.
const Box = React.forwardRef( function Box(
	{ sx, className, component, style, ...props },
	ref
) {
	const Comp = component || 'div';
	const split = splitSystem( props, sx );
	const r = sxResolve( split.sx );
	return (
		<Comp
			ref={ ref }
			className={ cx( className, r.className ) || undefined }
			style={ r.style || style ? { ...r.style, ...style } : undefined }
			{ ...split.rest }
		/>
	);
} );

export default Box;
