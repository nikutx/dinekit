// Print helper — opens a clean, self-contained document in a new window and
// triggers the browser print dialog. Kept out of the admin's own styles so
// tickets/slips print tidily. All dynamic values must be escaped via esc().

export function esc( value ) {
	return String( value == null ? '' : value )
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' )
		.replace( /"/g, '&quot;' );
}

const PRINT_CSS = `
	* { box-sizing: border-box; }
	html, body { background: #fff; }
	body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; }
	h1 { font-size: 20px; margin: 0 0 2px; }
	.dinekit-sub { color: #64748b; font-size: 13px; margin: 0 0 18px; }
	.dinekit-section-title { font-size: 12px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #64748b; margin: 18px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
	.dinekit-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 15px; border-bottom: 1px solid #f1f5f9; }
	.dinekit-row strong { font-variant-numeric: tabular-nums; }
	.dinekit-allergen { color: #b45309; font-weight: 700; }
	.dinekit-ticket { border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px 14px; margin: 0 0 10px; page-break-inside: avoid; }
	.dinekit-ticket h3 { margin: 0 0 4px; font-size: 16px; }
	.dinekit-ticket .dinekit-meta { color: #64748b; font-size: 13px; margin: 0 0 6px; }
	.dinekit-ticket ul { margin: 0; padding-left: 18px; font-size: 15px; }
	.dinekit-ticket .dinekit-flag { margin-top: 6px; font-size: 13px; }
	.dinekit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.dinekit-foot { margin-top: 24px; color: #94a3b8; font-size: 11px; }
	@media print { body { padding: 0; } @page { margin: 14mm; } .dinekit-grid { grid-template-columns: 1fr 1fr; } }
`;

export function buildDoc( title, bodyHtml ) {
	return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc( title ) +
		'</title><style>' + PRINT_CSS + '</style></head><body>' + bodyHtml +
		'<p class="dinekit-foot">Printed from DineKit</p></body></html>';
}

export function printDoc( title, bodyHtml ) {
	const w = window.open( '', '_blank' );
	if ( ! w ) {
		return;
	}
	w.document.open();
	w.document.write( buildDoc( title, bodyHtml ) );
	w.document.close();
	w.focus();
	// Let styles/layout settle before invoking print.
	setTimeout( () => {
		try {
			w.print();
		} catch ( e ) {
			// Print dialog unavailable (e.g. headless) — the window still shows.
		}
	}, 350 );
}
