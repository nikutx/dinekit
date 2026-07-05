import React from 'react';
import { sxResolve, cx } from './sx';
import { tokens } from '../theme';

// Semantic element per MUI's default variant mapping.
const TAG = {
	h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6',
	subtitle1: 'h6', subtitle2: 'h6',
	body1: 'p', body2: 'p',
	button: 'span', caption: 'span', overline: 'span',
};

// The handful of MUI palette color paths the app passes to <Typography color>.
const COLOR = {
	'text.primary': tokens.ink,
	'text.secondary': tokens.muted,
	'primary': tokens.accent,
	'primary.main': tokens.accent,
	'error': tokens.red,
	'error.main': tokens.red,
};

// Text primitive — our drop-in for MUI's <Typography>. Variant styling lives in
// ui.css as .dk-typo--<variant>; per-instance sx still wins via the cascade.
const Typography = React.forwardRef( function Typography(
	{ variant = 'body1', component, color, align, noWrap, gutterBottom, sx, className, children, ...rest },
	ref
) {
	const Comp = component || TAG[ variant ] || 'p';
	const extra = {};
	if ( align ) {
		extra.textAlign = align;
	}
	if ( noWrap ) {
		extra.whiteSpace = 'nowrap';
		extra.overflow = 'hidden';
		extra.textOverflow = 'ellipsis';
	}
	if ( gutterBottom ) {
		extra.marginBottom = '0.35em';
	}
	if ( color ) {
		extra.color = COLOR[ color ] || color;
	}
	const r = sxResolve( { ...extra, ...sx } );
	return (
		<Comp
			ref={ ref }
			className={ cx( 'dk-typo', 'dk-typo--' + variant, className, r.className ) }
			style={ r.style }
			{ ...rest }
		>
			{ children }
		</Comp>
	);
} );

export default Typography;
