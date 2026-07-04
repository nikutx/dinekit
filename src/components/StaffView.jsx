import React, { useEffect, useState } from 'react';
import {
	Box,
	Stack,
	Typography,
	Button,
	IconButton,
	TextField,
	MenuItem,
	Switch,
	Chip,
	Drawer,
	Tooltip,
	ToggleButton,
	ToggleButtonGroup,
	CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CloseIcon from '@mui/icons-material/Close';
import BadgeIcon from '@mui/icons-material/Badge';
import { tokens } from '../theme';
import { api } from '../api/client';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import EmptyState from './ui/EmptyState';
import Card from './ui/Card';
import { ListSkeleton } from './ui/Skeletons';
import PageTour from './PageTour';
import StaffRota from './StaffRota';
import StaffHoliday from './StaffHoliday';
import StaffDashboard from './StaffDashboard';

export default function StaffView() {
	const [ staff, setStaff ] = useState( [] );
	const [ roles, setRoles ] = useState( [] );
	const [ loading, setLoading ] = useState( true );
	const [ editing, setEditing ] = useState( null ); // staff object being edited, or null.
	const [ tab, setTab ] = useState( 'people' );

	useEffect( () => {
		Promise.all( [ api.getStaff(), api.getStaffSettings() ] )
			.then( ( [ list, s ] ) => {
				setStaff( list || [] );
				setRoles( ( s && s.roles ) || [] );
			} )
			.finally( () => setLoading( false ) );
	}, [] );

	const roleLabel = ( key ) => ( roles.find( ( r ) => r.key === key ) || {} ).label || key;

	const addStaff = async () => {
		const m = await api.createStaff( { name: '' } );
		setStaff( ( s ) => [ ...s, m ] );
		setEditing( m );
	};
	const patch = ( id, p ) => {
		setStaff( ( s ) => s.map( ( m ) => ( m.id === id ? { ...m, ...p } : m ) ) );
		if ( editing && editing.id === id ) {
			setEditing( ( e ) => ( { ...e, ...p } ) );
		}
		api.updateStaff( id, p );
	};
	const remove = async ( id ) => {
		await api.deleteStaff( id );
		setStaff( ( s ) => s.filter( ( m ) => m.id !== id ) );
		setEditing( null );
	};

	if ( loading ) {
		return <Page><ListSkeleton rows={ 5 } /></Page>;
	}

	return (
		<Page>
			<PageHeader
				title="Staff"
				subtitle="Your team, their roles and rotas — plus a live view of whether you're staffed for the day."
				actions={
					<Button variant="contained" startIcon={ <AddIcon /> } onClick={ addStaff }>
						Add team member
					</Button>
				}
			/>

			<PageTour
				id="staff"
				title="Build your team"
				points={ [
					'Add each team member with their role, pay rate and holiday allowance.',
					'The rota and the “are we staffed?” dashboard are built from these people.',
					'DineKit tracks rota + holiday and exports timesheets — it doesn’t run PAYE payroll (that’s specialist software).',
				] }
			/>

			<ToggleButtonGroup exclusive size="small" value={ tab } onChange={ ( e, v ) => v && setTab( v ) } sx={ { mb: 2 } }>
				<ToggleButton value="people">People</ToggleButton>
				<ToggleButton value="rota">Rota</ToggleButton>
				<ToggleButton value="holiday">Holiday</ToggleButton>
				<ToggleButton value="dashboard">Dashboard</ToggleButton>
			</ToggleButtonGroup>

			{ tab === 'rota' && <StaffRota staff={ staff } roles={ roles } /> }
			{ tab === 'holiday' && <StaffHoliday staff={ staff } /> }
			{ tab === 'dashboard' && <StaffDashboard /> }

			{ tab === 'people' && ( staff.length === 0 ? (
				<EmptyState
					icon={ <BadgeIcon /> }
					title="No team members yet"
					description="Add your servers, chefs and managers to start building rotas and tracking holiday."
					action={ <Button variant="contained" startIcon={ <AddIcon /> } onClick={ addStaff }>Add team member</Button> }
				/>
			) : (
				<Stack spacing={ 1 }>
					{ staff.map( ( m ) => (
						<Card key={ m.id } hover onClick={ () => setEditing( m ) } sx={ { p: 1.5, cursor: 'pointer', opacity: m.active ? 1 : 0.6 } }>
							<Stack direction="row" alignItems="center" spacing={ 1.5 }>
								<Box sx={ { width: 12, height: 12, borderRadius: '50%', bgcolor: m.color, flexShrink: 0 } } />
								<Box sx={ { flex: 1, minWidth: 0 } }>
									<Typography sx={ { fontWeight: 650, fontSize: 14, color: tokens.ink } } noWrap>
										{ m.name || 'Unnamed' }{ ! m.active && ' · inactive' }
									</Typography>
									<Typography sx={ { fontSize: 12.5, color: tokens.muted } } noWrap>
										{ roleLabel( m.role ) } · { m.area === 'boh' ? 'Back of house' : m.area === 'foh' ? 'Front of house' : 'Both' }
										{ m.rate && Number( m.rate ) > 0 ? ` · £${ m.rate }/h` : '' }
									</Typography>
								</Box>
								<Chip label={ `${ m.holiday } days holiday` } size="small" sx={ { bgcolor: tokens.soft, color: tokens.muted, fontWeight: 600 } } />
								<IconButton size="small" onClick={ ( e ) => { e.stopPropagation(); remove( m.id ); } } sx={ { color: tokens.muted2 } }>
									<DeleteOutlineIcon fontSize="small" />
								</IconButton>
							</Stack>
						</Card>
					) ) }
				</Stack>
			) ) }

			<Drawer
				anchor="right"
				open={ !! editing }
				onClose={ () => setEditing( null ) }
				disableEnforceFocus
				sx={ { zIndex: 100000 } }
				PaperProps={ { sx: { width: { xs: '100%', sm: 400 } } } }
			>
				{ editing && (
					<Box sx={ { p: 3 } }>
						<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 2 } }>
							<Typography variant="h6" sx={ { fontSize: 18 } }>Team member</Typography>
							<IconButton size="small" onClick={ () => setEditing( null ) }><CloseIcon fontSize="small" /></IconButton>
						</Stack>
						<Stack spacing={ 2 }>
							<TextField label="Name" size="small" value={ editing.name } onChange={ ( e ) => patch( editing.id, { name: e.target.value } ) } fullWidth />
							<Stack direction="row" spacing={ 1.5 }>
								<TextField select label="Role" size="small" value={ editing.role } onChange={ ( e ) => patch( editing.id, { role: e.target.value } ) } sx={ { flex: 1 } }>
									{ roles.map( ( r ) => <MenuItem key={ r.key } value={ r.key }>{ r.label }</MenuItem> ) }
								</TextField>
								<TextField select label="Area" size="small" value={ editing.area } onChange={ ( e ) => patch( editing.id, { area: e.target.value } ) } sx={ { width: 130 } }>
									<MenuItem value="foh">Front</MenuItem>
									<MenuItem value="boh">Back</MenuItem>
									<MenuItem value="both">Both</MenuItem>
								</TextField>
							</Stack>
							<TextField label="Email" type="email" size="small" value={ editing.email } onChange={ ( e ) => patch( editing.id, { email: e.target.value } ) } fullWidth />
							<TextField label="Phone" size="small" value={ editing.phone } onChange={ ( e ) => patch( editing.id, { phone: e.target.value } ) } fullWidth />
							<Stack direction="row" spacing={ 1.5 }>
								<TextField label="Hourly rate (£)" type="number" size="small" value={ editing.rate } onChange={ ( e ) => patch( editing.id, { rate: e.target.value } ) } sx={ { flex: 1 } } />
								<TextField label="Holiday (days/yr)" type="number" size="small" value={ editing.holiday } onChange={ ( e ) => patch( editing.id, { holiday: Math.max( 0, parseInt( e.target.value, 10 ) || 0 ) } ) } sx={ { flex: 1 } } helperText="UK min 28 (incl. bank hols)" />
							</Stack>
							<Stack direction="row" alignItems="center" spacing={ 2 }>
								<Box>
									<Typography sx={ { fontSize: 12.5, fontWeight: 600, color: tokens.muted, mb: 0.5 } }>Rota colour</Typography>
									<Box component="input" type="color" value={ editing.color } onChange={ ( e ) => patch( editing.id, { color: e.target.value } ) } sx={ { width: 46, height: 34, p: 0, border: `1px solid ${ tokens.border2 }`, borderRadius: 1, bgcolor: 'transparent', cursor: 'pointer' } } />
								</Box>
								<Box sx={ { flex: 1 } } />
								<Stack direction="row" alignItems="center" spacing={ 1 }>
									<Switch checked={ editing.active } onChange={ ( e ) => patch( editing.id, { active: e.target.checked } ) } />
									<Typography sx={ { fontSize: 14, fontWeight: 600 } }>Active</Typography>
								</Stack>
							</Stack>
							<Tooltip title="Removes the member, their shifts and leave">
								<Button color="error" size="small" startIcon={ <DeleteOutlineIcon /> } onClick={ () => remove( editing.id ) } sx={ { justifyContent: 'flex-start' } }>
									Remove team member
								</Button>
							</Tooltip>
						</Stack>
					</Box>
				) }
			</Drawer>
		</Page>
	);
}
