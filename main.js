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
    title: "Jump to Root",
    description: "Navigate directly up to the root level",
    target: "global",
    isEnabled: () => store.currentParentId !== null,
    execute: (ctx) => {
        const targetParentId = ctx.targetParentId !== undefined ? ctx.targetParentId : null;
        store.setLayer(targetParentId);
        canvasView.selectedNode = null;
        camera.fitToNodes(store.getVisibleNodes());
    }
});

actionRegistry.register({
    id: "toggleRecentLayer",
    title: "Toggle Recent Layer",
    description: "Switch view back and forth between the two most recently visited layers (B)",
    target: "global",
    isEnabled: () => store.previousParentId !== undefined && store.previousParentId !== store.currentParentId,
    execute: () => {
        if (store.toggleRecentLayer()) {
            canvasView.selectedNode = null;
            canvasView.lastFocusedNode = null;
            canvasView.selectedRelationship = null;
            camera.fitToNodes(store.getVisibleNodes());
        }
    }
});

actionRegistry.register({
    id: "openJumpPalette",
    title: "Jump to Bubble / Layer",
    description: "Open search palette to quickly jump to any bubble across all layers",
    target: "global",
    execute: () => {
        uiController.toggleJumpPalette();
    }
});

actionRegistry.register({
    id: "openCommandPalette",
    title: "Command Palette",
    description: "Search and execute all editor actions and tools",
    target: "global",
    execute: () => {
        uiController.toggleCommandPalette();
    }
});

actionRegistry.register({
    id: "openSettings",
    title: "Open Settings / System Menu",
    description: "Open system settings drawer for keybindings, data types, and preferences",
    target: "global",
    execute: () => {
        uiController.toggleSettings();
    }
});

actionRegistry.register({
    id: "exportJson",
    title: "Export JSON",
    description: "Download active project document as a .json file",
    target: "global",
    execute: () => {
        uiController.downloadJsonFile();
    }
});

actionRegistry.register({
    id: "importJson",
    title: "Import JSON",
    description: "Upload and load a project document from a .json file",
    target: "global",
    execute: () => {
        uiController.triggerJsonFileInput();
    }
});

actionRegistry.register({
    id: "exportOutline",
    title: "Export Outline",
    description: "View, copy, or download tab-indented outline text",
    target: "global",
    execute: () => {
        uiController.openExportOutlineModal();
    }
});

actionRegistry.register({
    id: "exportMarkdown",
    title: "Export Markdown Documentation",
    description: "Export namespaced ontology and typed method signatures for AI ingestion and docs",
    target: "global",
    execute: () => {
        uiController.openExportMarkdownModal();
    }
});

