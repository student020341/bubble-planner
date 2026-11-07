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
            ["Ctrl+Space", "openCommandPalette"],
            ["KeyJ", "openJumpPalette"],
            ["Ctrl+KeyK", "openJumpPalette"],
            ["KeyP", "togglePropertyFilter"],
            ["KeyE", "editLabel"],
            ["KeyL", "editLabel"],
            ["Delete", "deleteSelection"],
            ["Backspace", "deleteSelection"],
            ["Ctrl+Comma", "openSettings"]
        ];

        /** @type {Map<string, string[]>} Active Trigger -> Array of Action IDs */
        this.bindings = new Map();
        for (const [trigger, actionId] of this.defaultBindings) {
            this.bind(trigger, actionId);
        }
    }

    /** Reset bindings back to default configuration */
    restoreDefaults() {
        this.bindings = new Map();
        for (const [trigger, actionId] of this.defaultBindings) {
            this.bind(trigger, actionId);
        }
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
        let list = this.bindings.get(trigger);
        if (!list) {
            list = [];
            this.bindings.set(trigger, list);
        } else if (!Array.isArray(list)) {
            list = [list];
            this.bindings.set(trigger, list);
        }
        if (!list.includes(actionId)) {
            list.push(actionId);
        }
    }

    /**
     * Unbind an input trigger from an action ID.
     * @param {string} trigger
     * @param {string} [actionId]
     */
    unbind(trigger, actionId = null) {
        if (!actionId) {
            this.bindings.delete(trigger);
            return;
        }
        let list = this.bindings.get(trigger);
        if (Array.isArray(list)) {
            list = list.filter(id => id !== actionId);
            if (list.length === 0) {
                this.bindings.delete(trigger);
            } else {
                this.bindings.set(trigger, list);
            }
        } else {
            this.bindings.delete(trigger);
        }
    }

    /**
     * Get all triggers bound to a specific action.
     * @param {string} actionId
     * @returns {string[]}
     */
    getTriggersForAction(actionId) {
        const triggers = [];
        for (const [trigger, val] of this.bindings.entries()) {
            const list = Array.isArray(val) ? val : [val];
            if (list.includes(actionId)) {
                triggers.push(trigger);
            }
        }
        return triggers;
    }

    /**
     * Detect triggers that are shared across multiple actions.
     * @returns {Map<string, string[]>} Trigger -> Array of conflicting action titles
     */
    detectConflicts() {
        const conflicts = new Map();
        for (const [trigger, val] of this.bindings.entries()) {
            const actionIds = Array.isArray(val) ? val : [val];
            if (actionIds.length > 1) {
                const titles = actionIds.map(id => {
                    const act = this.actions.get(id);
                    return act ? act.title : id;
                });
                conflicts.set(trigger, titles);
            }
        }
        return conflicts;
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
     * Trigger an action bound to an input event / trigger string or sequence string.
     * @param {string} trigger
     * @param {ActionContext} context
     * @returns {boolean}
     */
    trigger(trigger, context) {
        if (!trigger) return false;
        // 1. Direct exact lookup
        let val = this.bindings.get(trigger);

        // 2. Fallback: normalized case-insensitive match (for sequences or variations)
        if (!val) {
            const inputSteps = ActionRegistry.splitTrigger(trigger);
            for (const [key, actVal] of this.bindings.entries()) {
                const boundSteps = ActionRegistry.splitTrigger(key);
                if (boundSteps.length === inputSteps.length) {
                    let match = true;
                    for (let i = 0; i < boundSteps.length; i++) {
                        if (boundSteps[i].toLowerCase() !== inputSteps[i].toLowerCase()) {
                            match = false;
                            break;
                        }
                    }
                    if (match) {
                        val = actVal;
                        break;
                    }
                }
            }
        }

        if (!val) return false;
        const actionIds = Array.isArray(val) ? val : [val];
        for (const actionId of actionIds) {
            if (this.execute(actionId, context)) {
                return true;
            }
        }
        return false;
    }


    /**
     * Splits a trigger string into sequential steps.
     * Sequences can be separated by spaces or ' > ' (e.g. 'KeyB KeyN', 'B > N').
     * Single chord combinations like 'Ctrl+KeyK' remain 1 step.
     * @param {string} trigger
     * @returns {string[]}
     */
    static splitTrigger(trigger) {
        if (!trigger) return [];
        if (trigger.includes(" > ")) {
            return trigger.split(" > ").map(s => s.trim()).filter(Boolean);
        }
        if (trigger.includes(" ")) {
            return trigger.split(/\s+/).map(s => s.trim()).filter(Boolean);
        }
        return [trigger.trim()];
    }

    /**
     * Checks if any registered trigger sequence starts with the given prefix steps.
     * @param {string[]} prefixSteps
     * @returns {boolean}
     */
    hasSequencePrefix(prefixSteps) {
        if (!prefixSteps || prefixSteps.length === 0) return false;
        for (const trigger of this.bindings.keys()) {
            const steps = ActionRegistry.splitTrigger(trigger);
            if (steps.length > prefixSteps.length) {
                let match = true;
                for (let i = 0; i < prefixSteps.length; i++) {
                    if (steps[i].toLowerCase() !== prefixSteps[i].toLowerCase()) {
                        match = false;
                        break;
                    }
                }
                if (match) return true;
            }
        }
        return false;
    }

    /**
     * Get all registered actions.
     * @returns {EditorAction[]}
     */
    getAllActions() {
        return Array.from(this.actions.values());
    }
}

