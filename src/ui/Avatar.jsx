import React from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <Avatar> — renders an image when `src` is set, otherwise
// its children (initials / an icon). Size + colours come from sx.
const Avatar = React.forwardRef( function Avatar(
	{ variant = 'circular', src, alt, sx, className, children, ...rest },
	ref
) {
	const r = sxResolve( sx );
	const cls = cx( 'dk-avatar', 'dk-avatar--' + variant, className, r.className );
	return (
		<div ref={ ref } className={ cls } style={ r.style } { ...rest }>
			{ src ? <img className="dk-avatar__img" src={ src } alt={ alt || '' } /> : children }
		</div>
	);
} );

export default Avatar;
