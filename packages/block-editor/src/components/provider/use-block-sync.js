/**
 * External dependencies
 */
import { last, noop } from 'lodash';

/**
 * WordPress dependencies
 */
import { useEffect, useRef } from '@wordpress/element';
import { useRegistry } from '@wordpress/data';

export default function useBlockSync( {
	clientId = null,
	value: controlledBlocks,
	onChange = noop,
	onInput = noop,
	selectionStart: controlledSelectionStart,
	selectionEnd: controlledSelectionEnd,
} ) {
	const registry = useRegistry();

	const {
		resetBlocks,
		resetSelection,
		replaceInnerBlocks,
		setHasControlledInnerBlocks,
		__unstableMarkNextChangeAsNotPersistent,
	} = registry.dispatch( 'core/block-editor' );
	const { getBlocks } = registry.select( 'core/block-editor' );

	const pendingChanges = useRef( { incoming: null, outgoing: [] } );

	const setControlledBlocks = () => {
		if ( ! controlledBlocks ) {
			return;
		}
		if ( clientId ) {
			setHasControlledInnerBlocks( clientId, true );
			// We don't need to persist this change because we only replace
			// controlled inner blocks when the change was caused by an entity,
			// and so it would already be persisted.
			__unstableMarkNextChangeAsNotPersistent();
			replaceInnerBlocks( clientId, controlledBlocks );
		} else {
			resetBlocks( controlledBlocks );
		}
	};

	// Add a subscription to the block-editor registry to detect when changes
	// have been made. This lets us inform the data source of changes. This
	// is an effect so that the subscriber can run synchronously without
	// waiting for React renders for changes.
	useEffect( () => {
		const {
			getSelectionStart,
			getSelectionEnd,
			isLastBlockChangePersistent,
			__unstableIsLastBlockChangeIgnored,
		} = registry.select( 'core/block-editor' );

		let blocks = getBlocks( clientId );
		let isPersistent = isLastBlockChangePersistent();
		let previousAreBlocksDifferent = false;

		const unsubscribe = registry.subscribe( () => {
			const newBlocks = getBlocks( clientId );
			const newIsPersistent = isLastBlockChangePersistent();

			const areBlocksDifferent = newBlocks !== blocks;

			if (
				areBlocksDifferent &&
				( pendingChanges.current.incoming ||
					__unstableIsLastBlockChangeIgnored() )
			) {
				pendingChanges.current.incoming = null;
				blocks = newBlocks;
				isPersistent = newIsPersistent;
				return;
			}

			// Since we often dispatch an action to mark the previous action as
			// persistent, we need to make sure that the blocks changed on the
			// previous action before committing the change.
			const didPersistenceChange =
				previousAreBlocksDifferent &&
				! areBlocksDifferent &&
				newIsPersistent &&
				! isPersistent;

			if ( areBlocksDifferent || didPersistenceChange ) {
				blocks = newBlocks;
				isPersistent = newIsPersistent;
				// We know that onChange/onInput will update controlledBlocks.
				// We need to be aware that it was caused by an outgoing change
				// so that we do not treat it as an incoming change later on,
				// which would cause a block reset.
				pendingChanges.current.outgoing.push( blocks );

				// Inform the controlling entity that changes have been made to
				// the block-editor store they should be aware about.
				const updateParent = isPersistent ? onChange : onInput;
				updateParent( blocks, {
					selectionStart: getSelectionStart(),
					selectionEnd: getSelectionEnd(),
				} );
			}
			previousAreBlocksDifferent = areBlocksDifferent;
		} );
		return () => unsubscribe();
	}, [ registry, onChange, onInput, clientId ] );

	// Determine if blocks need to be reset when they change.
	useEffect( () => {
		if ( pendingChanges.current.outgoing.includes( controlledBlocks ) ) {
			// Skip block reset if the value matches expected outbound sync
			// triggered by this component by a preceding change detection.
			// Only skip if the value matches expectation, since a reset should
			// still occur if the value is modified (not equal by reference),
			// to allow that the consumer may apply modifications to reflect
			// back on the editor.
			if (
				last( pendingChanges.current.outgoing ) === controlledBlocks
			) {
				pendingChanges.current.outgoing = [];
			}
		} else {
			// Reset changing value in all other cases than the sync described
			// above. Since this can be reached in an update following an out-
			// bound sync, unset the outbound value to avoid considering it in
			// subsequent renders.
			pendingChanges.current.outgoing = [];
			pendingChanges.current.incoming = controlledBlocks;
			setControlledBlocks();

			if ( controlledSelectionStart && controlledSelectionEnd ) {
				resetSelection(
					controlledSelectionStart,
					controlledSelectionEnd
				);
			}
		}
	}, [ controlledBlocks, clientId ] );
}
