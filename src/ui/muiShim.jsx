import React from 'react';
import { sxResolve, cx } from './sx';
import { tokens } from '../theme';

// Shim for `@mui/material/utils` (Vite-aliased). `@mui/icons-material` icons are
// `createSvgIcon(<path/>, name)` and import createSvgIcon from here — so aliasing
// this one module lets us keep ALL 83 icon imports unchanged while dropping
// @mui/material + emotion from the bundle. Our icons match MUI's SvgIcon: sized
// by font-size (width/height:1em), coloured by currentColor.

const SIZE = { small: '20px', medium: '24px', large: '35px', inherit: 'inherit' };
const PALETTE = {
	primary: tokens.accent,
	secondary: tokens.violet,
	error: tokens.red,
	success: tokens.green,
	warning: tokens.amber,
	info: tokens.sky,
	disabled: tokens.muted2,
	action: tokens.muted,
};

export function createSvgIcon( pathNode, name ) {
	const Icon = React.forwardRef( function Icon(
		{ sx, fontSize = 'medium', color, htmlColor, titleAccess, className, style, ...props },
		ref
	) {
		const r = sxResolve( sx );
		const fill = htmlColor || ( color && color !== 'inherit' ? PALETTE[ color ] || color : 'currentColor' );
		return (
			<svg
				ref={ ref }
				viewBox="0 0 24 24"
				width="1em"
				height="1em"
				fill={ fill }
				focusable="false"
				aria-hidden={ titleAccess ? undefined : true }
				role={ titleAccess ? 'img' : undefined }
				data-icon={ name }
				className={ cx( 'dk-icon', className, r.className ) }
				style={ { fontSize: SIZE[ fontSize ] || SIZE.medium, ...r.style, ...style } }
				{ ...props }
			>
				{ titleAccess ? <title>{ titleAccess }</title> : null }
				{ pathNode }
			</svg>
		);
	} );
	Icon.muiName = 'SvgIcon';
	return Icon;
}

export default createSvgIcon;
