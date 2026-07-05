import React from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <LinearProgress>. Determinate fills to `value`%;
// indeterminate runs an animated sweep. Track/bar styling from ui.css.
const LinearProgress = React.forwardRef( function LinearProgress(
	{ variant = 'indeterminate', value = 0, sx, className, ...rest },
	ref
) {
	const r = sxResolve( sx );
	const det = variant === 'determinate';
	return (
		<span
			ref={ ref }
			role="progressbar"
			aria-valuenow={ det ? Math.round( value ) : undefined }
			className={ cx( 'dk-linear', className, r.className ) }
			style={ r.style }
			{ ...rest }
		>
			<span
				className={ cx( 'dk-linear__bar', ! det && 'dk-linear__bar--indeterminate' ) }
				style={ det ? { width: Math.min( 100, Math.max( 0, value ) ) + '%' } : undefined }
			/>
		</span>
	);
} );

export default LinearProgress;
