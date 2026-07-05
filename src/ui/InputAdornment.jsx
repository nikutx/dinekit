import React from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <InputAdornment> — a start/end affix beside an input's
// content (e.g. a currency symbol). Positioning is done by the field itself.
const InputAdornment = React.forwardRef( function InputAdornment(
	{ position = 'start', sx, className, children, ...rest },
	ref
) {
	const r = sxResolve( sx );
	return (
		<span
			ref={ ref }
			className={ cx( 'dk-adorn', 'dk-adorn--' + position, className, r.className ) }
			style={ r.style }
			{ ...rest }
		>
			{ children }
		</span>
	);
} );

export default InputAdornment;
