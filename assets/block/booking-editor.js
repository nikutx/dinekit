/**
 * DineKit Booking Form block — editor UI (plain JS, server-rendered preview).
 */
( function ( wp ) {
	'use strict';

	var el = wp.element.createElement;
	var __ = wp.i18n.__;
	var InspectorControls = wp.blockEditor.InspectorControls;
	var useBlockProps = wp.blockEditor.useBlockProps;
	var PanelBody = wp.components.PanelBody;
	var TextControl = wp.components.TextControl;
	var TextareaControl = wp.components.TextareaControl;
	var ServerSideRender = wp.serverSideRender;

	function Edit( props ) {
		var a = props.attributes;
		var set = props.setAttributes;

		var controls = el(
			InspectorControls,
			null,
			el(
				PanelBody,
				{ title: __( 'Booking form', 'dinekit' ), initialOpen: true },
				el( TextControl, {
					label: __( 'Heading', 'dinekit' ),
					placeholder: __( 'Book a table', 'dinekit' ),
					value: a.heading,
					onChange: function ( v ) {
						set( { heading: v } );
					},
				} ),
				el( TextareaControl, {
					label: __( 'Intro text (optional)', 'dinekit' ),
					value: a.intro,
					onChange: function ( v ) {
						set( { intro: v } );
					},
				} )
			)
		);

		return el(
			'div',
			useBlockProps(),
			controls,
			el( ServerSideRender, { block: 'dinekit/booking', attributes: a } )
		);
	}

	wp.blocks.registerBlockType( 'dinekit/booking', {
		edit: Edit,
		save: function () {
			return null;
		},
	} );
} )( window.wp );
