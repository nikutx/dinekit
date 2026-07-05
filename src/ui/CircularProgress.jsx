import React from 'react';
import { sxResolve, cx } from './sx';
import { tokens } from '../theme';

// Our drop-in for MUI's <CircularProgress>. Indeterminate by default (rotating
// arc); `variant="determinate"` draws `value`%. `color="inherit"` uses
// currentColor (for spinners inside coloured buttons).
const CircularProgress = React.forwardRef( function CircularProgress(
	{ size = 40, color = 'primary', thickness = 3.6, variant = 'indeterminate', value = 0, sx, className, ...rest },
	ref
) {
	const r = sxResolve( sx );
	const s = typeof size === 'number' ? size : parseInt( size, 10 ) || 40;
	const stroke = color === 'inherit' ? 'currentColor' : tokens.accent;
	const RADIUS = 20.2;
	const CIRC = 2 * Math.PI * RADIUS;
	const circleStyle = variant === 'determinate'
		? { strokeDasharray: CIRC.toFixed( 3 ), strokeDashoffset: ( ( ( 100 - Math.min( 100, Math.max( 0, value ) ) ) / 100 ) * CIRC ).toFixed( 3 ) }
		: undefined;
	return (
		<span
			ref={ ref }
			role="progressbar"
			className={ cx( 'dk-spin', 'dk-spin--' + variant, className, r.className ) }
			style={ { width: s, height: s, ...r.style } }
			{ ...rest }
		>
			<svg className="dk-spin__svg" viewBox="22 22 44 44">
				<circle
					className="dk-spin__circle"
					cx="44"
					cy="44"
					r={ RADIUS }
					fill="none"
					stroke={ stroke }
					strokeWidth={ thickness }
					style={ circleStyle }
				/>
			</svg>
		</span>
	);
} );

export default CircularProgress;
