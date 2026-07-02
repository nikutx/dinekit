import React from 'react';
import { Box, Typography, Stack, Chip } from '@mui/material';
import { tokens } from '../theme';

export default function Sidebar( { nav, view, onChange } ) {
	return (
		<Box
			sx={ {
				width: 244,
				flexShrink: 0,
				bgcolor: tokens.sidebar,
				color: tokens.sidebarText,
				minHeight: 'calc(100vh - 32px)',
				py: 3,
				position: 'sticky',
				top: 32,
				alignSelf: 'flex-start',
			} }
		>
			<Box sx={ { px: 3, mb: 4 } }>
				<Typography
					sx={ {
						fontWeight: 800,
						fontSize: 22,
						letterSpacing: '-0.5px',
						color: '#fff',
					} }
				>
					Dine<span style={ { color: tokens.accent } }>Kit</span>
				</Typography>
				<Typography sx={ { fontSize: 11, color: tokens.muted2, mt: 0.5 } }>
					by Web Level Up
				</Typography>
			</Box>

			<Stack spacing={ 0.5 } sx={ { px: 2 } }>
				{ nav.map( ( item ) => {
					const active = item.key === view;
					return (
						<Box
							key={ item.key }
							onClick={ () => onChange( item.key ) }
							sx={ {
								display: 'flex',
								alignItems: 'center',
								gap: 1.25,
								px: 1.75,
								py: 1.1,
								borderRadius: 2,
								cursor: 'pointer',
								fontSize: 14,
								fontWeight: 600,
								color: active ? '#fff' : tokens.sidebarText,
								bgcolor: active ? tokens.accent : 'transparent',
								transition: 'all 0.15s ease-in-out',
								'&:hover': {
									bgcolor: active ? tokens.accentDark : tokens.sidebarHover,
								},
							} }
						>
							{ item.icon }
							<span style={ { flex: 1 } }>{ item.label }</span>
							{ item.soon && (
								<Chip
									label="Soon"
									size="small"
									sx={ {
										height: 18,
										fontSize: 10,
										bgcolor: tokens.sidebarHover,
										color: tokens.muted2,
									} }
								/>
							) }
						</Box>
					);
				} ) }
			</Stack>
		</Box>
	);
}
