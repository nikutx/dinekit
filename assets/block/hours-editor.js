/**
 * DineKit Opening Hours block — editor UI (plain JS, server-rendered preview).
 */
( function ( wp ) {
	'use strict';

	var el = wp.element.createElement;
	var __ = wp.i18n.__;
	var InspectorControls = wp.blockEditor.InspectorControls;
	var useBlockProps = wp.blockEditor.useBlockProps;
	var PanelBody = wp.components.PanelBody;
	var TextControl = wp.components.TextControl;
	var ToggleControl = wp.components.ToggleControl;
	var ServerSideRender = wp.serverSideRender;

	function Edit( props ) {
		var a = props.attributes;
		var set = props.setAttributes;

		var controls = el(
			InspectorControls,
			null,
			el(
				PanelBody,
				{ title: __( 'Opening hours', 'dinekit' ), initialOpen: true },
				el( TextControl, {
					label: __( 'Heading (optional)', 'dinekit' ),
					value: a.title,
					onChange: function ( v ) {
						set( { title: v } );
					},
				} ),
				el( ToggleControl, {
					label: __( 'Show open / closed status', 'dinekit' ),
					checked: a.showStatus,
					onChange: function ( v ) {
						set( { showStatus: v } );
					},
				} )
			)
		);

		return el(
			'div',
			useBlockProps(),
			controls,
			el( ServerSideRender, { block: 'dinekit/hours', attributes: a } )
		);
	}

	wp.blocks.registerBlockType( 'dinekit/hours', {
		edit: Edit,
		save: function () {
			return null;
		},
	} );
} )( window.wp );
