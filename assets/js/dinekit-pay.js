/**
 * DineKit pay-by-QR page. Standalone (no theme). Reads window.DINEKIT_PAY, opens
 * a PaymentIntent for the bill balance and mounts the Stripe Payment Element.
 * Fulfilment is webhook-driven server-side (records a card tender on the tab).
 */
( function () {
	'use strict';
	var cfg = window.DINEKIT_PAY;
	if ( ! cfg ) {
		return;
	}
	var sym = cfg.currency || '£';
	function money( n ) {
		var v = Number( n || 0 ).toFixed( 2 );
		return 'after' === cfg.currencyPos ? v + sym : sym + v;
	}
	var sub = document.getElementById( 'dk-pay-sub' );
	var amtEl = document.getElementById( 'dk-pay-amount' );
	var elEl = document.getElementById( 'dk-pay-element' );
	var errEl = document.getElementById( 'dk-pay-error' );
	var btn = document.getElementById( 'dk-pay-btn' );
	var done = document.getElementById( 'dk-pay-done' );

	function showDone( msg ) {
		if ( msg ) {
			done.querySelector( 'p' ).textContent = msg;
		}
		elEl.style.display = 'none';
		btn.style.display = 'none';
		errEl.textContent = '';
		sub.textContent = '';
		amtEl.style.display = 'none';
		done.hidden = false;
	}

	if ( ! cfg.valid ) {
		amtEl.textContent = 'This payment link is not valid.';
		btn.style.display = 'none';
		return;
	}
	sub.textContent = 'Order #' + cfg.number + ( cfg.table ? ' · ' + cfg.table : '' );
	if ( ! cfg.ready ) {
		amtEl.textContent = 'Card payment isn’t available here.';
		btn.style.display = 'none';
		return;
	}
	if ( Number( cfg.balance ) <= 0 ) {
		showDone( 'This bill is already paid.' );
		return;
	}

	amtEl.textContent = money( cfg.balance );
	btn.textContent = 'Pay ' + money( cfg.balance );

	var stripe;
	var elements;
	fetch( cfg.restUrl + 'pay/' + encodeURIComponent( cfg.token ) + '/intent', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify( {} ),
	} )
		.then( function ( r ) { return r.json().then( function ( d ) { return { ok: r.ok, d: d }; } ); } )
		.then( function ( res ) {
			if ( ! res.ok || ! res.d.clientSecret ) {
				errEl.textContent = ( res.d && res.d.message ) || 'Could not start the payment.';
				return;
			}
			stripe = window.Stripe( res.d.publishableKey );
			elements = stripe.elements( { clientSecret: res.d.clientSecret } );
			elements.create( 'payment' ).mount( '#dk-pay-element' );
			btn.disabled = false;
		} )
		.catch( function () { errEl.textContent = 'Network error — please try again.'; } );

	btn.addEventListener( 'click', function () {
		if ( ! stripe ) {
			return;
		}
		btn.disabled = true;
		btn.textContent = 'Processing…';
		errEl.textContent = '';
		stripe.confirmPayment( {
			elements: elements,
			confirmParams: { return_url: window.location.href },
			redirect: 'if_required',
		} ).then( function ( result ) {
			if ( result.error ) {
				btn.disabled = false;
				btn.textContent = 'Pay ' + money( cfg.balance );
				errEl.textContent = result.error.message || 'Payment failed.';
			} else {
				showDone();
			}
		} );
	} );
} )();
