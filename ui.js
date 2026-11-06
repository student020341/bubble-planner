/**
 * @file UI overlay components: Breadcrumbs, side drawer inspector, settings drawer, and keybinding management.
 */

class UIController {
    /**
     * @param {ProjectStore} store
     * @param {CanvasView} canvasView
     * @param {Camera} camera
     * @param {ActionRegistry} actionRegistry
     */
    constructor(store, canvasView, camera, actionRegistry) {
        this.store = store;
        this.canvasView = canvasView;
        this.camera = camera;
        this.actionRegistry = actionRegistry;

        /** @type {HTMLElement|null} */
        this.topBar = null;

        /** @type {HTMLElement|null} */
        this.breadcrumbContainer = null;

        /** @type {HTMLElement|null} Right-hand inspector drawer container */
        this.inspectorDrawer = null;

        /** @type {HTMLElement|null} Settings drawer container */
        this.settingsDrawer = null;

        /** @type {BubbleNode|BubbleRelationship|null} */
        this.inspectedEntity = null;

        /** @type {boolean} */
        this.isInspectorOpen = false;

        /** @type {boolean} */
        this.isSettingsOpen = false;

        /** @type {string|null} Action ID currently recording a new trigger */
        this.recordingActionId = null;

        this.mount();
        this.store.subscribe(() => {
            this.renderBreadcrumbs();
            if (this.isInspectorOpen && this.inspectedEntity) {
                this.renderInspectorContent();
            }
        });
    }

    /** Mount DOM overlay elements for top bar, breadcrumbs, and drawer containers */
    mount() {
        // Top navigation bar
        this.topBar = document.createElement("div");
        this.topBar.id = "top-bar";
        this.topBar.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 44px;
            background: rgba(15, 23, 42, 0.88);
            backdrop-filter: blur(8px);
            border-bottom: 1px solid rgba(51, 65, 85, 0.7);
            display: flex;
            align-items: center;
            padding: 0 16px;
            gap: 12px;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 14px;
            z-index: 10;
            user-select: none;
        `;

        // Settings gear button (left of breadcrumbs)
        const gearBtn = document.createElement("button");
        gearBtn.innerHTML = "⚙️";
        gearBtn.title = "Settings (Keybindings, Custom Types, Reset)";
        gearBtn.style.cssText = `
            background: transparent;
            border: 1px solid rgba(100, 116, 139, 0.4);
            border-radius: 6px;
            color: #cbd5e1;
            font-size: 15px;
            padding: 4px 8px;
            cursor: pointer;
            transition: all 0.15s ease;
        `;
        gearBtn.addEventListener("mouseenter", () => {
            gearBtn.style.background = "rgba(255, 255, 255, 0.1)";
            gearBtn.style.borderColor = "#94a3b8";
        });
        gearBtn.addEventListener("mouseleave", () => {
            gearBtn.style.background = "transparent";
            gearBtn.style.borderColor = "rgba(100, 116, 139, 0.4)";
        });
        gearBtn.addEventListener("click", () => this.toggleSettings());
        this.topBar.appendChild(gearBtn);

        // Breadcrumb container
        this.breadcrumbContainer = document.createElement("div");
        this.breadcrumbContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            flex-grow: 1;
        `;
        this.topBar.appendChild(this.breadcrumbContainer);

        document.body.appendChild(this.topBar);

        // Settings Drawer Container
        this.settingsDrawer = document.createElement("div");
        this.settingsDrawer.id = "settings-drawer";
        this.settingsDrawer.style.cssText = `
            position: fixed;
            top: 44px;
            left: 0;
            bottom: 0;
            width: 420px;
            background: rgba(15, 23, 42, 0.96);
            backdrop-filter: blur(12px);
            border-right: 1px solid rgba(51, 65, 85, 0.8);
            box-shadow: 4px 0 24px rgba(0, 0, 0, 0.6);
            display: none;
            flex-direction: column;
            z-index: 20;
            font-family: system-ui, -apple-system, sans-serif;
            color: #e2e8f0;
            overflow-y: auto;
        `;
        document.body.appendChild(this.settingsDrawer);

        this.renderBreadcrumbs();
    }

    // --- Breadcrumbs ---

