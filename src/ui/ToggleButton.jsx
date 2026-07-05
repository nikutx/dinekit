import React from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <ToggleButton>. `selected`/`onClick` are injected by the
// parent ToggleButtonGroup; `value` identifies the option.
const ToggleButton = React.forwardRef( function ToggleButton(
	{ value, selected, onClick, disabled, size, sx, className, children, ...rest },
	ref
) {
	const r = sxResolve( sx );
	return (
		<button
			ref={ ref }
			type="button"
			aria-pressed={ !! selected }
			className={ cx( 'dk-tog', selected && 'is-selected', className, r.className ) }
			style={ r.style }
			onClick={ onClick }
			disabled={ disabled }
			{ ...rest }
		>
			{ children }
		</button>
	);
} );

export default ToggleButton;
