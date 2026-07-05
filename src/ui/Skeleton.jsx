import React from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <Skeleton> — a shimmering placeholder. `width`/`height`
// accept numbers (px) or CSS strings; variant sets the shape.
const Skeleton = React.forwardRef( function Skeleton(
	{ variant = 'text', width, height, animation = 'pulse', sx, className, ...rest },
	ref
) {
	const r = sxResolve( sx );
	const dims = {};
	if ( width != null ) {
		dims.width = typeof width === 'number' ? width + 'px' : width;
	}
	if ( height != null ) {
		dims.height = typeof height === 'number' ? height + 'px' : height;
	}
	const cls = cx(
		'dk-skel',
		'dk-skel--' + variant,
		animation && 'dk-skel--' + animation,
		className,
		r.className
	);
	return <span ref={ ref } className={ cls } style={ { ...dims, ...r.style } } { ...rest } />;
} );

export default Skeleton;
