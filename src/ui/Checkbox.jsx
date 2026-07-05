import React, { useRef, useEffect, useImperativeHandle } from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <Checkbox> — a native checkbox tinted with the brand
// accent (accessible + compact). `indeterminate` is applied via the DOM prop.
const Checkbox = React.forwardRef( function Checkbox(
	{ checked, onChange, size, disabled, indeterminate, sx, className, ...rest },
	ref
) {
	const inner = useRef( null );
	useImperativeHandle( ref, () => inner.current );
	useEffect( () => {
		if ( inner.current ) {
			inner.current.indeterminate = !! indeterminate;
		}
	}, [ indeterminate ] );
	const r = sxResolve( sx );
	return (
		<input
			ref={ inner }
			type="checkbox"
			checked={ checked }
			onChange={ onChange }
			disabled={ disabled }
			className={ cx( 'dk-checkbox', size === 'small' && 'dk-checkbox--sm', className, r.className ) }
			style={ r.style }
			{ ...rest }
		/>
	);
} );

export default Checkbox;
