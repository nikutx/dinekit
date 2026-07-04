import React from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { tokens } from '../../theme';

// Small building blocks for detail drawers (orders, bookings): a labelled
// section with an optional right-aligned action, and a label/value row.
export function DetailSection( { title, action, children } ) {
	return (
		<Box sx={ { mb: 2.5 } }>
			<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 0.75 } }>
				<Typography sx={ { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted2 } }>{ title }</Typography>
				{ action || null }
			</Stack>
			{ children }
		</Box>
	);
}

export function DetailRow( { label, value, mono } ) {
	return (
		<Stack direction="row" justifyContent="space-between" sx={ { py: 0.25 } }>
			<Typography sx={ { color: tokens.muted, fontSize: 13.5 } }>{ label }</Typography>
			<Typography sx={ { color: tokens.ink, fontSize: 13.5, fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all', textAlign: 'right', ml: 2 } }>{ value }</Typography>
		</Stack>
	);
}
