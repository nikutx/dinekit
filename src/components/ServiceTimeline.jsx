import React, { useEffect, useRef, useState } from 'react';
import { Box, Stack, Typography, Tooltip } from '../ui';
import { tokens } from '../theme';
import { statusColor } from '../lib/bookings';

// Full-width service view: tables down the left, the day's clock across the top,
// each booking a block on its table's row positioned by time + turn length.
//
// Drag & drop is pointer-event based (not native HTML5 drag): the browser's
// built-in drag ghost is forced semi-transparent and its drop maths broke on
// clipped blocks. Here the preview IS the landing position — a full-opacity
// block that snaps in 15-min steps under your hand, turns red on a collision,
// and the drop commits exactly where the preview sits.

const pad = ( n ) => ( n < 10 ? '0' : '' ) + n;
const hhmm = ( m ) => pad( Math.floor( ( m % 1440 ) / 60 ) ) + ':' + pad( m % 60 );
const toMin = ( t ) => {
	const p = String( t ).split( ':' );
	return ( parseInt( p[ 0 ], 10 ) || 0 ) * 60 + ( parseInt( p[ 1 ], 10 ) || 0 );
};

// One palette across the app (src/lib/bookings.js): confirmed = indigo,
// seated = green, pending = amber, penciled/waitlist = violet.
const colorFor = statusColor;

const LABEL_W = 150;
const DRAG_THRESHOLD = 5; // px of movement before a press becomes a drag

