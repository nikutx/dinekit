/**
 * DineKit Menu block — editor UI. Plain JS (no JSX/build) using the global
 * wp.* APIs. The preview is server-rendered so it always matches the frontend.
 */
( function ( wp ) {
	'use strict';

	var el = wp.element.createElement;
	var Fragment = wp.element.Fragment;
	var useState = wp.element.useState;
	var useEffect = wp.element.useEffect;
	var __ = wp.i18n.__;
	var InspectorControls = wp.blockEditor.InspectorControls;
	var useBlockProps = wp.blockEditor.useBlockProps;
	var PanelBody = wp.components.PanelBody;
	var SelectControl = wp.components.SelectControl;
	var ToggleControl = wp.components.ToggleControl;
	var ServerSideRender = wp.serverSideRender;

	function Edit( props ) {
		var attributes = props.attributes;
		var setAttributes = props.setAttributes;
		var menus = useState( [] );
		var menuList = menus[ 0 ];
		var setMenuList = menus[ 1 ];
		var sections = useState( [] );
		var sectionList = sections[ 0 ];
		var setSectionList = sections[ 1 ];

		useEffect( function () {
			if ( ! wp.apiFetch ) {
				return;
			}
			wp.apiFetch( { path: 'dinekit/v1/state' } ).then( function ( data ) {
				setMenuList( data.menus || [] );
				setSectionList( data.sections || [] );
			} ).catch( function () {} );
		}, [] );

		var menuOptions = [ { label: __( 'All items', 'dinekit' ), value: 0 } ].concat(
			( menuList || [] ).map( function ( m ) {
				return { label: m.name, value: m.id };
			} )
		);

		var sectionOptions = [ { label: __( 'All sections', 'dinekit' ), value: 0 } ].concat(
			( sectionList || [] ).map( function ( s ) {
				return { label: s.name, value: s.id };
			} )
		);

		var controls = el(
			InspectorControls,
			null,
			el(
				PanelBody,
				{ title: __( 'Menu settings', 'dinekit' ), initialOpen: true },
				el( SelectControl, {
					label: __( 'Which menu', 'dinekit' ),
					value: attributes.menu,
					options: menuOptions,
					onChange: function ( v ) {
						setAttributes( { menu: parseInt( v, 10 ) || 0 } );
					},
				} ),
				el( SelectControl, {
					label: __( 'Limit to section', 'dinekit' ),
					value: ( attributes.sections && attributes.sections[ 0 ] ) || 0,
					options: sectionOptions,
					onChange: function ( v ) {
						var id = parseInt( v, 10 ) || 0;
						setAttributes( { sections: id ? [ id ] : [] } );
					},
				} ),
				el( SelectControl, {
					label: __( 'Layout', 'dinekit' ),
					value: attributes.layout,
					options: [
						{ label: __( 'Classic list', 'dinekit' ), value: 'list' },
						{ label: __( 'Card grid', 'dinekit' ), value: 'grid' },
						{ label: __( 'Compact chalkboard', 'dinekit' ), value: 'chalkboard' },
					],
					onChange: function ( v ) {
						setAttributes( { layout: v } );
					},
				} ),
				el( SelectControl, {
					label: __( 'Columns', 'dinekit' ),
					value: String( attributes.columns || 0 ),
					options: [
						{ label: __( 'Automatic', 'dinekit' ), value: '0' },
						{ label: __( '1 column', 'dinekit' ), value: '1' },
						{ label: __( '2 columns', 'dinekit' ), value: '2' },
						{ label: __( '3 columns', 'dinekit' ), value: '3' },
						{ label: __( '4 columns', 'dinekit' ), value: '4' },
					],
					onChange: function ( v ) {
						setAttributes( { columns: parseInt( v, 10 ) || 0 } );
					},
				} )
			),
			el(
				PanelBody,
				{ title: __( 'Show', 'dinekit' ), initialOpen: false },
				el( ToggleControl, {
					label: __( 'Photos', 'dinekit' ),
					checked: attributes.showImages,
					onChange: function ( v ) {
						setAttributes( { showImages: v } );
					},
				} ),
				el( ToggleControl, {
					label: __( 'Allergen icons + key', 'dinekit' ),
					checked: attributes.showAllergens,
					onChange: function ( v ) {
						setAttributes( { showAllergens: v } );
					},
				} ),
				el( ToggleControl, {
					label: __( 'Dietary labels', 'dinekit' ),
					checked: attributes.showDietary,
					onChange: function ( v ) {
						setAttributes( { showDietary: v } );
					},
				} ),
				el( ToggleControl, {
					label: __( 'Printable allergen matrix', 'dinekit' ),
					checked: attributes.showMatrix,
					onChange: function ( v ) {
						setAttributes( { showMatrix: v } );
					},
				} ),
				el( ToggleControl, {
					label: __( 'Diner filter (show only / avoid)', 'dinekit' ),
					checked: attributes.showFilter,
					onChange: function ( v ) {
						setAttributes( { showFilter: v } );
					},
				} )
			)
		);

		var preview = el( ServerSideRender, {
			block: 'dinekit/menu',
			attributes: attributes,
		} );

		return el( 'div', useBlockProps(), controls, preview );
	}

	wp.blocks.registerBlockType( 'dinekit/menu', {
		edit: Edit,
		save: function () {
			return null; // Dynamic (rendered in PHP).
		},
	} );
} )( window.wp );
