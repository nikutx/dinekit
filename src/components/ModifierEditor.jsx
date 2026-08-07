import React from 'react';
import {
	Box,
	Stack,
	Typography,
	TextField,
	IconButton,
	Button,
	ToggleButton,
	ToggleButtonGroup,
} from '../ui';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import TuneIcon from '@mui/icons-material/Tune';
import { tokens } from '../theme';
import { isMoneyish, isIntish } from '../lib/numbers';

const labelSx = {
	textTransform: 'uppercase',
	fontSize: 11,
	fontWeight: 700,
	letterSpacing: '0.04em',
	color: tokens.muted,
	display: 'block',
};

// Dish customizations: a list of groups. A "remove" group lists ingredients the
// diner can take off ("no onions"); a "choose" group offers options (base,
// sauce, toppings) with an optional +price and min/max selectable.
export default function ModifierEditor( { modifiers, onChange } ) {
	const groups = modifiers || [];

	const update = ( i, patch ) => onChange( groups.map( ( g, idx ) => ( idx === i ? { ...g, ...patch } : g ) ) );
	const addGroup = () =>
		onChange( [ ...groups, { name: '', type: 'choose', min: 1, max: 1, options: [ { label: '', price: '' } ] } ] );
	const removeGroup = ( i ) => onChange( groups.filter( ( _, idx ) => idx !== i ) );
	const setOpt = ( gi, oi, patch ) =>
		update( gi, { options: groups[ gi ].options.map( ( o, idx ) => ( idx === oi ? { ...o, ...patch } : o ) ) } );
	const addOpt = ( gi ) => update( gi, { options: [ ...( groups[ gi ].options || [] ), { label: '', price: '' } ] } );
	const removeOpt = ( gi, oi ) => update( gi, { options: groups[ gi ].options.filter( ( _, idx ) => idx !== oi ) } );

	return (
		<Box>
			<Stack direction="row" justifyContent="space-between" alignItems="center" sx={ { mb: 0.75 } }>
				<Typography sx={ labelSx } component="span">Customizations</Typography>
				<Button size="small" startIcon={ <AddIcon /> } onClick={ addGroup } sx={ { color: tokens.accent } }>
					Add
				</Button>
			</Stack>

			{ groups.length === 0 && (
				<Typography sx={ { fontSize: 13, color: tokens.muted2 } }>
					Let diners tweak this dish — remove ingredients (“no onions”), or offer choices
					(base, sauce, extra toppings) with optional prices.
				</Typography>
			) }

			<Stack spacing={ 1.5 }>
				{ groups.map( ( g, gi ) => (
					<Box key={ gi } sx={ { border: `1px solid ${ tokens.border }`, borderRadius: 2, p: 1.5, bgcolor: tokens.surface } }>
						<Stack direction="row" spacing={ 1 } alignItems="center" sx={ { mb: 1 } }>
							<TextField
								size="small"
								placeholder={ g.type === 'remove' ? 'Group (e.g. Ingredients)' : 'Group (e.g. Base)' }
								value={ g.name }
								onChange={ ( e ) => update( gi, { name: e.target.value } ) }
								sx={ { flex: 1 } }
							/>
							<IconButton size="small" onClick={ () => removeGroup( gi ) } sx={ { color: tokens.muted2 } }>
								<DeleteOutlineIcon fontSize="small" />
							</IconButton>
						</Stack>

						<Stack direction="row" spacing={ 1.5 } alignItems="center" sx={ { mb: 1 } }>
							<ToggleButtonGroup
								size="small"
								exclusive
								value={ g.type }
								onChange={ ( e, v ) => v && update( gi, { type: v } ) }
							>
								<ToggleButton value="remove">Removable</ToggleButton>
								<ToggleButton value="choose">Choose</ToggleButton>
							</ToggleButtonGroup>
							{ g.type === 'choose' && (
								<>
									<TextField
										size="small"
										type="number"
										label="Min"
										value={ g.min }
										onChange={ ( e ) => update( gi, { min: Math.max( 0, parseInt( e.target.value, 10 ) || 0 ) } ) }
										sx={ { width: 74 } }
									/>
									<TextField
										size="small"
										type="number"
										label="Max"
										value={ g.max }
										onChange={ ( e ) => update( gi, { max: Math.max( 0, parseInt( e.target.value, 10 ) || 0 ) } ) }
										sx={ { width: 74 } }
									/>
								</>
							) }
						</Stack>

						<Stack spacing={ 0.75 }>
							{ ( g.options || [] ).map( ( o, oi ) => (
								<OptionRow
									key={ oi }
									g={ g }
									o={ o }
									onChange={ ( patch ) => setOpt( gi, oi, patch ) }
									onRemove={ () => removeOpt( gi, oi ) }
								/>
							) ) }
							<Button size="small" startIcon={ <AddIcon /> } onClick={ () => addOpt( gi ) } sx={ { alignSelf: 'flex-start', color: tokens.muted } }>
								Option
							</Button>
						</Stack>
					</Box>
				) ) }
			</Stack>
		</Box>
	);
}

// One option row, with an optional (collapsed by default) cost + calories detail
// so ingredient-level pricing/nutrition stays subtle until you want it.
function OptionRow( { g, o, onChange, onRemove } ) {
	const [ open, setOpen ] = React.useState( !! ( o.cost || o.calories ) );
	return (
		<Box>
			<Stack direction="row" spacing={ 1 } alignItems="center">
				<TextField
					size="small"
					placeholder={ g.type === 'remove' ? 'Ingredient (e.g. Onions)' : 'Option (e.g. Thin base)' }
					value={ o.label }
					onChange={ ( e ) => onChange( { label: e.target.value } ) }
					sx={ { flex: 1 } }
				/>
				{ g.type === 'choose' && (
					<TextField
						size="small"
						placeholder="+ price"
						value={ o.price }
						error={ ! isMoneyish( o.price ) }
						onChange={ ( e ) => onChange( { price: e.target.value } ) }
						sx={ { width: 84 } }
					/>
				) }
				<IconButton size="small" title="Cost &amp; calories (optional)" onClick={ () => setOpen( ( v ) => ! v ) } sx={ { color: open ? tokens.accent : tokens.muted2 } }>
					<TuneIcon sx={ { fontSize: 16 } } />
				</IconButton>
				<IconButton size="small" onClick={ onRemove } sx={ { color: tokens.muted2 } }>
					<DeleteOutlineIcon sx={ { fontSize: 16 } } />
				</IconButton>
			</Stack>
			{ open && (
				<Stack direction="row" spacing={ 1 } sx={ { mt: 0.75, pl: 0.5 } }>
					<TextField size="small" placeholder="Cost" value={ o.cost || '' } error={ ! isMoneyish( o.cost ) } onChange={ ( e ) => onChange( { cost: e.target.value } ) } sx={ { width: 100 } } />
					<TextField size="small" placeholder="kcal" value={ o.calories || '' } error={ ! isIntish( o.calories ) } onChange={ ( e ) => onChange( { calories: e.target.value } ) } sx={ { width: 100 } } />
				</Stack>
			) }
		</Box>
	);
}
