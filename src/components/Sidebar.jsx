import React from 'react';
import { Box, Typography, Stack, Chip, Tooltip, IconButton } from '../ui';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { tokens } from '../theme';

// App sidebar — dark shell, grouped nav. Active item = soft indigo tint +
// accent rail (not a heavy solid pill), Linear-style. Collapses to an icon rail
// ("focus mode") for more running-screen on the full-width service views.
export default function Sidebar( { nav, view, onChange, collapsed, onToggleCollapse } ) {
	const version = ( window.DINEKIT && window.DINEKIT.version ) || '';
	return (
		<Box
			sx={ {
				width: collapsed ? 64 : 248,
				flexShrink: 0,
				bgcolor: tokens.sidebar,
				color: tokens.sidebarText,
				minHeight: 'calc(100vh - 32px)',
				pt: 3,
				position: 'sticky',
				top: 32,
				alignSelf: 'flex-start',
				display: 'flex',
				flexDirection: 'column',
				transition: 'width .18s ease',
			} }
		>
			{ /* Logo lockup */ }
			<Stack direction="row" spacing={ 1.25 } alignItems="center" sx={ { px: collapsed ? 0 : 3, mb: 3.5, justifyContent: collapsed ? 'center' : 'flex-start' } }>
				<Box
					sx={ {
						width: 32,
						height: 32,
						borderRadius: 2,
						flexShrink: 0,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						background: `linear-gradient(135deg, #6366f1 0%, ${ tokens.accentDark } 100%)`,
						boxShadow: 'inset 0 1px 0 rgba(255,255,255,.22), 0 2px 6px rgba(79,70,229,.4)',
					} }
				>
					<RestaurantIcon sx={ { fontSize: 17, color: '#fff' } } />
				</Box>
				{ ! collapsed && (
					<Box>
						<Typography sx={ { fontWeight: 700, fontSize: 16.5, letterSpacing: '-0.02em', color: '#fff', lineHeight: 1.15 } }>
							DineKit
						</Typography>
						<Typography sx={ { fontSize: 10.5, color: '#6b6b76', letterSpacing: '0.02em' } }>
							by Web Level Up
						</Typography>
					</Box>
				) }
			</Stack>

			{ /* Nav */ }
			<Stack spacing={ 0.25 } sx={ { px: 1.5, flex: 1, overflowY: 'auto' } }>
				{ nav.map( ( item, i ) => {
					if ( item.group ) {
						return collapsed ? (
							<Box key={ `group-${ i }` } sx={ { height: '1px', bgcolor: '#1c1c22', mx: 1, my: 1 } } />
						) : (
							<Typography
								key={ `group-${ i }` }
								sx={ {
									px: 1.5,
									pt: 2.75,
									pb: 0.75,
									fontSize: 10.5,
									fontWeight: 600,
									letterSpacing: '0.08em',
									textTransform: 'uppercase',
									color: '#63636e',
								} }
							>
								{ item.group }
							</Typography>
						);
					}
					const active = item.key === view;
					const row = (
						<Box
							onClick={ () => onChange( item.key ) }
							sx={ {
								position: 'relative',
								display: 'flex',
								alignItems: 'center',
								gap: collapsed ? 0 : 1.25,
								justifyContent: collapsed ? 'center' : 'flex-start',
								px: collapsed ? 0 : 1.5,
								height: 36,
								borderRadius: 2,
								cursor: 'pointer',
								fontSize: 13.5,
								fontWeight: 550,
								letterSpacing: '-0.006em',
								color: active ? '#fff' : tokens.sidebarText,
								bgcolor: active ? 'rgba(99,102,241,0.16)' : 'transparent',
								transition: 'background .15s ease, color .15s ease',
								'&:hover': { bgcolor: active ? 'rgba(99,102,241,0.16)' : tokens.sidebarHover, color: '#e4e4e7' },
								'&::before': active && ! collapsed
									? {
										content: '""',
										position: 'absolute',
										left: 0,
										top: '50%',
										transform: 'translateY(-50%)',
										width: 3,
										height: 16,
										borderRadius: 999,
										bgcolor: '#818cf8',
									}
									: undefined,
								'& svg': { fontSize: 18, color: active ? '#a5b4fc' : '#6b6b76', transition: 'color .15s ease' },
								'&:hover svg': { color: active ? '#a5b4fc' : '#9d9da8' },
							} }
						>
							{ item.icon }
							{ ! collapsed && <span style={ { flex: 1 } }>{ item.label }</span> }
							{ ! collapsed && item.soon && (
								<Chip
									label="Soon"
									size="small"
									sx={ { height: 18, fontSize: 10, bgcolor: tokens.sidebarHover, color: '#6b6b76' } }
								/>
							) }
						</Box>
					);
					return collapsed ? (
						<Tooltip key={ item.key } title={ item.label } placement="right">
							{ row }
						</Tooltip>
					) : (
						<React.Fragment key={ item.key }>{ row }</React.Fragment>
					);
				} ) }
			</Stack>

			{ /* Footer */ }
			<Box sx={ { borderTop: '1px solid #1c1c22', px: collapsed ? 0.5 : 3, py: 2, mt: 2 } }>
				<Stack direction="row" alignItems="center" justifyContent={ collapsed ? 'center' : 'space-between' }>
					{ ! collapsed && (
						<Box
							component="a"
							href="https://weblevelup.co.uk"
							target="_blank"
							rel="noreferrer"
							sx={ {
								display: 'flex',
								alignItems: 'center',
								gap: 0.75,
								fontSize: 12,
								fontWeight: 550,
								color: '#6b6b76',
								textDecoration: 'none',
								'&:hover': { color: '#9d9da8' },
							} }
						>
							<HelpOutlineIcon sx={ { fontSize: 15 } } />
							Help &amp; support
						</Box>
					) }
					<Stack direction="row" alignItems="center" spacing={ 1 }>
						{ ! collapsed && version && (
							<Typography sx={ { fontSize: 10.5, color: '#4a4a55', fontVariantNumeric: 'tabular-nums' } }>
								v{ version }
							</Typography>
						) }
						<Tooltip title={ collapsed ? 'Expand menu' : 'Collapse menu (focus mode)' } placement="right">
							<IconButton size="small" onClick={ onToggleCollapse } sx={ { color: '#6b6b76', '&:hover': { color: '#e4e4e7', bgcolor: tokens.sidebarHover } } }>
								{ collapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" /> }
							</IconButton>
						</Tooltip>
					</Stack>
				</Stack>
			</Box>
		</Box>
	);
}
