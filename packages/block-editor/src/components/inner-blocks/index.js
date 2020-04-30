/**
 * External dependencies
 */
import { mapValues, isEqual } from 'lodash';
import classnames from 'classnames';

/**
 * WordPress dependencies
 */
import { useViewportMatch } from '@wordpress/compose';
import { forwardRef, useRef, useEffect } from '@wordpress/element';
import { useSelect, useDispatch } from '@wordpress/data';
import {
	getBlockType,
	synchronizeBlocksWithTemplate,
	withBlockContentContext,
} from '@wordpress/blocks';
import isShallowEqual from '@wordpress/is-shallow-equal';

/**
 * Internal dependencies
 */
import ButtonBlockAppender from './button-block-appender';
import DefaultBlockAppender from './default-block-appender';

/**
 * Internal dependencies
 */
import BlockList from '../block-list';
import { BlockContextProvider } from '../block-context';
import { useBlockEditContext } from '../block-edit/context';
import { useBlockSync } from '../provider/use-block-sync';

/**
 * Block context cache, implemented as a WeakMap mapping block types to a
 * WeakMap mapping attributes object to context value.
 *
 * @type {WeakMap<string,WeakMap<string,*>>}
 */
const BLOCK_CONTEXT_CACHE = new WeakMap();

/**
 * Returns a cached context object value for a given set of attributes for the
 * block type.
 *
 * @param {Record<string,*>} attributes Block attributes object.
 * @param {WPBlockType}      blockType  Block type settings.
 *
 * @return {Record<string,*>} Context value.
 */
function getBlockContext( attributes, blockType ) {
	if ( ! BLOCK_CONTEXT_CACHE.has( blockType ) ) {
		BLOCK_CONTEXT_CACHE.set( blockType, new WeakMap() );
	}

	const blockTypeCache = BLOCK_CONTEXT_CACHE.get( blockType );
	if ( ! blockTypeCache.has( attributes ) ) {
		const context = mapValues(
			blockType.providesContext,
			( attributeName ) => attributes[ attributeName ]
		);

		blockTypeCache.set( attributes, context );
	}

	return blockTypeCache.get( attributes );
}

function useNestedSettingsUpdate(
	clientId,
	allowedBlocks,
	templateLock,
	captureToolbars,
	__experimentalMoverDirection
) {
	const { updateBlockListSettings } = useDispatch( 'core/block-editor' );

	const { blockListSettings, parentLock } = useSelect(
		( select ) => {
			const rootClientId = select(
				'core/block-editor'
			).getBlockRootClientId( clientId );
			return {
				blockListSettings: select(
					'core/block-editor'
				).getBlockListSettings( clientId ),
				parentLock: select( 'core/block-editor' ).getTemplateLock(
					rootClientId
				),
			};
		},
		[ clientId ]
	);

	useEffect( () => {
		const newSettings = {
			allowedBlocks,
			templateLock:
				templateLock === undefined ? parentLock : templateLock,
			__experimentalCaptureToolbars: captureToolbars || false,
			__experimentalMoverDirection,
		};

		if ( ! isShallowEqual( blockListSettings, newSettings ) ) {
			updateBlockListSettings( clientId, newSettings );
		}
	}, [
		clientId,
		blockListSettings,
		allowedBlocks,
		templateLock,
		parentLock,
		captureToolbars,
		__experimentalMoverDirection,
		updateBlockListSettings,
	] );
}

function useInnerBlockTemplateSynchronization(
	clientId,
	template,
	templateLock,
	templateInsertUpdatesSelection
) {
	const { replaceInnerBlocks } = useDispatch( 'core/block-editor' );

	const innerBlocks = useSelect(
		( select ) => select( 'core/block-editor' ).getBlocks( clientId ),
		[ clientId ]
	);

	// Maintain a reference to the previous value so we can do a deep equality check.
	const existingTemplate = useRef( null );
	useEffect( () => {
		// Only synchronize innerBlocks with template if innerBlocks are empty or
		// a locking all exists directly on the block.
		if ( innerBlocks.length === 0 || templateLock === 'all' ) {
			const hasTemplateChanged = ! isEqual(
				template,
				existingTemplate.current
			);
			if ( hasTemplateChanged ) {
				existingTemplate.current = template;
				const nextBlocks = synchronizeBlocksWithTemplate(
					innerBlocks,
					template
				);
				if ( ! isEqual( nextBlocks, innerBlocks ) ) {
					replaceInnerBlocks(
						clientId,
						nextBlocks,
						innerBlocks.length === 0 &&
							templateInsertUpdatesSelection &&
							nextBlocks.length !== 0
					);
				}
			}
		}
	}, [ innerBlocks, templateLock, clientId ] );
}

