import React, { useEffect, useRef, useState } from 'react';
import {
	Box,
	Stack,
	Typography,
	IconButton,
	Button,
	TextField,
	Chip,
	Divider,
	Switch,
	Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { tokens } from '../theme';
import { api } from '../api/client';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import Card from './ui/Card';
import { ListSkeleton } from './ui/Skeletons';

const DAY_ORDER = [ 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun' ];

export default function HoursEditor() {
	const [ hours, setHours ] = useState( null );
	const [ days, setDays ] = useState( {} );
	const [ status, setStatus ] = useState( null );
	const [ loading, setLoading ] = useState( true );
	const [ saveState, setSaveState ] = useState( 'idle' );
	const debounce = useRef( null );

	useEffect( () => {
		api.getHours().then( ( data ) => {
			setHours( data.hours );
			setDays( data.days );
			setStatus( data.status );
			setLoading( false );
		} );
	}, [] );

	const persist = ( next ) => {
		setHours( next );
		clearTimeout( debounce.current );
		setSaveState( 'saving' );
		debounce.current = setTimeout( () => {
			api.saveHours( next )
				.then( ( res ) => {
					setStatus( res.status );
					setSaveState( 'saved' );
				} )
				.catch( () => setSaveState( 'error' ) );
		}, 500 );
	};

	if ( loading ) {
		return (
			<Page width={ 860 }>
				<ListSkeleton rows={ 7 } />
			</Page>
		);
	}

	const setPeriod = ( day, index, field, value ) => {
		const week = { ...hours.week };
		week[ day ] = week[ day ].map( ( p, i ) => ( i === index ? { ...p, [ field ]: value } : p ) );
		persist( { ...hours, week } );
	};
	const addPeriod = ( day ) => {
		const week = { ...hours.week };
		week[ day ] = [ ...( week[ day ] || [] ), { open: '09:00', close: '17:00' } ];
		persist( { ...hours, week } );
	};
	const removePeriod = ( day, index ) => {
		const week = { ...hours.week };
		week[ day ] = week[ day ].filter( ( _, i ) => i !== index );
		persist( { ...hours, week } );
	};
	const copyToAll = ( day ) => {
		const src = hours.week[ day ] || [];
		const week = {};
		DAY_ORDER.forEach( ( d ) => ( week[ d ] = src.map( ( p ) => ( { ...p } ) ) ) );
		persist( { ...hours, week } );
	};

	const addHoliday = () => {
		persist( {
			...hours,
			holidays: [ ...hours.holidays, { date: '', closed: true, periods: [], note: '' } ],
		} );
	};
	const setHoliday = ( index, patch ) => {
		persist( {
			...hours,
			holidays: hours.holidays.map( ( h, i ) => ( i === index ? { ...h, ...patch } : h ) ),
		} );
	};
	const removeHoliday = ( index ) => {
		persist( { ...hours, holidays: hours.holidays.filter( ( _, i ) => i !== index ) } );
	};

	// DAY_ORDER is Monday-first; Date.getDay() is Sunday-first.
	const todayKey = DAY_ORDER[ ( new Date().getDay() + 6 ) % 7 ];

	return (
		<Page width={ 860 }>
			<PageHeader
				title="Opening Hours"
				actions={
					<>
						{ status && (
							<Chip
								label={ status.open ? `Open now${ status.until ? ' · until ' + status.until : '' }` : 'Closed now' }
								sx={ {
									fontWeight: 600,
									bgcolor: status.open ? tokens.greenSoft : tokens.redSoft,
									color: status.open ? tokens.green : tokens.red,
								} }
							/>
						) }
						<Typography sx={ { fontSize: 13, color: tokens.muted, minWidth: 54 } }>
							{ saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : '' }
						</Typography>
					</>
				}
			/>

			<Stack spacing={ 1 }>
				{ DAY_ORDER.map( ( day ) => {
					const periods = hours.week[ day ] || [];
					const multi = periods.length > 1;
					return (
						<Card key={ day } sx={ { p: 1.75 } }>
							<Stack direction="row" spacing={ 2 } alignItems={ multi ? 'flex-start' : 'center' }>
								<Typography
									sx={ {
										width: 88,
										flexShrink: 0,
										fontWeight: 650,
										fontSize: 14,
										color: day === todayKey ? tokens.accent : tokens.ink,
										pt: multi ? 1 : 0,
									} }
								>
									{ days[ day ] }
								</Typography>
								<Box sx={ { flex: 1, minWidth: 0 } }>
									{ periods.length === 0 && (
										<Typography sx={ { color: tokens.muted2, fontSize: 14 } }>Closed</Typography>
									) }
									<Stack spacing={ 1 }>
										{ periods.map( ( p, i ) => (
											<Stack key={ i } direction="row" spacing={ 1 } alignItems="center">
												<TextField
													type="time"
													size="small"
													value={ p.open }
													onChange={ ( e ) => setPeriod( day, i, 'open', e.target.value ) }
													sx={ { width: 130 } }
												/>
												<Typography sx={ { color: tokens.muted } }>–</Typography>
												<TextField
													type="time"
													size="small"
													value={ p.close }
													onChange={ ( e ) => setPeriod( day, i, 'close', e.target.value ) }
													sx={ { width: 130 } }
												/>
												<Tooltip title="Remove hours">
													<IconButton size="small" onClick={ () => removePeriod( day, i ) } sx={ { color: tokens.muted2 } }>
														<DeleteOutlineIcon fontSize="small" />
													</IconButton>
												</Tooltip>
											</Stack>
										) ) }
									</Stack>
								</Box>
								<Stack direction="row" spacing={ 0.5 } alignItems="center" sx={ { flexShrink: 0, pt: multi ? 0.25 : 0 } }>
									{ day === 'mon' && periods.length > 0 && (
										<Button
											size="small"
											startIcon={ <ContentCopyIcon sx={ { fontSize: 14 } } /> }
											onClick={ () => copyToAll( day ) }
											sx={ { color: tokens.muted, fontSize: 12, whiteSpace: 'nowrap' } }
										>
											Copy to all days
										</Button>
									) }
									<Tooltip title="Add hours">
										<IconButton size="small" onClick={ () => addPeriod( day ) } sx={ { color: tokens.accent } }>
											<AddIcon fontSize="small" />
										</IconButton>
									</Tooltip>
								</Stack>
							</Stack>
						</Card>
					);
				} ) }
			</Stack>

			<Box sx={ { mt: 3 } }>
				<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 1 } }>
					<Typography sx={ { fontWeight: 650, fontSize: 15, color: tokens.ink } }>
						Holiday overrides
					</Typography>
					<Button size="small" startIcon={ <AddIcon /> } onClick={ addHoliday }>
						Add date
					</Button>
				</Stack>
				<Card sx={ { p: 1.75 } }>
					<Stack spacing={ 1 }>
						{ hours.holidays.length === 0 && (
							<Typography sx={ { color: tokens.muted, fontSize: 14 } }>
								Add specific dates (e.g. bank holidays) that override the weekly hours.
							</Typography>
						) }
						{ hours.holidays.map( ( h, i ) => (
							<Stack
								key={ i }
								direction="row"
								spacing={ 1.5 }
								alignItems="center"
								sx={ { bgcolor: tokens.soft, borderRadius: '10px', px: 1.5, py: 0.75 } }
							>
								<TextField
									type="date"
									size="small"
									value={ h.date }
									onChange={ ( e ) => setHoliday( i, { date: e.target.value } ) }
								/>
								<TextField
									size="small"
									placeholder="Note (e.g. Christmas Day)"
									value={ h.note }
									onChange={ ( e ) => setHoliday( i, { note: e.target.value } ) }
									sx={ { flex: 1 } }
								/>
								<Stack direction="row" alignItems="center" spacing={ 0.5 }>
									<Switch
										checked={ h.closed }
										onChange={ ( e ) => setHoliday( i, { closed: e.target.checked } ) }
									/>
									<Typography sx={ { fontSize: 13, width: 48 } }>{ h.closed ? 'Closed' : 'Open' }</Typography>
								</Stack>
								<IconButton size="small" onClick={ () => removeHoliday( i ) } sx={ { color: tokens.muted2 } }>
									<DeleteOutlineIcon fontSize="small" />
								</IconButton>
							</Stack>
						) ) }
					</Stack>
				</Card>
			</Box>

			<Divider sx={ { my: 3 } } />
			<Typography sx={ { fontSize: 13, color: tokens.muted } }>
				Add the <strong>DineKit Opening Hours</strong> block or the <code>[dinekit_hours]</code> shortcode to any
				page to show these hours with a live open/closed status.
			</Typography>
		</Page>
	);
}
