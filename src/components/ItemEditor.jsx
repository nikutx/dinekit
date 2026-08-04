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
	ToggleButton,
	ToggleButtonGroup,
	Collapse,
} from '../ui';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ImageIcon from '@mui/icons-material/Image';
import { tokens } from '../theme';
import PriceRepeater from './PriceRepeater';
import ModifierEditor from './ModifierEditor';
import ConfirmDialog from './ui/ConfirmDialog';
import SavePill from './ui/SavePill';
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

// A collapsible group in the dish editor — keeps the long form calm and grouped
// so it doesn't feel overwhelming.
function Section( { title, subtitle, defaultOpen = false, children } ) {
	const [ open, setOpen ] = useState( defaultOpen );
	return (
		<Box sx={ { border: `1px solid ${ tokens.border }`, borderRadius: 3, bgcolor: tokens.surface, overflow: 'hidden' } }>
			<Stack
				direction="row"
				alignItems="center"
				justifyContent="space-between"
				onClick={ () => setOpen( ( v ) => ! v ) }
				sx={ { px: 2, py: 1.5, cursor: 'pointer', userSelect: 'none', '&:hover': { bgcolor: tokens.soft } } }
			>
				<Box>
					<Typography sx={ { fontSize: 13.5, fontWeight: 700, color: tokens.ink } }>{ title }</Typography>
					{ subtitle && <Typography sx={ { fontSize: 12, color: tokens.muted2 } }>{ subtitle }</Typography> }
				</Box>
				<ExpandMoreIcon sx={ { color: tokens.muted2, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s ease' } } />
			</Stack>
			<Collapse in={ open }>
				<Box sx={ { px: 2, pb: 2, pt: 0.5, display: 'flex', flexDirection: 'column', gap: 2.5 } }>
					{ children }
				</Box>
			</Collapse>
		</Box>
	);
}

export default function ItemEditor( { item, store, onArchive, onClose } ) {
	const { data } = store;
	const [ form, setForm ] = useState( item );
	const debounceRef = useRef( null );
	// Changes awaiting the debounced save, tagged with the item they belong to so
	// switching items mid-edit can't post one dish's text onto another.
	const pendingRef = useRef( { id: null, changes: {} } );
	const storeRef = useRef( store );
	storeRef.current = store;
	const toast = useToast();

	// Keep in sync if the underlying item changes identity.
	useEffect( () => setForm( item ), [ item.id ] ); // eslint-disable-line react-hooks/exhaustive-deps

	// There's no Save button on this form, so the header pill has to be honest
	// about keystrokes that are typed but still inside the debounce window —
	// the global save bus only knows about requests already in flight.
	const [ typing, setTyping ] = useState( false );

	const save = ( changes ) => store.updateItem( item.id, changes );

	// Write any queued edits through immediately (item switch, drawer close).
	const flush = () => {
		clearTimeout( debounceRef.current );
		const { id, changes } = pendingRef.current;
		pendingRef.current = { id: null, changes: {} };
		setTyping( false );
		if ( id && Object.keys( changes ).length ) {
			storeRef.current.updateItem( id, changes );
		}
	};

	// Debounced save for free-text fields. One shared timer, but changes accumulate
	// so moving between fields inside the debounce window can't drop the earlier
	// field's edit.
	const setField = ( field, value ) => {
		setForm( ( f ) => ( { ...f, [ field ]: value } ) );
		if ( pendingRef.current.id !== item.id ) {
			flush();
		}
		// After the flush above — flush() clears the flag for the item it wrote.
		setTyping( true );
		pendingRef.current = {
			id: item.id,
			changes: { ...pendingRef.current.changes, [ field ]: value },
		};
		clearTimeout( debounceRef.current );
		debounceRef.current = setTimeout( flush, 600 );
	};

	// Immediate save for structured fields (toggles, chips).
	const setNow = ( field, value ) => {
		setForm( ( f ) => ( { ...f, [ field ]: value } ) );
		save( { [ field ]: value } );
	};

	// Don't lose a half-typed field when the drawer closes or the item switches.
	useEffect( () => flush, [ item.id ] ); // eslint-disable-line react-hooks/exhaustive-deps

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

	// Which specific cereal/nut per allergen (Natasha's Law sub-sources).
	const toggleSource = ( slug, key ) => {
		const cur = { ...( form.allergenSources || {} ) };
		const set = new Set( cur[ slug ] || [] );
		set.has( key ) ? set.delete( key ) : set.add( key );
		const arr = [ ...set ];
		if ( arr.length ) {
			cur[ slug ] = arr;
		} else {
			delete cur[ slug ];
		}
		setNow( 'allergenSources', cur );
	};

	const [ newAllergen, setNewAllergen ] = useState( '' );
	const addAllergen = async () => {
		const n = newAllergen.trim();
		setNewAllergen( '' );
		if ( ! n ) {
			return;
		}
		const term = await store.createTerm( 'dinekit_allergen', n );
		if ( term && term.id ) {
			setNow( 'allergens', [ ...( form.allergens || [] ), term.id ] );
		}
	};

	// Delete a custom allergen (the core 14 have no delete button) — via a proper
	// confirm modal that surfaces how many dishes use it, so nothing's removed by
	// surprise. Core 14 are also blocked server-side.
	const [ delAllergen, setDelAllergen ] = useState( null );
	const [ delBusy, setDelBusy ] = useState( false );
	const removeAllergen = ( a ) => setDelAllergen( a );
	const confirmRemoveAllergen = async () => {
		const a = delAllergen;
		if ( ! a ) {
			return;
		}
		setDelBusy( true );
		try {
			setNow( 'allergens', ( form.allergens || [] ).filter( ( id ) => id !== a.id ) );
			await store.deleteTerm( 'dinekit_allergen', a.id );
			setDelAllergen( null );
		} finally {
			setDelBusy( false );
		}
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

	// Gross profit % from the first price vs the cost-to-make.
	const firstPrice = Number( ( ( form.prices || [] )[ 0 ] || {} ).amount ) || 0;
	const costNum = Number( form.cost ) || 0;
	const gp = firstPrice > 0 && costNum > 0 ? Math.round( ( ( firstPrice - costNum ) / firstPrice ) * 100 ) : null;

	// If the dish is built from ingredients/options that carry their own cost +
	// calories, add them up so the whole-dish figures can be filled in one tap.
	const optCost = ( form.modifiers || [] ).reduce( ( s, g ) => s + ( g.options || [] ).reduce( ( t, o ) => t + ( Number( o.cost ) || 0 ), 0 ), 0 );
	const optKcal = ( form.modifiers || [] ).reduce( ( s, g ) => s + ( g.options || [] ).reduce( ( t, o ) => t + ( Number( o.calories ) || 0 ), 0 ), 0 );
	const fillFromOptions = () => {
		const c = Math.round( optCost * 100 ) / 100;
		const k = Math.round( optKcal );
		const patch = { cost: c ? String( c ) : '', calories: k ? String( k ) : '' };
		setForm( ( f ) => ( { ...f, ...patch } ) );
		save( patch );
	};

	// Typed-but-not-yet-sent counts as saving; otherwise follow the same bus the
	// topbar reads, so "Saved — safe to close" is only ever shown when it's true.
	const pillStatus = typing ? 'saving' : store.saveStatus || 'idle';

	// Opening "Add dish" creates the dish up front so this form has somewhere to
	// autosave to — which means closing it again without typing anything used to
	// leave a nameless dish sitting on the menu, published. If nothing was
	// entered, close means "never mind": bin it. (The server re-checks and
	// archives instead if it finds any data.)
	const isBlank = () => {
		const f = form;
		const hasPrice = ( f.prices || [] ).some( ( p ) => String( p.amount || '' ).trim() !== '' );
		return (
			! ( f.title || '' ).trim() &&
			! ( f.description || '' ).trim() &&
			! f.image &&
			! hasPrice &&
			! ( f.modifiers || [] ).length &&
			! ( f.allergens || [] ).length &&
			! ( f.dietary || [] ).length &&
			! ( f.badge || '' ).trim() &&
			! String( f.calories || '' ).trim() &&
			! String( f.cost || '' ).trim()
		);
	};

	const closeEditor = () => {
		// Push any half-typed field first — that decides whether it's blank.
		flush();
		if ( isBlank() ) {
			store.discardItem( item.id );
		}
		onClose();
	};

	return (
		<>
		<Drawer
			anchor="right"
			open
			onClose={ closeEditor }
			// Sit above the WP admin bar (99999) so the drawer header/close isn't
			// hidden behind it; disableEnforceFocus lets the wp.media modal (which
			// opens on top) receive clicks instead of the drawer trapping focus.
			disableEnforceFocus
			sx={ { zIndex: 100000 } }
			PaperProps={ { sx: { bgcolor: tokens.bg } } }
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
					Edit dish
				</Typography>
				<Stack direction="row" alignItems="center" spacing={ 1.25 }>
					{ /* No Save button on this form — the pill is the receipt. */ }
					<SavePill status={ pillStatus } safeToClose />
					<IconButton size="small" aria-label="Close dish" onClick={ closeEditor }>
						<CloseIcon fontSize="small" />
					</IconButton>
				</Stack>
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

				<PriceRepeater prices={ form.prices || [] } onChange={ ( prices ) => setField( 'prices', prices ) } symbol={ data.currency || '£' } position={ data.currencyPosition || 'before' } />

				<ModifierEditor modifiers={ form.modifiers || [] } onChange={ ( m ) => setNow( 'modifiers', m ) } />

				<Section title="Nutrition &amp; cost" subtitle="Calories show on the menu · cost is private.">
					<Box>
						<Typography sx={ labelSx }>Calories (kcal)</Typography>
						<TextField
							type="number"
							value={ form.calories || '' }
							onChange={ ( e ) => setField( 'calories', e.target.value ) }
							placeholder="e.g. 850"
							sx={ { width: 160 } }
						/>
						<Typography sx={ { fontSize: 12, color: tokens.muted2, mt: 0.5 } }>Shown on your public menu.</Typography>
					</Box>
					<Box>
						<Typography sx={ labelSx }>Cost to make</Typography>
						<Stack direction="row" spacing={ 1.5 } alignItems="center" flexWrap="wrap" useFlexGap>
							<Stack direction="row" spacing={ 0.75 } alignItems="center">
								<Typography sx={ { fontWeight: 600, color: tokens.muted2 } }>{ data.currency || '£' }</Typography>
								<TextField
									type="number"
									value={ form.cost || '' }
									onChange={ ( e ) => setField( 'cost', e.target.value ) }
									placeholder="e.g. 3.20"
									sx={ { width: 120 } }
								/>
							</Stack>
							{ null !== gp && (
								<Chip label={ `GP ${ gp }%` } sx={ { fontWeight: 700, bgcolor: gp >= 60 ? tokens.greenSoft : tokens.amberSoft, color: gp >= 60 ? tokens.green : tokens.amber } } />
							) }
						</Stack>
						<Typography sx={ { fontSize: 12, color: tokens.muted2, mt: 0.5 } }>Never shown to customers — used to work out your gross profit.</Typography>
					</Box>
					{ ( optCost > 0 || optKcal > 0 ) && (
						<Box sx={ { p: 1.5, borderRadius: 2, bgcolor: tokens.soft } }>
							<Typography sx={ { fontSize: 12.5, color: tokens.ink2 } }>
								Your ingredients/options add up to <strong>{ data.currency || '£' }{ ( Math.round( optCost * 100 ) / 100 ).toFixed( 2 ) }</strong>{ optKcal > 0 ? <> · <strong>{ Math.round( optKcal ) } kcal</strong></> : null }.
							</Typography>
							<Button size="small" variant="outlined" onClick={ fillFromOptions } sx={ { mt: 0.75 } }>Use these as the dish totals</Button>
						</Box>
					) }
				</Section>

				<Section title="Kitchen &amp; labels">
				<Box>
					<Typography sx={ labelSx }>Badge</Typography>
					<TextField
						fullWidth
						value={ form.badge }
						onChange={ ( e ) => setField( 'badge', e.target.value ) }
						placeholder="e.g. New, Popular, Chef’s Special"
					/>
				</Box>

				<Box>
					<Typography sx={ labelSx }>Prep station</Typography>
					<ToggleButtonGroup
						exclusive
						size="small"
						value={ form.station || 'kitchen' }
						onChange={ ( e, v ) => v && setNow( 'station', v ) }
					>
						<ToggleButton value="kitchen">Kitchen</ToggleButton>
						<ToggleButton value="bar">Bar</ToggleButton>
					</ToggleButtonGroup>
					<Typography sx={ { fontSize: 12, color: tokens.muted2, mt: 0.5 } }>Which pass this prints to on order tickets.</Typography>
				</Box>

				<Box>
					<Stack direction="row" alignItems="center" justifyContent="space-between" spacing={ 2 }>
						<Box>
							<Typography sx={ labelSx }>Available</Typography>
							<Typography sx={ { fontSize: 12, color: tokens.muted2 } }>Turn off to 86 this dish — it shows as “Currently unavailable” on the menu and can’t be ordered.</Typography>
						</Box>
						<Switch
							checked={ form.available !== false }
							onChange={ ( e ) => setNow( 'available', e.target.checked ) }
						/>
					</Stack>
				</Box>

				</Section>

				<Section title="Menus, dietary &amp; allergens">
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
					<Typography sx={ labelSx }>Allergens</Typography>
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
									{ ! a.core && (
										<Box
											component="span"
											title="Delete this custom allergen"
											onClick={ ( e ) => { e.stopPropagation(); removeAllergen( a ); } }
											sx={ { ml: 'auto', px: 0.5, fontSize: 15, lineHeight: 1, cursor: 'pointer', color: tokens.muted2, '&:hover': { color: tokens.red } } }
										>
											×
										</Box>
									) }
								</Stack>
							);
						} ) }
					</Box>

					{ /* Natasha's Law: which specific cereal/nut, for selected allergens with branches. */ }
					{ ( form.allergens || [] ).map( ( id ) => {
						const a = data.allergens.find( ( x ) => x.id === id );
						const opts = a && ( data.allergenSourceOptions || {} )[ a.slug ];
						if ( ! a || ! opts ) {
							return null;
						}
						const picked = ( form.allergenSources || {} )[ a.slug ] || [];
						return (
							<Box key={ a.slug } sx={ { mt: 1 } }>
								<Typography sx={ { fontSize: 11.5, color: tokens.muted2, mb: 0.5 } }>{ a.name } — which one?</Typography>
								<Stack direction="row" spacing={ 0.75 } flexWrap="wrap" useFlexGap>
									{ Object.keys( opts ).map( ( key ) => {
										const son = picked.includes( key );
										return (
											<Box key={ key } component="button" type="button" onClick={ () => toggleSource( a.slug, key ) }
												sx={ { px: 1, py: 0.4, borderRadius: 999, fontSize: 11.5, fontWeight: son ? 700 : 500, cursor: 'pointer', border: `1px solid ${ son ? tokens.amber : tokens.border }`, bgcolor: son ? tokens.amberSoft : tokens.surface, color: son ? tokens.amber : tokens.ink2, fontFamily: 'inherit' } }>
												{ opts[ key ] }
											</Box>
										);
									} ) }
								</Stack>
							</Box>
						);
					} ) }

					{ /* "May contain" traces — cross-contamination risk, distinct from contains. */ }
					<Box sx={ { mt: 1.5 } }>
						<Typography sx={ { fontSize: 11.5, color: tokens.muted2, mb: 0.5 } }>
							May contain traces of{ ' ' }
							<Box component="span" sx={ { color: tokens.muted2, fontStyle: 'italic' } }>
								(cross-contamination risk — shows as “may contain” on the menu)
							</Box>
						</Typography>
						<Stack direction="row" spacing={ 0.75 } flexWrap="wrap" useFlexGap>
							{ data.allergens
								.filter( ( a ) => ! ( form.allergens || [] ).includes( a.id ) )
								.map( ( a ) => {
									const on = ( form.allergenTraces || [] ).includes( a.id );
									return (
										<Box
											key={ a.id }
											component="button"
											type="button"
											onClick={ () => {
												const cur = form.allergenTraces || [];
												setNow( 'allergenTraces', on ? cur.filter( ( id ) => id !== a.id ) : [ ...cur, a.id ] );
											} }
											sx={ { px: 1, py: 0.4, borderRadius: 999, fontSize: 11.5, fontWeight: on ? 700 : 500, cursor: 'pointer', border: `1px dashed ${ on ? tokens.amber : tokens.border }`, bgcolor: on ? tokens.amberSoft : tokens.surface, color: on ? tokens.amber : tokens.ink2, fontFamily: 'inherit' } }
										>
											{ a.name }
										</Box>
									);
								} ) }
						</Stack>
					</Box>

					{ /* Add a custom allergen on the fly. */ }
					<Stack direction="row" spacing={ 1 } alignItems="center" sx={ { mt: 1.25 } }>
						<Box component="input" type="text" placeholder="Add your own allergen…" value={ newAllergen }
							onChange={ ( e ) => setNewAllergen( e.target.value ) }
							onKeyDown={ ( e ) => { if ( 'Enter' === e.key ) { e.preventDefault(); addAllergen(); } } }
							sx={ { flex: 1, px: 1.25, py: 0.6, border: `1px solid ${ tokens.border2 }`, borderRadius: '9px', fontFamily: 'inherit', fontSize: 13, boxShadow: 'none', outline: 'none' } } />
						<Button size="small" variant="outlined" disabled={ ! newAllergen.trim() } onClick={ addAllergen }>Add</Button>
					</Stack>
				</Box>

				</Section>

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
					<Tooltip title="Archive this dish — hidden from the menu, kept for past orders">
						<Button
							color="error"
							size="small"
							startIcon={ <DeleteOutlineIcon /> }
							onClick={ onArchive }
						>
							Archive
						</Button>
					</Tooltip>
				</Stack>
			</Box>
		</Drawer>
		<ConfirmDialog
			open={ !! delAllergen }
			title={ delAllergen ? `Delete the “${ delAllergen.name }” allergen?` : '' }
			message="This custom allergen will be removed for good."
			confirmLabel="Delete allergen"
			busy={ delBusy }
			onConfirm={ confirmRemoveAllergen }
			onCancel={ () => setDelAllergen( null ) }
			details={ delAllergen && delAllergen.count > 0 ? (
				<Box sx={ { p: 1.5, borderRadius: 2, bgcolor: tokens.amberSoft } }>
					<Typography sx={ { fontSize: 13, color: tokens.amber, fontWeight: 600 } }>
						It&apos;s used on { delAllergen.count } dish{ 1 === delAllergen.count ? '' : 'es' } — it&apos;ll be removed from { 1 === delAllergen.count ? 'it' : 'them' }.
					</Typography>
				</Box>
			) : null }
		/>
		</>
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
