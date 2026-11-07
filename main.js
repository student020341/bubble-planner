// World setup: 1:1 screen mapping so Camera manages virtual space
setWorld(0, 0, "fill", false);

/** @type CanvasRenderingContext2D */
const ctx = canvasContext2D;

// 1. Initialize StorageDB & Store
const db = new StorageDB();
const store = new ProjectStore(db);

// 2. Initialize Camera
const camera = new Camera(canvas);

// 3. Initialize Action Registry
const actionRegistry = new ActionRegistry();

// 4. Initialize Canvas Interaction View
const canvasView = new CanvasView(canvas, store, camera, actionRegistry);

// 5. Initialize UI Controller (interactive breadcrumbs, overlays)
const uiController = new UIController(store, canvasView, camera, actionRegistry);
window.uiController = uiController;

// Attach camera transform listener for debounced view-state persistence
camera.onTransformChange = () => {
    store.debouncedSaveViewState(camera);
};

// --- Register Core Named Actions ---

actionRegistry.register({
    id: "jumpToLayer",
    title: "Jump To Layer",
    description: "Navigate directly to a specific ancestor bubble layer or root",
    target: "global",
    execute: (ctx) => {
        store.currentParentId = ctx.targetParentId !== undefined ? ctx.targetParentId : null;
        store.notify();
        canvasView.selectedNode = null;
        camera.fitToNodes(store.getVisibleNodes());
    }
});

actionRegistry.register({
    id: "inspectEntity",
    title: "Inspect Item",
    description: "Open inspector drawer to view/edit properties and details",
    target: "node",
    isEnabled: () => Boolean(canvasView.selectedNode || canvasView.selectedRelationship),
    execute: (ctx) => {
        const target = ctx.node || canvasView.selectedNode || canvasView.selectedRelationship;
        if (target) {
            uiController.toggleInspector(target);
        }
    }
});

actionRegistry.register({
    id: "togglePropertyFilter",
    title: "Property Filter",
    description: "Open inline property quick-filter card on selected bubble",
    target: "node",
    isEnabled: () => Boolean(canvasView.selectedNode),
    execute: (ctx) => {
        const target = ctx.node || canvasView.selectedNode;
        if (target) {
            uiController.togglePropertyQuickFilter(target);
        }
    }
});


actionRegistry.register({
    id: "drillDown",
    title: "Enter Bubble",
    description: "Drill down into the selected bubble layer",
    target: "node",
    isEnabled: (ctx) => Boolean(ctx.node || canvasView.selectedNode),
    execute: (ctx) => {
        const targetNode = ctx.node || canvasView.selectedNode;
        if (!targetNode) return;
        store.enterBubble(targetNode.id);
        canvasView.selectedNode = null;
        camera.fitToNodes(store.getVisibleNodes());
    }
});

actionRegistry.register({
    id: "drillUp",
    title: "Leave Bubble",
    description: "Navigate up to the parent bubble or root layer",
    target: "global",
    execute: () => {
        store.leaveBubble();
        canvasView.selectedNode = null;
        camera.fitToNodes(store.getVisibleNodes());
    }
});

actionRegistry.register({
    id: "createBubble",
    title: "Create Bubble",
    description: "Create a new bubble at the current location",
    target: "canvas",
    execute: (ctx) => {
        const pos = ctx.worldPos || { x: camera.x, y: camera.y };
        const label = window.prompt("New bubble name:", "New Item");
        if (label) {
            const node = store.addNode(label, pos.x, pos.y);
            canvasView.selectedNode = node;
            canvasView.lastFocusedNode = node;
        }
    }
});

actionRegistry.register({
    id: "editLabel",
    title: "Edit Label",
    description: "Rename the currently selected bubble",
    target: "node",
    isEnabled: () => Boolean(canvasView.selectedNode),
    execute: () => {
        const node = canvasView.selectedNode;
        if (!node) return;
        const newLabel = window.prompt("Edit bubble name:", node.label);
        if (newLabel && newLabel.trim()) {
            store.updateNode(node.id, { label: newLabel.trim() });
        }
    }
});