    renderBreadcrumbs() {
        if (!this.breadcrumbContainer) return;
        this.breadcrumbContainer.innerHTML = "";

        const breadcrumbs = this.store.getBreadcrumbs();
        const isAtRoot = this.store.currentParentId == null;

        // Root button
        const rootBtn = this.createCrumbButton("Root (Project)", isAtRoot, () => {
            this.actionRegistry.execute("jumpToLayer", {
                store: this.store,
                canvasView: this.canvasView,
                camera: this.camera,
                targetParentId: null
            });
        });
        this.breadcrumbContainer.appendChild(rootBtn);

        // Nested crumbs
        for (let i = 0; i < breadcrumbs.length; i++) {
            const b = breadcrumbs[i];
            const isLast = i === breadcrumbs.length - 1;

            const separator = document.createElement("span");
            separator.textContent = "›";
            separator.style.color = "#475569";
            this.breadcrumbContainer.appendChild(separator);

            const crumbBtn = this.createCrumbButton(b.label, isLast, () => {
                if (!isLast) {
                    this.actionRegistry.execute("jumpToLayer", {
                        store: this.store,
                        canvasView: this.canvasView,
                        camera: this.camera,
                        targetParentId: b.id
                    });
                }
            });
            this.breadcrumbContainer.appendChild(crumbBtn);
        }
    }

    createCrumbButton(label, isCurrent, onClick) {
        const btn = document.createElement("button");
        btn.textContent = label;
        btn.style.cssText = `
            background: ${isCurrent ? "rgba(56, 189, 248, 0.15)" : "transparent"};
            color: ${isCurrent ? "#38bdf8" : "#94a3b8"};
            border: 1px solid ${isCurrent ? "rgba(56, 189, 248, 0.4)" : "transparent"};
            border-radius: 6px;
            padding: 4px 10px;
            font-size: 13px;
            font-weight: ${isCurrent ? "600" : "500"};
            cursor: ${isCurrent ? "default" : "pointer"};
            transition: all 0.15s ease;
        `;

        if (!isCurrent) {
            btn.addEventListener("mouseenter", () => {
                btn.style.color = "#f8fafc";
                btn.style.background = "rgba(255, 255, 255, 0.08)";
            });
            btn.addEventListener("mouseleave", () => {
                btn.style.color = "#94a3b8";
                btn.style.background = "transparent";
            });
            btn.addEventListener("click", onClick);
        }

        return btn;
    }

    // --- Settings Drawer ---

    toggleSettings() {
        if (this.isSettingsOpen) {
            this.closeSettings();
        } else {
            this.openSettings();
        }
    }

    openSettings() {
        this.isSettingsOpen = true;
        this.settingsDrawer.style.display = "flex";
        this.renderSettingsContent();
    }

    closeSettings() {
        this.isSettingsOpen = false;
        this.recordingActionId = null;
        this.settingsDrawer.style.display = "none";
    }

    renderSettingsContent() {
        if (!this.settingsDrawer) return;
        this.settingsDrawer.innerHTML = "";

        // Header
        const header = document.createElement("div");
        header.style.cssText = `
            padding: 16px;
            border-bottom: 1px solid rgba(51, 65, 85, 0.7);
            display: flex;
            align-items: center;
            justify-content: space-between;
        `;
        const title = document.createElement("h2");
        title.textContent = "Settings";
        title.style.cssText = "margin: 0; font-size: 16px; font-weight: 600; color: #f8fafc;";

        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = "✕";
        closeBtn.style.cssText = `
            background: transparent;
            border: none;
            color: #94a3b8;
            font-size: 16px;
            cursor: pointer;
            padding: 4px 8px;
        `;
        closeBtn.addEventListener("click", () => this.closeSettings());

        header.appendChild(title);
        header.appendChild(closeBtn);
        this.settingsDrawer.appendChild(header);

        // Body Content
        const body = document.createElement("div");
        body.style.cssText = "padding: 16px; display: flex; flex-direction: column; gap: 24px;";

        // 1. Keybindings Section
        body.appendChild(this.createKeybindingsPanel());

        // 2. Custom Scalar Types Section
        body.appendChild(this.createScalarTypesPanel());

        // 3. Storage / Reset Section
        body.appendChild(this.createStoragePanel());

        this.settingsDrawer.appendChild(body);
    }

