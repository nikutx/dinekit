import React, { useState, useRef, useEffect } from 'react';
import Portal from './Portal';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <Select>. Renders a button showing the current value
// (or renderValue), and a portalled listbox of MenuItem children. Reports like
// MUI: onChange({ target: { value } }, child). Closes on select/Escape/outside.
const Select = React.forwardRef( function Select(
	{ value, onChange, size, renderValue, displayEmpty, disabled, fullWidth, children, sx, className, MenuProps, ...rest },
	ref
) {
	const [ open, setOpen ] = useState( false );
	const [ rect, setRect ] = useState( null );
	const btnRef = useRef( null );

	useEffect( () => {
		if ( ! open ) {
			return;
		}
		const onKey = ( e ) => { if ( e.key === 'Escape' ) { setOpen( false ); } };
		document.addEventListener( 'keydown', onKey );
		return () => document.removeEventListener( 'keydown', onKey );
	}, [ open ] );

	const items = React.Children.toArray( children ).filter( React.isValidElement );
	const current = items.find( ( c ) => c.props.value === value );
	const display = renderValue ? renderValue( value ) : ( current ? current.props.children : '' );

	const openMenu = () => {
		if ( disabled ) {
			return;
		}
		if ( btnRef.current ) {
			setRect( btnRef.current.getBoundingClientRect() );
		}
		setOpen( true );
	};
	const choose = ( v ) => {
		setOpen( false );
		if ( onChange ) {
			onChange( { target: { value: v } }, null );
		}
	};

	const r = sxResolve( sx );
	return (
		<>
			<button
				ref={ ( n ) => { btnRef.current = n; if ( typeof ref === 'function' ) ref( n ); else if ( ref ) ref.current = n; } }
				type="button"
				disabled={ disabled }
				aria-haspopup="listbox"
				aria-expanded={ open }
				className={ cx( 'dk-select', size === 'small' && 'dk-select--sm', fullWidth && 'dk-select--full', className, r.className ) }
				style={ r.style }
				onClick={ openMenu }
				{ ...rest }
			>
				<span className="dk-select__value">{ display }</span>
				<svg className="dk-select__arrow" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M7 10l5 5 5-5z" /></svg>
			</button>
			{ open && rect && (
				<Portal>
					<div className="dk-menu-backdrop" onClick={ () => setOpen( false ) } />
					<ul
						role="listbox"
						className="dk-menu__paper dk-select__list"
						style={ { position: 'fixed', top: rect.bottom + 4 + 'px', left: rect.left + 'px', minWidth: rect.width + 'px' } }
					>
						{ items.map( ( c ) => React.cloneElement( c, {
							selected: c.props.value === value,
							onClick: () => choose( c.props.value ),
						} ) ) }
					</ul>
				</Portal>
			) }
		</>
	);
} );

export default Select;
