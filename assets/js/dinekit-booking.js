/**
 * DineKit public booking widget. Vanilla JS, no dependencies. Builds time slots,
 * checks availability live, and submits a booking to the public REST endpoints.
 * All user-facing strings come translated from PHP via the config object.
 */
( function () {
	'use strict';

	function pad( n ) {
		return ( n < 10 ? '0' : '' ) + n;
	}
	function localDate( d ) {
		return d.getFullYear() + '-' + pad( d.getMonth() + 1 ) + '-' + pad( d.getDate() );
	}
	function money( cfg, pence ) {
		return ( cfg.currency || '£' ) + ( pence / 100 ).toFixed( 2 );
	}

	// Replace the whole widget with a simple confirmation screen. Announced to
	// screen readers (role=status) and focused so keyboard users land on it.
	function renderSuccess( root, title, message ) {
		var wrap = document.createElement( 'div' );
		wrap.className = 'dinekit-booking__success';
		wrap.setAttribute( 'role', 'status' );
		wrap.tabIndex = -1;
		var h = document.createElement( 'p' );
		h.className = 'dinekit-booking__success-title';
		h.textContent = title;
		var p = document.createElement( 'p' );
		p.textContent = message || '';
		wrap.appendChild( h );
		wrap.appendChild( p );
		root.innerHTML = '';
		root.appendChild( wrap );
		wrap.focus();
	}

	// Native Stripe deposit step (Payment Element, on-site). Started only when the
	// booking needs a deposit and Stripe.js is present. Fulfilment is webhook-driven
	// server-side; this just collects the card and confirms.
	function startDeposit( root, cfg, t, bookingId ) {
		var wrap = document.createElement( 'div' );
		wrap.className = 'dinekit-booking__pay';
		var h = document.createElement( 'p' );
		h.className = 'dinekit-booking__success-title';
		h.textContent = t.payTitle || t.payButton || 'Pay deposit';
		var skel = document.createElement( 'div' );
		skel.className = 'dinekit-booking__pay-skel';
		skel.setAttribute( 'aria-hidden', 'true' );
		for ( var s = 0; s < 3; s++ ) {
			var line = document.createElement( 'div' );
			line.className = 'dinekit-booking__skel-line';
			skel.appendChild( line );
		}
		var removeSkel = function () { if ( skel.parentNode ) { skel.parentNode.removeChild( skel ); } };
		var host = document.createElement( 'div' );
		host.className = 'dinekit-booking__pay-element';
		var err = document.createElement( 'p' );
		err.className = 'dinekit-booking__pay-error';
		err.setAttribute( 'role', 'alert' );
		var btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'dinekit-booking__submit';
		btn.textContent = t.payButton || 'Pay deposit';
		btn.disabled = true;
		wrap.setAttribute( 'role', 'status' );
		wrap.tabIndex = -1;
		wrap.appendChild( h );
		wrap.appendChild( skel );
		wrap.appendChild( host );
		wrap.appendChild( err );
		wrap.appendChild( btn );
		root.innerHTML = '';
		root.appendChild( wrap );
		wrap.focus();

		var stripe = window.Stripe( cfg.publishableKey );
		fetch( cfg.restUrl + 'payments/intent', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.nonce },
			body: JSON.stringify( { booking: bookingId } ),
		} )
			.then( function ( r ) { return r.json().then( function ( d ) { return { ok: r.ok, d: d }; } ); } )
			.then( function ( res ) {
				if ( ! res.ok || ! res.d || ! res.d.clientSecret ) {
					removeSkel();
					err.textContent = ( res.d && res.d.message ) ? res.d.message : ( t.payError || '' );
					return;
				}
				if ( res.d.amount ) {
					btn.textContent = ( t.payButton || 'Pay' ) + ' · ' + money( cfg, res.d.amount );
				}
				var elements = stripe.elements( { clientSecret: res.d.clientSecret } );
				var paymentEl = elements.create( 'payment' );
				paymentEl.on( 'ready', removeSkel );
				paymentEl.mount( host );
				btn.disabled = false;
				btn.addEventListener( 'click', function () {
					btn.disabled = true;
					err.textContent = '';
					btn.textContent = t.paying || '…';
					stripe.confirmPayment( {
						elements: elements,
						confirmParams: { return_url: window.location.href },
						redirect: 'if_required',
					} ).then( function ( result ) {
						if ( result.error ) {
							btn.disabled = false;
							btn.textContent = t.payButton || 'Pay deposit';
							err.textContent = result.error.message || t.payError || '';
						} else {
							renderSuccess( root, t.depositPaid || t.tableBooked, '' );
						}
					} );
				} );
			} )
			.catch( function () { removeSkel(); err.textContent = t.networkError || ''; } );
	}

	function setup( root ) {
		var cfg;
		try {
			cfg = JSON.parse( root.getAttribute( 'data-dinekit-booking' ) );
		} catch ( e ) {
			return;
		}
		var t = cfg.i18n || {};
		var form = root.querySelector( '.dinekit-booking__form' );
		if ( ! form ) {
			return;
		}
		var dateEl = form.querySelector( '[name=date]' );
		var timeEl = form.querySelector( '[name=time]' );
		var partyEl = form.querySelector( '[name=party]' );
		var availEl = root.querySelector( '.dinekit-booking__availability' );
		var resultEl = root.querySelector( '.dinekit-booking__result' );
		var submitEl = form.querySelector( '.dinekit-booking__submit' );
		var origSubmit = submitEl.textContent;

		var today = localDate( new Date() );
		dateEl.min = today;
		var maxD = new Date();
		maxD.setDate( maxD.getDate() + ( cfg.maxDaysAhead || 90 ) );
		dateEl.max = localDate( maxD );
		if ( ! dateEl.value ) {
			dateEl.value = today;
		}

		// Slots come from the server (service periods = Opening Hours), so lunch/
		// dinner services, closed days and min-notice are all honoured centrally.
		function loadSlots() {
			if ( ! dateEl.value ) {
				return;
			}
			var url = cfg.restUrl + 'book/slots?date=' + encodeURIComponent( dateEl.value );
			fetch( url, { headers: { 'X-WP-Nonce': cfg.nonce } } )
				.then( function ( r ) { return r.json(); } )
				.then( function ( d ) {
					var slots = ( d && d.slots ) || [];
					var keep = timeEl.value;
					if ( ! slots.length ) {
						timeEl.innerHTML = '';
						submitEl.disabled = true;
						say( availEl, '✗ ' + ( t.closedDay || 'Sorry, we’re closed that day.' ), 'is-no' );
						return;
					}
					submitEl.disabled = false;
					var html = '';
					for ( var i = 0; i < slots.length; i++ ) {
						html += '<option value="' + slots[ i ] + '">' + slots[ i ] + '</option>';
					}
					timeEl.innerHTML = html;
					if ( keep && slots.indexOf( keep ) !== -1 ) {
						timeEl.value = keep;
					}
					check();
				} )
				.catch( function () {} );
		}

		function say( elm, msg, cls ) {
			elm.textContent = msg;
			elm.className = elm.className.replace( /\bis-(ok|no|wait)\b/g, '' ).trim();
			if ( cls ) {
				elm.classList.add( cls );
			}
		}

		// "Fully booked at 7pm — next free: 7:30, 8:15" clickable chips, so a diner
		// isn't turned away when a table opens up shortly after their choice.
		function renderSuggestions( list ) {
			if ( ! list || ! list.length ) {
				return;
			}
			var wrap = document.createElement( 'span' );
			wrap.className = 'dinekit-booking__suggests';
			wrap.appendChild( document.createTextNode( ' ' + ( t.nextFree || 'Next free:' ) + ' ' ) );
			list.forEach( function ( s ) {
				var b = document.createElement( 'button' );
				b.type = 'button';
				b.className = 'dinekit-booking__suggest';
				b.textContent = s;
				b.setAttribute( 'aria-label', ( t.bookAt || 'Choose' ) + ' ' + s );
				b.addEventListener( 'click', function () { timeEl.value = s; check(); } );
				wrap.appendChild( b );
			} );
			availEl.appendChild( wrap );
		}

		var timer;
		function check() {
			say( availEl, '', '' );
			if ( ! dateEl.value || ! timeEl.value || ! partyEl.value ) {
				return;
			}
			clearTimeout( timer );
			timer = setTimeout( function () {
				var url = cfg.restUrl + 'book/check?date=' + encodeURIComponent( dateEl.value ) +
					'&time=' + encodeURIComponent( timeEl.value ) +
					'&party=' + encodeURIComponent( partyEl.value );
				fetch( url, { headers: { 'X-WP-Nonce': cfg.nonce } } )
					.then( function ( r ) { return r.json(); } )
					.then( function ( d ) {
						if ( d.available ) {
							var msg = ( cfg.autoConfirm ? t.available : t.availableReq );
							if ( d.deposit ) {
								msg += ' · ' + t.deposit;
							}
							say( availEl, '✓ ' + msg, 'is-ok' );
							submitEl.textContent = origSubmit;
						} else if ( d.waitlist ) {
							say( availEl, '★ ' + t.waitlistOffer, 'is-wait' );
							submitEl.textContent = t.joinWaitlist;
							renderSuggestions( d.suggestions );
						} else {
							say( availEl, '✗ ' + t.notAvailable, 'is-no' );
							submitEl.textContent = origSubmit;
							renderSuggestions( d.suggestions );
						}
					} )
					.catch( function () {} );
			}, 300 );
		}

		dateEl.addEventListener( 'change', loadSlots );
		timeEl.addEventListener( 'change', check );
		partyEl.addEventListener( 'change', check );

		form.addEventListener( 'submit', function ( e ) {
			e.preventDefault();
			say( resultEl, '', '' );
			var name = form.querySelector( '[name=name]' ).value.trim();
			var email = form.querySelector( '[name=email]' ).value.trim();
			if ( ! name || ! email || email.indexOf( '@' ) < 1 ) {
				say( resultEl, t.needNameEmail, 'is-no' );
				return;
			}
			submitEl.disabled = true;
			submitEl.classList.add( 'is-loading' );
			var payload = {
				date: dateEl.value,
				time: timeEl.value,
				party: partyEl.value,
				name: name,
				email: email,
				phone: form.querySelector( '[name=phone]' ).value,
				notes: form.querySelector( '[name=notes]' ).value,
				hp: form.querySelector( '[name=hp]' ).value,
			};
			fetch( cfg.restUrl + 'book', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.nonce },
				body: JSON.stringify( payload ),
			} )
				.then( function ( r ) { return r.json().then( function ( d ) { return { ok: r.ok, d: d }; } ); } )
				.then( function ( res ) {
					submitEl.disabled = false;
					submitEl.classList.remove( 'is-loading' );
					if ( res.ok && res.d && res.d.ok ) {
						// Deposit due + Stripe live → collect it on-site; else confirm.
						if ( res.d.bookingId && cfg.payNow && cfg.publishableKey && window.Stripe ) {
							startDeposit( root, cfg, t, res.d.bookingId );
							return;
						}
						var title = res.d.waitlist ? t.waitlisted : ( res.d.status === 'confirmed' ? t.tableBooked : t.requestSent );
						renderSuccess( root, title, res.d.message || '' );
					} else {
						say( resultEl, ( res.d && res.d.message ) ? res.d.message : t.genericError, 'is-no' );
					}
				} )
				.catch( function () {
					submitEl.disabled = false;
					submitEl.classList.remove( 'is-loading' );
					say( resultEl, t.networkError, 'is-no' );
				} );
		} );

		loadSlots();
	}

	function init() {
		var nodes = document.querySelectorAll( '.dinekit-booking' );
		Array.prototype.forEach.call( nodes, function ( n ) {
			if ( n.querySelector( '.dinekit-booking__form' ) ) {
				setup( n );
			}
		} );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )();
