import React from 'react';
import { Box } from '@mui/material';
import { tokens } from '../../theme';

// Surface card v2 — the standard container. `hover` lifts on mouse-over
// (use for clickable cards), `feature` adds a soft indigo gradient wash.
export default function Card( { children, hover, feature, onClick, sx } ) {
	return (
		<Box
			onClick={ onClick }
			sx={ {
				bgcolor: tokens.surface,
				border: `1px solid ${ tokens.border }`,
				borderRadius: '12px',
				p: 2.5,
				...( feature && {
					background: `linear-gradient(135deg, ${ tokens.accentSoft } 0%, #ffffff 45%)`,
				} ),
				...( hover && {
					cursor: 'pointer',
					transition: 'box-shadow .18s ease, border-color .18s ease, transform .18s ease',
					'&:hover': {
						boxShadow: tokens.shadowMd,
						borderColor: tokens.border2,
						transform: 'translateY(-1px)',
					},
				} ),
				...sx,
			} }
		>
			{ children }
		</Box>
	);
}
