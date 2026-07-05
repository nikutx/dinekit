import React from 'react';
import { sxResolve, cx } from './sx';

// Our drop-in for MUI's <ToggleButtonGroup> — a segmented control. Injects
// selected state + click handling into ToggleButton children and reports changes
// as MUI does: onChange(event, newValue). In exclusive mode, clicking the active
// option deselects to null (MUI behaviour the app's handlers already expect).
const ToggleButtonGroup = React.forwardRef( function ToggleButtonGroup(
	{ value, onChange, exclusive, size, fullWidth, orientation = 'horizontal', disabled, sx, className, children, ...rest },
	ref
) {
	const r = sxResolve( sx );
	const handle = ( e, v, isSelected ) => {
		if ( ! onChange ) {
			return;
		}
		if ( exclusive ) {
			onChange( e, isSelected ? null : v );
		} else {
			const arr = Array.isArray( value ) ? value.slice() : [];
			const i = arr.indexOf( v );
			if ( i === -1 ) {
				arr.push( v );
			} else {
				arr.splice( i, 1 );
			}
			onChange( e, arr );
		}
	};
	return (
		<div
			ref={ ref }
			className={ cx(
				'dk-toggrp',
				size === 'small' && 'dk-toggrp--sm',
				fullWidth && 'dk-toggrp--full',
				orientation === 'vertical' && 'dk-toggrp--vertical',
				className,
				r.className
			) }
			style={ r.style }
			{ ...rest }
		>
			{ React.Children.map( children, ( child ) => {
				if ( ! React.isValidElement( child ) ) {
					return child;
				}
				const isSelected = exclusive
					? value === child.props.value
					: Array.isArray( value ) && value.indexOf( child.props.value ) !== -1;
				return React.cloneElement( child, {
					selected: isSelected,
					size: child.props.size || size,
					onClick: ( e ) => {
						if ( child.props.disabled || disabled ) {
							return;
						}
						handle( e, child.props.value, isSelected );
						child.props.onClick && child.props.onClick( e );
					},
				} );
			} ) }
		</div>
	);
} );

export default ToggleButtonGroup;
