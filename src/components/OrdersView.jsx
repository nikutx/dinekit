import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
	Box,
	Stack,
	Typography,
	Select,
	MenuItem,
	Chip,
	IconButton,
	Button,
	CircularProgress,
	Tooltip,
	ToggleButton,
	ToggleButtonGroup,
	Switch,
	TextField,
	Collapse,
	Divider,
	Snackbar,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PrintIcon from '@mui/icons-material/Print';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TuneIcon from '@mui/icons-material/Tune';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { tokens } from '../theme';
import { api } from '../api/client';
import { printDoc, esc } from '../lib/print';

const O_STATUS = [
	{ key: 'new', label: 'New', fg: tokens.accentDark, bg: tokens.accentSoft },
	{ key: 'preparing', label: 'Preparing', fg: tokens.amber, bg: tokens.amberSoft },
	{ key: 'ready', label: 'Ready', fg: tokens.green, bg: tokens.greenSoft },
	{ key: 'completed', label: 'Completed', fg: tokens.muted, bg: tokens.soft },
	{ key: 'cancelled', label: 'Cancelled', fg: tokens.red, bg: tokens.redSoft },
];
const meta = ( k ) => O_STATUS.find( ( s ) => s.key === k ) || O_STATUS[ 0 ];

export default function OrdersView() {
	const [ orders, setOrders ] = useState( [] );
	const [ loading, setLoading ] = useState( true );
	const [ tab, setTab ] = useState( 'active' );
	const [ cur, setCur ] = useState( { symbol: '£', position: 'before' } );
	const [ settingsOpen, setSettingsOpen ] = useState( false );

	useEffect( () => {
		Promise.all( [ api.getOrders(), api.getSettings() ] )
			.then( ( [ list, settings ] ) => {
				setOrders( list || [] );
				setCur( { symbol: settings.currency || '£', position: settings.currencyPosition || 'before' } );
			} )
			.finally( () => setLoading( false ) );
	}, [] );

	const money = ( n ) => {
		const v = Number( n || 0 ).toFixed( 2 );
		return cur.position === 'after' ? `${ v }${ cur.symbol }` : `${ cur.symbol }${ v }`;
	};

	const setStatus = ( id, status ) => {
		setOrders( ( os ) => os.map( ( o ) => ( o.id === id ? { ...o, status } : o ) ) );
		api.updateOrder( id, { status } );
	};
	const remove = async ( id ) => {
		await api.deleteOrder( id );
		setOrders( ( os ) => os.filter( ( o ) => o.id !== id ) );
	};

	const filtered = useMemo( () => {
		if ( tab === 'active' ) {
			return orders.filter( ( o ) => [ 'new', 'preparing', 'ready' ].includes( o.status ) );
		}
		if ( tab === 'done' ) {
			return orders.filter( ( o ) => [ 'completed', 'cancelled' ].includes( o.status ) );
		}
		return orders;
	}, [ orders, tab ] );

	const activeCount = orders.filter( ( o ) => [ 'new', 'preparing', 'ready' ].includes( o.status ) ).length;

	const printTicket = ( o ) => {
		let body = '<h1>Order #' + o.number + '</h1>';
		body += '<p class="dk-sub">' + esc( o.name ) + ( o.phone ? ' · ' + esc( o.phone ) : '' ) +
			' · ' + ( o.when === 'asap' ? 'ASAP' : esc( o.when ) ) + '</p>';
		o.items.forEach( ( li ) => {
			body += '<div class="dk-row"><span><strong>' + li.qty + '×</strong> ' + esc( li.title ) +
				( li.priceLabel ? ' (' + esc( li.priceLabel ) + ')' : '' ) + '</span><strong>' + money( li.lineTotal ) + '</strong></div>';
			const mods = li.chosen.map( ( c ) => c.label ).concat( ( li.removed || [] ).map( ( r ) => 'no ' + r ) );
			if ( mods.length ) {
				body += '<div style="font-size:13px;color:#64748b;padding:2px 0 6px 16px">' + esc( mods.join( ', ' ) ) + '</div>';
			}
		} );
		body += '<div class="dk-row" style="border-top:2px solid #0f172a;margin-top:6px"><span><strong>Total</strong></span><strong>' + money( o.total ) + '</strong></div>';
		if ( o.notes ) {
			body += '<p class="dk-flag">“' + esc( o.notes ) + '”</p>';
		}
		printDoc( 'Order #' + o.number, body );
	};

	if ( loading ) {
		return <Box sx={ { display: 'flex', justifyContent: 'center', mt: 8 } }><CircularProgress /></Box>;
	}

	return (
		<Box sx={ { maxWidth: 900, mx: 'auto' } }>
			<Stack direction="row" alignItems="flex-end" justifyContent="space-between" sx={ { mb: 2 } }>
				<Box>
					<Typography variant="h5">Orders</Typography>
					<Typography sx={ { color: tokens.muted, fontSize: 14, mt: 0.5 } }>
						Commission-free takeaway orders from your own site — you keep 100%.
					</Typography>
				</Box>
				<Stack direction="row" spacing={ 1 } alignItems="center">
					<Chip
						icon={ <ReceiptLongIcon sx={ { fontSize: 16 } } /> }
						label={ `${ activeCount } active` }
						sx={ { bgcolor: activeCount ? tokens.accentSoft : tokens.soft, color: activeCount ? tokens.accentDark : tokens.muted, fontWeight: 700 } }
					/>
					<Tooltip title="Ordering settings & the public page">
						<IconButton
							onClick={ () => setSettingsOpen( ( v ) => ! v ) }
							sx={ { border: `1px solid ${ tokens.border }`, borderRadius: 2, color: settingsOpen ? tokens.accent : tokens.muted } }
						>
							<TuneIcon />
						</IconButton>
					</Tooltip>
				</Stack>
			</Stack>

			<Collapse in={ settingsOpen } unmountOnExit>
				<OrderSettings />
			</Collapse>

			<ToggleButtonGroup size="small" exclusive value={ tab } onChange={ ( e, v ) => v && setTab( v ) } sx={ { mb: 2 } }>
				<ToggleButton value="active">Active</ToggleButton>
				<ToggleButton value="done">Completed</ToggleButton>
				<ToggleButton value="all">All</ToggleButton>
			</ToggleButtonGroup>

			{ filtered.length === 0 ? (
				<Box sx={ { border: `1px dashed ${ tokens.border2 }`, borderRadius: 3, p: 5, textAlign: 'center', color: tokens.muted } }>
					<Typography sx={ { fontWeight: 700, color: tokens.ink2 } }>No orders here</Typography>
					<Typography sx={ { fontSize: 14, mt: 0.5 } }>Orders placed on your site land here in real time.</Typography>
				</Box>
			) : (
				<Stack spacing={ 1.5 }>
					{ filtered.map( ( o ) => {
						const m = meta( o.status );
						return (
							<Box key={ o.id } sx={ { bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderLeft: `3px solid ${ m.fg }`, borderRadius: 2, p: 2 } }>
								<Stack direction="row" alignItems="center" spacing={ 1.5 } sx={ { mb: 1 } }>
									<Typography sx={ { fontWeight: 800, fontSize: 16 } }>#{ o.number }</Typography>
									<Typography sx={ { fontSize: 13, color: tokens.muted } }>
										{ o.name }{ o.phone ? ` · ${ o.phone }` : '' } · { o.when === 'asap' ? 'ASAP' : o.when }
									</Typography>
									<Box sx={ { flex: 1 } } />
									<Typography sx={ { fontWeight: 800 } }>{ money( o.total ) }</Typography>
									<Select
										value={ o.status }
										onChange={ ( e ) => setStatus( o.id, e.target.value ) }
										size="small"
										sx={ { minWidth: 130, fontWeight: 700, fontSize: 13, color: m.fg, bgcolor: m.bg, '& fieldset': { border: 'none' } } }
									>
										{ O_STATUS.map( ( s ) => <MenuItem key={ s.key } value={ s.key } sx={ { fontSize: 13, fontWeight: 600 } }>{ s.label }</MenuItem> ) }
									</Select>
									<Tooltip title="Print ticket">
										<IconButton size="small" onClick={ () => printTicket( o ) } sx={ { color: tokens.muted } }><PrintIcon fontSize="small" /></IconButton>
									</Tooltip>
									<Tooltip title="Delete order">
										<IconButton size="small" onClick={ () => remove( o.id ) } sx={ { color: tokens.muted2 } }><DeleteOutlineIcon fontSize="small" /></IconButton>
									</Tooltip>
								</Stack>
								<Stack spacing={ 0.25 } sx={ { pl: 0.5 } }>
									{ o.items.map( ( li, i ) => (
										<Box key={ i }>
											<Typography sx={ { fontSize: 14 } }>
												<strong>{ li.qty }×</strong> { li.title }
												{ li.priceLabel ? <span style={ { color: tokens.muted } }> ({ li.priceLabel })</span> : null }
											</Typography>
											{ ( li.chosen.length > 0 || ( li.removed || [] ).length > 0 ) && (
												<Typography sx={ { fontSize: 12, color: tokens.muted, pl: 2 } }>
													{ li.chosen.map( ( c ) => c.label ).concat( ( li.removed || [] ).map( ( r ) => `no ${ r }` ) ).join( ' · ' ) }
												</Typography>
											) }
										</Box>
									) ) }
									{ o.notes && <Typography sx={ { fontSize: 13, color: tokens.ink2, mt: 0.5, fontStyle: 'italic' } }>“{ o.notes }”</Typography> }
								</Stack>
							</Box>
						);
					} ) }
				</Stack>
			) }
		</Box>
	);
}