    createKeybindingsPanel() {
        const panel = document.createElement("div");

        // Header with "Restore Defaults" button
        const headerRow = document.createElement("div");
        headerRow.style.cssText = "display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;";

        const title = document.createElement("h3");
        title.textContent = "Shortcuts & Gestures";
        title.style.cssText = "margin: 0; font-size: 14px; font-weight: 600; color: #38bdf8;";
        headerRow.appendChild(title);

        const restoreBtn = document.createElement("button");
        restoreBtn.textContent = "Restore Defaults";
        restoreBtn.style.cssText = `
            background: transparent;
            border: 1px solid rgba(148, 163, 184, 0.4);
            border-radius: 4px;
            color: #94a3b8;
            font-size: 11px;
            padding: 3px 8px;
            cursor: pointer;
            transition: all 0.15s ease;
        `;
        restoreBtn.addEventListener("mouseenter", () => {
            restoreBtn.style.color = "#f8fafc";
            restoreBtn.style.borderColor = "#cbd5e1";
        });
        restoreBtn.addEventListener("mouseleave", () => {
            restoreBtn.style.color = "#94a3b8";
            restoreBtn.style.borderColor = "rgba(148, 163, 184, 0.4)";
        });
        restoreBtn.addEventListener("click", () => {
            this.actionRegistry.restoreDefaults();
            this.renderSettingsContent();
        });
        headerRow.appendChild(restoreBtn);
        panel.appendChild(headerRow);

        // Build inverted map: actionId -> trigger list
        const actionToTriggers = new Map();
        for (const [trigger, actionId] of this.actionRegistry.bindings.entries()) {
            if (!actionToTriggers.has(actionId)) actionToTriggers.set(actionId, []);
            actionToTriggers.get(actionId).push(trigger);
        }

        const cardsContainer = document.createElement("div");
        cardsContainer.style.cssText = "display: flex; flex-direction: column; gap: 12px;";

        const interactionOptions = [
            { label: "Double-click Node", value: "node:dblclick" },
            { label: "Click Node", value: "node:click" },
            { label: "Double-click Canvas", value: "canvas:dblclick" },
            { label: "Click Canvas", value: "canvas:click" }
        ];

        const actions = this.actionRegistry.getAllActions();
        for (const action of actions) {
            const card = document.createElement("div");
            card.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 10px;
                background: rgba(30, 41, 59, 0.6);
                border: 1px solid rgba(51, 65, 85, 0.6);
                border-radius: 6px;
            `;

            // Card Header
            const cardHead = document.createElement("div");
            const actionName = document.createElement("div");
            actionName.textContent = action.title;
            actionName.style.cssText = "font-size: 13px; font-weight: 600; color: #f1f5f9;";

            const actionDesc = document.createElement("div");
            actionDesc.textContent = action.description || "";
            actionDesc.style.cssText = "font-size: 11px; color: #64748b; margin-top: 2px;";

            cardHead.appendChild(actionName);
            if (action.description) cardHead.appendChild(actionDesc);
            card.appendChild(cardHead);

            // Trigger list
            const triggers = actionToTriggers.get(action.id) || [];
            const triggerList = document.createElement("div");
            triggerList.style.cssText = "display: flex; flex-direction: column; gap: 6px;";

            if (triggers.length === 0) {
                const emptyMsg = document.createElement("div");
                emptyMsg.textContent = "No triggers bound";
                emptyMsg.style.cssText = "font-size: 11px; color: #64748b; font-style: italic;";
                triggerList.appendChild(emptyMsg);
            }

            for (const trigger of triggers) {
                const row = document.createElement("div");
                row.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: rgba(15, 23, 42, 0.7);
                    border: 1px solid rgba(51, 65, 85, 0.4);
                    border-radius: 4px;
                    padding: 4px 8px;
                `;

                const isGesture = trigger.includes(":");
                const triggerBadge = document.createElement("span");
                triggerBadge.textContent = isGesture
                    ? (interactionOptions.find(o => o.value === trigger)?.label || trigger)
                    : trigger;
                triggerBadge.style.cssText = `
                    font-family: ${isGesture ? "system-ui" : "monospace"};
                    font-size: 12px;
                    color: ${isGesture ? "#fbbf24" : "#38bdf8"};
                `;
                row.appendChild(triggerBadge);

                // Unbind button (×)
                const delBtn = document.createElement("button");
                delBtn.innerHTML = "✕";
                delBtn.title = "Unbind this shortcut";
                delBtn.style.cssText = `
                    background: transparent;
                    border: none;
                    color: #94a3b8;
                    font-size: 12px;
                    cursor: pointer;
                    padding: 0 4px;
                `;
                delBtn.addEventListener("mouseenter", () => delBtn.style.color = "#f43f5e");
                delBtn.addEventListener("mouseleave", () => delBtn.style.color = "#94a3b8");
                delBtn.addEventListener("click", () => {
                    this.actionRegistry.unbind(trigger);
                    this.renderSettingsContent();
                });
                row.appendChild(delBtn);

                triggerList.appendChild(row);
            }
            card.appendChild(triggerList);

            // Add Keybind Row / Options
            const addRow = document.createElement("div");
            addRow.style.cssText = "display: flex; gap: 6px; margin-top: 4px;";

            const isRecording = this.recordingActionId === action.id;

            // Detect Key button
            const recordBtn = document.createElement("button");
            recordBtn.textContent = isRecording ? "Press key now..." : "+ Keybind";
            recordBtn.style.cssText = `
                flex: 1;
                background: ${isRecording ? "#e0f2fe" : "rgba(2, 132, 199, 0.2)"};
                color: ${isRecording ? "#0369a1" : "#38bdf8"};
                border: 1px solid ${isRecording ? "#38bdf8" : "rgba(56, 189, 248, 0.4)"};
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 11px;
                font-weight: 500;
                cursor: pointer;
            `;

            recordBtn.addEventListener("click", () => {
                this.recordingActionId = action.id;
                this.renderSettingsContent();

                const onNextKey = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.removeEventListener("keydown", onNextKey, true);

                    const newTrigger = e.code.startsWith("Key") ? e.code : e.key;
                    this.actionRegistry.bind(newTrigger, action.id);
                    this.recordingActionId = null;
                    this.renderSettingsContent();
                };

                window.addEventListener("keydown", onNextKey, true);
            });
            addRow.appendChild(recordBtn);

