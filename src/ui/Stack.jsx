import React from 'react';
import Box from './Box';

// Flex container — our drop-in for MUI's <Stack>. `spacing` is the MUI unit
// (× 8px) and, like MUI, becomes the flex `gap`. `direction`, `alignItems`,
// `justifyContent` and `flexWrap` may be responsive objects (handled by sx).
const Stack = React.forwardRef( function Stack(
	{ direction = 'column', spacing, alignItems, justifyContent, flexWrap, divider, sx, children, ...rest },
	ref
) {
	const layout = { display: 'flex', flexDirection: direction };
	if ( spacing !== undefined && spacing !== null ) {
		layout.gap = spacing;
	}
	if ( alignItems !== undefined ) {
		layout.alignItems = alignItems;
	}
	if ( justifyContent !== undefined ) {
		layout.justifyContent = justifyContent;
	}
	if ( flexWrap !== undefined ) {
		layout.flexWrap = flexWrap;
	}

	// MUI inserts a copy of `divider` between (not around) each child.
	let content = children;
	if ( divider ) {
		const items = React.Children.toArray( children ).filter( ( c ) => c !== null && c !== undefined && c !== false );
		content = items.reduce( ( acc, child, i ) => {
			if ( i > 0 ) {
				acc.push( React.cloneElement( divider, { key: 'dk-div-' + i } ) );
			}
			acc.push( child );
			return acc;
		}, [] );
	}

	return (
		<Box ref={ ref } sx={ { ...layout, ...sx } } { ...rest }>
			{ content }
		</Box>
	);
} );

export default Stack;
