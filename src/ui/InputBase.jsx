import React from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <InputBase> — a bare, unstyled input for inline editors
// (rename fields, price rows). Callers style it via sx.
const InputBase = React.forwardRef( function InputBase(
	{ multiline, rows, fullWidth, sx, className, inputProps = {}, ...rest },
	ref
) {
	const r = sxResolve( sx );
	const cls = cx( 'dk-inputbase', fullWidth && 'dk-inputbase--full', className, r.className );
	if ( multiline ) {
		return <textarea ref={ ref } rows={ rows || 3 } className={ cls } style={ r.style } { ...inputProps } { ...rest } />;
	}
	return <input ref={ ref } className={ cls } style={ r.style } { ...inputProps } { ...rest } />;
} );

export default InputBase;
