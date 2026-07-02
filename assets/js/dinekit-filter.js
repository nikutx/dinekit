/**
 * Diner-facing menu filter. Vanilla JS, no dependencies. Toggling "show only"
 * (dietary) and "avoid" (allergen) chips shows/hides matching dishes and
 * collapses empty sections.
 */
( function () {
	'use strict';

	function setup( bar ) {
		var menu = bar.closest( '.dinekit-menu' );
		if ( ! menu ) {
			return;
		}
		var items = Array.prototype.slice.call( menu.querySelectorAll( '.dinekit-item' ) );
		var sections = Array.prototype.slice.call( menu.querySelectorAll( '.dinekit-section' ) );
		var emptyMsg = menu.querySelector( '.dinekit-filter__empty' );
		var clearBtn = bar.querySelector( '.dinekit-filter__clear' );
		var diets = {};
		var avoids = {};

		function tokens( item, attr ) {
			return ( item.getAttribute( attr ) || '' ).split( ' ' ).filter( Boolean );
		}

		function apply() {
			var activeDiets = Object.keys( diets ).filter( function ( k ) {
				return diets[ k ];
			} );
			var activeAvoids = Object.keys( avoids ).filter( function ( k ) {
				return avoids[ k ];
			} );
			var visible = 0;

			items.forEach( function ( item ) {
				var d = tokens( item, 'data-dietary' );
				var a = tokens( item, 'data-allergens' );
				var showDiet =
					! activeDiets.length ||
					activeDiets.some( function ( x ) {
						return d.indexOf( x ) > -1;
					} );
				var okAvoid = ! activeAvoids.some( function ( x ) {
					return a.indexOf( x ) > -1;
				} );
				var ok = showDiet && okAvoid;
				item.hidden = ! ok;
				if ( ok ) {
					visible++;
				}
			} );

			sections.forEach( function ( sec ) {
				sec.hidden = sec.querySelectorAll( '.dinekit-item:not([hidden])' ).length === 0;
			} );

			if ( emptyMsg ) {
				emptyMsg.hidden = visible > 0;
			}
			if ( clearBtn ) {
				clearBtn.hidden = ! ( activeDiets.length || activeAvoids.length );
			}
		}

		bar.addEventListener( 'click', function ( e ) {
			var chip = e.target.closest( '.dinekit-filter__chip' );
			if ( chip ) {
				var on = chip.classList.toggle( 'is-active' );
				chip.setAttribute( 'aria-pressed', on ? 'true' : 'false' );
				var diet = chip.getAttribute( 'data-diet' );
				var allergen = chip.getAttribute( 'data-allergen' );
				if ( diet ) {
					diets[ diet ] = on;
				}
				if ( allergen ) {
					avoids[ allergen ] = on;
				}
				apply();
				return;
			}
			if ( e.target.closest( '.dinekit-filter__clear' ) ) {
				diets = {};
				avoids = {};
				bar.querySelectorAll( '.is-active' ).forEach( function ( c ) {
					c.classList.remove( 'is-active' );
					c.setAttribute( 'aria-pressed', 'false' );
				} );
				apply();
			}
		} );
	}

	document.querySelectorAll( '[data-dinekit-filter]' ).forEach( setup );
} )();
