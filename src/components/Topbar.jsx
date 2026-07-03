import React, { useState } from 'react';
import { Box, Typography, Stack, Button, Menu, MenuItem, ListItemIcon } from '@mui/material';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AddIcon from '@mui/icons-material/Add';
import EventSeatIcon from '@mui/icons-material/EventSeat';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import CelebrationIcon from '@mui/icons-material/Celebration';
import { tokens } from '../theme';

const STATES = {
	idle: { icon: <CloudDoneIcon sx={ { fontSize: 15 } } />, text: 'All changes saved', fg: tokens.muted, bg: tokens.soft },
	saving: { icon: <CloudSyncIcon sx={ { fontSize: 15 } } />, text: 'Saving…', fg: tokens.accent, bg: tokens.accentSoft },
	saved: { icon: <CloudDoneIcon sx={ { fontSize: 15 } } />, text: 'Saved', fg: tokens.green, bg: tokens.greenSoft },
	error: { icon: <ErrorOutlineIcon sx={ { fontSize: 15 } } />, text: 'Save failed', fg: tokens.red, bg: tokens.redSoft },
};

export default function Topbar( { saveStatus, title, navigate, businessType } ) {
	const state = STATES[ saveStatus ] || STATES.idle;
	const [ anchor, setAnchor ] = useState( null );

	const quick = [
		businessType !== 'takeaway' && { label: 'New booking', icon: <EventSeatIcon fontSize="small" />, view: 'bookings' },
		{ label: 'New dish', icon: <RestaurantMenuIcon fontSize="small" />, view: 'builder' },
		{ label: 'New event', icon: <CelebrationIcon fontSize="small" />, view: 'events' },
	].filter( Boolean );

	return (
		<Box
			sx={ {
				height: 58,
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
			<Typography sx={ { fontSize: 15, fontWeight: 650, letterSpacing: '-0.014em', color: tokens.ink } }>
				{ title || 'Home' }
			</Typography>

			<Stack direction="row" spacing={ 1.5 } alignItems="center">
				{ /* Save status pill */ }
				<Stack
					direction="row"
					spacing={ 0.6 }
					alignItems="center"
					sx={ { color: state.fg, bgcolor: state.bg, borderRadius: 999, px: 1.25, py: 0.45 } }
				>
					{ state.icon }
					<Typography sx={ { fontSize: 12, fontWeight: 550 } }>{ state.text }</Typography>
				</Stack>

				{ /* Global quick-create */ }
				<Button
					variant="contained"
					size="small"
					startIcon={ <AddIcon sx={ { fontSize: 16 } } /> }
					onClick={ ( e ) => setAnchor( e.currentTarget ) }
					sx={ { minHeight: 32, px: 1.5, fontSize: 13 } }
				>
					New
				</Button>
				<Menu
					anchorEl={ anchor }
					open={ !! anchor }
					onClose={ () => setAnchor( null ) }
					anchorOrigin={ { vertical: 'bottom', horizontal: 'right' } }
					transformOrigin={ { vertical: 'top', horizontal: 'right' } }
				>
					{ quick.map( ( q ) => (
						<MenuItem
							key={ q.view + q.label }
							onClick={ () => {
								setAnchor( null );
								navigate && navigate( q.view );
							} }
							sx={ { fontSize: 13.5, fontWeight: 500, minWidth: 170 } }
						>
							<ListItemIcon sx={ { color: tokens.muted, minWidth: '30px !important' } }>{ q.icon }</ListItemIcon>
							{ q.label }
						</MenuItem>
					) ) }
				</Menu>
			</Stack>
		</Box>
	);
}
