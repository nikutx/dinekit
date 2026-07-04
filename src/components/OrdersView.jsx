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
import AddIcon from '@mui/icons-material/Add';
import PrintIcon from '@mui/icons-material/Print';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TuneIcon from '@mui/icons-material/Tune';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { tokens } from '../theme';
import { api } from '../api/client';
import { printDoc, esc } from '../lib/print';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import EmptyState from './ui/EmptyState';
import Card from './ui/Card';
import { ListSkeleton } from './ui/Skeletons';
import PageTour from './PageTour';

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
	const [ adding, setAdding ] = useState( false );

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
		return (
			<Page>
				<PageHeader
					title="Orders"
					subtitle="Commission-free takeaway orders from your own site — you keep 100%."
				/>
				<ListSkeleton rows={ 5 } />
			</Page>
		);
	}

	return (
		<Page>
			<PageHeader
				title="Orders"
				subtitle="Commission-free takeaway orders from your own site — you keep 100%."
				actions={
					<>
						<Chip
							icon={ <ReceiptLongIcon sx={ { fontSize: 14 } } /> }
							label={ `${ activeCount } active` }
							size="small"
							sx={ { height: 22, fontSize: 12, bgcolor: activeCount ? tokens.accentSoft : tokens.soft, color: activeCount ? tokens.accentDark : tokens.muted, fontWeight: 600 } }
						/>
						<Tooltip title="Ordering settings & the public page">
							<IconButton
								onClick={ () => setSettingsOpen( ( v ) => ! v ) }
								sx={ { border: `1px solid ${ tokens.border }`, borderRadius: 2, color: settingsOpen ? tokens.accent : tokens.muted } }
							>
								<TuneIcon />
							</IconButton>
						</Tooltip>
						<Button variant="contained" startIcon={ <AddIcon /> } onClick={ () => setAdding( ( v ) => ! v ) }>
							New order
						</Button>
					</>
				}
			/>

			<PageTour
				id="orders"
				title="Commission-free takeaway orders"
				points={ [
					'Orders from your site land here live; move them New → Preparing → Ready → Completed.',
					'“New order” takes a phone/walk-in order; print a kitchen ticket from each card.',
					'The gear opens ordering settings & the public order page. You keep 100% — no commission.',
				] }
			/>

			<Collapse in={ settingsOpen } unmountOnExit>
				<OrderSettings />
			</Collapse>

			<Collapse in={ adding } unmountOnExit>
				<NewOrder
					money={ money }
					onCancel={ () => setAdding( false ) }
					onCreated={ ( order ) => { setOrders( ( os ) => [ order, ...os ] ); setAdding( false ); setTab( 'active' ); } }
				/>
			</Collapse>

			<ToggleButtonGroup size="small" exclusive value={ tab } onChange={ ( e, v ) => v && setTab( v ) } sx={ { mb: 2 } }>
				<ToggleButton value="active">Active</ToggleButton>
				<ToggleButton value="done">Completed</ToggleButton>
				<ToggleButton value="all">All</ToggleButton>
			</ToggleButtonGroup>

			{ filtered.length === 0 ? (
				<EmptyState
					icon={ <ReceiptLongIcon /> }
					title="No orders here"
					description="Orders placed on your site land here in real time."
				/>
			) : (
				<Stack spacing={ 1.5 }>
					{ filtered.map( ( o ) => {
						const m = meta( o.status );
						return (
							<Card key={ o.id } hover sx={ { p: 2 } }>
								<Stack direction="row" alignItems="center" spacing={ 1.5 } sx={ { mb: 1 } }>
									<Typography sx={ { fontWeight: 650, fontSize: 15, fontVariantNumeric: 'tabular-nums' } }>#{ o.number }</Typography>
									<Typography sx={ { fontSize: 13, color: tokens.muted } } noWrap>
										{ o.name }{ o.phone ? ` · ${ o.phone }` : '' } · { o.when === 'asap' ? 'ASAP' : o.when }
									</Typography>
									<Box sx={ { flex: 1 } } />
									<Typography sx={ { fontWeight: 650, fontVariantNumeric: 'tabular-nums', textAlign: 'right' } }>{ money( o.total ) }</Typography>
									<Select
										value={ o.status }
										onChange={ ( e ) => setStatus( o.id, e.target.value ) }
										size="small"
										renderValue={ ( v ) => {
											const sm = meta( v );
											return (
												<Stack direction="row" spacing={ 0.75 } alignItems="center" component="span">
													<Box component="span" sx={ { width: 7, height: 7, borderRadius: '50%', bgcolor: sm.fg, flexShrink: 0 } } />
													{ sm.label }
												</Stack>
											);
										} }
										sx={ { minWidth: 130, fontWeight: 600, fontSize: 13, color: m.fg, bgcolor: m.bg, borderRadius: '8px', '& fieldset': { border: 'none' } } }
									>
										{ O_STATUS.map( ( s ) => (
											<MenuItem key={ s.key } value={ s.key } sx={ { fontSize: 13, fontWeight: 600 } }>
												<Box component="span" sx={ { width: 7, height: 7, borderRadius: '50%', bgcolor: s.fg, display: 'inline-block', mr: 1, flexShrink: 0 } } />
												{ s.label }
											</MenuItem>
										) ) }
									</Select>
									<Tooltip title="Print ticket">
										<IconButton size="small" onClick={ () => printTicket( o ) } sx={ { color: tokens.muted } }><PrintIcon fontSize="small" /></IconButton>
									</Tooltip>
									<Tooltip title="Delete order">
										<IconButton size="small" onClick={ () => remove( o.id ) } sx={ { color: tokens.muted2 } }><DeleteOutlineIcon fontSize="small" /></IconButton>
									</Tooltip>
								</Stack>
								<Typography sx={ { fontSize: 12.5, color: tokens.muted, lineHeight: 1.6 } }>
									{ o.items.map( ( li ) => {
										const extra = [ li.priceLabel ]
											.concat( li.chosen.map( ( c ) => c.label ) )
											.concat( ( li.removed || [] ).map( ( r ) => `no ${ r }` ) )
											.filter( Boolean );
										return `${ li.qty }× ${ li.title }${ extra.length ? ` (${ extra.join( ', ' ) })` : '' }`;
									} ).join( '  ·  ' ) }
								</Typography>
								{ o.notes && <Typography sx={ { fontSize: 12.5, color: tokens.ink2, mt: 0.5, fontStyle: 'italic' } }>“{ o.notes }”</Typography> }
							</Card>
						);
					} ) }
				</Stack>
			) }
		</Page>
	);
}

