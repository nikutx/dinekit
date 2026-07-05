import React, { useState } from 'react';
import { sxResolve, cx } from './sx';

// Our text field — a clean, solid, label-above input (deliberately NOT MUI's
// floating-label look, which read as hollow). The border sits on the wrapper so
// start/end adornments render inside it; `select` renders a native dropdown from
// MenuItem-like children; `multiline` renders a textarea.
const TextField = React.forwardRef( function TextField(
	{
		label, value, onChange, type = 'text', size, multiline, minRows, rows,
		fullWidth, placeholder, select, disabled, required, error, helperText,
		InputProps = {}, InputLabelProps = {}, inputProps = {}, SelectProps = {},
		sx, className, children, defaultValue, ...rest
	},
	ref
) {
	const [ focused, setFocused ] = useState( false );
	const r = sxResolve( sx );
	const innerSx = sxResolve( InputProps.sx );

	const common = {
		className: cx( 'dk-field__input', innerSx.className ),
		style: innerSx.style,
		value,
		defaultValue,
		disabled,
		onChange,
		onFocus: ( e ) => { setFocused( true ); rest.onFocus && rest.onFocus( e ); },
		onBlur: ( e ) => { setFocused( false ); rest.onBlur && rest.onBlur( e ); },
		...inputProps,
	};
	const { onFocus: _f, onBlur: _b, ...restProps } = rest;

	let control;
	if ( select ) {
		control = (
			<select ref={ ref } { ...common } { ...restProps } { ...SelectProps }>
				{ React.Children.map( children, ( c ) =>
					React.isValidElement( c )
						? <option value={ c.props.value }>{ c.props.children }</option>
						: null
				) }
			</select>
		);
	} else if ( multiline ) {
		control = <textarea ref={ ref } rows={ rows || minRows || 3 } placeholder={ placeholder } { ...common } { ...restProps } />;
	} else {
		control = <input ref={ ref } type={ type } placeholder={ placeholder } { ...common } { ...restProps } />;
	}

	// The whole field is a <label> so clicking anywhere in the bordered box (not
	// just the small inner input) focuses/opens the control — no dead padding.
	return (
		<label
			className={ cx(
				'dk-field',
				size === 'small' && 'dk-field--sm',
				fullWidth && 'dk-field--full',
				multiline && 'dk-field--multiline',
				select && 'dk-field--select',
				error && 'dk-field--error',
				disabled && 'dk-field--disabled',
				InputProps.disableUnderline && 'dk-field--bare',
				focused && 'is-focused',
				className,
				r.className
			) }
			style={ r.style }
		>
			{ label && (
				<span className="dk-field__label">
					{ label }{ required ? ' *' : '' }
				</span>
			) }
			<span className="dk-field__wrap">
				{ InputProps.startAdornment }
				{ control }
				{ InputProps.endAdornment }
			</span>
			{ helperText && <span className="dk-field__helper">{ helperText }</span> }
		</label>
	);
} );

export default TextField;