            // Dropdown for non-key gestures filtered by action target scope
            const targetScope = action.target || "global";
            const compatibleGestures = interactionOptions.filter(opt => {
                if (targetScope === "node") return opt.value.startsWith("node:");
                if (targetScope === "canvas") return opt.value.startsWith("canvas:");
                return true; // global
            });

            if (compatibleGestures.length > 0) {
                const gestureSelect = document.createElement("select");
                gestureSelect.style.cssText = `
                    flex: 1;
                    background: rgba(15, 23, 42, 0.8);
                    color: #cbd5e1;
                    border: 1px solid rgba(51, 65, 85, 0.8);
                    border-radius: 4px;
                    padding: 4px;
                    font-size: 11px;
                    cursor: pointer;
                `;
                const defaultOpt = document.createElement("option");
                defaultOpt.value = "";
                defaultOpt.textContent = "+ Gesture...";
                gestureSelect.appendChild(defaultOpt);

                for (const opt of compatibleGestures) {
                    const o = document.createElement("option");
                    o.value = opt.value;
                    o.textContent = opt.label;
                    gestureSelect.appendChild(o);
                }

                gestureSelect.addEventListener("change", () => {
                    if (gestureSelect.value) {
                        this.actionRegistry.bind(gestureSelect.value, action.id);
                        this.renderSettingsContent();
                    }
                });
                addRow.appendChild(gestureSelect);
            }

