import React from 'react';
import { Box, Typography } from '@mui/material';
import { tokens } from '../../theme';

// Empty state v2 — a warm, teaching moment: gradient icon disc, confident
// copy, always a next step. `tint` takes a { fg, bg } pair (defaults indigo).
export default function EmptyState( { icon, title, description, action, tint } ) {
	const pair = tint || { fg: tokens.accent, bg: tokens.accentSoft };
	return (
		<Box
			sx={ {
				border: `1px dashed ${ tokens.border2 }`,
				borderRadius: '12px',
				py: 7,
				px: 3,
				textAlign: 'center',
				bgcolor: tokens.surface,
			} }
		>
			{ icon && (
				<Box
					sx={ {
						width: 64,
						height: 64,
						mx: 'auto',
						mb: 2,
						borderRadius: '50%',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						color: pair.fg,
						background: `radial-gradient(circle at 50% 35%, ${ pair.bg } 0%, ${ pair.bg }00 78%), linear-gradient(180deg, ${ pair.bg } 0%, #ffffff 100%)`,
						border: `1px solid ${ tokens.border }`,
						'& svg': { fontSize: 28 },
					} }
				>
					{ icon }
				</Box>
			) }
			<Typography sx={ { fontWeight: 650, color: tokens.ink, fontSize: 15.5, letterSpacing: '-0.01em' } }>{ title }</Typography>
			{ description && (
				<Typography sx={ { fontSize: 13.5, color: tokens.muted, mt: 0.75, maxWidth: 400, mx: 'auto', lineHeight: 1.55 } }>
					{ description }
				</Typography>
			) }
			{ action && <Box sx={ { mt: 2.5 } }>{ action }</Box> }
		</Box>
	);
}
