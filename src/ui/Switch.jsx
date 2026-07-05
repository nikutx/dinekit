import React from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <Switch> — a track+thumb toggle over a real checkbox
// input (keyboard + screen-reader friendly). Styling from ui.css / theme.
const Switch = React.forwardRef( function Switch(
	{ checked, onChange, size, disabled, sx, className, ...rest },
	ref
) {
	const r = sxResolve( sx );
	return (
		<span className={ cx( 'dk-switch', size === 'small' && 'dk-switch--sm', disabled && 'dk-switch--disabled', className, r.className ) } style={ r.style }>
			<input
				ref={ ref }
				type="checkbox"
				className="dk-switch__input"
				role="switch"
				checked={ checked }
				onChange={ onChange }
				disabled={ disabled }
				{ ...rest }
			/>
			<span className="dk-switch__track" aria-hidden="true" />
			<span className="dk-switch__thumb" aria-hidden="true" />
		</span>
	);
} );

export default Switch;
