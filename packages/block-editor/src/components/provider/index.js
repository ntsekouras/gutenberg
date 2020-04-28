/**
 * WordPress dependencies
 */
import { compose } from '@wordpress/compose';
import { useDispatch } from '@wordpress/data';
import { useEffect } from '@wordpress/element';

/**
 * Internal dependencies
 */
import withRegistryProvider from './with-registry-provider';
import { useBlockEntitySync } from './use-block-entity-sync';

/** @typedef {import('@wordpress/data').WPDataRegistry} WPDataRegistry */

export default compose( [ withRegistryProvider ] )( ( props ) => {
	const { children, settings } = props;

	const { updateSettings } = useDispatch( 'core/block-editor' );
	useEffect( () => {
		updateSettings( settings );
	}, [ settings ] );

	// Syncs the entity provider with changes in the block-editor store.
	useBlockEntitySync( props );

	return children;
} );