            card.appendChild(addRow);
            cardsContainer.appendChild(card);
        }

        panel.appendChild(cardsContainer);
        return panel;
    }

    createScalarTypesPanel() {
        const panel = document.createElement("div");

        const title = document.createElement("h3");
        title.textContent = "Scalar Data Types";
        title.style.cssText = "margin: 0 0 6px 0; font-size: 14px; font-weight: 600; color: #38bdf8;";
        panel.appendChild(title);

        const desc = document.createElement("p");
        desc.textContent = "Data types available for properties on bubbles & actions:";
        desc.style.cssText = "margin: 0 0 10px 0; font-size: 12px; color: #94a3b8;";
        panel.appendChild(desc);

        // Types tag list with delete (×) buttons
        const tagContainer = document.createElement("div");
        tagContainer.style.cssText = "display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;";

        for (const type of this.store.doc.types) {
            const tag = document.createElement("div");
            tag.style.cssText = `
                display: flex;
                align-items: center;
                gap: 6px;
                background: rgba(30, 41, 59, 0.8);
                border: 1px solid rgba(51, 65, 85, 0.8);
                border-radius: 4px;
                padding: 3px 8px;
                font-size: 12px;
                font-family: monospace;
                color: #a5f3fc;
            `;

            const labelSpan = document.createElement("span");
            labelSpan.textContent = type;
            tag.appendChild(labelSpan);

            // Allow deleting any type except base 'text'
            if (type !== "text") {
                const delTypeBtn = document.createElement("button");
                delTypeBtn.innerHTML = "✕";
                delTypeBtn.title = `Delete "${type}" type`;
                delTypeBtn.style.cssText = `
                    background: transparent;
                    border: none;
                    color: #64748b;
                    font-size: 11px;
                    cursor: pointer;
                    padding: 0;
                    line-height: 1;
                `;
                delTypeBtn.addEventListener("mouseenter", () => delTypeBtn.style.color = "#f43f5e");
                delTypeBtn.addEventListener("mouseleave", () => delTypeBtn.style.color = "#64748b");
                delTypeBtn.addEventListener("click", () => {
                    this.store.doc.types = this.store.doc.types.filter(t => t !== type);
                    this.store.notify();
                    this.renderSettingsContent();
                });
                tag.appendChild(delTypeBtn);
            }

            tagContainer.appendChild(tag);
        }
        panel.appendChild(tagContainer);

        // Add new scalar type input
        const form = document.createElement("div");
        form.style.cssText = "display: flex; gap: 6px;";

        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "e.g. date, url, boolean";
        input.style.cssText = `
            flex-grow: 1;
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid rgba(51, 65, 85, 0.8);
            border-radius: 4px;
            color: #f8fafc;
            padding: 5px 8px;
            font-size: 12px;
        `;

        const addBtn = document.createElement("button");
        addBtn.textContent = "+ Add";
        addBtn.style.cssText = `
            background: #0284c7;
            border: none;
            border-radius: 4px;
            color: white;
            padding: 5px 12px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
        `;
        const submitType = () => {
            const val = input.value.trim().toLowerCase();
            if (val && !this.store.doc.types.includes(val)) {
                this.store.doc.types.push(val);
                this.store.notify();
                this.renderSettingsContent();
            }
        };

        addBtn.addEventListener("click", submitType);
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") submitType();
        });

        form.appendChild(input);
        form.appendChild(addBtn);
        panel.appendChild(form);

        return panel;
    }

    createStoragePanel() {
        const panel = document.createElement("div");

        const title = document.createElement("h3");
        title.textContent = "Data & Storage";
        title.style.cssText = "margin: 0 0 6px 0; font-size: 14px; font-weight: 600; color: #fb7185;";
        panel.appendChild(title);

        const desc = document.createElement("p");
        desc.textContent = "Reset project back to default state and clear local store:";
        desc.style.cssText = "margin: 0 0 10px 0; font-size: 12px; color: #94a3b8;";
        panel.appendChild(desc);

        const resetBtn = document.createElement("button");
        resetBtn.textContent = "Reset Project Data";
        resetBtn.style.cssText = `
            background: rgba(225, 29, 72, 0.15);
            border: 1px solid rgba(225, 29, 72, 0.5);
            color: #fda4af;
            border-radius: 4px;
            padding: 6px 12px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
        `;
        resetBtn.addEventListener("mouseenter", () => {
            resetBtn.style.background = "rgba(225, 29, 72, 0.3)";
        });
        resetBtn.addEventListener("mouseleave", () => {
            resetBtn.style.background = "rgba(225, 29, 72, 0.15)";
        });
        resetBtn.addEventListener("click", () => {
            if (window.confirm("Reset all bubbles and actions back to initial mock project?")) {
                location.reload();
            }
        });

        panel.appendChild(resetBtn);
        return panel;
    }

    // --- Inspector Drawer (Stubs for next step) ---

    openInspector(entity) {
        // stub
    }

    closeInspector() {
        // stub
    }

    renderInspectorContent() {
        // stub
    }

    renderPropertiesEditor(parentEl, entity) {
        // stub
    }

    renderCrossLayerConnectSection(parentEl, node) {
        // stub
    }

    getNodeNamespace(node) {
        const trail = [];
        let cur = node;
        while (cur) {
            trail.unshift(cur.label);
            cur = cur.parentId != null ? this.store.doc.nodes.find(n => n.id === cur.parentId) : null;
        }
        return trail.join(".");
    }
}
