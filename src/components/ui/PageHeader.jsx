import React from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { tokens } from '../../theme';

// The identical page header on every screen: title + one-line subtitle on the
// left, actions right-aligned. 32px gap below.
export default function PageHeader( { title, subtitle, actions } ) {
	return (
		<Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={ 2 } sx={ { mb: 4 } }>
			<Box sx={ { minWidth: 0 } }>
				<Typography variant="h5">{ title }</Typography>
				{ subtitle && (
					<Typography sx={ { color: tokens.muted, fontSize: 14, mt: 0.5 } }>{ subtitle }</Typography>
				) }
			</Box>
			{ actions && (
				<Stack direction="row" spacing={ 1 } alignItems="center" sx={ { flexShrink: 0 } }>
					{ actions }
				</Stack>
			) }
		</Stack>
	);
}