export default function ServiceTimeline( { bookings, tables, areas, combos, events, eventCovers, openMin, closeMin, turnMin, today, onSelect, onCreate, onMove } ) {
	const span = Math.max( 60, closeMin - openMin );
	const hourPct = ( 60 / span ) * 100; // Width of one hour, for the gridlines.
	const active = bookings.filter( ( b ) => ! [ 'cancelled', 'no_show' ].includes( b.status ) );
	const comboMembers = Object.fromEntries( ( combos || [] ).map( ( c ) => [ c.id, c.tables ] ) );

	const rowsFor = ( tableId ) =>
		active.filter( ( b ) => b.tableId === tableId || ( b.comboId && ( comboMembers[ b.comboId ] || [] ).includes( tableId ) ) );
	const unassigned = active.filter( ( b ) => ! b.tableId && ! b.comboId );

	const ticks = [];
	for ( let m = Math.ceil( openMin / 60 ) * 60; m <= closeMin; m += 60 ) {
		ticks.push( m );
	}

	const zones = ( areas || [] ).map( ( a ) => ( { id: a.id, name: a.name } ) );
	if ( tables.some( ( t ) => ! ( t.areaId || 0 ) ) ) {
		zones.push( { id: 0, name: 'Unzoned' } );
	}

	// ---- "Now" marker (today only): red line + greyed-out past -------------
	const [ nowMin, setNowMin ] = useState( () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); } );
	useEffect( () => {
		if ( ! today ) {
			return undefined;
		}
		const t = setInterval( () => { const d = new Date(); setNowMin( d.getHours() * 60 + d.getMinutes() ); }, 30000 );
		return () => clearInterval( t );
	}, [ today ] );
	const showNow = !! today && nowMin >= openMin && nowMin <= closeMin;
	const nowFrac = ( nowMin - openMin ) / span;

	// ---- Pointer-based drag & drop ------------------------------------------
	const axisRef = useRef( null ); // clock strip = the x → minutes ruler
	const rowBodyRefs = useRef( new Map() ); // tableId → row body node (y hit-testing)
	const pressRef = useRef( null ); // pointer-down details until the threshold
	const suppressClickRef = useRef( false ); // a finished drag must not fire click-to-edit
	const [ drag, setDrag ] = useState( null ); // { id, tableId, min, valid, status, name, party }
	const dragRef = useRef( null ); // mirror of `drag` — side effects must not live in a state updater

	const minuteAtX = ( clientX ) => {
		const r = axisRef.current.getBoundingClientRect();
		return openMin + ( ( clientX - r.left ) / Math.max( 1, r.width ) ) * span;
	};
	const rowAtY = ( clientY ) => {
		for ( const [ tableId, node ] of rowBodyRefs.current ) {
			if ( ! node ) {
				continue;
			}
			const r = node.getBoundingClientRect();
			if ( clientY >= r.top && clientY <= r.bottom ) {
				return tableId;
			}
		}
		return null;
	};
	const collides = ( tableId, startMin, selfId ) =>
		rowsFor( tableId ).some( ( o ) => {
			if ( o.id === selfId ) {
				return false;
			}
			const os = toMin( o.time );
			return os < startMin + turnMin && os + turnMin > startMin;
		} );

	// The drag listens on WINDOW, not the block: React re-renders while the
	// preview moves, and a re-render remounts the block node — a node-level
	// pointer capture dies with it and the drag goes deaf mid-move.
	const startPress = ( b, e ) => {
		if ( ! onMove || ( e.button !== 0 && e.button !== 1 ) ) {
			return;
		}
		e.preventDefault(); // middle button must not start autoscroll
		const blockRect = e.currentTarget.getBoundingClientRect();
		const axisRect = axisRef.current.getBoundingClientRect();
		// Where inside the sitting the block was grabbed, in real minutes —
		// measured on the ruler, so clipped/min-width blocks can't skew it.
		const grabMin = ( ( e.clientX - blockRect.left ) / Math.max( 1, axisRect.width ) ) * span;
		const press = { b, grabMin, startX: e.clientX, startY: e.clientY };
		press.off = () => {
			window.removeEventListener( 'pointermove', movePress );
			window.removeEventListener( 'pointerup', endPress );
			window.removeEventListener( 'pointercancel', endPress );
		};
		pressRef.current = press;
		window.addEventListener( 'pointermove', movePress );
		window.addEventListener( 'pointerup', endPress );
		window.addEventListener( 'pointercancel', endPress );
	};
	const movePress = ( e ) => {
		const p = pressRef.current;
		if ( ! p ) {
			return;
		}
		if ( ! p.dragging ) {
			if ( Math.abs( e.clientX - p.startX ) + Math.abs( e.clientY - p.startY ) < DRAG_THRESHOLD ) {
				return;
			}
			p.dragging = true;
		}
		let min = Math.round( ( minuteAtX( e.clientX ) - p.grabMin ) / 15 ) * 15;
		min = Math.max( openMin, Math.min( closeMin - 15, min ) );
		const overRow = rowAtY( e.clientY );
		const tableId = overRow !== null ? overRow : ( dragRef.current ? dragRef.current.tableId : p.b.tableId );
		const cur = dragRef.current;
		if ( cur && cur.tableId === tableId && cur.min === min ) {
			return; // still in the same 15-min slot — no re-render needed
		}
		const next = {
			id: p.b.id,
			tableId,
			min,
			valid: !! tableId && ! collides( tableId, min, p.b.id ),
			status: p.b.status,
			name: p.b.name,
			party: p.b.party,
		};
		dragRef.current = next;
		setDrag( next );
	};
	const endPress = ( e ) => {
		const p = pressRef.current;
		pressRef.current = null;
		if ( ! p ) {
			return;
		}
		p.off();
		if ( ! p.dragging ) {
			return; // plain click — let onClick open the editor
		}
		suppressClickRef.current = true;
		setTimeout( () => { suppressClickRef.current = false; }, 0 );
		const d = dragRef.current;
		dragRef.current = null;
		setDrag( null );
		if ( d && d.valid && e.type !== 'pointercancel' ) {
			const moved = d.tableId !== p.b.tableId || !! p.b.comboId || hhmm( d.min ) !== p.b.time;
			if ( moved ) {
				onMove( d.id, d.tableId, hhmm( d.min ) );
			}
		}
	};

	const Block = ( { b } ) => {
		const start = Math.max( openMin, toMin( b.time ) );
		const left = ( ( start - openMin ) / span ) * 100;
		const width = Math.max( 4, Math.min( 100 - left, ( turnMin / span ) * 100 ) );
		const soft = 'provisional' === b.status || 'waitlist' === b.status;
		const isOrigin = drag && drag.id === b.id;
		const tip = `${ b.time } · ${ b.name || 'Guest' } · ${ b.party }p · ${ b.status }`
			+ ( b.notes ? ` — “${ b.notes }”` : '' )
			+ ( onMove ? ' — drag to move, click to edit' : '' );
		return (
			<Tooltip title={ tip }>
				<Box
					// The empty native title stops the row's "click to add a booking"
					// hover hint appearing on top of a booking (it was covering notes).
					title=""
					onPointerDown={ onMove ? ( e ) => startPress( b, e ) : undefined }
					onClick={ ( e ) => {
						e.stopPropagation();
						if ( ! suppressClickRef.current && onSelect ) {
							onSelect( b );
						}
					} }
					sx={ {
						position: 'absolute',
						left: `${ left }%`,
						width: `${ width }%`,
						top: 4,
						bottom: 4,
						bgcolor: colorFor( b.status ),
						color: '#fff',
						borderRadius: '6px',
						px: 0.75,
						display: 'flex',
						alignItems: 'center',
						gap: 0.4,
						overflow: 'hidden',
						fontSize: 11,
						fontWeight: 700,
						cursor: onMove ? 'grab' : ( onSelect ? 'pointer' : 'default' ),
						touchAction: 'none',
						userSelect: 'none',
						// While dragging, the ORIGIN stays put as a dashed outline so you
						// can see where it came from; the solid preview is the real thing.
						opacity: isOrigin ? 0.3 : ( soft ? 0.82 : 1 ),
						border: isOrigin ? '1px dashed rgba(255,255,255,0.9)' : ( soft ? '1px dashed rgba(255,255,255,0.6)' : '1px solid rgba(255,255,255,0.25)' ),
					} }
				>
					{ !! b.notes && <span aria-hidden="true" style={ { flexShrink: 0, fontSize: 10 } } title={ b.notes }>📝</span> }
					<span style={ { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }>
						{ b.time } { b.name || 'Guest' } · { b.party }
					</span>
				</Box>
			</Tooltip>
		);
	};

	// The landing preview: a full-opacity block snapped to the 15-min grid on
	// the row under the pointer. Red = collides with another booking there.
	const DragPreview = () => {
		const left = ( ( drag.min - openMin ) / span ) * 100;
		const width = Math.max( 4, Math.min( 100 - left, ( turnMin / span ) * 100 ) );
		return (
			<Box
				sx={ {
					position: 'absolute',
					left: `${ left }%`,
					width: `${ width }%`,
					top: 2,
					bottom: 2,
					bgcolor: drag.valid ? colorFor( drag.status ) : tokens.red,
					color: '#fff',
					borderRadius: '6px',
					px: 0.75,
					display: 'flex',
					alignItems: 'center',
					gap: 0.4,
					overflow: 'hidden',
					fontSize: 11,
					fontWeight: 700,
					pointerEvents: 'none',
					zIndex: 5,
					boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
					outline: `2px solid ${ drag.valid ? 'rgba(255,255,255,0.85)' : tokens.red }`,
				} }
			>
				<span style={ { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }>
					{ drag.valid ? `${ hhmm( drag.min ) } ${ drag.name || 'Guest' } · ${ drag.party }` : `✕ ${ hhmm( drag.min ) } — table already booked` }
				</span>
			</Box>
		);
	};

	// Click an empty part of a table row to start a booking at that time + table.
	const createAt = ( tableId, e ) => {
		if ( ! onCreate || ! tableId || suppressClickRef.current ) {
			return;
		}
		const rect = e.currentTarget.getBoundingClientRect();
		let min = openMin + ( ( e.clientX - rect.left ) / rect.width ) * span;
		min = Math.max( openMin, Math.min( closeMin, Math.round( min / 15 ) * 15 ) );
		onCreate( tableId, hhmm( min ) );
	};

	const Row = ( { label, sub, blocks, head, tableId } ) => {
		const clickable = !! ( onCreate && tableId );
		return (
			<Stack direction="row" sx={ { borderTop: `1px solid ${ tokens.border }`, minHeight: head ? 30 : 42, bgcolor: head ? tokens.soft : 'transparent' } }>
				<Box sx={ { width: LABEL_W, flexShrink: 0, px: 1.5, py: 0.75, borderRight: `1px solid ${ tokens.border }` } }>
					<Typography sx={ { fontSize: head ? 12 : 13, fontWeight: head ? 700 : 650, color: head ? tokens.muted : tokens.ink, textTransform: head ? 'uppercase' : 'none', letterSpacing: head ? '0.03em' : 0 } }>
						{ label }
					</Typography>
					{ sub && <Typography sx={ { fontSize: 11, color: tokens.muted } }>{ sub }</Typography> }
				</Box>
				<Box
					ref={ tableId ? ( node ) => {
						if ( node ) {
							rowBodyRefs.current.set( tableId, node );
						} else {
							rowBodyRefs.current.delete( tableId );
						}
					} : undefined }
					onClick={ clickable ? ( e ) => createAt( tableId, e ) : undefined }
					title={ clickable && ! drag ? 'Click to add a booking here' : undefined }
					sx={ {
						position: 'relative',
						flex: 1,
						minWidth: 0,
						cursor: drag ? 'grabbing' : ( clickable ? 'copy' : 'default' ),
						// Per-hour vertical gridlines for clear separation.
						backgroundImage: head ? 'none' : `repeating-linear-gradient(to right, ${ tokens.border } 0 1px, transparent 1px ${ hourPct }%)`,
						'&:hover': clickable && ! drag ? { bgcolor: tokens.soft } : {},
					} }
				>
					{ ( blocks || [] ).map( ( b ) => <Block key={ b.id } b={ b } /> ) }
					{ drag && drag.tableId === tableId && <DragPreview /> }
				</Box>
			</Stack>
		);
	};

	return (
		<Box sx={ { border: `1px solid ${ tokens.border }`, borderRadius: '12px', overflowX: 'auto', bgcolor: tokens.surface } }>
			<Box sx={ { minWidth: 720, position: 'relative' } }>
				{ /* Clock axis */ }
				<Stack direction="row" sx={ { bgcolor: tokens.soft } }>
					<Box sx={ { width: LABEL_W, flexShrink: 0, px: 1.5, py: 1, borderRight: `1px solid ${ tokens.border }` } }>
						<Typography sx={ { fontSize: 12, fontWeight: 700, color: tokens.muted } }>Tables</Typography>
					</Box>
					<Box ref={ axisRef } sx={ { position: 'relative', flex: 1, height: 32 } }>
						{ ticks.map( ( m ) => (
							<Box key={ m } sx={ { position: 'absolute', left: `${ ( ( m - openMin ) / span ) * 100 }%`, top: 0, bottom: 0, borderLeft: `1px solid ${ tokens.border }`, pl: 0.5 } }>
								<Typography sx={ { fontSize: 10.5, color: tokens.muted2, fontWeight: 600 } }>{ hhmm( m ) }</Typography>
							</Box>
						) ) }
					</Box>
				</Stack>

					{ ( events || [] ).map( ( ev ) => {
					const start = Math.max( openMin, toMin( ev.time || '00:00' ) );
					const left = ( ( start - openMin ) / span ) * 100;
					return (
						<Stack key={ 'ev' + ev.id } direction="row" sx={ { borderTop: `1px solid ${ tokens.border }`, minHeight: 34, bgcolor: tokens.violetSoft } }>
							<Box sx={ { width: LABEL_W, flexShrink: 0, px: 1.5, py: 0.75, borderRight: `1px solid ${ tokens.border }` } }>
								<Typography sx={ { fontSize: 11, fontWeight: 700, color: tokens.violet, textTransform: 'uppercase', letterSpacing: '0.03em' } }>Event</Typography>
							</Box>
							<Box sx={ { position: 'relative', flex: 1, minWidth: 0 } }>
								<Box sx={ { position: 'absolute', left: `${ left }%`, top: 4, bottom: 4, display: 'flex', alignItems: 'center', px: 1, bgcolor: tokens.violet, color: '#fff', borderRadius: '6px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', maxWidth: '96%', overflow: 'hidden' } }>
									{ ev.time ? ev.time + ' · ' : '' }{ ev.name } · { eventCovers ? eventCovers( ev ) : 0 }
								</Box>
							</Box>
						</Stack>
					);
				} ) }

				{ unassigned.length > 0 && <Row label={ `Unassigned · ${ unassigned.length }` } blocks={ unassigned } head /> }

				{ zones.map( ( z ) => {
					const zt = tables.filter( ( t ) => ( t.areaId || 0 ) === z.id );
					if ( ! zt.length ) {
						return null;
					}
					return (
						<React.Fragment key={ z.id }>
							<Row label={ z.name } head />
							{ zt.map( ( t ) => <Row key={ t.id } label={ t.name } sub={ `${ t.seats } seats` } blocks={ rowsFor( t.id ) } tableId={ t.id } /> ) }
						</React.Fragment>
					);
				} ) }

				{ active.length === 0 && (
					<Box sx={ { p: 3, textAlign: 'center' } }>
						<Typography sx={ { fontSize: 13, color: tokens.muted2 } }>No bookings for this day yet.</Typography>
					</Box>
				) }

				{ /* Today only: everything before "now" sits under a grey wash (the
				     coloured blocks visibly grey out), and a red line + time pill
				     marks where the service is right now. */ }
				{ showNow && (
					<>
						<Box
							sx={ {
								position: 'absolute',
								top: 0,
								bottom: 0,
								left: LABEL_W,
								width: `calc((100% - ${ LABEL_W }px) * ${ nowFrac })`,
								bgcolor: 'rgba(244,244,245,0.45)',
								backdropFilter: 'grayscale(0.8)',
								pointerEvents: 'none',
								zIndex: 2,
							} }
						/>
						<Box
							sx={ {
								position: 'absolute',
								top: 0,
								bottom: 0,
								left: `calc(${ LABEL_W }px + (100% - ${ LABEL_W }px) * ${ nowFrac })`,
								width: 0,
								borderLeft: `2px solid ${ tokens.red }`,
								pointerEvents: 'none',
								zIndex: 3,
							} }
						>
							<Box
								sx={ {
									position: 'absolute',
									top: 4,
									left: 0,
									transform: 'translateX(-50%)',
									bgcolor: tokens.red,
									color: '#fff',
									fontSize: 10,
									fontWeight: 700,
									px: 0.75,
									py: 0.1,
									borderRadius: '999px',
									whiteSpace: 'nowrap',
									lineHeight: 1.6,
								} }
							>
								{ hhmm( nowMin ) }
							</Box>
						</Box>
					</>
				) }
			</Box>
		</Box>
	);
}
