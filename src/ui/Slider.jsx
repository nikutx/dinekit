import React from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <Slider> — a native range input tinted with the accent.
// Reports as MUI does: onChange(event, value:number).
const Slider = React.forwardRef( function Slider(
	{ value, onChange, min = 0, max = 100, step = 1, disabled, size, sx, className, ...rest },
	ref
) {
	const r = sxResolve( sx );
	return (
		<input
			ref={ ref }
			type="range"
			className={ cx( 'dk-slider', size === 'small' && 'dk-slider--sm', className, r.className ) }
			style={ r.style }
			value={ value }
			min={ min }
			max={ max }
			step={ step }
			disabled={ disabled }
			onChange={ ( e ) => onChange && onChange( e, Number( e.target.value ) ) }
			{ ...rest }
		/>
	);
} );

export default Slider;
