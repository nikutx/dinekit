// One definition of "reads as a number" for free-text money/number fields.
// The server quietly zeroes anything else on save, so the field must say so
// BEFORE the value is lost — never let letters fail silently.
export const isMoneyish = ( v ) =>
	'' === String( v == null ? '' : v ).trim() ||
	/^[0-9]+([.,][0-9]{0,2})?$/.test( String( v ).trim() );

export const isIntish = ( v ) =>
	'' === String( v == null ? '' : v ).trim() ||
	/^[0-9]+$/.test( String( v ).trim() );
