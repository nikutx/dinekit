import React from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <ListItemIcon> — a fixed-min-width slot for a leading
// icon in a menu/list row.
const ListItemIcon = React.forwardRef( function ListItemIcon(
	{ sx, className, children, ...rest },
	ref
) {
	const r = sxResolve( sx );
	return (
		<span ref={ ref } className={ cx( 'dk-listicon', className, r.className ) } style={ r.style } { ...rest }>
			{ children }
		</span>
	);
} );

export default ListItemIcon;
