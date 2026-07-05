import React, { useState, useRef, useCallback } from 'react';
import Portal from './Portal';
import { cx } from './sx';

// Position the tip (fixed/viewport coords) for a placement around the anchor rect.
function place( rect, placement ) {
	const gap = 8;
	switch ( placement ) {
		case 'top':
			return { top: rect.top - gap, left: rect.left + rect.width / 2, transform: 'translate(-50%, -100%)' };
		case 'right':
			return { top: rect.top + rect.height / 2, left: rect.right + gap, transform: 'translate(0, -50%)' };
		case 'left':
			return { top: rect.top + rect.height / 2, left: rect.left - gap, transform: 'translate(-100%, -50%)' };
		default: // bottom
			return { top: rect.bottom + gap, left: rect.left + rect.width / 2, transform: 'translate(-50%, 0)' };
	}
}

// Our drop-in for MUI's <Tooltip> — shows `title` on hover/focus, rendered in a
// portal. No-op when title is empty. Wraps a single element child.
const Tooltip = React.forwardRef( function Tooltip(
	{ title, placement = 'bottom', arrow, enterDelay, disableInteractive, children, ...rest },
	ref
) {
	const [ pos, setPos ] = useState( null );
	const anchorRef = useRef( null );

	const show = useCallback( () => {
		const el = anchorRef.current;
		if ( el && el.getBoundingClientRect ) {
			setPos( place( el.getBoundingClientRect(), placement ) );
		}
	}, [ placement ] );
	const hide = useCallback( () => setPos( null ), [] );

	if ( title == null || title === '' || ! React.isValidElement( children ) ) {
		return children || null;
	}

	const child = React.cloneElement( children, {
		ref: ( node ) => {
			anchorRef.current = node;
			const r = children.ref;
			if ( typeof r === 'function' ) {
				r( node );
			} else if ( r ) {
				r.current = node;
			}
		},
		onMouseEnter: ( e ) => { show(); children.props.onMouseEnter && children.props.onMouseEnter( e ); },
		onMouseLeave: ( e ) => { hide(); children.props.onMouseLeave && children.props.onMouseLeave( e ); },
		onFocus: ( e ) => { show(); children.props.onFocus && children.props.onFocus( e ); },
		onBlur: ( e ) => { hide(); children.props.onBlur && children.props.onBlur( e ); },
	} );

	return (
		<>
			{ child }
			{ pos && (
				<Portal>
					<div
						role="tooltip"
						className={ cx( 'dk-tooltip', 'dk-tooltip--' + placement ) }
						style={ { position: 'fixed', top: pos.top, left: pos.left, transform: pos.transform } }
						{ ...rest }
					>
						{ title }
						{ arrow && <span className="dk-tooltip__arrow" /> }
					</div>
				</Portal>
			) }
		</>
	);
} );

export default Tooltip;
