import React from 'react';
import { Stack, Typography } from '../../ui';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { tokens } from '../../theme';

// One definition of save feedback for the whole app, so the topbar and any
// pop-up that saves as you type can never drift apart.
export const SAVE_STATES = {
	idle: { icon: <CloudDoneIcon sx={ { fontSize: 15 } } />, text: 'Auto-saved', fg: tokens.ink2, bg: tokens.soft },
	saving: { icon: <CloudSyncIcon sx={ { fontSize: 15 } } />, text: 'Saving…', fg: tokens.accent, bg: tokens.accentSoft },
	saved: { icon: <CloudDoneIcon sx={ { fontSize: 15 } } />, text: 'Saved', fg: tokens.green, bg: tokens.greenSoft },
	error: { icon: <ErrorOutlineIcon sx={ { fontSize: 15 } } />, text: 'Save failed', fg: tokens.red, bg: tokens.redSoft },
};

// `safeToClose` spells the reassurance out in a pop-up: there is no Save button
// to press, so say plainly that the work is in and the window can be shut.
export default function SavePill( { status, safeToClose, sx } ) {
	const base = SAVE_STATES[ status ] || SAVE_STATES.idle;
	const state =
		safeToClose && ( status === 'idle' || status === 'saved' )
			? { ...SAVE_STATES.saved, text: 'Saved — safe to close' }
			: base;
	return (
		<Stack
			direction="row"
			spacing={ 0.6 }
			alignItems="center"
			role="status"
			aria-live="polite"
			sx={ { color: state.fg, bgcolor: state.bg, borderRadius: 999, px: 1.25, py: 0.45, ...sx } }
		>
			{ state.icon }
			<Typography sx={ { fontSize: 12, fontWeight: 550, whiteSpace: 'nowrap' } }>{ state.text }</Typography>
		</Stack>
	);
}
