import React, { useEffect } from 'react';
import Portal from './Portal';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <Menu> — a popover list anchored to `anchorEl`, honouring
// anchorOrigin/transformOrigin for placement. Closes on Escape or backdrop click.
const Menu = React.forwardRef( function Menu(
	{
		anchorEl, open, onClose, children,
		anchorOrigin = { vertical: 'bottom', horizontal: 'left' },
		transformOrigin = { vertical: 'top', horizontal: 'left' },
		MenuListProps, PaperProps = {}, sx, className, ...rest
	},
	ref
) {
	useEffect( () => {
		if ( ! open ) {
			return;
		}
		const onKey = ( e ) => { if ( e.key === 'Escape' && onClose ) { onClose( e, 'escapeKeyDown' ); } };
		document.addEventListener( 'keydown', onKey );
		return () => document.removeEventListener( 'keydown', onKey );
	}, [ open, onClose ] );

	if ( ! open || ! anchorEl || ! anchorEl.getBoundingClientRect ) {
		return null;
	}
	const rect = anchorEl.getBoundingClientRect();
	const top = ( anchorOrigin.vertical === 'bottom' ? rect.bottom : anchorOrigin.vertical === 'center' ? rect.top + rect.height / 2 : rect.top );
	const left = ( anchorOrigin.horizontal === 'right' ? rect.right : anchorOrigin.horizontal === 'center' ? rect.left + rect.width / 2 : rect.left );
	const tx = transformOrigin.horizontal === 'right' ? '-100%' : transformOrigin.horizontal === 'center' ? '-50%' : '0';
	const ty = transformOrigin.vertical === 'bottom' ? '-100%' : transformOrigin.vertical === 'center' ? '-50%' : '0';
	const r = sxResolve( sx );
	const paper = sxResolve( PaperProps.sx );

	return (
		<Portal>
			<div className="dk-menu-backdrop" onClick={ ( e ) => onClose && onClose( e, 'backdropClick' ) } />
			<ul
				ref={ ref }
				role="menu"
				className={ cx( 'dk-menu__paper', className, r.className, paper.className ) }
				style={ { position: 'fixed', top: top + 'px', left: left + 'px', transform: `translate(${ tx }, ${ ty })`, ...r.style, ...paper.style } }
				{ ...rest }
			>
				{ children }
			</ul>
		</Portal>
	);
} );

export default Menu;
