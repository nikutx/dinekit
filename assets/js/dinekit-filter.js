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
		var countEl = bar.querySelector( '[data-filter-count]' );
		var countTpl = bar.getAttribute( 'data-count-tpl' ) || '%1$s / %2$s';
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
			var filtering = !! ( activeDiets.length || activeAvoids.length );
			if ( clearBtn ) {
				clearBtn.hidden = ! filtering;
			}
			// Live feedback: "Showing 8 of 14 dishes" while any filter is on.
			if ( countEl ) {
				countEl.hidden = ! filtering;
				if ( filtering ) {
					countEl.textContent = countTpl
						.replace( '%1$s', String( visible ) )
						.replace( '%2$s', String( items.length ) );
				}
			}
		}

		// Dropdown variant: popover panels of checkboxes — proper multi-choice
		// (avoid milk AND nuts), with allergen icons alongside the names.
		function syncDd( dd ) {
			var btn = dd.querySelector( '.dinekit-filter__ddbtn' );
			var n = dd.querySelectorAll( 'input:checked' ).length;
			var count = btn.querySelector( '.dinekit-filter__ddcount' );
			if ( count ) {
				count.hidden = ! n;
				count.textContent = n ? String( n ) : '';
			}
			btn.classList.toggle( 'is-active', n > 0 );
		}
		function closeDds( except ) {
			bar.querySelectorAll( '[data-dd]' ).forEach( function ( dd ) {
				if ( dd === except ) {
					return;
				}
				dd.querySelector( '.dinekit-filter__panel' ).hidden = true;
				dd.querySelector( '.dinekit-filter__ddbtn' ).setAttribute( 'aria-expanded', 'false' );
			} );
		}
		bar.addEventListener( 'change', function ( e ) {
			var box = e.target;
			if ( box.hasAttribute( 'data-diet-check' ) ) {
				diets[ box.value ] = box.checked;
			} else if ( box.hasAttribute( 'data-allergen-check' ) ) {
				avoids[ box.value ] = box.checked;
			} else {
				return;
			}
			syncDd( box.closest( '[data-dd]' ) );
			apply();
		} );
		document.addEventListener( 'click', function ( e ) {
			if ( ! e.target.closest( '[data-dd]' ) ) {
				closeDds( null );
			}
		} );
		document.addEventListener( 'keydown', function ( e ) {
			if ( 'Escape' === e.key ) {
				closeDds( null );
			}
		} );

		bar.addEventListener( 'click', function ( e ) {
			var ddbtn = e.target.closest( '.dinekit-filter__ddbtn' );
			if ( ddbtn ) {
				var dd = ddbtn.closest( '[data-dd]' );
				var panel = dd.querySelector( '.dinekit-filter__panel' );
				closeDds( dd );
				panel.hidden = ! panel.hidden;
				ddbtn.setAttribute( 'aria-expanded', panel.hidden ? 'false' : 'true' );
				return;
			}
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
				bar.querySelectorAll( '.dinekit-filter__chip.is-active' ).forEach( function ( c ) {
					c.classList.remove( 'is-active' );
					c.setAttribute( 'aria-pressed', 'false' );
				} );
				bar.querySelectorAll( '[data-dd] input:checked' ).forEach( function ( box ) {
					box.checked = false;
				} );
				bar.querySelectorAll( '[data-dd]' ).forEach( syncDd );
				closeDds( null );
				apply();
			}
		} );
	}

	document.querySelectorAll( '[data-dinekit-filter]' ).forEach( setup );
} )();