actionRegistry.register({
    id: "deleteSelection",
    title: "Delete Selection",
    description: "Delete the selected bubble or relationship",
    target: "global",
    isEnabled: () => Boolean(canvasView.selectedNode || canvasView.selectedRelationship),
    execute: () => {
        if (canvasView.selectedNode) {
            const confirmed = window.confirm(`Delete "${canvasView.selectedNode.label}" and all its sub-bubbles?`);
            if (confirmed) {
                store.removeNode(canvasView.selectedNode.id);
                canvasView.selectedNode = null;
                canvasView.lastFocusedNode = null;
            }
        } else if (canvasView.selectedRelationship) {
            store.removeRelationship(canvasView.selectedRelationship.id);
            canvasView.selectedRelationship = null;
        }
    }
});

// --- Keyboard Event Router ---

window.addEventListener("keydown", (e) => {
    // Priority: If Escape is pressed, let UIController dismiss the topmost open overlay/drawer
    if (e.key === "Escape") {
        if (uiController.handleEscape()) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
    }

    // Ignore key shortcuts if user is typing in an input, textarea, select, or drawer element
    const isEditing = (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        e.target.isContentEditable ||
        Boolean(e.target.closest("#inspector-drawer")) ||
        Boolean(e.target.closest("#settings-drawer"))
    );

    if (isEditing) {
        return;
    }

    const context = {
        store,
        canvasView,
        camera,
        node: canvasView.selectedNode,
        relationship: canvasView.selectedRelationship,
        originalEvent: e
    };

    // Try triggering by key code (e.g. 'KeyE') or key name (e.g. 'Escape', 'Delete')
    const handled = actionRegistry.trigger(e.code, context) || actionRegistry.trigger(e.key, context);
    if (handled) {
        e.preventDefault();
    }
});

// Main Loop logic and render
const logic = (dt) => {
    // State updates if needed
};

const render = (dt, cw, ch) => {
    canvasView.render();
};

loop([logic, render]);

// --- Boot Persistence ---

async function bootPersistence() {
    try {
        await db.init();

        // 1. Load project document
        const hasLoadedDoc = await store.loadProject();
        if (!hasLoadedDoc) {
            // Seed project for the first time
            await store.saveProject();
        }

        // 2. Load user settings (preferences, custom keybindings)
        const savedSettings = await db.get("user_settings");
        if (savedSettings) {
            if (savedSettings.bindings) {
                actionRegistry.bindings = new Map(savedSettings.bindings);
            }
            if (savedSettings.autoOpenInspector !== undefined) {
                uiController.autoOpenInspector = savedSettings.autoOpenInspector;
            }
            if (savedSettings.autoCloseInspector !== undefined) {
                uiController.autoCloseInspector = savedSettings.autoCloseInspector;
            }
            if (savedSettings.dragThreshold !== undefined) {
                canvasView.dragThreshold = savedSettings.dragThreshold;
            }
        }

        // 3. Load navigation & camera state
        const savedViewState = await db.get("view_state_" + store.projectId);
        let restoredCamera = false;
        if (savedViewState) {
            if (savedViewState.currentParentId !== undefined) {
                const layerExists = savedViewState.currentParentId === null || 
                                    store.doc.nodes.some(n => n.id === savedViewState.currentParentId);
                store.currentParentId = layerExists ? savedViewState.currentParentId : null;
            }
            if (savedViewState.camera && typeof savedViewState.camera.zoom === "number") {
                camera.x = savedViewState.camera.x;
                camera.y = savedViewState.camera.y;
                camera.zoom = savedViewState.camera.zoom;
                restoredCamera = true;
            }
        }

        if (!restoredCamera) {
            camera.fitToNodes(store.getVisibleNodes());
        }

        store.notify();
    } catch (err) {
        console.error("StorageDB init error:", err);
        camera.fitToNodes(store.getVisibleNodes());
        store.notify();
    }
}

bootPersistence();

