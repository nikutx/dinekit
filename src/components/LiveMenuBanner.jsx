import React, { useState } from 'react';
import { Stack, Typography, Button, Switch } from '../ui';
import LaunchIcon from '@mui/icons-material/Launch';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AddIcon from '@mui/icons-material/Add';
import { tokens } from '../theme';
import { api } from '../api/client';
import { useToast } from './Toast';
import { copyToClipboard } from '../lib/clipboard';
import Card from './ui/Card';

// Always-visible bridge between the admin and the live site: shows where the
// menu is published (or offers to publish it) so users never wonder "how do I
// see this on my website?".
export default function LiveMenuBanner( { menuPage } ) {
	const [ page, setPage ] = useState( menuPage );
	const [ busy, setBusy ] = useState( false );
	// The other half of the story: the ORDERING page + its master switch,
	// surfaced right where the menu is built — owners look here first, not in
	// Orders → gear. { url, on } once loaded.
	const [ ordering, setOrdering ] = useState( null );
	const [ obusy, setObusy ] = useState( false );
	const toast = useToast();

	React.useEffect( () => {
		api.getDashboard()
			.then( ( d ) => setOrdering( { url: d.orderPageUrl || '', on: !! d.orderingOn } ) )
			.catch( () => setOrdering( null ) );
	}, [] );

	const toggleOrdering = async ( on ) => {
		setObusy( true );
		setOrdering( ( o ) => ( { ...o, on } ) );
		try {
			await api.saveOrderSettings( { enabled: on } );
			toast.success( on ? 'Online ordering is ON' : 'Online ordering is OFF', on ? 'Customers can order from your website.' : 'The ordering page shows the menu but checkout is closed.' );
		} catch ( e ) {
			setOrdering( ( o ) => ( { ...o, on: ! on } ) );
			toast.error( 'Couldn’t change it', e.message );
		} finally {
			setObusy( false );
		}
	};
	const createOrderPage = async () => {
		setObusy( true );
		try {
			const r = await api.createSetupPage( 'order' );
			setOrdering( ( o ) => ( { ...( o || { on: true } ), url: r.page || '' } ) );
			toast.success( 'Ordering page created', 'Takeaway & delivery orders land on your Orders board.' );
		} catch ( e ) {
			toast.error( 'Couldn’t create the page', e.message );
		} finally {
			setObusy( false );
		}
	};

	// Slim second strip: ordering status + the on/off switch, always visible so
	// "how do customers order?" is answered where owners actually look.
	const orderingStrip = ordering && (
		<Card
			feature
			sx={ { ...wrapSx, mt: -1.5, ...( ordering.url && ordering.on ? {} : { borderStyle: 'dashed', borderColor: ordering.url ? tokens.amber : tokens.border2 } ) } }
		>
			<Stack direction="row" spacing={ 1.5 } alignItems="center" justifyContent="space-between" flexWrap="wrap">
				<Stack direction="row" spacing={ 1 } alignItems="center" sx={ { minWidth: 0 } }>
					{ ordering.url && ordering.on && <CheckCircleIcon sx={ { color: tokens.green, fontSize: 20 } } /> }
					<Typography sx={ { fontSize: 14, color: tokens.ink2 } }>
						{ ! ordering.url
							? 'Want takeaway & delivery orders from this menu? Create your ordering page.'
							: ordering.on
								? <>Online ordering is <strong>ON</strong> at <strong>{ ordering.url.replace( /^https?:\/\//, '' ) }</strong></>
								: <>Your ordering page is ready at <strong>{ ordering.url.replace( /^https?:\/\//, '' ) }</strong> — but ordering is <strong>OFF</strong>, so guests can’t check out.</> }
					</Typography>
				</Stack>
				<Stack direction="row" spacing={ 1 } alignItems="center">
					{ ordering.url ? (
						<>
							<Stack direction="row" spacing={ 0.5 } alignItems="center">
								<Switch checked={ ordering.on } disabled={ obusy } onChange={ ( e ) => toggleOrdering( e.target.checked ) } />
								<Typography sx={ { fontSize: 12.5, fontWeight: 700, color: ordering.on ? tokens.green : tokens.muted } }>
									{ ordering.on ? 'Taking orders' : 'Off' }
								</Typography>
							</Stack>
							<Button size="small" endIcon={ <LaunchIcon /> } href={ ordering.url } target="_blank" rel="noreferrer" sx={ { color: tokens.muted } }>
								View
							</Button>
						</>
					) : (
						<Button variant="contained" size="small" startIcon={ <AddIcon /> } onClick={ createOrderPage } disabled={ obusy }>
							{ obusy ? 'Creating…' : 'Create ordering page' }
						</Button>
					) }
				</Stack>
			</Stack>
		</Card>
	);

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
			<>
				<Card feature sx={ { ...wrapSx, borderStyle: 'dashed', borderColor: tokens.border2 } }>
					<Stack direction="row" spacing={ 1.5 } alignItems="center" justifyContent="space-between" flexWrap="wrap">
						<Typography sx={ { fontSize: 14, color: tokens.ink2 } }>
							Your menu isn’t on your website yet. Create a menu page in one click.
						</Typography>
						<Button variant="contained" size="small" startIcon={ <AddIcon /> } onClick={ create } disabled={ busy }>
							{ busy ? 'Creating…' : 'Create menu page' }
						</Button>
					</Stack>
				</Card>
				{ orderingStrip }
			</>
		);
	}

	// A page created from the dashboard's setup guide starts as a draft — say so,
	// and send them to the editor to publish rather than to a 404 for guests.
	const isDraft = 'draft' === page.status;
	if ( isDraft ) {
		return (
			<>
			<Card feature sx={ { ...wrapSx, borderStyle: 'dashed', borderColor: tokens.amber } }>
				<Stack direction="row" spacing={ 1.5 } alignItems="center" justifyContent="space-between" flexWrap="wrap">
					<Typography sx={ { fontSize: 14, color: tokens.ink2 } }>
						Your menu page is a <strong>draft</strong> — guests can’t see it yet.
					</Typography>
					<Stack direction="row" spacing={ 1 }>
						<Button size="small" startIcon={ <ContentCopyIcon sx={ { fontSize: 16 } } /> } onClick={ copyShortcode } sx={ { color: tokens.muted } }>
							Copy shortcode
						</Button>
						{ page.edit && (
							<Button variant="contained" size="small" endIcon={ <LaunchIcon /> } href={ page.edit } target="_blank" rel="noreferrer">
								Review &amp; publish
							</Button>
						) }
					</Stack>
				</Stack>
			</Card>
			{ orderingStrip }
			</>
		);
	}

	return (
		<>
			<Card feature sx={ wrapSx }>
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
			</Card>
			{ orderingStrip }
		</>
	);
}

// Compact padding — the banner is a slim strip, not a full content card.
const wrapSx = {
	px: 2,
	py: 1.25,
	mb: 2.5,
};