function OrderSettings() {
	const [ cfg, setCfg ] = useState( null );
	const [ saveState, setSaveState ] = useState( 'idle' );
	const [ copied, setCopied ] = useState( false );
	const debounce = useRef( null );

	useEffect( () => {
		api.getOrderSettings().then( setCfg );
	}, [] );

	const patch = ( p ) => {
		const next = { ...cfg, ...p };
		setCfg( next );
		clearTimeout( debounce.current );
		setSaveState( 'saving' );
		debounce.current = setTimeout( () => {
			api.saveOrderSettings( next ).then( () => setSaveState( 'saved' ) ).catch( () => setSaveState( 'error' ) );
		}, 500 );
	};

	if ( ! cfg ) {
		return <Box sx={ { display: 'flex', justifyContent: 'center', py: 3 } }><CircularProgress size={ 22 } /></Box>;
	}

	const copyShortcode = () => {
		if ( navigator.clipboard ) {
			navigator.clipboard.writeText( '[dinekit_order]' ).then( () => setCopied( true ) );
		}
	};

	return (
		<Box sx={ { bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderRadius: 3, p: 2.5, mb: 2 } }>
			<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 2 } }>
				<Typography variant="subtitle2" sx={ { color: tokens.ink } }>Ordering settings</Typography>
				<Typography sx={ { fontSize: 12, color: tokens.muted, minWidth: 50 } }>
					{ saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : '' }
				</Typography>
			</Stack>

			<Stack direction="row" spacing={ 3 } flexWrap="wrap" useFlexGap sx={ { mb: 2 } }>
				<Stack direction="row" alignItems="center" spacing={ 1 }>
					<Switch checked={ cfg.enabled } onChange={ ( e ) => patch( { enabled: e.target.checked } ) } />
					<Typography sx={ { fontSize: 14, fontWeight: 600 } }>Accept online orders</Typography>
				</Stack>
				<Stack direction="row" alignItems="center" spacing={ 1 }>
					<Switch checked={ cfg.emails_enabled } onChange={ ( e ) => patch( { emails_enabled: e.target.checked } ) } />
					<Typography sx={ { fontSize: 14, fontWeight: 600 } }>Email notifications</Typography>
				</Stack>
			</Stack>

			<Stack direction="row" spacing={ 1.5 } flexWrap="wrap" useFlexGap>
				<TextField
					label="Prep time (min)" type="number" size="small"
					value={ cfg.prep_mins }
					onChange={ ( e ) => patch( { prep_mins: Math.max( 0, parseInt( e.target.value, 10 ) || 0 ) } ) }
					helperText="Earliest collection"
					sx={ { width: 150 } }
				/>
				<TextField
					label="Min order" type="number" size="small"
					value={ cfg.min_order }
					onChange={ ( e ) => patch( { min_order: Math.max( 0, parseFloat( e.target.value ) || 0 ) } ) }
					helperText="0 = none"
					sx={ { width: 130 } }
				/>
				<TextField
					label="Kitchen email" type="email" size="small"
					placeholder="Defaults to site admin"
					value={ cfg.notify_email }
					onChange={ ( e ) => patch( { notify_email: e.target.value } ) }
					sx={ { width: 240 } }
				/>
			</Stack>

			<Divider sx={ { my: 2 } } />
			<Stack direction="row" alignItems="center" spacing={ 1.5 } flexWrap="wrap" useFlexGap>
				<Typography sx={ { fontSize: 13, color: tokens.muted } }>
					Add the ordering page anywhere with this shortcode:
				</Typography>
				<Chip
					label="[dinekit_order]"
					onClick={ copyShortcode }
					onDelete={ copyShortcode }
					deleteIcon={ <ContentCopyIcon /> }
					sx={ { fontFamily: 'monospace', fontWeight: 700, bgcolor: tokens.soft } }
				/>
			</Stack>
			<Typography sx={ { fontSize: 12, color: tokens.muted2, mt: 1.5 } }>
				Card payment (your own Stripe, 0% commission) plugs in from Integrations — coming soon.
			</Typography>
			<Snackbar open={ copied } autoHideDuration={ 1800 } onClose={ () => setCopied( false ) } message="Shortcode copied" anchorOrigin={ { vertical: 'bottom', horizontal: 'center' } } />
		</Box>
	);
}
