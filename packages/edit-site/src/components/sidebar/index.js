/**
 * WordPress dependencies
 */
import { createSlotFill } from '@wordpress/components';
import {
	ComplementaryArea,
	ComplementaryAreaMoreMenuItem,
} from '@wordpress/interface';
import { __ } from '@wordpress/i18n';
import { cog, pencil } from '@wordpress/icons';

const { Slot: InspectorSlot, Fill: InspectorFill } = createSlotFill(
	'EditSiteSidebarInspector'
);

const DefaultSidebar = ( { areaId, title, icon, children } ) => {
	return (
		<>
			<ComplementaryArea
				scope="core/edit-site"
				identifier={ areaId }
				title={ title }
				icon={ icon }
			>
				{ children }
			</ComplementaryArea>
			<ComplementaryAreaMoreMenuItem
				scope="core/edit-site"
				identifier={ areaId }
				icon={ icon }
			>
				{ title }
			</ComplementaryAreaMoreMenuItem>
		</>
	);
};
function Sidebar() {
	return (
		<>
			<ComplementaryArea.Slot scope="core/edit-site" />
			<DefaultSidebar
				areaId="edit-site/block-inspector"
				title={ __( 'Block Inspector' ) }
				icon={ cog }
			>
				<InspectorSlot bubblesVirtually />
			</DefaultSidebar>
			<DefaultSidebar
				areaId="edit-site/global-styles"
				title={ __( 'Global Styles' ) }
				icon={ pencil }
			>
				<p>Global Styles area</p>
			</DefaultSidebar>
		</>
	);
}

Sidebar.InspectorFill = InspectorFill;

export default Sidebar;