// Staff order builder — phone/walk-in orders. Amount is recomputed server-side.
function NewOrder( { money, onCreated, onCancel } ) {
	const [ menu, setMenu ] = useState( [] );
	const [ lines, setLines ] = useState( [] );
	const [ pick, setPick ] = useState( '' );
	const [ name, setName ] = useState( '' );
	const [ phone, setPhone ] = useState( '' );
	const [ notes, setNotes ] = useState( '' );
	const [ saving, setSaving ] = useState( false );
	const [ error, setError ] = useState( '' );

	useEffect( () => {
		api.getState().then( ( s ) => {
			// Only items with at least one price are orderable.
			const priced = ( s.items || [] )
				.filter( ( it ) => ( it.prices || [] ).length > 0 && it.title )
				.map( ( it ) => ( { id: it.id, title: it.title, unit: Number( it.prices[ 0 ].amount ) || 0 } ) );
			setMenu( priced );
		} );
	}, [] );

	const addLine = ( id ) => {
		const it = menu.find( ( m ) => m.id === id );
		if ( ! it ) {
			return;
		}
		setLines( ( ls ) => {
			const existing = ls.find( ( l ) => l.id === id );
			return existing
				? ls.map( ( l ) => ( l.id === id ? { ...l, qty: l.qty + 1 } : l ) )
				: [ ...ls, { id, title: it.title, unit: it.unit, qty: 1 } ];
		} );
		setPick( '' );
	};
	const setQty = ( id, d ) => setLines( ( ls ) => ls.map( ( l ) => ( l.id === id ? { ...l, qty: Math.max( 1, l.qty + d ) } : l ) ).filter( ( l ) => l.qty > 0 ) );
	const removeLine = ( id ) => setLines( ( ls ) => ls.filter( ( l ) => l.id !== id ) );
	const total = lines.reduce( ( s, l ) => s + l.unit * l.qty, 0 );

	const create = async () => {
		if ( ! lines.length ) {
			setError( 'Add at least one item.' );
			return;
		}
		setSaving( true );
		setError( '' );
		try {
			const order = await api.createOrder( {
				items: lines.map( ( l ) => ( { itemId: l.id, qty: l.qty } ) ),
				name,
				phone,
				notes,
				when: 'asap',
				payment: 'unpaid',
			} );
			onCreated( order );
		} catch ( e ) {
			setError( e.message || 'Could not create the order.' );
		} finally {
			setSaving( false );
		}
	};

	return (
		<Card sx={ { p: 2.5, mb: 2 } }>
			<Typography variant="subtitle2" sx={ { color: tokens.ink, mb: 1.5 } }>New order (phone / walk-in)</Typography>
			<Stack direction="row" spacing={ 1.5 } flexWrap="wrap" useFlexGap sx={ { mb: 1.5 } }>
				<Select
					size="small"
					displayEmpty
					value={ pick }
					onChange={ ( e ) => addLine( e.target.value ) }
					sx={ { minWidth: 260 } }
					renderValue={ () => 'Add an item…' }
				>
					{ menu.length === 0 && <MenuItem value="" disabled>No priced items yet</MenuItem> }
					{ menu.map( ( m ) => (
						<MenuItem key={ m.id } value={ m.id }>{ m.title } · { money( m.unit ) }</MenuItem>
					) ) }
				</Select>
				<TextField size="small" label="Customer name" value={ name } onChange={ ( e ) => setName( e.target.value ) } sx={ { width: 200 } } />
				<TextField size="small" label="Phone" value={ phone } onChange={ ( e ) => setPhone( e.target.value ) } sx={ { width: 160 } } />
			</Stack>

			{ lines.length > 0 && (
				<Stack spacing={ 0.75 } sx={ { mb: 1.5 } }>
					{ lines.map( ( l ) => (
						<Stack key={ l.id } direction="row" alignItems="center" spacing={ 1 } sx={ { bgcolor: tokens.soft, borderRadius: 2, px: 1.5, py: 0.75 } }>
							<Typography sx={ { flex: 1, fontSize: 14 } }>{ l.title }</Typography>
							<IconButton size="small" onClick={ () => setQty( l.id, -1 ) }>−</IconButton>
							<Typography sx={ { width: 24, textAlign: 'center', fontWeight: 700 } }>{ l.qty }</Typography>
							<IconButton size="small" onClick={ () => setQty( l.id, 1 ) }>+</IconButton>
							<Typography sx={ { width: 70, textAlign: 'right', fontWeight: 650 } }>{ money( l.unit * l.qty ) }</Typography>
							<IconButton size="small" onClick={ () => removeLine( l.id ) } sx={ { color: tokens.muted2 } }><DeleteOutlineIcon fontSize="small" /></IconButton>
						</Stack>
					) ) }
				</Stack>
			) }

			<TextField size="small" fullWidth label="Notes (optional)" value={ notes } onChange={ ( e ) => setNotes( e.target.value ) } sx={ { mb: 1.5 } } />
			{ error && <Typography sx={ { color: tokens.red, fontSize: 13, mb: 1 } }>{ error }</Typography> }
			<Stack direction="row" alignItems="center" spacing={ 2 }>
				<Typography sx={ { fontWeight: 700, fontSize: 16 } }>Total: { money( total ) }</Typography>
				<Box sx={ { flex: 1 } } />
				<Button onClick={ onCancel } sx={ { color: tokens.muted } }>Cancel</Button>
				<Button variant="contained" onClick={ create } disabled={ saving || lines.length === 0 }>
					{ saving ? 'Creating…' : 'Create order' }
				</Button>
			</Stack>
		</Card>
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
					sx={ { fontFamily: 'monospace', fontWeight: 600, bgcolor: tokens.soft } }
				/>
			</Stack>
			<Typography sx={ { fontSize: 12, color: tokens.muted2, mt: 1.5 } }>
				Card payment (your own Stripe, 0% commission) plugs in from Integrations — coming soon.
			</Typography>
			<Snackbar open={ copied } autoHideDuration={ 1800 } onClose={ () => setCopied( false ) } message="Shortcode copied" anchorOrigin={ { vertical: 'bottom', horizontal: 'center' } } />
		</Box>
	);
}
