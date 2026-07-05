import React from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <MenuItem>. In a Menu/Select it renders an option row;
// inside our TextField `select` it is read for its value/children and converted
// to a native <option>, so this render is only used in the popover context.
const MenuItem = React.forwardRef( function MenuItem(
	{ value, selected, disabled, onClick, dense, sx, className, children, ...rest },
	ref
) {
	const r = sxResolve( sx );
	return (
		<li
			ref={ ref }
			role="option"
			aria-selected={ !! selected }
			aria-disabled={ disabled || undefined }
			data-value={ value }
			className={ cx( 'dk-menuitem', selected && 'is-selected', disabled && 'is-disabled', dense && 'dk-menuitem--dense', className, r.className ) }
			style={ r.style }
			onClick={ disabled ? undefined : onClick }
			{ ...rest }
		>
			{ children }
		</li>
	);
} );

export default MenuItem;
