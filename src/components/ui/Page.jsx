import React from 'react';
import { Box } from '@mui/material';
import { CONTENT_WIDTH } from '../../theme';

// The single content column — every page uses this so widths never vary.
export default function Page( { children, width } ) {
	return (
		<Box sx={ { maxWidth: width || CONTENT_WIDTH, mx: 'auto', width: '100%' } }>
			{ children }
		</Box>
	);
}
