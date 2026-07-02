import React, { createContext, useCallback, useContext, useState } from 'react';
import { Box, Slide, IconButton } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { tokens } from '../theme';

const ToastContext = createContext( { push: () => {} } );

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext( ToastContext );

const CONFIG = {
	success: { icon: <CheckCircleRoundedIcon fontSize="small" />, color: tokens.green, bg: tokens.greenSoft },
	error: { icon: <ErrorRoundedIcon fontSize="small" />, color: tokens.red, bg: tokens.redSoft },
	info: { icon: <InfoRoundedIcon fontSize="small" />, color: tokens.accentDark, bg: tokens.accentSoft },
};

let seq = 0;

export function ToastProvider( { children } ) {
	const [ toasts, setToasts ] = useState( [] );

	const remove = useCallback( ( id ) => {
		setToasts( ( t ) => t.filter( ( x ) => x.id !== id ) );
	}, [] );

	const push = useCallback(
		( type, title, detail, ttl = 4500 ) => {
			const id = ++seq;
			setToasts( ( t ) => [ ...t, { id, type, title, detail } ] );
			if ( ttl ) {
				setTimeout( () => remove( id ), ttl );
			}
		},
		[ remove ]
	);

	const api = {
		push,
		success: ( title, detail ) => push( 'success', title, detail ),
		error: ( title, detail ) => push( 'error', title, detail ),
		info: ( title, detail ) => push( 'info', title, detail ),
	};

	return (
		<ToastContext.Provider value={ api }>
			{ children }
			<Box
				sx={ {
					position: 'fixed',
					top: 48,
					right: 24,
					zIndex: 200000,
					display: 'flex',
					flexDirection: 'column',
					gap: 1.25,
					maxWidth: 380,
					pointerEvents: 'none',
				} }
			>
				{ toasts.map( ( t ) => {
					const cfg = CONFIG[ t.type ] || CONFIG.info;
					return (
						<Slide key={ t.id } direction="left" in mountOnEnter unmountOnExit>
							<Box
								sx={ {
									pointerEvents: 'auto',
									display: 'flex',
									alignItems: 'flex-start',
									gap: 1.25,
									bgcolor: tokens.surface,
									border: `1px solid ${ tokens.border }`,
									borderLeft: `4px solid ${ cfg.color }`,
									borderRadius: 2.5,
									boxShadow: '0 18px 48px rgba(15,23,42,0.16)',
									px: 1.75,
									py: 1.5,
									minWidth: 300,
								} }
							>
								<Box sx={ { color: cfg.color, mt: '1px' } }>{ cfg.icon }</Box>
								<Box sx={ { flex: 1, minWidth: 0 } }>
									<Box sx={ { fontWeight: 700, fontSize: 14, color: tokens.ink } }>{ t.title }</Box>
									{ t.detail && (
										<Box sx={ { fontSize: 13, color: tokens.muted, mt: 0.25 } }>{ t.detail }</Box>
									) }
								</Box>
								<IconButton size="small" onClick={ () => remove( t.id ) } sx={ { color: tokens.muted2, p: 0.25 } }>
									<CloseRoundedIcon fontSize="small" />
								</IconButton>
							</Box>
						</Slide>
					);
				} ) }
			</Box>
		</ToastContext.Provider>
	);
}
