import React, { useState } from 'react';
import { Box, Stack, Typography, Button } from '@mui/material';
import LaunchIcon from '@mui/icons-material/Launch';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AddIcon from '@mui/icons-material/Add';
import { tokens } from '../theme';
import { api } from '../api/client';
import { useToast } from './Toast';
import { copyToClipboard } from '../lib/clipboard';

// Always-visible bridge between the admin and the live site: shows where the
// menu is published (or offers to publish it) so users never wonder "how do I
// see this on my website?".
export default function LiveMenuBanner( { menuPage } ) {
	const [ page, setPage ] = useState( menuPage );
	const [ busy, setBusy ] = useState( false );
	const toast = useToast();

	const create = () => {
		setBusy( true );
		api.createMenuPage()
			.then( ( p ) => {
				setPage( p );
				setBusy( false );
				toast.success( 'Menu page created', 'Your menu is now live on your website.' );
			} )
			.catch( ( e ) => {
				setBusy( false );
				toast.error( 'Couldn’t create the page', e.message );
			} );
	};

	const copyShortcode = () => {
		copyToClipboard( '[dinekit_menu]' );
		toast.info( 'Shortcode copied', 'Paste [dinekit_menu] into any page or post.' );
	};

	if ( ! page || ! page.url ) {
		return (
			<Box sx={ { ...wrapSx, borderStyle: 'dashed' } }>
				<Stack direction="row" spacing={ 1.5 } alignItems="center" justifyContent="space-between" flexWrap="wrap">
					<Typography sx={ { fontSize: 14, color: tokens.ink2 } }>
						Your menu isn’t on your website yet. Create a menu page in one click.
					</Typography>
					<Button variant="contained" size="small" startIcon={ <AddIcon /> } onClick={ create } disabled={ busy }>
						{ busy ? 'Creating…' : 'Create menu page' }
					</Button>
				</Stack>
			</Box>
		);
	}

	return (
		<>
			<Box sx={ wrapSx }>
				<Stack direction="row" spacing={ 1.5 } alignItems="center" justifyContent="space-between" flexWrap="wrap">
					<Stack direction="row" spacing={ 1 } alignItems="center">
						<CheckCircleIcon sx={ { color: tokens.green, fontSize: 20 } } />
						<Typography sx={ { fontSize: 14, color: tokens.ink2 } }>
							Your menu is live at <strong>{ page.url.replace( /^https?:\/\//, '' ) }</strong>
						</Typography>
					</Stack>
					<Stack direction="row" spacing={ 1 }>
						<Button size="small" startIcon={ <ContentCopyIcon sx={ { fontSize: 16 } } /> } onClick={ copyShortcode } sx={ { color: tokens.muted } }>
							Copy shortcode
						</Button>
						<Button variant="contained" size="small" endIcon={ <LaunchIcon /> } href={ page.url } target="_blank" rel="noreferrer">
							View live menu
						</Button>
					</Stack>
				</Stack>
			</Box>
		</>
	);
}

const wrapSx = {
	bgcolor: tokens.surface,
	border: `1px solid ${ tokens.border }`,
	borderRadius: 3,
	px: 2,
	py: 1.25,
	mb: 2.5,
};
