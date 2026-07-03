import React, { useEffect, useRef, useState } from 'react';
import {
	Drawer,
	Box,
	Stack,
	Typography,
	TextField,
	IconButton,
	Button,
	Chip,
	Switch,
	FormControlLabel,
	Divider,
	Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ImageIcon from '@mui/icons-material/Image';
import { tokens } from '../theme';
import PriceRepeater from './PriceRepeater';
import ModifierEditor from './ModifierEditor';
import { openMediaPicker } from '../lib/media';
import { useToast } from './Toast';

const labelSx = {
	textTransform: 'uppercase',
	fontSize: 11,
	fontWeight: 700,
	letterSpacing: '0.04em',
	color: tokens.muted,
	mb: 0.75,
	display: 'block',
};

export default function ItemEditor( { item, store, onClose } ) {
	const { data } = store;
	const [ form, setForm ] = useState( item );
	const debounceRef = useRef( null );
	const toast = useToast();

	// Keep in sync if the underlying item changes identity.
	useEffect( () => setForm( item ), [ item.id ] ); // eslint-disable-line react-hooks/exhaustive-deps

	const save = ( changes ) => store.updateItem( item.id, changes );

	// Debounced save for free-text fields.
	const setField = ( field, value ) => {
		setForm( ( f ) => ( { ...f, [ field ]: value } ) );
		clearTimeout( debounceRef.current );
		debounceRef.current = setTimeout( () => save( { [ field ]: value } ), 600 );
	};

	// Immediate save for structured fields (toggles, chips, prices).
	const setNow = ( field, value ) => {
		setForm( ( f ) => ( { ...f, [ field ]: value } ) );
		save( { [ field ]: value } );
	};

	// The image is an object locally (for preview) but the REST API expects the
	// attachment ID (or 0 to remove).
	const setImage = ( imgObj ) => {
		setForm( ( f ) => ( { ...f, image: imgObj } ) );
		save( { image: imgObj ? imgObj.id : 0 } );
	};

	const toggleTerm = ( field, id ) => {
		const set = new Set( form[ field ] || [] );
		set.has( id ) ? set.delete( id ) : set.add( id );
		setNow( field, [ ...set ] );
	};

	const pickImage = () => {
		openMediaPicker(
			( attachment ) => {
				setImage( {
					id: attachment.id,
					thumb: attachment.sizes?.thumbnail?.url || attachment.url,
					url: attachment.url,
				} );
				toast.success( 'Photo added' );
			},
			( message ) => toast.error( 'Media library unavailable', message )
		);
	};

	return (
		<Drawer
			anchor="right"
			open
			onClose={ onClose }
			// Sit above the WP admin bar (99999) so the drawer header/close isn't
			// hidden behind it; disableEnforceFocus lets the wp.media modal (which
			// opens on top) receive clicks instead of the drawer trapping focus.
			disableEnforceFocus
			sx={ { zIndex: 100000 } }
			PaperProps={ { sx: { width: { xs: '100%', sm: 460 }, bgcolor: tokens.bg } } }
		>
			<Stack
				direction="row"
				alignItems="center"
				justifyContent="space-between"
				sx={ {
					px: 3,
					py: 2,
					bgcolor: tokens.surface,
					borderBottom: `1px solid ${ tokens.border }`,
					position: 'sticky',
					top: 0,
					zIndex: 2,
				} }
			>
				<Typography variant="h6" sx={ { fontSize: 16 } }>
					Edit item
				</Typography>
				<IconButton size="small" onClick={ onClose }>
					<CloseIcon fontSize="small" />
				</IconButton>
			</Stack>

			<Box sx={ { p: 3, display: 'flex', flexDirection: 'column', gap: 3 } }>
				<Box>
					<Typography sx={ labelSx }>Name</Typography>
					<TextField
						fullWidth
						value={ form.title }
						onChange={ ( e ) => setField( 'title', e.target.value ) }
						placeholder="e.g. Beer-battered fish & chips"
					/>
				</Box>

				<Box>
					<Typography sx={ labelSx }>Description</Typography>
					<TextField
						fullWidth
						multiline
						minRows={ 2 }
						value={ form.description }
						onChange={ ( e ) => setField( 'description', e.target.value ) }
						placeholder="Short, tempting description…"
					/>
				</Box>

				<Box>
					<Typography sx={ labelSx }>Photo</Typography>
					<Stack direction="row" spacing={ 1.5 } alignItems="center">
						<Box
							onClick={ pickImage }
							sx={ {
								width: 72,
								height: 72,
								borderRadius: 2,
								border: `1px solid ${ tokens.border }`,
								bgcolor: tokens.soft,
								backgroundImage: form.image ? `url(${ form.image.thumb || form.image.url })` : 'none',
								backgroundSize: 'cover',
								backgroundPosition: 'center',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								cursor: 'pointer',
								color: tokens.muted2,
							} }
						>
							{ ! form.image && <ImageIcon /> }
						</Box>
						<Stack spacing={ 0.5 }>
							<Button size="small" variant="outlined" onClick={ pickImage }>
								{ form.image ? 'Change' : 'Choose photo' }
							</Button>
							{ form.image && (
								<Button size="small" color="error" onClick={ () => setImage( null ) }>
									Remove
								</Button>
							) }
						</Stack>
					</Stack>
				</Box>

				<PriceRepeater prices={ form.prices || [] } onChange={ ( prices ) => setNow( 'prices', prices ) } />

				<ModifierEditor modifiers={ form.modifiers || [] } onChange={ ( m ) => setNow( 'modifiers', m ) } />

				<Box>
					<Typography sx={ labelSx }>Badge</Typography>
					<TextField
						fullWidth
						value={ form.badge }
						onChange={ ( e ) => setField( 'badge', e.target.value ) }
						placeholder="e.g. New, Popular, Chef’s Special"
					/>
				</Box>

				<TermChips
					label="Menus"
					terms={ data.menus }
					selected={ form.menus }
					onToggle={ ( id ) => toggleTerm( 'menus', id ) }
					color={ { bg: tokens.accentSoft, fg: tokens.accentDark } }
				/>

				<TermChips
					label="Dietary"
					terms={ data.dietary }
					selected={ form.dietary }
					onToggle={ ( id ) => toggleTerm( 'dietary', id ) }
					color={ { bg: tokens.greenSoft, fg: tokens.green } }
				/>

				<Box>
					<Typography sx={ labelSx }>Allergens (UK 14)</Typography>
					<Box
						sx={ {
							display: 'grid',
							gridTemplateColumns: 'repeat(2, 1fr)',
							gap: 0.75,
						} }
					>
						{ data.allergens.map( ( a ) => {
							const on = ( form.allergens || [] ).includes( a.id );
							return (
								<Stack
									key={ a.id }
									direction="row"
									spacing={ 1 }
									alignItems="center"
									onClick={ () => toggleTerm( 'allergens', a.id ) }
									sx={ {
										px: 1,
										py: 0.6,
										borderRadius: 2,
										cursor: 'pointer',
										border: `1px solid ${ on ? tokens.amber : tokens.border }`,
										bgcolor: on ? tokens.amberSoft : tokens.surface,
										transition: 'all 0.12s ease-in-out',
									} }
								>
									{ a.icon ? (
										<Box
											component="img"
											src={ a.icon }
											alt=""
											sx={ { width: 18, height: 18, opacity: on ? 1 : 0.45 } }
										/>
									) : null }
									<Typography sx={ { fontSize: 12, fontWeight: on ? 700 : 500, color: on ? tokens.amber : tokens.ink2 } }>
										{ a.name }
									</Typography>
								</Stack>
							);
						} ) }
					</Box>
				</Box>

				<Divider />

				<Stack direction="row" alignItems="center" justifyContent="space-between">
					<FormControlLabel
						control={
							<Switch
								checked={ form.status === 'publish' }
								onChange={ ( e ) => setNow( 'status', e.target.checked ? 'publish' : 'draft' ) }
							/>
						}
						label={ form.status === 'publish' ? 'Published' : 'Draft' }
					/>
					<Tooltip title="Delete item">
						<Button
							color="error"
							size="small"
							startIcon={ <DeleteOutlineIcon /> }
							onClick={ () => {
								store.deleteItem( item.id );
								onClose();
							} }
						>
							Delete
						</Button>
					</Tooltip>
				</Stack>
			</Box>
		</Drawer>
	);
}

function TermChips( { label, terms, selected, onToggle, color } ) {
	if ( ! terms || ! terms.length ) {
		return null;
	}
	const sel = selected || [];
	return (
		<Box>
			<Typography sx={ labelSx }>{ label }</Typography>
			<Box sx={ { display: 'flex', flexWrap: 'wrap', gap: 0.75 } }>
				{ terms.map( ( t ) => {
					const on = sel.includes( t.id );
					return (
						<Chip
							key={ t.id }
							label={ t.name }
							onClick={ () => onToggle( t.id ) }
							sx={ {
								cursor: 'pointer',
								bgcolor: on ? color.bg : tokens.soft,
								color: on ? color.fg : tokens.muted,
								fontWeight: on ? 700 : 500,
							} }
						/>
					);
				} ) }
			</Box>
		</Box>
	);
}
