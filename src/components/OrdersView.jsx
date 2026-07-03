import React, { useEffect, useMemo, useState } from 'react';
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
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PrintIcon from '@mui/icons-material/Print';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
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
				<Chip
					icon={ <ReceiptLongIcon sx={ { fontSize: 16 } } /> }
					label={ `${ activeCount } active` }
					sx={ { bgcolor: activeCount ? tokens.accentSoft : tokens.soft, color: activeCount ? tokens.accentDark : tokens.muted, fontWeight: 700 } }
				/>
			</Stack>

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
