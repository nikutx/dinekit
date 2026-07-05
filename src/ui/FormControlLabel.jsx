import React from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <FormControlLabel> — pairs a control (Switch/Checkbox)
// with a clickable text label.
const FormControlLabel = React.forwardRef( function FormControlLabel(
	{ control, label, labelPlacement = 'end', disabled, sx, className, ...rest },
	ref
) {
	const r = sxResolve( sx );
	return (
		<label
			ref={ ref }
			className={ cx( 'dk-fcl', 'dk-fcl--' + labelPlacement, disabled && 'dk-fcl--disabled', className, r.className ) }
			style={ r.style }
			{ ...rest }
		>
			{ control }
			<span className="dk-fcl__label">{ label }</span>
		</label>
	);
} );

export default FormControlLabel;
