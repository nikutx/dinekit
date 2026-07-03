import React from 'react';
import { Box, Typography } from '@mui/material';
import { tokens } from '../../theme';

// Teaching empty state: muted icon + headline + one line + a primary action.
export default function EmptyState( { icon, title, description, action } ) {
	return (
		<Box
			sx={ {
				border: `1px dashed ${ tokens.border2 }`,
				borderRadius: 3,
				py: 8,
				px: 3,
				textAlign: 'center',
				bgcolor: tokens.surface,
			} }
		>
			{ icon && (
				<Box sx={ { color: tokens.muted2, mb: 1.5, '& svg': { fontSize: 40 } } }>{ icon }</Box>
			) }
			<Typography sx={ { fontWeight: 600, color: tokens.ink2, fontSize: 16 } }>{ title }</Typography>
			{ description && (
				<Typography sx={ { fontSize: 14, color: tokens.muted, mt: 0.5, maxWidth: 380, mx: 'auto' } }>
					{ description }
				</Typography>
			) }
			{ action && <Box sx={ { mt: 2.5 } }>{ action }</Box> }
		</Box>
	);
}
