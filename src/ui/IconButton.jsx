import React from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <IconButton> — a square, rounded, borderless hit-target
// for a single icon. `edge` is accepted for API parity (negative-margin trim).
const IconButton = React.forwardRef( function IconButton(
	{ size = 'medium', color, edge, disabled, type = 'button', component, sx, className, children, ...rest },
	ref
) {
	const Comp = component || 'button';
	const r = sxResolve( sx );
	const cls = cx(
		'dk-iconbtn',
		size === 'small' && 'dk-iconbtn--sm',
		edge === 'start' && 'dk-iconbtn--edge-start',
		edge === 'end' && 'dk-iconbtn--edge-end',
		className,
		r.className
	);
	const nativeProps = Comp === 'button' ? { type, disabled } : {};
	return (
		<Comp ref={ ref } className={ cls } style={ r.style } { ...nativeProps } { ...rest }>
			{ children }
		</Comp>
	);
} );

export default IconButton;
