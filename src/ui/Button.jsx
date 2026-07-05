import React from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <Button>. Variants contained/outlined/text; `color`
// supports the app's error/inherit; startIcon/endIcon render in gap-spaced slots.
// Visual styling lives in ui.css (folded from theme.MuiButton); sx still wins.
const Button = React.forwardRef( function Button(
	{
		variant = 'text', color = 'primary', size = 'medium', startIcon, endIcon,
		fullWidth, disabled, type = 'button', href, component, sx, className, children, ...rest
	},
	ref
) {
	const Comp = component || ( href ? 'a' : 'button' );
	const r = sxResolve( sx );
	const cls = cx(
		'dk-btn',
		'dk-btn--' + variant,
		color !== 'primary' && 'dk-btn--' + color,
		size === 'small' && 'dk-btn--sm',
		fullWidth && 'dk-btn--full',
		disabled && 'dk-btn--disabled',
		className,
		r.className
	);
	const nativeProps = {};
	if ( Comp === 'button' ) {
		nativeProps.type = type;
		nativeProps.disabled = disabled;
	} else if ( href ) {
		nativeProps.href = href;
	}
	return (
		<Comp ref={ ref } className={ cls } style={ r.style } { ...nativeProps } { ...rest }>
			{ startIcon && <span className="dk-btn__icon dk-btn__icon--start">{ startIcon }</span> }
			<span className="dk-btn__label">{ children }</span>
			{ endIcon && <span className="dk-btn__icon dk-btn__icon--end">{ endIcon }</span> }
		</Comp>
	);
} );

export default Button;