actionRegistry.register({
    id: "openGuide",
    title: "Quick Guide & Help",
    description: "Open the fundamentals quick guide and overview",
    target: "global",
    execute: () => {
        uiController.toggleGuideModal();
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
    description: "Open inline property quick-filter card on selected bubble or action",
    target: "global",
    isEnabled: (ctx) => Boolean((ctx && (ctx.node || ctx.relationship)) || canvasView.selectedNode || canvasView.selectedRelationship),
    execute: (ctx) => {
        const target = (ctx && (ctx.node || ctx.relationship)) || canvasView.selectedNode || canvasView.selectedRelationship;
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
    execute: async (ctx) => {
        const pos = ctx.worldPos || { x: camera.x, y: camera.y };
        const label = await uiController.customPrompt("New bubble name:", "New Item", "Create Bubble", "Create");
        if (label && label.trim()) {
            const node = store.addNode(label.trim(), pos.x, pos.y);
            canvasView.selectedNode = node;
            canvasView.lastFocusedNode = node;
        }
    }
});

actionRegistry.register({
    id: "editLabel",
    title: "Edit Label",
    description: "Rename the currently selected bubble or action",
    target: "global",
    isEnabled: (ctx) => Boolean((ctx && (ctx.node || ctx.relationship)) || canvasView.selectedNode || canvasView.selectedRelationship),
    execute: async (ctx) => {
        const targetNode = (ctx && ctx.node) || canvasView.selectedNode;
        const targetRel = (ctx && ctx.relationship) || canvasView.selectedRelationship;

        if (targetNode) {
            const newLabel = await uiController.customPrompt("Edit bubble name:", targetNode.label, "Rename Bubble", "Save");
            if (newLabel && newLabel.trim()) {
                store.updateNode(targetNode.id, { label: newLabel.trim() });
            }
        } else if (targetRel) {
            const newLabel = await uiController.customPrompt("Edit action label:", targetRel.label, "Rename Action", "Save");
            if (newLabel && newLabel.trim()) {
                store.updateRelationship(targetRel.id, { label: newLabel.trim() });
            }
        }
    }
});

actionRegistry.register({
    id: "hideAction",
    title: "Hide Action",
    description: "Hide selected action from canvas and move to hidden drawer",
    target: "relationship",
    isEnabled: (ctx) => {
        const target = (ctx && ctx.relationship) || canvasView.selectedRelationship || 
            (uiController.isInspectorOpen && uiController.inspectedEntity && !uiController.inspectedEntity.hasOwnProperty("x") ? uiController.inspectedEntity : null);
        return Boolean(target);
    },
    execute: (ctx) => {
        const rel = (ctx && ctx.relationship) || canvasView.selectedRelationship || 
            (uiController.isInspectorOpen && uiController.inspectedEntity && !uiController.inspectedEntity.hasOwnProperty("x") ? uiController.inspectedEntity : null);
        if (!rel) return;
        rel.hidden = !rel.hidden;
        store.notify();
        if (rel.hidden && canvasView.selectedRelationship === rel) {
            canvasView.selectedRelationship = null;
        }
        if (uiController.isInspectorOpen && uiController.inspectedEntity === rel) {
            uiController.renderInspectorContent();
        }
    }
});

actionRegistry.register({
    id: "moveNodeToLayer",
    title: "Move Bubble to Layer",
    description: "Move the selected bubble into another layer or to root level (M)",
    target: "node",
    isEnabled: (ctx) => {
        const target = (ctx && ctx.node) || canvasView.selectedNode || 
            (uiController.isInspectorOpen && uiController.inspectedEntity && uiController.inspectedEntity.hasOwnProperty("x") ? uiController.inspectedEntity : null);
        return Boolean(target);
    },
    execute: (ctx) => {
        const target = (ctx && ctx.node) || canvasView.selectedNode || 
            (uiController.isInspectorOpen && uiController.inspectedEntity && uiController.inspectedEntity.hasOwnProperty("x") ? uiController.inspectedEntity : null);
        if (target) {
            uiController.openMovePalette(target);
        }
    }
});

actionRegistry.register({
    id: "deleteSelection",
    title: "Delete Selection",
    description: "Delete the selected bubble or relationship",
    target: "global",
    isEnabled: () => Boolean(canvasView.selectedNode || canvasView.selectedRelationship),
    execute: async () => {
        if (canvasView.selectedNode) {
            const confirmed = await uiController.customConfirm(
                `Delete "${canvasView.selectedNode.label}" and all its sub-bubbles?`,
                "Delete Bubble",
                true,
                "Delete"
            );
            if (confirmed) {
                store.removeNode(canvasView.selectedNode.id);
                canvasView.selectedNode = null;
                canvasView.lastFocusedNode = null;
            }
        } else if (canvasView.selectedRelationship) {
            const rel = canvasView.selectedRelationship;
            const confirmed = await uiController.customConfirm(
                `Delete action "${rel.label}"?`,
                "Delete Action",
                true,
                "Delete"
            );
            if (confirmed) {
                store.removeRelationship(rel.id);
                canvasView.selectedRelationship = null;
            }
        }
    }
});


// --- Keyboard Event Router ---

// Helper to build canonical key combination string (e.g., 'Shift+KeyI', 'Ctrl+KeyK', 'Ctrl+Space')
function buildKeyCombo(e) {
    const parts = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Meta");

    const code = e.code;
    const isModifier = ["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(code);
    if (!isModifier) {
        const keyName = code.startsWith("Key") ? code : (code === "Space" ? "Space" : (code.startsWith("Digit") ? code : e.key));
        parts.push(keyName);
    }
    return parts.length > 0 ? parts.join("+") : null;
}

// Active sequence buffer for Vim-style leader key shortcuts
let pendingSequence = [];

window.addEventListener("keydown", (e) => {
    // 0. If a modal dialog is open, let the dialog handle its own keyboard input
    if (uiController.isDialogOpen) {
        return;
    }

    // 1. If a sequence is pending and Escape is pressed, cancel the sequence immediately
    if (e.key === "Escape" && pendingSequence.length > 0) {
        pendingSequence = [];
        uiController.hideSequenceHUD();
        e.preventDefault();
        e.stopPropagation();
        return;
    }

    // 2. Priority: If Escape is pressed with no pending sequence, let UIController dismiss topmost overlay/drawer
    if (e.key === "Escape") {
        if (uiController.handleEscape()) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
    }

    // Global Command Palette shortcut (Ctrl+Space or Cmd+Space)
    if ((e.ctrlKey || e.metaKey) && (e.code === "Space" || e.key === " ")) {
        if (pendingSequence.length > 0) {
            pendingSequence = [];
            uiController.hideSequenceHUD();
        }
        e.preventDefault();
        e.stopPropagation();
        uiController.toggleCommandPalette();
        return;
    }

    // Global Jump Palette shortcut (Ctrl+K or Cmd+K)
    if ((e.ctrlKey || e.metaKey) && (e.code === "KeyK" || e.key === "k" || e.key === "K")) {
        if (pendingSequence.length > 0) {
            pendingSequence = [];
            uiController.hideSequenceHUD();
        }
        e.preventDefault();
        e.stopPropagation();
        uiController.toggleJumpPalette();
        return;
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
        if (pendingSequence.length > 0) {
            pendingSequence = [];
            uiController.hideSequenceHUD();
        }
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

    // Ignore bare modifier keydown events (Shift, Control, Alt, Meta)
    const isModifier = ["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(e.code);
    if (isModifier) {
        return;
    }

    const combo = buildKeyCombo(e);
    const keyStep = e.code.startsWith("Key") ? e.code : (e.code === "Space" ? "Space" : (e.code.startsWith("Digit") ? e.code : e.key));

    // A. If a sequence is already in progress:
    if (pendingSequence.length > 0) {
        e.preventDefault();
        e.stopPropagation();

        const candidateSeq = [...pendingSequence, keyStep];
        const candidateStr = candidateSeq.join(" ");

        // Check if candidateSeq completes an action
        if (actionRegistry.trigger(candidateStr, context)) {
            pendingSequence = [];
            uiController.hideSequenceHUD();
            return;
        }

        // Check if candidateSeq is still a valid prefix for an even longer sequence
        if (actionRegistry.hasSequencePrefix(candidateSeq)) {
            pendingSequence = candidateSeq;
            uiController.showSequenceHUD(pendingSequence);
            return;
        }

        // Neither completed nor valid prefix -> cancel sequence
        pendingSequence = [];
        uiController.hideSequenceHUD();
        return;
    }

    // B. If no sequence is active, check if pressing this key starts a registered sequence
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (actionRegistry.hasSequencePrefix([keyStep])) {
            e.preventDefault();
            e.stopPropagation();
            pendingSequence = [keyStep];
            uiController.showSequenceHUD(pendingSequence);
            return;
        }
    }

    // C. Otherwise, trigger standard single key or modifier combo (e.g. 'Shift+KeyI', 'Ctrl+KeyK')
    const handled = (combo && actionRegistry.trigger(combo, context)) ||
                    actionRegistry.trigger(e.code, context) ||
                    actionRegistry.trigger(e.key, context);
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

        // 1. Resolve active project
        const activeId = await store.getActiveProjectId();
        const list = await store.listProjects();
        const activeMeta = list.find(p => p.id === activeId) || list[0];
        store.projectId = activeMeta.id;
        store.projectName = activeMeta.name;

        // 2. Load project document
        const hasLoadedDoc = await store.loadProject(store.projectId);
        if (!hasLoadedDoc) {
            // Seed project for the first time
            await store.saveProject();
        }

        // 3. Load user settings (preferences, custom keybindings)
        const savedSettings = await db.get("user_settings");
        if (savedSettings) {
            if (savedSettings.bindings) {
                actionRegistry.bindings = new Map();
                for (const [trigger, val] of savedSettings.bindings) {
                    const actionIds = Array.isArray(val) ? val : [val];
                    for (const id of actionIds) {
                        actionRegistry.bind(trigger, id);
                    }
                }
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
            if (savedSettings.snapGridSize !== undefined) {
                canvasView.snapGridSize = savedSettings.snapGridSize;
            }
            if (savedSettings.alwaysSnapToGrid !== undefined) {
                canvasView.alwaysSnapToGrid = savedSettings.alwaysSnapToGrid;
            }
            if (savedSettings.followOnMove !== undefined) {
                uiController.followOnMove = savedSettings.followOnMove;
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

