import React from 'react';
import { Modal, Box, Stack, Typography, Button, CircularProgress } from '../../ui';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { tokens } from '../../theme';

/**
 * A real confirmation dialog, replacing window.confirm(). Destructive by default:
 * the confirm button is rose and the cancel is the quiet one, so the safe action
 * is never the loud one.
 *
 * `details` renders between the message and the buttons — use it to surface
 * consequences the user can't see (e.g. "this dish is on 2 live orders").
 */
export default function ConfirmDialog( {
	open,
	title,
	message,
	details,
	confirmLabel = 'Delete',
	cancelLabel = 'Cancel',
	destructive = true,
	busy = false,
	confirmDisabled = false,
	onConfirm,
	onCancel,
} ) {
	if ( ! open ) {
		return null;
	}

	return (
		<Modal open onClose={ busy ? undefined : onCancel } sx={ { maxWidth: 440 } }>
			<Box sx={ { p: 3 } }>
				<Stack direction="row" spacing={ 1.75 } alignItems="flex-start" sx={ { mb: 2 } }>
					{ destructive && (
						<Box
							sx={ {
								width: 38,
								height: 38,
								flexShrink: 0,
								borderRadius: '50%',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								bgcolor: `${ tokens.red }14`,
							} }
						>
							<WarningAmberIcon sx={ { fontSize: 20, color: tokens.red } } />
						</Box>
					) }
					<Box sx={ { minWidth: 0 } }>
						<Typography sx={ { fontSize: 16, fontWeight: 650, color: tokens.ink, mb: 0.5 } }>
							{ title }
						</Typography>
						{ message && (
							<Typography sx={ { fontSize: 13.5, color: tokens.muted, lineHeight: 1.5 } }>
								{ message }
							</Typography>
						) }
					</Box>
				</Stack>

				{ details }

				<Stack direction="row" spacing={ 1 } justifyContent="flex-end" sx={ { mt: 2.5 } }>
					<Button variant="text" onClick={ onCancel } disabled={ busy } sx={ { color: tokens.muted } }>
						{ cancelLabel }
					</Button>
					<Button
						variant="contained"
						color={ destructive ? 'error' : 'primary' }
						onClick={ onConfirm }
						disabled={ busy || confirmDisabled }
						startIcon={ busy ? <CircularProgress size={ 15 } color="inherit" /> : null }
					>
						{ confirmLabel }
					</Button>
				</Stack>
			</Box>
		</Modal>
	);
}
