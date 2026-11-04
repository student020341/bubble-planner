/**
 * @file UI overlay components: Breadcrumbs, side drawer inspector, and shortcut handling.
 */

class UIController {
    /**
     * @param {ProjectStore} store
     * @param {CanvasView} canvasView
     */
    constructor(store, canvasView) {
        this.store = store;
        this.canvasView = canvasView;

        /** @type {HTMLElement|null} */
        this.breadcrumbContainer = null;

        /** @type {HTMLElement|null} */
        this.drawerContainer = null;

        /** @type {Map<string, (e: KeyboardEvent) => void>} */
        this.shortcuts = new Map();

        /** @type {boolean} */
        this.isDrawerOpen = false;

        /** @type {BubbleNode|BubbleRelationship|null} */
        this.selectedEntity = null;
    }

    /** Mount DOM elements for breadcrumbs, side drawer, and toolbar. */
    mount() {
        // stub
    }

    /**
     * Register a keyboard shortcut.
     * @param {string} keyCombination - e.g. "KeyE", "Shift+KeyA", "Escape"
     * @param {(e: KeyboardEvent) => void} handler
     */
    registerShortcut(keyCombination, handler) {
        // stub
    }

    /** Update breadcrumb bar to match currentParentId hierarchy. */
    renderBreadcrumbs() {
        // stub
    }

    /**
     * Open side drawer inspector for a selected node or relationship.
     * @param {BubbleNode|BubbleRelationship} entity
     */
    openDrawer(entity) {
        // stub
    }

    /** Close side drawer. */
    closeDrawer() {
        // stub
    }

    /**
     * Search all nodes across layers for cross-layer relationship targeting.
     * @param {string} query
     * @returns {Array<{node: BubbleNode, path: string}>} List of matches with qualified path e.g. "postal service.customer location"
     */
    searchNodesByNamespace(query) {
        // stub
        return [];
    }

    /**
     * Render property editor table inside drawer.
     * @param {PropertyMap} properties
     * @param {(updated: PropertyMap) => void} onChange
     */
    renderPropertiesEditor(properties, onChange) {
        // stub
    }

    /** Show prompt or inline modal for editing labels. */
    promptEditLabel(entity) {
        // stub
    }
}
