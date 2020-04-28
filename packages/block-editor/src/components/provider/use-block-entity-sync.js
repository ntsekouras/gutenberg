/**
 * External dependencies
 */
import { last, noop } from 'lodash';

/**
 * WordPress dependencies
 */
import isShallowEqual from '@wordpress/is-shallow-equal';
import { useEffect, useRef } from '@wordpress/element';
import { createHigherOrderComponent } from '@wordpress/compose';

export function useBlockEntitySync( {
	registry,
	value: controlledBlocks,
	clientId = null,
	onChange = noop,
	onInput = noop,
	selectionStart: incomingSelectionStart,
	selectionEnd: incomingSelectionEnd,
} ) {
	const {
		resetBlocks,
		resetSelection,
		replaceInnerBlocks,
		__unstableMarkNextChangeAsNotPersistent,
	} = registry.dispatch( 'core/block-editor' );
	const { getBlocks: getRegistryBlocks, getBlock } = registry.select(
		'core/block-editor'
	);

	const pendingChanges = useRef( { incoming: null, outgoing: [] } );

	const setControlledBlocks = () => {
		if ( ! controlledBlocks ) {
			return;
		}
		__unstableMarkNextChangeAsNotPersistent();
		if ( clientId ) {
			replaceInnerBlocks( clientId, controlledBlocks );
		} else {
			resetBlocks( controlledBlocks );
		}
	};

	const getBlocks = () => {
		if ( clientId ) {
			const block = getBlock( clientId, true );
			return block ? block.innerBlocks : [];
		}
		return getRegistryBlocks();
	};

	// Add a subscription to the block-editor registry to detect when changes
	// have been made. This lets us inform the data source of changes. This
	// is an effect so that the subscriber can run synchronously without
	// waiting for React renders for changes.
	useEffect( () => {
		const {
			getSelectionStart,
			getSelectionEnd,
			areAnyInnerBlocksControlled,
			isLastBlockChangePersistent,
			__unstableIsLastBlockChangeIgnored,
		} = registry.select( 'core/block-editor' );

		let blocks = getBlocks();
		let isPersistent = isLastBlockChangePersistent();
		let previousAreBlocksDifferent = false;

		const unsubscribe = registry.subscribe( () => {
			const newBlocks = getBlocks();
			const newIsPersistent = isLastBlockChangePersistent();

			// Avoid the more expensive equality check if there are no controlled
			// inner block areas.
			const areBlocksDifferent = areAnyInnerBlocksControlled()
				? ! isShallowEqual( newBlocks, blocks )
				: newBlocks !== blocks;

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
				// When knowing the blocks value is changing, assign instance
				// value to skip reset in subsequent `componentDidUpdate`.
				if ( areBlocksDifferent ) {
					pendingChanges.current.outgoing.push( newBlocks );
				}

				blocks = newBlocks;
				isPersistent = newIsPersistent;

				const selectionStart = getSelectionStart();
				const selectionEnd = getSelectionEnd();

				if ( isPersistent ) {
					onChange( blocks, { selectionStart, selectionEnd } );
				} else {
					onInput( blocks, { selectionStart, selectionEnd } );
				}
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

			if ( incomingSelectionStart && incomingSelectionEnd ) {
				resetSelection( incomingSelectionStart, incomingSelectionEnd );
			}
		}
	}, [ controlledBlocks ] );
}

export const withBlockEntitySync = createHigherOrderComponent(
	( WrappedComponent ) => ( props ) => {
		useBlockEntitySync( props );
		return <WrappedComponent { ...props } />;
	},
	'withBlockEntitySync'
);
