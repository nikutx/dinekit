import React, { useEffect, useMemo, useState } from 'react';
import { Box, Stack, Typography, Button, IconButton, Chip, CircularProgress, Modal, ToggleButton, ToggleButtonGroup } from '../ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import TableRestaurantIcon from '@mui/icons-material/TableRestaurant';
import TakeoutDiningIcon from '@mui/icons-material/TakeoutDining';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import { tokens } from '../theme';
import { api } from '../api/client';
import { printDoc, esc } from '../lib/print';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import Card from './ui/Card';

const COURSES = [ '', 'Drinks', 'Starters', 'Mains', 'Desserts' ];
const OPEN_TAB = [ 'open', 'sent', 'preparing', 'served', 'bill' ];

export default function POSView() {
	const [ loading, setLoading ] = useState( true );
	const [ floor, setFloor ] = useState( { tables: [], areas: [], combos: [] } );
	const [ sections, setSections ] = useState( [] );
	const [ orders, setOrders ] = useState( [] ); // open dine-in tabs
	const [ cur, setCur ] = useState( { symbol: '£', position: 'before' } );
	const [ active, setActive ] = useState( null ); // { tableId, tableName, order|null, takeaway? }
	const [ course, setCourse ] = useState( '' );
	const [ mod, setMod ] = useState( null ); // item being configured
	const [ bill, setBill ] = useState( false ); // bill/pay sheet open
	const [ cashUp, setCashUp ] = useState( false ); // cash-up sheet open
	const [ moveOpen, setMoveOpen ] = useState( false ); // transfer-table picker
	const [ busy, setBusy ] = useState( false );
	const caps = ( typeof window !== 'undefined' && window.DINEKIT && window.DINEKIT.caps ) || {};

	useEffect( () => {
		Promise.all( [
			api.getFloor().catch( () => ( { tables: [], areas: [], combos: [] } ) ),
			api.getPosMenu().catch( () => ( { sections: [] } ) ),
			api.getOrders().catch( () => [] ),
			api.getState().catch( () => ( {} ) ),
		] ).then( ( [ f, m, o, s ] ) => {
			setFloor( f || { tables: [], areas: [] } );
			setSections( ( m && m.sections ) || [] );
			setOrders( ( o || [] ).filter( ( x ) => 'dine_in' === x.channel && OPEN_TAB.includes( x.status ) && ! x.archived ) );
			if ( s.currency ) {
				setCur( { symbol: s.currency || '£', position: s.currencyPosition || 'before' } );
			}
		} ).finally( () => setLoading( false ) );
	}, [] );

	const money = ( n ) => {
		const v = Number( n || 0 ).toFixed( 2 );
		return 'after' === cur.position ? `${ v }${ cur.symbol }` : `${ cur.symbol }${ v }`;
	};
	const tabFor = ( tableId ) => orders.find( ( o ) => o.tableId === tableId );

	const openTable = ( t ) => { setActive( { tableId: t.id, tableName: t.name, order: tabFor( t.id ) || null } ); setCourse( '' ); };
	const openTakeaway = () => { setActive( { tableId: 0, tableName: 'Takeaway', order: null, takeaway: true } ); setCourse( '' ); };
	const back = () => setActive( null );

	// Reflect an updated/created order into both the active pad and the tab list.
	const syncOrder = ( order ) => {
		setActive( ( a ) => ( a ? { ...a, order } : a ) );
		setOrders( ( os ) => {
			const without = os.filter( ( o ) => o.id !== order.id );
			return 'dine_in' === order.channel && OPEN_TAB.includes( order.status ) ? [ ...without, order ] : without;
		} );
	};

	const addLine = async ( line ) => {
		if ( ! active ) {
			return;
		}
		setBusy( true );
		try {
			const payload = { ...line, course };
			const order = active.order
				? await api.addOrderLines( active.order.id, [ payload ] )
				: await api.createOrder( { channel: active.takeaway ? 'takeaway' : 'dine_in', tableId: active.tableId, items: [ payload ] } );
			syncOrder( order );
		} finally {
			setBusy( false );
		}
	};

	const chooseItem = ( item ) => {
		if ( item.available === false ) {
			return;
		}
		const hasVariants = ( item.prices || [] ).length > 1;
		const hasMods = ( item.modifiers || [] ).length > 0;
		if ( hasVariants || hasMods ) {
			setMod( item );
		} else {
			addLine( { itemId: item.id, qty: 1, priceIndex: 0 } );
		}
	};

	// 86 / restock a menu item (optimistic; reverts on failure).
	const eightySix = async ( item ) => {
		const out = item.available !== false;
		const flip = ( av ) => setSections( ( secs ) => secs.map( ( s ) => ( { ...s, items: s.items.map( ( it ) => ( it.id === item.id ? { ...it, available: av } : it ) ) } ) ) );
		flip( ! out );
		try { await api.setItemStock( item.id, out ); } catch ( e ) { flip( out ); }
	};

	// Transfer the open tab to another table.
	const transfer = async ( t ) => {
		if ( ! active || ! active.order ) {
			setMoveOpen( false );
			return;
		}
		setBusy( true );
		try {
			const updated = await api.updateOrder( active.order.id, { action: 'transfer', tableId: t.id } );
			setActive( ( a ) => ( { ...a, tableId: t.id, tableName: t.name, order: updated } ) );
			setOrders( ( os ) => os.map( ( o ) => ( o.id === updated.id ? updated : o ) ) );
			setMoveOpen( false );
		} finally { setBusy( false ); }
	};

	const fire = async () => {
		if ( ! active || ! active.order ) {
			return;
		}
		setBusy( true );
		try {
			syncOrder( await api.updateOrder( active.order.id, { action: 'fire' } ) );
		} finally {
			setBusy( false );
		}
	};
	const voidLine = async ( idx ) => {
		if ( ! active || ! active.order ) {
			return;
		}
		setBusy( true );
		try {
			syncOrder( await api.updateOrder( active.order.id, { action: 'void_line', line: idx } ) );
		} finally {
			setBusy( false );
		}
	};

	if ( loading ) {
		return (
			<Page>
				<PageHeader title="Take Order" subtitle="Take a table's order and fire it to the kitchen." />
				<Stack alignItems="center" sx={ { py: 8 } }><CircularProgress /></Stack>
			</Page>
		);
	}

	// ---- Table picker ----
	if ( ! active ) {
		const zones = ( floor.areas || [] ).map( ( a ) => ( { id: a.id, name: a.name } ) );
		if ( ( floor.tables || [] ).some( ( t ) => ! ( t.areaId || 0 ) ) ) {
			zones.push( { id: 0, name: 'Tables' } );
		}
		return (
			<Page>
				<PageHeader
					title="Take Order"
					subtitle="Pick a table to start or continue a tab, or take a counter order."
					actions={
						<>
							<Button variant="outlined" startIcon={ <PointOfSaleIcon /> } onClick={ () => setCashUp( true ) }>Cash-up</Button>
							<Button variant="contained" startIcon={ <TakeoutDiningIcon /> } onClick={ openTakeaway }>Quick takeaway</Button>
						</>
					}
				/>
				{ cashUp && <CashSheet money={ money } onClose={ () => setCashUp( false ) } /> }
				{ ( floor.tables || [] ).length === 0 ? (
					<Card sx={ { p: 3 } }>
						<Typography sx={ { color: tokens.muted } }>No tables yet — add tables in Floor Plan first, or take a counter order with “Quick takeaway”.</Typography>
					</Card>
				) : zones.map( ( z ) => {
					const zt = ( floor.tables || [] ).filter( ( t ) => ( t.areaId || 0 ) === z.id );
					if ( ! zt.length ) {
						return null;
					}
					return (
						<Box key={ z.id } sx={ { mb: 3 } }>
							<Typography sx={ { fontSize: 11, fontWeight: 650, letterSpacing: '0.08em', textTransform: 'uppercase', color: tokens.muted, mb: 1, px: 0.5 } }>{ z.name }</Typography>
							<Box sx={ { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1.5 } }>
								{ zt.map( ( t ) => {
									const tab = tabFor( t.id );
									const off = 'maintenance' === t.status;
									return (
										<Card
											key={ t.id }
											hover={ ! off }
											onClick={ off ? undefined : () => openTable( t ) }
											sx={ { p: 1.75, opacity: off ? 0.5 : 1, borderColor: tab ? tokens.accent : tokens.border, borderWidth: tab ? 2 : 1, borderStyle: 'solid', cursor: off ? 'not-allowed' : 'pointer' } }
										>
											<Stack direction="row" alignItems="center" spacing={ 1 } sx={ { mb: 0.5 } }>
												<TableRestaurantIcon sx={ { fontSize: 18, color: tab ? tokens.accent : tokens.muted2 } } />
												<Typography sx={ { fontWeight: 700, fontSize: 15, color: tokens.ink } }>{ t.name }</Typography>
											</Stack>
											{ tab ? (
												<Typography sx={ { fontSize: 12.5, color: tokens.accentDark, fontWeight: 600 } }>
													Open · { money( tab.total ) } · { ( tab.items || [] ).length } item{ ( tab.items || [] ).length === 1 ? '' : 's' }
												</Typography>
											) : (
												<Typography sx={ { fontSize: 12.5, color: off ? tokens.amber : tokens.muted } }>{ off ? 'Maintenance' : `${ t.seats } seats · free` }</Typography>
											) }
										</Card>
									);
								} ) }
							</Box>
						</Box>
					);
				} ) }
			</Page>
		);
	}

	// ---- Order pad ----
	const lines = ( active.order && active.order.items ) || [];
	const total = active.order ? active.order.total : 0;
	const unfired = lines.filter( ( l ) => ! l.fired ).length;

	return (
		<Page width="100%">
			<Stack direction="row" alignItems="center" spacing={ 1.5 } sx={ { mb: 2 } }>
				<IconButton onClick={ back } sx={ { border: `1px solid ${ tokens.border }`, borderRadius: 2 } }><ArrowBackIcon /></IconButton>
				<Box sx={ { flex: 1, minWidth: 0 } }>
					<Typography variant="h5">{ active.tableName }</Typography>
					<Typography sx={ { fontSize: 13, color: tokens.muted } }>
						{ active.order ? `Open tab · ${ money( total ) }` : ( active.takeaway ? 'New counter order' : 'New tab — add the first item' ) }
					</Typography>
				</Box>
				{ active.order && ! active.takeaway && (
					<Button variant="outlined" startIcon={ <TableRestaurantIcon /> } onClick={ () => setMoveOpen( true ) }>Move</Button>
				) }
			</Stack>

			<Stack direction={ { xs: 'column', md: 'row' } } spacing={ 2 } alignItems="flex-start">
				{ /* Menu grid */ }
				<Box sx={ { flex: 1, minWidth: 0, width: '100%' } }>
					<ToggleButtonGroup size="small" exclusive value={ course } onChange={ ( e, v ) => setCourse( v == null ? '' : v ) } sx={ { mb: 2, flexWrap: 'wrap' } }>
						{ COURSES.map( ( c ) => <ToggleButton key={ c || 'any' } value={ c }>{ c || 'No course' }</ToggleButton> ) }
					</ToggleButtonGroup>
					{ sections.length === 0 && <Typography sx={ { color: tokens.muted } }>No menu items yet — add some in Menu Builder.</Typography> }
					{ sections.map( ( sec ) => (
						<Box key={ sec.id } sx={ { mb: 2.5 } }>
							<Typography sx={ { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted, mb: 1 } }>{ sec.name }</Typography>
							<Box sx={ { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 1 } }>
								{ ( sec.items || [] ).map( ( item ) => {
									const off = item.available === false;
									return (
										<Card key={ item.id } hover={ ! off } onClick={ off ? undefined : () => chooseItem( item ) } sx={ { p: 1.25, cursor: off ? 'default' : 'pointer', position: 'relative', opacity: off ? 0.55 : 1 } }>
											<Typography sx={ { fontWeight: 600, fontSize: 13.5, color: tokens.ink, lineHeight: 1.25, pr: 3 } }>{ item.title }</Typography>
											<Typography sx={ { fontSize: 12.5, color: off ? tokens.red : tokens.accentDark, fontWeight: 700, mt: 0.5, fontVariantNumeric: 'tabular-nums' } }>
												{ off ? '86’d — out of stock' : ( ( item.prices || [] ).length > 1 ? `from ${ money( item.prices[ 0 ].amount ) }` : money( ( item.prices[ 0 ] || {} ).amount ) ) }
												{ ! off && ( item.modifiers || [] ).length > 0 ? ' · options' : '' }
											</Typography>
											<Box component="button" onClick={ ( e ) => { e.stopPropagation(); eightySix( item ); } } sx={ { position: 'absolute', top: 4, right: 4, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 10.5, fontWeight: 700, color: off ? tokens.green : tokens.muted2, padding: '2px 4px' } }>
												{ off ? 'Restock' : '86' }
											</Box>
										</Card>
									);
								} ) }
							</Box>
						</Box>
					) ) }
				</Box>

				{ /* Tab panel */ }
				<Box sx={ { width: { xs: '100%', md: 360 }, flexShrink: 0, position: { md: 'sticky' }, top: { md: 16 } } }>
					<Card sx={ { p: 0, overflow: 'hidden' } }>
						<Box sx={ { p: 1.75, borderBottom: `1px solid ${ tokens.border }` } }>
							<Typography sx={ { fontWeight: 700, fontSize: 15 } }>The tab</Typography>
						</Box>
						<Box sx={ { maxHeight: 420, overflowY: 'auto' } }>
							{ lines.length === 0 ? (
								<Typography sx={ { p: 2, fontSize: 13, color: tokens.muted } }>Tap items to add them to this tab.</Typography>
							) : lines.map( ( l, i ) => (
								<Stack key={ i } direction="row" alignItems="flex-start" spacing={ 1 } sx={ { px: 1.75, py: 1, borderBottom: `1px solid ${ tokens.soft }` } }>
									<Typography sx={ { fontWeight: 700, fontSize: 13, width: 22, color: tokens.muted, fontVariantNumeric: 'tabular-nums' } }>{ l.qty }×</Typography>
									<Box sx={ { flex: 1, minWidth: 0 } }>
										<Typography sx={ { fontSize: 13.5, fontWeight: 600, color: tokens.ink } }>
											{ l.title }{ l.priceLabel ? ` · ${ l.priceLabel }` : '' }
										</Typography>
										{ ( l.chosen || [] ).length > 0 && <Typography sx={ { fontSize: 11.5, color: tokens.muted } }>+ { l.chosen.map( ( c ) => c.label ).join( ', ' ) }</Typography> }
										{ ( l.removed || [] ).length > 0 && <Typography sx={ { fontSize: 11.5, color: tokens.red } }>− { l.removed.join( ', ' ) }</Typography> }
										<Stack direction="row" spacing={ 0.75 } sx={ { mt: 0.25 } }>
											{ l.course ? <Chip label={ l.course } size="small" sx={ { height: 17, fontSize: 10.5, bgcolor: tokens.soft, color: tokens.muted } } /> : null }
											<Chip label={ l.fired ? 'Fired' : 'New' } size="small" sx={ { height: 17, fontSize: 10.5, bgcolor: l.fired ? tokens.greenSoft : tokens.amberSoft, color: l.fired ? tokens.green : tokens.amber, fontWeight: 700 } } />
										</Stack>
									</Box>
									<Typography sx={ { fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' } }>{ money( l.lineTotal ) }</Typography>
									{ ( ! l.fired || caps.refunds ) && (
										<IconButton size="small" disabled={ busy } onClick={ () => voidLine( i ) } sx={ { color: l.fired ? tokens.red : tokens.muted2 } }><DeleteOutlineIcon fontSize="small" /></IconButton>
									) }
								</Stack>
							) ) }
						</Box>
						<Box sx={ { p: 1.75, borderTop: `1px solid ${ tokens.border }` } }>
							<Stack direction="row" justifyContent="space-between" sx={ { mb: 1.5 } }>
								<Typography sx={ { fontWeight: 700, fontSize: 15 } }>Total</Typography>
								<Typography sx={ { fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums' } }>{ money( total ) }</Typography>
							</Stack>
							<Button
								variant="contained"
								fullWidth
								startIcon={ <LocalFireDepartmentIcon /> }
								disabled={ busy || unfired === 0 }
								onClick={ fire }
							>
								{ unfired > 0 ? `Fire ${ unfired } to kitchen` : 'Nothing to fire' }
							</Button>
							<Button
								variant="outlined"
								fullWidth
								startIcon={ <ReceiptLongIcon /> }
								disabled={ ! active.order || lines.length === 0 }
								onClick={ () => setBill( true ) }
								sx={ { mt: 1 } }
							>
								Bill &amp; pay
							</Button>
						</Box>
					</Card>
				</Box>
			</Stack>

			{ mod && (
				<ModifierSheet
					item={ mod }
					money={ money }
					onClose={ () => setMod( null ) }
					onAdd={ ( line ) => { setMod( null ); addLine( line ); } }
				/>
			) }

			{ moveOpen && (
				<Modal open onClose={ () => setMoveOpen( false ) }>
					<Box sx={ { p: 3, maxHeight: '80vh', overflowY: 'auto' } }>
						<Typography variant="h6" sx={ { mb: 2 } }>Move { active.tableName } to…</Typography>
						<Box sx={ { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 1 } }>
							{ ( floor.tables || [] ).filter( ( t ) => t.id !== active.tableId && 'maintenance' !== t.status ).map( ( t ) => (
								<Button key={ t.id } variant="outlined" disabled={ busy } onClick={ () => transfer( t ) }>{ t.name }</Button>
							) ) }
						</Box>
					</Box>
				</Modal>
			) }

			{ bill && active.order && (
				<BillSheet
					order={ active.order }
					money={ money }
					tableName={ active.tableName }
					onUpdate={ syncOrder }
					onClose={ () => setBill( false ) }
					onSettled={ () => { setBill( false ); back(); } }
				/>
			) }
		</Page>
	);
}

// Configure variant/price + modifier choices for an item before adding to the tab.
function ModifierSheet( { item, money, onAdd, onClose } ) {
	const [ priceIndex, setPriceIndex ] = useState( 0 );
	const [ qty, setQty ] = useState( 1 );
	const [ choices, setChoices ] = useState( {} ); // groupIdx -> [optIdx]
	const [ removed, setRemoved ] = useState( {} ); // groupIdx -> [optIdx]
	const groups = item.modifiers || [];
	const variants = item.prices || [];

	const toggle = ( map, setMap, gi, oi, single ) => {
		setMap( ( m ) => {
			const cur = m[ gi ] || [];
			let next;
			if ( single ) {
				next = cur.includes( oi ) ? [] : [ oi ];
			} else {
				next = cur.includes( oi ) ? cur.filter( ( x ) => x !== oi ) : [ ...cur, oi ];
			}
			return { ...m, [ gi ]: next };
		} );
	};

	const preview = useMemo( () => {
		let unit = Number( ( variants[ priceIndex ] || variants[ 0 ] || {} ).amount || 0 );
		groups.forEach( ( g, gi ) => {
			if ( 'choose' === g.type ) {
				( choices[ gi ] || [] ).forEach( ( oi ) => { unit += Number( ( g.options[ oi ] || {} ).price || 0 ); } );
			}
		} );
		return unit * qty;
	}, [ priceIndex, qty, choices, groups, variants ] );

	const add = () => onAdd( { itemId: item.id, qty, priceIndex, choices, removed } );

	return (
		<Modal open onClose={ onClose }>
			<Box sx={ { p: 3, maxHeight: '80vh', overflowY: 'auto' } }>
				<Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={ { mb: 2 } }>
					<Typography variant="h6">{ item.title }</Typography>
					<IconButton size="small" onClick={ onClose }><CloseIcon fontSize="small" /></IconButton>
				</Stack>

				{ variants.length > 1 && (
					<Box sx={ { mb: 2 } }>
						<Typography sx={ { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted, mb: 1 } }>Size</Typography>
						<Stack direction="row" spacing={ 1 } flexWrap="wrap" useFlexGap>
							{ variants.map( ( p, i ) => (
								<Chip
									key={ i }
									label={ `${ p.label || 'Standard' } · ${ money( p.amount ) }` }
									onClick={ () => setPriceIndex( i ) }
									sx={ { fontWeight: 700, bgcolor: priceIndex === i ? tokens.accentSoft : tokens.soft, color: priceIndex === i ? tokens.accentDark : tokens.ink2, cursor: 'pointer' } }
								/>
							) ) }
						</Stack>
					</Box>
				) }

				{ groups.map( ( g, gi ) => {
					const single = 'choose' === g.type && Number( g.max ) === 1;
					const isRemove = 'remove' === g.type;
					const map = isRemove ? removed : choices;
					const setMap = isRemove ? setRemoved : setChoices;
					return (
						<Box key={ gi } sx={ { mb: 2 } }>
							<Typography sx={ { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted, mb: 1 } }>{ g.name }</Typography>
							<Stack direction="row" spacing={ 1 } flexWrap="wrap" useFlexGap>
								{ ( g.options || [] ).map( ( opt, oi ) => {
									const on = ( map[ gi ] || [] ).includes( oi );
									return (
										<Chip
											key={ oi }
											label={ `${ isRemove ? 'No ' : '' }${ opt.label }${ ! isRemove && Number( opt.price ) ? ` +${ money( opt.price ) }` : '' }` }
											onClick={ () => toggle( map, setMap, gi, oi, single ) }
											sx={ { fontWeight: 600, bgcolor: on ? ( isRemove ? tokens.redSoft : tokens.accentSoft ) : tokens.soft, color: on ? ( isRemove ? tokens.red : tokens.accentDark ) : tokens.ink2, cursor: 'pointer' } }
										/>
									);
								} ) }
							</Stack>
						</Box>
					);
				} ) }

				<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mt: 3 } }>
					<Stack direction="row" alignItems="center" spacing={ 1 }>
						<IconButton size="small" onClick={ () => setQty( ( q ) => Math.max( 1, q - 1 ) ) } sx={ { border: `1px solid ${ tokens.border }` } }><RemoveIcon fontSize="small" /></IconButton>
						<Typography sx={ { fontWeight: 700, width: 24, textAlign: 'center', fontVariantNumeric: 'tabular-nums' } }>{ qty }</Typography>
						<IconButton size="small" onClick={ () => setQty( ( q ) => Math.min( 20, q + 1 ) ) } sx={ { border: `1px solid ${ tokens.border }` } }><AddIcon fontSize="small" /></IconButton>
					</Stack>
					<Button variant="contained" onClick={ add }>Add · { money( preview ) }</Button>
				</Stack>
			</Box>
		</Modal>
	);
}

const round2 = ( n ) => Math.round( n * 100 ) / 100;

// Settle a tab: service charge + tip, then take payment (cash w/ change, or
// card/voucher/comp settling the balance). Auto-closes when fully paid.
function BillSheet( { order, money, tableName, onUpdate, onClose, onSettled } ) {
	const [ cash, setCash ] = useState( '' );
	const [ tipInput, setTipInput ] = useState( order.tip && Number( order.tip ) ? String( order.tip ) : '' );
	const [ shares, setShares ] = useState( 1 );
	const [ sharesPaid, setSharesPaid ] = useState( 0 );
	const [ qr, setQr ] = useState( '' ); // pay-by-QR svg
	const [ payToken, setPayToken ] = useState( '' );
	const [ mode, setMode ] = useState( 'even' ); // split mode: even | item
	const [ paidIdx, setPaidIdx ] = useState( [] ); // line indexes already settled (by-item)
	const [ sel, setSel ] = useState( [] ); // currently selected line indexes (by-item)
	const [ emailTo, setEmailTo ] = useState( '' );
	const [ emailed, setEmailed ] = useState( false );
	const [ term, setTerm ] = useState( null ); // { paired, ready }
	const [ readerMsg, setReaderMsg ] = useState( '' );
	const [ busy, setBusy ] = useState( false );
	const caps = ( typeof window !== 'undefined' && window.DINEKIT && window.DINEKIT.caps ) || {};

	useEffect( () => { if ( 'completed' === order.status ) { onSettled(); } }, [ order.status ] );
	useEffect( () => { api.getTerminal().then( setTerm ).catch( () => setTerm( { paired: false } ) ); }, [] );

	const food = Number( order.total );
	const svcApplied = Number( order.service ) > 0;
	const grand = Number( order.grandTotal );
	const balance = Number( order.balance );
	const cashN = Number( cash || 0 );
	const lines = order.items || [];
	const selSubtotal = round2( sel.reduce( ( s, i ) => s + Number( ( lines[ i ] || {} ).lineTotal || 0 ), 0 ) );
	// The amount the current tender settles: selected items (by-item), an even
	// share (even split), else the whole remaining balance.
	const charge = 'item' === mode
		? round2( Math.min( sel.length ? selSubtotal : balance, balance ) )
		: round2( Math.min( shares > 1 ? balance / Math.max( 1, shares - sharesPaid ) : balance, balance ) );
	const change = cashN > charge ? round2( cashN - charge ) : 0;

	const setCharges = async ( patch ) => {
		setBusy( true );
		try { onUpdate( await api.updateOrder( order.id, { action: 'set_charges', ...patch } ) ); } finally { setBusy( false ); }
	};
	const toggleService = () => setCharges( { service: svcApplied ? 0 : round2( food * 0.125 ) } );

	const tender = async ( type, amount ) => {
		if ( amount <= 0 ) {
			return;
		}
		setBusy( true );
		try {
			const updated = await api.updateOrder( order.id, { action: 'tender', tenderType: type, amount } );
			onUpdate( updated );
			if ( 'completed' === updated.status ) {
				printReceipt( updated, 'cash' === type ? change : 0 );
				onSettled();
			} else {
				setCash( '' );
				if ( 'item' === mode ) {
					setPaidIdx( ( p ) => [ ...p, ...sel ] );
					setSel( [] );
				} else if ( shares > 1 ) {
					setSharesPaid( ( p ) => p + 1 );
				}
			}
		} finally { setBusy( false ); }
	};
	// Empty cash box = exact amount; a smaller amount = a partial payment.
	const takeCash = () => tender( 'cash', cashN > 0 && cashN < charge ? round2( cashN ) : charge );

	// Card reader (Stripe Terminal): charge the reader, then poll the tab until
	// the webhook records the card tender.
	const payReader = async () => {
		setBusy( true );
		setReaderMsg( 'Follow the prompt on the reader…' );
		try {
			await api.terminalCharge( order.id, charge );
			let tries = 0;
			const iv = setInterval( async () => {
				tries++;
				try {
					const os = await api.getOrders();
					const o = ( os || [] ).find( ( x ) => x.id === order.id );
					if ( o ) {
						onUpdate( o );
						if ( 'completed' === o.status || Number( o.balance ) <= 0 ) {
							clearInterval( iv );
							setReaderMsg( '' );
							if ( 'completed' === o.status ) {
								onSettled();
							}
						}
					}
				} catch ( e ) { /* keep polling */ }
				if ( tries > 25 ) {
					clearInterval( iv );
					setReaderMsg( '' );
				}
			}, 3000 );
		} catch ( e ) {
			setReaderMsg( ( e && e.message ) || 'Could not start the reader.' );
		} finally { setBusy( false ); }
	};

	const emailReceipt = async () => {
		if ( ! emailTo ) {
			return;
		}
		setBusy( true );
		try {
			await api.updateOrder( order.id, { action: 'email_receipt', email: emailTo } );
			setEmailed( true );
			setTimeout( () => setEmailed( false ), 2500 );
		} finally { setBusy( false ); }
	};

	// Pay-by-QR: mint a pay link, show its QR, and poll until the customer pays.
	const showQr = async () => {
		setBusy( true );
		try {
			const updated = await api.updateOrder( order.id, { action: 'pay_link' } );
			onUpdate( updated );
			const url = updated.payUrl || '';
			setPayToken( url ? ( new URL( url ).searchParams.get( 'dinekit_pay' ) || '' ) : '' );
			const r = await api.getQr( url );
			setQr( r.svg || '' );
		} finally { setBusy( false ); }
	};
	useEffect( () => {
		if ( ! payToken ) {
			return;
		}
		const iv = setInterval( () => {
			api.payStatus( payToken ).then( ( s ) => {
				if ( s && Number( s.balance ) <= 0 ) {
					clearInterval( iv );
					onSettled();
				}
			} ).catch( () => {} );
		}, 3000 );
		return () => clearInterval( iv );
	}, [ payToken ] );

	const printReceipt = ( o, changeGiven ) => {
		const rows = ( o.items || [] ).map( ( l ) =>
			`<tr><td>${ l.qty }× ${ esc( l.title ) }${ l.priceLabel ? ' (' + esc( l.priceLabel ) + ')' : '' }</td><td class="r">${ money( l.lineTotal ) }</td></tr>`
		).join( '' );
		const extra = [];
		if ( Number( o.service ) ) extra.push( `<tr><td>Service</td><td class="r">${ money( o.service ) }</td></tr>` );
		if ( Number( o.tip ) ) extra.push( `<tr><td>Tip</td><td class="r">${ money( o.tip ) }</td></tr>` );
		if ( Number( o.discount ) ) extra.push( `<tr><td>Discount</td><td class="r">−${ money( o.discount ) }</td></tr>` );
		const tenders = ( o.tenders || [] ).map( ( t ) => `<tr><td>${ esc( t.type ) }</td><td class="r">${ money( t.amount ) }</td></tr>` ).join( '' );
		printDoc(
			'<style>body{font-family:monospace;font-size:12px;max-width:300px;margin:0 auto}h2{text-align:center;margin:4px 0}table{width:100%;border-collapse:collapse}td{padding:1px 0}.r{text-align:right}hr{border:none;border-top:1px dashed #000;margin:6px 0}.tot{font-weight:700;font-size:14px}</style>' +
			`<h2>Receipt</h2><div style="text-align:center">Order #${ o.number }${ o.table ? ' · ' + esc( o.table ) : '' }</div><hr>` +
			`<table>${ rows }</table><hr><table>${ extra.join( '' ) }<tr class="tot"><td>Total</td><td class="r">${ money( o.grandTotal ) }</td></tr></table>` +
			( tenders ? `<hr><table>${ tenders }${ changeGiven ? `<tr><td>Change</td><td class="r">${ money( changeGiven ) }</td></tr>` : '' }</table>` : '' ) +
			'<hr><div style="text-align:center">Thank you!</div>'
		);
	};

	return (
		<Modal open onClose={ onClose }>
			<Box sx={ { p: 3, maxHeight: '85vh', overflowY: 'auto' } }>
				<Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={ { mb: 2 } }>
					<Box>
						<Typography variant="h6">Bill — { tableName }</Typography>
						<Typography sx={ { fontSize: 13, color: tokens.muted } }>Order #{ order.number }</Typography>
					</Box>
					<IconButton size="small" onClick={ onClose }><CloseIcon fontSize="small" /></IconButton>
				</Stack>

				{ /* Totals */ }
				<Box sx={ { border: `1px solid ${ tokens.border }`, borderRadius: '10px', p: 1.5, mb: 2 } }>
					<Row label="Items" value={ money( food ) } />
					{ Number( order.service ) > 0 && <Row label="Service (12.5%)" value={ money( order.service ) } /> }
					{ Number( order.tip ) > 0 && <Row label="Tip" value={ money( order.tip ) } /> }
					<Box sx={ { borderTop: `1px solid ${ tokens.soft }`, mt: 0.75, pt: 0.75 } }>
						<Row label="Total" value={ money( grand ) } bold />
						{ Number( order.paid ) > 0 && <Row label="Paid" value={ money( order.paid ) } /> }
						<Row label="Balance" value={ money( balance ) } bold accent />
					</Box>
				</Box>

				{ /* Charges */ }
				<Stack direction="row" spacing={ 1 } sx={ { mb: 2 } } flexWrap="wrap" useFlexGap>
					<Chip
						label={ svcApplied ? 'Service 12.5% ✓' : 'Add service 12.5%' }
						onClick={ busy ? undefined : toggleService }
						sx={ { fontWeight: 600, cursor: 'pointer', bgcolor: svcApplied ? tokens.accentSoft : tokens.soft, color: svcApplied ? tokens.accentDark : tokens.ink2 } }
					/>
					{ [ 5, 10, 12.5 ].map( ( pct ) => (
						<Chip key={ pct } label={ `Tip ${ pct }%` } onClick={ busy ? undefined : () => { const t = round2( food * pct / 100 ); setTipInput( String( t ) ); setCharges( { tip: t } ); } } sx={ { cursor: 'pointer', bgcolor: tokens.soft, color: tokens.ink2 } } />
					) ) }
				</Stack>

				{ /* Payment */ }
				<Typography sx={ { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted, mb: 1 } }>Take payment</Typography>
				<Stack direction="row" spacing={ 1 } sx={ { mb: 1.5 } }>
					<Chip label="Even split" onClick={ () => { setMode( 'even' ); setSel( [] ); } } sx={ { cursor: 'pointer', fontWeight: 600, bgcolor: 'even' === mode ? tokens.accentSoft : tokens.soft, color: 'even' === mode ? tokens.accentDark : tokens.ink2 } } />
					<Chip label="By item" onClick={ () => setMode( 'item' ) } sx={ { cursor: 'pointer', fontWeight: 600, bgcolor: 'item' === mode ? tokens.accentSoft : tokens.soft, color: 'item' === mode ? tokens.accentDark : tokens.ink2 } } />
				</Stack>
				{ 'even' === mode ? (
					<Stack direction="row" alignItems="center" spacing={ 1 } sx={ { mb: 1.5 } } flexWrap="wrap" useFlexGap>
						<Typography sx={ { fontSize: 13, color: tokens.muted } }>Split evenly</Typography>
						<IconButton size="small" disabled={ shares <= 1 } onClick={ () => setShares( ( s ) => Math.max( 1, s - 1 ) ) } sx={ { border: `1px solid ${ tokens.border }` } }><RemoveIcon fontSize="small" /></IconButton>
						<Typography sx={ { fontWeight: 700, width: 20, textAlign: 'center' } }>{ shares }</Typography>
						<IconButton size="small" onClick={ () => setShares( ( s ) => Math.min( 12, s + 1 ) ) } sx={ { border: `1px solid ${ tokens.border }` } }><AddIcon fontSize="small" /></IconButton>
						<Typography sx={ { fontSize: 13, color: tokens.muted } }>{ shares > 1 ? `${ sharesPaid }/${ shares } paid · ${ money( charge ) }/share` : 'whole bill' }</Typography>
					</Stack>
				) : (
					<Box sx={ { mb: 1.5, border: `1px solid ${ tokens.border }`, borderRadius: '10px', overflow: 'hidden' } }>
						{ lines.map( ( l, i ) => {
							const done = paidIdx.includes( i );
							const on = sel.includes( i );
							return (
								<Stack
									key={ i }
									direction="row"
									justifyContent="space-between"
									alignItems="center"
									onClick={ done ? undefined : () => setSel( ( s ) => s.includes( i ) ? s.filter( ( x ) => x !== i ) : [ ...s, i ] ) }
									sx={ { px: 1.25, py: 0.75, borderBottom: `1px solid ${ tokens.soft }`, cursor: done ? 'default' : 'pointer', bgcolor: on ? tokens.accentSoft : 'transparent', opacity: done ? 0.5 : 1 } }
								>
									<Typography sx={ { fontSize: 13, color: tokens.ink, textDecoration: done ? 'line-through' : 'none' } }>{ l.qty }× { l.title }</Typography>
									<Typography sx={ { fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' } }>{ done ? 'paid' : money( l.lineTotal ) }</Typography>
								</Stack>
							);
						} ) }
						<Box sx={ { px: 1.25, py: 0.75, bgcolor: tokens.soft } }>
							<Typography sx={ { fontSize: 12.5, color: tokens.muted } }>{ sel.length ? `Selected: ${ money( selSubtotal ) }` : 'Tap items to pay for them — or leave none to pay the remainder.' }</Typography>
						</Box>
					</Box>
				) }
				<Stack direction="row" spacing={ 1 } alignItems="center" sx={ { mb: 1.5 } } flexWrap="wrap" useFlexGap>
					<Box component="input" type="number" inputMode="decimal" placeholder={ charge < balance ? `Cash for ${ money( charge ) }` : 'Cash received' } value={ cash } onChange={ ( e ) => setCash( e.target.value ) }
						sx={ { width: 160, px: 1.25, py: 1, border: `1px solid ${ tokens.border2 }`, borderRadius: '9px', fontFamily: 'inherit', fontSize: 14, boxShadow: 'none', outline: 'none' } } />
					<Button variant="contained" disabled={ busy || balance <= 0 } onClick={ takeCash }>Take cash</Button>
					{ change > 0 && <Typography sx={ { fontWeight: 700, color: tokens.green } }>Change { money( change ) }</Typography> }
				</Stack>
				<Stack direction="row" spacing={ 1 } flexWrap="wrap" useFlexGap>
					<Button variant="outlined" disabled={ busy || balance <= 0 } onClick={ () => tender( 'card', charge ) }>Card · { money( charge ) }</Button>
					<Button variant="outlined" disabled={ busy || balance <= 0 } onClick={ () => tender( 'voucher', charge ) }>Voucher</Button>
					<Button variant="outlined" disabled={ busy || balance <= 0 || ! caps.refunds } onClick={ () => tender( 'comp', balance ) }>Comp</Button>
					<Button variant="outlined" startIcon={ <QrCode2Icon /> } disabled={ busy || balance <= 0 } onClick={ showQr }>Pay by QR</Button>
					{ term && term.paired && term.ready && (
						<Button variant="outlined" startIcon={ <PointOfSaleIcon /> } disabled={ busy || balance <= 0 } onClick={ payReader }>Card reader · { money( charge ) }</Button>
					) }
					<Box sx={ { flex: 1 } } />
					<Button variant="text" onClick={ () => printReceipt( order, 0 ) }>Print receipt</Button>
				</Stack>
				{ readerMsg && <Typography sx={ { mt: 1, fontSize: 13, color: tokens.accentDark, fontWeight: 600 } }>{ readerMsg }</Typography> }
				<Stack direction="row" spacing={ 1 } alignItems="center" sx={ { mt: 1 } } flexWrap="wrap" useFlexGap>
					<Box component="input" type="email" placeholder="Email receipt to…" value={ emailTo } onChange={ ( e ) => setEmailTo( e.target.value ) }
						sx={ { width: 200, px: 1.25, py: 0.75, border: `1px solid ${ tokens.border2 }`, borderRadius: '9px', fontFamily: 'inherit', fontSize: 13.5, boxShadow: 'none', outline: 'none' } } />
					<Button variant="text" disabled={ busy || ! emailTo } onClick={ emailReceipt }>{ emailed ? 'Sent ✓' : 'Email' }</Button>
				</Stack>

				{ qr && balance > 0 && (
					<Box sx={ { mt: 2, p: 2, border: `1px solid ${ tokens.border }`, borderRadius: '12px', textAlign: 'center' } }>
						<Typography sx={ { fontSize: 13, fontWeight: 600, color: tokens.ink, mb: 1 } }>
							Ask the customer to scan to pay { money( balance ) }
						</Typography>
						<Box sx={ { width: 180, mx: 'auto', '& svg': { width: '100%', height: 'auto', display: 'block' } } } dangerouslySetInnerHTML={ { __html: qr } } />
						<Stack direction="row" alignItems="center" justifyContent="center" spacing={ 1 } sx={ { mt: 1 } }>
							<CircularProgress size={ 14 } />
							<Typography sx={ { fontSize: 12, color: tokens.muted } }>Waiting for payment…</Typography>
						</Stack>
					</Box>
				) }
			</Box>
		</Modal>
	);
}

// Cash drawer: open a float, record pay in/out + no-sale, and run an X/Z report.
function CashSheet( { money, onClose } ) {
	const [ rep, setRep ] = useState( null ); // null=loading, {open:false} or X report
	const [ floatIn, setFloatIn ] = useState( '' );
	const [ amt, setAmt ] = useState( '' );
	const [ reason, setReason ] = useState( '' );
	const [ counted, setCounted ] = useState( '' );
	const [ z, setZ ] = useState( null ); // final Z report after close
	const [ term, setTerm ] = useState( null ); // card reader status
	const [ readers, setReaders ] = useState( null ); // reader list when pairing
	const [ busy, setBusy ] = useState( false );

	const load = () => api.getCash().then( setRep ).catch( () => setRep( { open: false } ) );
	useEffect( () => { load(); api.getTerminal().then( setTerm ).catch( () => setTerm( { paired: false } ) ); }, [] );

	const loadReaders = () => { setReaders( [] ); api.terminalReaders().then( setReaders ).catch( () => setReaders( [] ) ); };
	const pair = async ( r ) => { setBusy( true ); try { setTerm( await api.pairReader( r ? r.id : '', r ? r.label : '' ) ); setReaders( null ); } finally { setBusy( false ); } };

	const open = async () => { setBusy( true ); try { setRep( await api.openCash( Number( floatIn || 0 ) ) ); } finally { setBusy( false ); } };
	const move = async ( type ) => {
		setBusy( true );
		try { setRep( await api.cashMovement( { type, amount: Number( amt || 0 ), reason } ) ); setAmt( '' ); setReason( '' ); } finally { setBusy( false ); }
	};
	const close = async () => { setBusy( true ); try { setZ( await api.closeCash( Number( counted || 0 ) ) ); } finally { setBusy( false ); } };

	return (
		<Modal open onClose={ onClose }>
			<Box sx={ { p: 3, maxHeight: '85vh', overflowY: 'auto' } }>
				<Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={ { mb: 2 } }>
					<Typography variant="h6">Cash drawer</Typography>
					<IconButton size="small" onClick={ onClose }><CloseIcon fontSize="small" /></IconButton>
				</Stack>

				{ z ? (
					<Box>
						<Typography sx={ { fontWeight: 700, mb: 1 } }>Drawer closed (Z)</Typography>
						<Box sx={ { border: `1px solid ${ tokens.border }`, borderRadius: '10px', p: 1.5 } }>
							<Row label="Expected in drawer" value={ money( z.expected ) } />
							<Row label="Counted" value={ money( z.counted ) } />
							<Row label="Variance" value={ money( z.variance ) } bold accent />
						</Box>
						<Button variant="contained" fullWidth sx={ { mt: 2 } } onClick={ onClose }>Done</Button>
					</Box>
				) : null === rep ? (
					<Stack alignItems="center" sx={ { py: 4 } }><CircularProgress /></Stack>
				) : ! rep.open ? (
					<Box>
						<Typography sx={ { fontSize: 13.5, color: tokens.muted, mb: 1.5 } }>No drawer session is open. Enter the opening float to start.</Typography>
						<Stack direction="row" spacing={ 1 }>
							<Box component="input" type="number" inputMode="decimal" placeholder="Opening float" value={ floatIn } onChange={ ( e ) => setFloatIn( e.target.value ) }
								sx={ { flex: 1, px: 1.25, py: 1, border: `1px solid ${ tokens.border2 }`, borderRadius: '9px', fontFamily: 'inherit', fontSize: 14, boxShadow: 'none', outline: 'none' } } />
							<Button variant="contained" disabled={ busy } onClick={ open }>Open drawer</Button>
						</Stack>
					</Box>
				) : (
					<Box>
						{ /* X report */ }
						<Box sx={ { border: `1px solid ${ tokens.border }`, borderRadius: '10px', p: 1.5, mb: 2 } }>
							<Row label="Opening float" value={ money( rep.float ) } />
							<Row label="Cash sales" value={ money( rep.cashSales ) } />
							<Row label="Paid in" value={ money( rep.payIns ) } />
							<Row label="Paid out" value={ `−${ money( rep.payOuts ) }` } />
							<Box sx={ { borderTop: `1px solid ${ tokens.soft }`, mt: 0.75, pt: 0.75 } }>
								<Row label="Expected in drawer" value={ money( rep.expected ) } bold accent />
							</Box>
							<Typography sx={ { fontSize: 12, color: tokens.muted, mt: 0.5 } }>Since { new Date( rep.since ).toLocaleString() } · { rep.noSales } no-sale{ rep.noSales === 1 ? '' : 's' }</Typography>
						</Box>

						{ /* Movements */ }
						<Typography sx={ { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted, mb: 1 } }>Movement</Typography>
						<Stack direction="row" spacing={ 1 } sx={ { mb: 1 } } flexWrap="wrap" useFlexGap>
							<Box component="input" type="number" inputMode="decimal" placeholder="Amount" value={ amt } onChange={ ( e ) => setAmt( e.target.value ) }
								sx={ { width: 110, px: 1.25, py: 0.75, border: `1px solid ${ tokens.border2 }`, borderRadius: '9px', fontFamily: 'inherit', fontSize: 13.5, boxShadow: 'none', outline: 'none' } } />
							<Box component="input" type="text" placeholder="Reason" value={ reason } onChange={ ( e ) => setReason( e.target.value ) }
								sx={ { flex: 1, minWidth: 120, px: 1.25, py: 0.75, border: `1px solid ${ tokens.border2 }`, borderRadius: '9px', fontFamily: 'inherit', fontSize: 13.5, boxShadow: 'none', outline: 'none' } } />
						</Stack>
						<Stack direction="row" spacing={ 1 } sx={ { mb: 2 } } flexWrap="wrap" useFlexGap>
							<Button variant="outlined" disabled={ busy || Number( amt ) <= 0 } onClick={ () => move( 'in' ) }>Pay in</Button>
							<Button variant="outlined" disabled={ busy || Number( amt ) <= 0 } onClick={ () => move( 'out' ) }>Pay out</Button>
							<Button variant="outlined" disabled={ busy } onClick={ () => move( 'nosale' ) }>No-sale</Button>
						</Stack>

						{ /* Close (Z) */ }
						<Typography sx={ { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted, mb: 1 } }>End of day (Z)</Typography>
						<Stack direction="row" spacing={ 1 }>
							<Box component="input" type="number" inputMode="decimal" placeholder="Counted cash" value={ counted } onChange={ ( e ) => setCounted( e.target.value ) }
								sx={ { flex: 1, px: 1.25, py: 1, border: `1px solid ${ tokens.border2 }`, borderRadius: '9px', fontFamily: 'inherit', fontSize: 14, boxShadow: 'none', outline: 'none' } } />
							<Button variant="contained" disabled={ busy } onClick={ close }>Close drawer</Button>
						</Stack>
					</Box>
				) }

				{ /* Card reader (Stripe Terminal) pairing */ }
				{ ! z && (
					<Box sx={ { mt: 2.5, pt: 2, borderTop: `1px solid ${ tokens.border }` } }>
						<Typography sx={ { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted, mb: 1 } }>Card reader</Typography>
						{ term && ! term.ready ? (
							<Typography sx={ { fontSize: 13, color: tokens.muted } }>Connect Stripe (Integrations) to use a card reader.</Typography>
						) : term && term.paired ? (
							<Stack direction="row" alignItems="center" spacing={ 1 }>
								<Typography sx={ { fontSize: 13.5 } }>Paired: <strong>{ term.readerName || term.readerId }</strong></Typography>
								<Box sx={ { flex: 1 } } />
								<Button variant="text" disabled={ busy } onClick={ () => pair( null ) }>Unpair</Button>
							</Stack>
						) : null === readers ? (
							<Button variant="outlined" disabled={ busy } onClick={ loadReaders }>Pair a reader</Button>
						) : readers.length === 0 ? (
							<Typography sx={ { fontSize: 13, color: tokens.muted } }>No readers found on your Stripe account. Register a WisePOS E / Reader S700 in Stripe first.</Typography>
						) : (
							<Stack spacing={ 1 }>
								{ readers.map( ( r ) => (
									<Button key={ r.id } variant="outlined" disabled={ busy } onClick={ () => pair( r ) }>{ r.label } { r.status ? `· ${ r.status }` : '' }</Button>
								) ) }
							</Stack>
						) }
					</Box>
				) }
			</Box>
		</Modal>
	);
}

function Row( { label, value, bold, accent } ) {
	return (
		<Stack direction="row" justifyContent="space-between" sx={ { py: 0.25 } }>
			<Typography sx={ { fontSize: bold ? 14 : 13, fontWeight: bold ? 700 : 500, color: tokens.ink2 } }>{ label }</Typography>
			<Typography sx={ { fontSize: bold ? 14 : 13, fontWeight: bold ? 700 : 600, fontVariantNumeric: 'tabular-nums', color: accent ? tokens.accentDark : tokens.ink } }>{ value }</Typography>
		</Stack>
	);
}
