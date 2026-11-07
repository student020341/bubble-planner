/**
 * @file Named Action / Command Registry and input binding manager.
 */

/**
 * @typedef {Object} ActionContext
 * @property {ProjectStore} store
 * @property {CanvasView} canvasView
 * @property {Camera} camera
 * @property {UIController} [ui]
 * @property {BubbleNode|null} [node]
 * @property {BubbleRelationship|null} [relationship]
 * @property {{x: number, y: number}} [worldPos]
 * @property {Event} [originalEvent]
 */

/**
 * @typedef {Object} EditorAction
 * @property {string} id - Unique action identifier (e.g. 'drillDown', 'editLabel').
 * @property {string} title - Human readable display name.
 * @property {string} [description] - Optional details for tooltip/palette.
 * @property {(context: ActionContext) => void} execute - Execution callback.
 * @property {(context: ActionContext) => boolean} [isEnabled] - Whether action is valid in current state.
 */

class ActionRegistry {
    constructor() {
        /** @type {Map<string, EditorAction>} */
        this.actions = new Map();

        /** Default base triggers snapshot */
        this.defaultBindings = [
            ["node:dblclick", "drillDown"],
            ["canvas:dblclick", "createBubble"],
            ["Escape", "drillUp"],
            ["KeyI", "inspectEntity"],
            ["KeyP", "togglePropertyFilter"],
            ["KeyE", "editLabel"],
            ["KeyL", "editLabel"],
            ["Delete", "deleteSelection"],
            ["Backspace", "deleteSelection"]
        ];

        /** @type {Map<string, string>} Active Trigger -> Action ID mapping */
        this.bindings = new Map(this.defaultBindings);
    }

    /** Reset bindings back to default configuration */
    restoreDefaults() {
        this.bindings = new Map(this.defaultBindings);
    }

    /**
     * Register a named action.
     * @param {EditorAction} action
     */
    register(action) {
        this.actions.set(action.id, action);
    }

    /**
     * Bind an input trigger to an action ID.
     * @param {string} trigger
     * @param {string} actionId
     */
    bind(trigger, actionId) {
        this.bindings.set(trigger, actionId);
    }

    /**
     * Unbind an input trigger.
     * @param {string} trigger
     */
    unbind(trigger) {
        this.bindings.delete(trigger);
    }

    /**
     * Execute an action by its ID with given context.
     * @param {string} actionId
     * @param {ActionContext} context
     * @returns {boolean} Whether action was executed
     */
    execute(actionId, context) {
        const action = this.actions.get(actionId);
        if (!action) return false;
        if (action.isEnabled && !action.isEnabled(context)) return false;
        action.execute(context);
        return true;
    }

    /**
     * Trigger an action bound to an input event / trigger string.
     * @param {string} trigger
     * @param {ActionContext} context
     * @returns {boolean}
     */
    trigger(trigger, context) {
        const actionId = this.bindings.get(trigger);
        if (!actionId) return false;
        return this.execute(actionId, context);
    }

    /**
     * Get all registered actions.
     * @returns {EditorAction[]}
     */
    getAllActions() {
        return Array.from(this.actions.values());
    }
}
