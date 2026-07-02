import { tokens } from '../theme';

// Booking statuses — mirror of includes/bookings/register.php statuses().
// order = the natural lifecycle order (used for the status dropdown).
export const STATUSES = [
	{ key: 'pending', label: 'Pending', fg: tokens.muted, bg: tokens.soft },
	{ key: 'provisional', label: 'Penciled in', fg: tokens.amber, bg: tokens.amberSoft },
	{ key: 'confirmed', label: 'Confirmed', fg: tokens.accentDark, bg: tokens.accentSoft },
	{ key: 'seated', label: 'Seated', fg: tokens.green, bg: tokens.greenSoft },
	{ key: 'completed', label: 'Completed', fg: tokens.muted, bg: tokens.soft },
	{ key: 'cancelled', label: 'Cancelled', fg: tokens.red, bg: tokens.redSoft },
	{ key: 'no_show', label: 'No-show', fg: tokens.red, bg: tokens.redSoft },
];

export const statusMeta = ( key ) =>
	STATUSES.find( ( s ) => s.key === key ) || STATUSES[ 0 ];

// Local YYYY-MM-DD for a Date (avoids the UTC shift toISOString() causes).
export function isoDate( d = new Date() ) {
	const p = ( n ) => String( n ).padStart( 2, '0' );
	return `${ d.getFullYear() }-${ p( d.getMonth() + 1 ) }-${ p( d.getDate() ) }`;
}

export function addDays( iso, n ) {
	const [ y, m, d ] = iso.split( '-' ).map( Number );
	const dt = new Date( y, m - 1, d + n );
	return isoDate( dt );
}

// "Fri 5 Jul" — friendly date label from a YYYY-MM-DD string.
export function prettyDate( iso ) {
	if ( ! iso ) {
		return '';
	}
	const [ y, m, d ] = iso.split( '-' ).map( Number );
	const dt = new Date( y, m - 1, d );
	return dt.toLocaleDateString( undefined, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
	} );
}
