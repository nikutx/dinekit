import React from 'react';
import { Box, Typography, Stack } from '@mui/material';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { tokens } from '../theme';

const STATES = {
	idle: { icon: <CloudDoneIcon fontSize="small" />, text: 'All changes saved', color: tokens.muted },
	saving: { icon: <CloudSyncIcon fontSize="small" />, text: 'Saving…', color: tokens.accent },
	saved: { icon: <CloudDoneIcon fontSize="small" />, text: 'Saved', color: tokens.green },
	error: { icon: <ErrorOutlineIcon fontSize="small" />, text: 'Save failed', color: tokens.red },
};

export default function Topbar( { saveStatus, title } ) {
	const state = STATES[ saveStatus ] || STATES.idle;
	return (
		<Box
			sx={ {
				height: 60,
				flexShrink: 0,
				bgcolor: tokens.surface,
				borderBottom: `1px solid ${ tokens.border }`,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				px: 4,
				position: 'sticky',
				top: 32,
				zIndex: 5,
			} }
		>
			<Typography variant="h6" sx={ { fontSize: 18 } }>
				{ title || 'Menu Builder' }
			</Typography>

			<Stack direction="row" spacing={ 0.75 } alignItems="center" sx={ { color: state.color } }>
				{ state.icon }
				<Typography sx={ { fontSize: 13, fontWeight: 600 } }>{ state.text }</Typography>
			</Stack>
		</Box>
	);
}