function UncontrolledInnerBlocks( props ) {
	const {
		clientId,
		allowedBlocks,
		template,
		templateLock,
		forwardedRef,
		templateInsertUpdatesSelection,
		__experimentalCaptureToolbars: captureToolbars,
		__experimentalMoverDirection,
	} = props;

	const isSmallScreen = useViewportMatch( 'medium', '<' );

	const { hasOverlay, block, enableClickThrough } = useSelect( ( select ) => {
		const {
			getBlock,
			isBlockSelected,
			hasSelectedInnerBlock,
			isNavigationMode,
		} = select( 'core/block-editor' );
		const theBlock = getBlock( clientId );
		return {
			block: theBlock,
			hasOverlay:
				theBlock.name !== 'core/template' &&
				! isBlockSelected( clientId ) &&
				! hasSelectedInnerBlock( clientId, true ),
			enableClickThrough: isNavigationMode() || isSmallScreen,
		};
	} );

	useNestedSettingsUpdate(
		clientId,
		allowedBlocks,
		templateLock,
		captureToolbars,
		__experimentalMoverDirection
	);

	useInnerBlockTemplateSynchronization(
		clientId,
		template,
		templateLock,
		templateInsertUpdatesSelection
	);

	// Note: all hooks must come before this point.
	// Also note: do we need this? It was fixing a bug. (see https://github.com/WordPress/gutenberg/pull/10733/files)
	// if ( templateInProcess ) {
	// 	return null;
	// }

	const classes = classnames( {
		'has-overlay': enableClickThrough && hasOverlay,
		'is-capturing-toolbar': captureToolbars,
	} );

	let blockList = (
		<BlockList
			{ ...props } // TODO: does BlockList desire props that used to come from the wrapped HOCs?
			ref={ forwardedRef }
			rootClientId={ clientId }
			className={ classes }
		/>
	);

	// Wrap context provider if (and only if) block has context to provide.
	const blockType = getBlockType( block.name );
	if ( blockType && blockType.providesContext ) {
		const context = getBlockContext( block.attributes, blockType );

		blockList = (
			<BlockContextProvider value={ context }>
				{ blockList }
			</BlockContextProvider>
		);
	}

	if ( props.__experimentalTagName ) {
		return blockList;
	}

	return (
		<div className="block-editor-inner-blocks" ref={ forwardedRef }>
			{ blockList }
		</div>
	);
}

function ControlledInnerBlocks( props ) {
	useBlockSync( props );
	return <UncontrolledInnerBlocks { ...props } />;
}

const ForwardedInnerBlocks = forwardRef( ( props, ref ) => {
	const { clientId } = useBlockEditContext();
	const fallbackRef = useRef();

	const allProps = {
		clientId,
		forwardedRef: ref || fallbackRef,
		...props,
	};

	// Detects if the InnerBlocks should be controlled by an incoming value.
	if ( props.value && props.onChange ) {
		return <ControlledInnerBlocks { ...allProps } />;
	}
	return <UncontrolledInnerBlocks { ...allProps } />;
} );

// Expose default appender placeholders as components.
ForwardedInnerBlocks.DefaultBlockAppender = DefaultBlockAppender;
ForwardedInnerBlocks.ButtonBlockAppender = ButtonBlockAppender;

ForwardedInnerBlocks.Content = withBlockContentContext(
	( { BlockContent } ) => <BlockContent />
);

/**
 * @see https://github.com/WordPress/gutenberg/blob/master/packages/block-editor/src/components/inner-blocks/README.md
 */
export default ForwardedInnerBlocks;
