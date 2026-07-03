import React from 'react';
import { Box, Stack, Skeleton } from '@mui/material';
import { tokens } from '../../theme';

// Loading skeletons v2 — pages sketch their own shape while data loads
// instead of a centered spinner.

const sk = { bgcolor: tokens.soft, borderRadius: '8px' };

export function TilesSkeleton( { count = 4 } ) {
	return (
		<Stack direction="row" spacing={ 2 } sx={ { mb: 3 } }>
			{ Array.from( { length: count } ).map( ( _, i ) => (
				<Box key={ i } sx={ { flex: 1, border: `1px solid ${ tokens.border }`, borderRadius: '12px', p: 2.25, bgcolor: tokens.surface } }>
					<Skeleton variant="rounded" width={ 110 } height={ 12 } sx={ sk } />
					<Skeleton variant="rounded" width={ 70 } height={ 26 } sx={ { ...sk, mt: 1.5 } } />
					<Skeleton variant="rounded" width={ 90 } height={ 10 } sx={ { ...sk, mt: 1 } } />
				</Box>
			) ) }
		</Stack>
	);
}

export function ListSkeleton( { rows = 5 } ) {
	return (
		<Stack spacing={ 1 }>
			{ Array.from( { length: rows } ).map( ( _, i ) => (
				<Stack
					key={ i }
					direction="row"
					spacing={ 1.5 }
					alignItems="center"
					sx={ { border: `1px solid ${ tokens.border }`, borderRadius: '12px', px: 2, py: 1.5, bgcolor: tokens.surface } }
				>
					<Skeleton variant="circular" width={ 34 } height={ 34 } sx={ { bgcolor: tokens.soft } } />
					<Box sx={ { flex: 1 } }>
						<Skeleton variant="rounded" width="34%" height={ 13 } sx={ sk } />
						<Skeleton variant="rounded" width="52%" height={ 10 } sx={ { ...sk, mt: 0.75 } } />
					</Box>
					<Skeleton variant="rounded" width={ 56 } height={ 22 } sx={ sk } />
				</Stack>
			) ) }
		</Stack>
	);
}

export function ChartSkeleton( { height = 200 } ) {
	return (
		<Box sx={ { border: `1px solid ${ tokens.border }`, borderRadius: '12px', p: 2.5, bgcolor: tokens.surface } }>
			<Skeleton variant="rounded" width={ 120 } height={ 14 } sx={ sk } />
			<Skeleton variant="rounded" width="100%" height={ height - 60 } sx={ { ...sk, mt: 2 } } />
		</Box>
	);
}
