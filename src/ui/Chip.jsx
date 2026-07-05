import React from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <Chip>. Neutral by default (the app tints most chips via
// sx); supports label/children, an optional leading icon, delete and click.
const Chip = React.forwardRef( function Chip(
	{ label, size, icon, onDelete, onClick, disabled, sx, className, children, ...rest },
	ref
) {
	const r = sxResolve( sx );
	const cls = cx(
		'dk-chip',
		size === 'small' && 'dk-chip--sm',
		onClick && 'dk-chip--clickable',
		className,
		r.className
	);
	return (
		<div ref={ ref } className={ cls } style={ r.style } onClick={ disabled ? undefined : onClick } { ...rest }>
			{ icon && <span className="dk-chip__icon">{ icon }</span> }
			<span className="dk-chip__label">{ label != null ? label : children }</span>
			{ onDelete && (
				<button
					type="button"
					className="dk-chip__delete"
					aria-label="Remove"
					onClick={ ( e ) => { e.stopPropagation(); onDelete( e ); } }
				>
					✕
				</button>
			) }
		</div>
	);
} );

export default Chip;
