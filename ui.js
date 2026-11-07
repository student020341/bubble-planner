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

        /** @type {HTMLElement|null} Floating property quick-filter card container */
        this.propFilterCard = null;

        /** @type {BubbleNode|null} Currently active node in property quick-filter */
        this.activeFilterNode = null;

        /** @type {BubbleNode|BubbleRelationship|null} */
        this.inspectedEntity = null;

        /** @type {boolean} */
        this.isInspectorOpen = false;

        /** @type {boolean} */
        this.isSettingsOpen = false;

        /** @type {string} Active search filter query for settings drawer */
        this.settingsSearchQuery = "";

        /** @type {boolean} Whether to automatically open inspector when an entity is focused */
        this.autoOpenInspector = false;

        /** @type {boolean} Whether to automatically close inspector when clicking off / unfocusing */
        this.autoCloseInspector = false;

        /** @type {string|null} Action ID currently recording a new trigger */
        this.recordingActionId = null;

        /** @type {Array<string>} Active overlay stack in LIFO order */
        this.overlayStack = [];

        /** @type {HTMLElement|null} Bottom-center visual sequence HUD indicator */
        this.sequenceIndicator = null;

        /** @type {HTMLElement|null} Top-bar project selector button */
        this.projectSelectorBtn = null;
        /** @type {HTMLElement|null} Top-bar project dropdown menu */
        this.projectMenu = null;
        /** @type {boolean} */
        this.isProjectMenuOpen = false;

        /** @type {HTMLElement|null} Quick Jump Palette modal */
        this.jumpPalette = null;
        /** @type {boolean} */
        this.isJumpPaletteOpen = false;
        /** @type {number} */
        this.jumpSelectedIndex = 0;

        /** @type {HTMLElement|null} Command Palette (Spotlight / Actions) modal */
        this.commandPalette = null;
        /** @type {boolean} */
        this.isCommandPaletteOpen = false;
        /** @type {number} */
        this.commandSelectedIndex = 0;

        /** @type {HTMLElement|null} Top-bar save status indicator */
        this.saveIndicator = null;
        /** @type {number|null} */
        this._savedFadeTimeout = null;

        /** @type {HTMLElement|null} Import / Export Outline Modal */
        this.importExportModal = null;
        /** @type {boolean} */
        this.isImportExportModalOpen = false;

        /** @type {HTMLElement|null} Guide / Help Modal */
        this.guideModal = null;
        /** @type {boolean} */
        this.isGuideModalOpen = false;

        /** @type {HTMLElement|null} Custom Dialog / Alert / Confirm / Prompt Modal */
        this.dialogModal = null;
        /** @type {boolean} */
        this.isDialogOpen = false;

        this.mount();
        if (this.store) {
            this.store.onSaveStatusChange = (status) => this.updateSaveIndicator(status);
        }
        this.store.subscribe(() => {
            this.updateProjectSelectorLabel();
            this.renderBreadcrumbs();
            if (this.activeFilterNode) {
                const isNode = this.activeFilterNode.hasOwnProperty("x");
                let entityStillVisible = false;
                if (isNode) {
                    entityStillVisible = this.store.getVisibleNodes().some(n => n.id === this.activeFilterNode.id);
                } else {
                    const rel = this.store.doc.relationships.find(r => r.id === this.activeFilterNode.id);
                    if (rel) {
                        const visibleNodeIds = new Set(this.store.getVisibleNodes().map(n => n.id));
                        entityStillVisible = visibleNodeIds.has(rel.from) && visibleNodeIds.has(rel.to);
                    }
                }
                if (!entityStillVisible) {
                    this.closePropertyQuickFilter();
                }
            }
            if (this.isInspectorOpen && this.inspectedEntity) {
                // If entity was deleted, close
                const exists = this.store.doc.nodes.some(n => n.id === this.inspectedEntity.id) ||
                               this.store.doc.relationships.some(r => r.id === this.inspectedEntity.id);
                if (!exists) {
                    this.closeInspector();
                    return;
                }

                // Do not wipe and rebuild inspector DOM while user is actively focused/typing in it
                const isTypingInInspector = this.inspectorDrawer && this.inspectorDrawer.contains(document.activeElement);
                if (!isTypingInInspector) {
                    this.renderInspectorContent();
                }
            }
        });
    }

    pushOverlay(name) {
        this.overlayStack = this.overlayStack.filter(item => item !== name);
        this.overlayStack.push(name);
    }

    removeOverlay(name) {
        this.overlayStack = this.overlayStack.filter(item => item !== name);
    }

    /**
     * Handle Escape key across all active UI overlays and drawers in LIFO order.
     * @returns {boolean} Whether an overlay, drawer, or input was dismissed/handled.
     */
    handleEscape() {
        // 1. If currently recording a keybinding in settings, cancel recording first
        if (this.recordingActionId) {
            this.recordingActionId = null;
            this.renderSettingsContent();
            return true;
        }

        // 2. If a text field in an open drawer has focus, blur it first
        const active = document.activeElement;
        if (active && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement)) {
            if ((this.inspectorDrawer && this.inspectorDrawer.contains(active)) ||
                (this.settingsDrawer && this.settingsDrawer.contains(active))) {
                active.blur();
                return true;
            }
        }

        // 3. Pop topmost overlay from stack
        while (this.overlayStack.length > 0) {
            const top = this.overlayStack.pop();
            if (top === "dialog" && this.isDialogOpen) {
                this.closeDialog(null);
                return true;
            }
            if (top === "guide" && this.isGuideModalOpen) {
                this.closeGuideModal();
                return true;
            }
            if (top === "importExport" && this.isImportExportModalOpen) {
                this.closeImportExportModal();
                return true;
            }
            if (top === "commandPalette" && this.isCommandPaletteOpen) {
                this.closeCommandPalette();
                return true;
            }
            if (top === "jumpPalette" && this.isJumpPaletteOpen) {
                this.closeJumpPalette();
                return true;
            }
            if (top === "projects" && this.isProjectMenuOpen) {
                this.closeProjectMenu();
                return true;
            }
            if (top === "propFilter" && this.propFilterCard && this.propFilterCard.style.display !== "none") {
                this.closePropertyQuickFilter();
                return true;
            }
            if (top === "settings" && this.isSettingsOpen) {
                this.closeSettings();
                return true;
            }
            if (top === "inspector" && this.isInspectorOpen) {
                this.closeInspector();
                return true;
            }
        }

        // 4. Fallbacks in case an overlay was opened without stack tracking
        if (this.isCommandPaletteOpen) {
            this.closeCommandPalette();
            return true;
        }
        if (this.isJumpPaletteOpen) {
            this.closeJumpPalette();
            return true;
        }
        if (this.isProjectMenuOpen) {
            this.closeProjectMenu();
            return true;
        }
        if (this.propFilterCard && this.propFilterCard.style.display !== "none") {
            this.closePropertyQuickFilter();
            return true;
        }
        if (this.isSettingsOpen) {
            this.closeSettings();
            return true;
        }
        if (this.isInspectorOpen) {
            this.closeInspector();
            return true;
        }

        return false;
    }

    /**
     * Persist user preferences and keybindings to IndexedDB.
     */
    async saveSettings() {
        if (!this.store || !this.store.db) return;
        if (this.store.setSaveStatus) this.store.setSaveStatus("saving");
        const settings = {
            bindings: Array.from(this.actionRegistry.bindings.entries()),
            autoOpenInspector: this.autoOpenInspector,
            autoCloseInspector: this.autoCloseInspector,
            dragThreshold: this.canvasView.dragThreshold,
            snapGridSize: this.canvasView.snapGridSize,
            alwaysSnapToGrid: this.canvasView.alwaysSnapToGrid
        };
        await this.store.db.set("user_settings", settings);
        if (this.store.setSaveStatus) this.store.setSaveStatus("saved");
    }

    /**
     * Update top-bar save status indicator badge.
     * @param {"saving"|"saved"} status
     */
    updateSaveIndicator(status) {
        if (!this.saveIndicator) return;
        if (this._savedFadeTimeout) clearTimeout(this._savedFadeTimeout);

        if (status === "saving") {
            this.saveIndicator.style.opacity = "1";
            this.saveIndicator.style.color = "#fbbf24";
            this.saveIndicator.style.background = "rgba(251, 191, 36, 0.12)";
            this.saveIndicator.innerHTML = `
                <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #fbbf24; box-shadow: 0 0 6px #fbbf24;"></span>
                <span>Saving...</span>
            `;
        } else if (status === "saved") {
            this.saveIndicator.style.opacity = "1";
            this.saveIndicator.style.color = "#34d399";
            this.saveIndicator.style.background = "rgba(16, 185, 129, 0.12)";
            this.saveIndicator.innerHTML = `
                <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #10b981; box-shadow: 0 0 6px #10b981;"></span>
                <span>Saved</span>
            `;

            this._savedFadeTimeout = setTimeout(() => {
                if (this.saveIndicator) {
                    this.saveIndicator.style.opacity = "0.45";
                    this.saveIndicator.style.color = "#94a3b8";
                    this.saveIndicator.style.background = "transparent";
                    const dot = this.saveIndicator.querySelector("span");
                    if (dot) dot.style.boxShadow = "none";
                }
            }, 1200);
        }
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
        gearBtn.title = "Settings / System Menu";
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

        // Project selector button (between gear and breadcrumbs)
        this.projectSelectorBtn = document.createElement("button");
        this.projectSelectorBtn.id = "project-selector-btn";
        this.projectSelectorBtn.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            background: rgba(30, 41, 59, 0.7);
            border: 1px solid rgba(100, 116, 139, 0.4);
            border-radius: 6px;
            color: #e2e8f0;
            font-size: 13px;
            font-weight: 500;
            padding: 4px 10px;
            cursor: pointer;
            transition: all 0.15s ease;
            max-width: 220px;
        `;
        this.projectSelectorBtn.addEventListener("mouseenter", () => {
            this.projectSelectorBtn.style.background = "rgba(255, 255, 255, 0.1)";
            this.projectSelectorBtn.style.borderColor = "#94a3b8";
        });
        this.projectSelectorBtn.addEventListener("mouseleave", () => {
            this.projectSelectorBtn.style.background = "rgba(30, 41, 59, 0.7)";
            this.projectSelectorBtn.style.borderColor = "rgba(100, 116, 139, 0.4)";
        });
        this.projectSelectorBtn.addEventListener("click", () => this.toggleProjectMenu());
        this.topBar.appendChild(this.projectSelectorBtn);
        this.updateProjectSelectorLabel();

        // Breadcrumb container
        this.breadcrumbContainer = document.createElement("div");
        this.breadcrumbContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            flex-grow: 1;
        `;
        this.topBar.appendChild(this.breadcrumbContainer);

        // Right side top-bar actions
        const rightBar = document.createElement("div");
        rightBar.style.cssText = "display: flex; align-items: center; gap: 8px;";

        // Save Status Indicator Badge
        this.saveIndicator = document.createElement("div");
        this.saveIndicator.id = "save-indicator";
        this.saveIndicator.style.cssText = `
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 11px;
            font-weight: 500;
            color: #94a3b8;
            opacity: 0.45;
            padding: 3px 8px;
            border-radius: 4px;
            transition: all 0.25s ease;
            user-select: none;
        `;
        this.saveIndicator.innerHTML = `
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #10b981;"></span>
            <span>Saved</span>
        `;
        rightBar.appendChild(this.saveIndicator);

        // Command Palette (Actions Super Menu) button
        const actionsBtn = document.createElement("button");
        actionsBtn.innerHTML = "⚡ Actions";
        actionsBtn.title = "Open Command Palette / Search all actions";
        actionsBtn.style.cssText = `
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(51, 65, 85, 0.8);
            border-radius: 6px;
            color: #cbd5e1;
            font-size: 12px;
            padding: 4px 10px;
            cursor: pointer;
            transition: all 0.15s ease;
        `;
        actionsBtn.addEventListener("mouseenter", () => {
            actionsBtn.style.background = "rgba(168, 85, 247, 0.25)";
            actionsBtn.style.borderColor = "rgba(168, 85, 247, 0.6)";
            actionsBtn.style.color = "#d8b4fe";
        });
        actionsBtn.addEventListener("mouseleave", () => {
            actionsBtn.style.background = "rgba(30, 41, 59, 0.8)";
            actionsBtn.style.borderColor = "rgba(51, 65, 85, 0.8)";
            actionsBtn.style.color = "#cbd5e1";
        });
        actionsBtn.addEventListener("click", () => this.toggleCommandPalette());
        rightBar.appendChild(actionsBtn);

        // Jump to Bubble / Layer Search button
        const jumpBtn = document.createElement("button");
        jumpBtn.innerHTML = "🔍 Jump";
        jumpBtn.title = "Jump to any bubble or layer";
        jumpBtn.style.cssText = `
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(51, 65, 85, 0.8);
            border-radius: 6px;
            color: #cbd5e1;
            font-size: 12px;
            padding: 4px 10px;
            cursor: pointer;
            transition: all 0.15s ease;
        `;
        jumpBtn.addEventListener("mouseenter", () => {
            jumpBtn.style.background = "rgba(59, 130, 246, 0.25)";
            jumpBtn.style.borderColor = "rgba(59, 130, 246, 0.6)";
            jumpBtn.style.color = "#93c5fd";
        });
        jumpBtn.addEventListener("mouseleave", () => {
            jumpBtn.style.background = "rgba(30, 41, 59, 0.8)";
            jumpBtn.style.borderColor = "rgba(51, 65, 85, 0.8)";
            jumpBtn.style.color = "#cbd5e1";
        });
        jumpBtn.addEventListener("click", () => this.toggleJumpPalette());
        rightBar.appendChild(jumpBtn);

        const inspectBtn = document.createElement("button");
        inspectBtn.innerHTML = "📝 Inspect";
        inspectBtn.title = "Inspect selected item";

        inspectBtn.style.cssText = `
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(51, 65, 85, 0.8);
            border-radius: 6px;
            color: #cbd5e1;
            font-size: 12px;
            padding: 4px 10px;
            cursor: pointer;
            transition: all 0.15s ease;
        `;
        inspectBtn.addEventListener("click", () => {
            const target = this.canvasView.selectedNode || this.canvasView.selectedRelationship;
            if (target) {
                this.toggleInspector(target);
            } else {
                this.customAlert("Select a bubble or connection first to inspect it.", "Inspection Notice");
            }
        });
        // Help / Guide button (?)
        const guideBtn = document.createElement("button");
        guideBtn.innerHTML = "❓ Guide";
        guideBtn.title = "Open Quick Guide & Default Controls";
        guideBtn.style.cssText = `
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(51, 65, 85, 0.8);
            border-radius: 6px;
            color: #cbd5e1;
            font-size: 12px;
            padding: 4px 10px;
            cursor: pointer;
            transition: all 0.15s ease;
        `;
        guideBtn.addEventListener("mouseenter", () => {
            guideBtn.style.background = "rgba(16, 185, 129, 0.2)";
            guideBtn.style.borderColor = "rgba(16, 185, 129, 0.6)";
            guideBtn.style.color = "#6ee7b7";
        });
        guideBtn.addEventListener("mouseleave", () => {
            guideBtn.style.background = "rgba(30, 41, 59, 0.8)";
            guideBtn.style.borderColor = "rgba(51, 65, 85, 0.8)";
            guideBtn.style.color = "#cbd5e1";
        });
        guideBtn.addEventListener("click", () => this.toggleGuideModal());
        rightBar.appendChild(guideBtn);

        rightBar.appendChild(inspectBtn);
        this.topBar.appendChild(rightBar);

        document.body.appendChild(this.topBar);

        // Settings Drawer Container (Left edge)
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

        // Inspector Drawer Container (Right edge)
        this.inspectorDrawer = document.createElement("div");
        this.inspectorDrawer.id = "inspector-drawer";
        this.inspectorDrawer.style.cssText = `
            position: fixed;
            top: 44px;
            right: 0;
            bottom: 0;
            width: 380px;
            background: rgba(15, 23, 42, 0.96);
            backdrop-filter: blur(12px);
            border-left: 1px solid rgba(51, 65, 85, 0.8);
            box-shadow: -4px 0 24px rgba(0, 0, 0, 0.6);
            display: none;
            flex-direction: column;
            z-index: 20;
            font-family: system-ui, -apple-system, sans-serif;
            color: #e2e8f0;
            overflow-y: auto;
        `;
        document.body.appendChild(this.inspectorDrawer);

        // Floating Property Quick-Filter Card
        this.propFilterCard = document.createElement("div");
        this.propFilterCard.id = "prop-filter-card";
        this.propFilterCard.style.cssText = `
            position: fixed;
            width: 240px;
            max-height: 220px;
            background: rgba(15, 23, 42, 0.98);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(168, 85, 247, 0.6);
            border-radius: 8px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8), 0 0 15px rgba(168, 85, 247, 0.2);
            display: none;
            flex-direction: column;
            z-index: 50;
            font-family: system-ui, -apple-system, sans-serif;
            color: #f1f5f9;
            padding: 10px;
            gap: 8px;
            outline: none;
        `;
        this.propFilterCard.tabIndex = -1;
        this.propFilterCard.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                this.closePropertyQuickFilter();
                e.stopPropagation();
                e.preventDefault();
            }
        });
        document.body.appendChild(this.propFilterCard);

        // Floating Project Switcher Dropdown Menu
        this.projectMenu = document.createElement("div");
        this.projectMenu.id = "project-menu";
        this.projectMenu.style.cssText = `
            position: fixed;
            width: 280px;
            max-height: 380px;
            background: rgba(15, 23, 42, 0.98);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(51, 65, 85, 0.8);
            border-radius: 8px;
            box-shadow: 0 12px 36px rgba(0, 0, 0, 0.7);
            display: none;
            flex-direction: column;
            z-index: 50;
            font-family: system-ui, -apple-system, sans-serif;
            color: #f1f5f9;
            padding: 10px;
            gap: 8px;
            outline: none;
        `;
        document.body.appendChild(this.projectMenu);

        // Floating Jump to Bubble / Layer Palette
        this.jumpPalette = document.createElement("div");
        this.jumpPalette.id = "jump-palette";
        this.jumpPalette.style.cssText = `
            position: fixed;
            top: 15%;
            left: 50%;
            transform: translateX(-50%);
            width: 520px;
            max-width: 90vw;
            background: rgba(15, 23, 42, 0.97);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(59, 130, 246, 0.5);
            border-radius: 10px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 20px rgba(59, 130, 246, 0.2);
            display: none;
            flex-direction: column;
            z-index: 60;
            font-family: system-ui, -apple-system, sans-serif;
            color: #f1f5f9;
            padding: 12px;
            gap: 10px;
            outline: none;
        `;
        document.body.appendChild(this.jumpPalette);

        // Floating Command Palette (Spotlight / Super Menu)
        this.commandPalette = document.createElement("div");
        this.commandPalette.id = "command-palette";
        this.commandPalette.style.cssText = `
            position: fixed;
            top: 15%;
            left: 50%;
            transform: translateX(-50%);
            width: 540px;
            max-width: 90vw;
            background: rgba(15, 23, 42, 0.97);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(168, 85, 247, 0.5);
            border-radius: 10px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 25px rgba(168, 85, 247, 0.2);
            display: none;
            flex-direction: column;
            z-index: 60;
            font-family: system-ui, -apple-system, sans-serif;
            color: #f1f5f9;
            padding: 12px;
            gap: 10px;
            outline: none;
        `;
        document.body.appendChild(this.commandPalette);

        // Floating Leader Key / Sequence HUD Indicator (Bottom-Center)
        this.sequenceIndicator = document.createElement("div");
        this.sequenceIndicator.id = "sequence-hud";
        this.sequenceIndicator.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(15, 23, 42, 0.94);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(56, 189, 248, 0.7);
            border-radius: 8px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8), 0 0 15px rgba(56, 189, 248, 0.25);
            display: none;
            align-items: center;
            gap: 10px;
            padding: 8px 16px;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 13px;
            color: #f1f5f9;
            z-index: 100;
            pointer-events: none;
            transition: opacity 0.15s ease;
        `;
        document.body.appendChild(this.sequenceIndicator);

        // Floating Import / Export Outline Modal
        this.importExportModal = document.createElement("div");
        this.importExportModal.id = "import-export-modal";
        this.importExportModal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 620px;
            max-width: 92vw;
            max-height: 85vh;
            background: rgba(15, 23, 42, 0.98);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(56, 189, 248, 0.5);
            border-radius: 10px;
            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(56, 189, 248, 0.2);
            display: none;
            flex-direction: column;
            z-index: 70;
            font-family: system-ui, -apple-system, sans-serif;
            color: #f1f5f9;
            padding: 18px;
            gap: 12px;
            outline: none;
        `;
        document.body.appendChild(this.importExportModal);

        // Floating Quick Guide Modal
        this.guideModal = document.createElement("div");
        this.guideModal.id = "guide-modal";
        this.guideModal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 580px;
            max-width: 92vw;
            max-height: 85vh;
            background: rgba(15, 23, 42, 0.98);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(16, 185, 129, 0.5);
            border-radius: 10px;
            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(16, 185, 129, 0.2);
            display: none;
            flex-direction: column;
            z-index: 75;
            font-family: system-ui, -apple-system, sans-serif;
            color: #f1f5f9;
            padding: 18px;
            gap: 14px;
            outline: none;
            overflow-y: auto;
        `;
        document.body.appendChild(this.guideModal);

        // Floating Custom Dialog Modal (Alert / Confirm / Prompt)
        this.dialogModal = document.createElement("div");
        this.dialogModal.id = "custom-dialog-modal";
        this.dialogModal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 440px;
            max-width: 90vw;
            background: rgba(15, 23, 42, 0.99);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(56, 189, 248, 0.6);
            border-radius: 10px;
            box-shadow: 0 30px 70px rgba(0, 0, 0, 0.85), 0 0 35px rgba(56, 189, 248, 0.25);
            display: none;
            flex-direction: column;
            z-index: 120;
            font-family: system-ui, -apple-system, sans-serif;
            color: #f1f5f9;
            padding: 20px;
            gap: 14px;
            outline: none;
        `;
        document.body.appendChild(this.dialogModal);

        // Close dropdowns and overlays when clicking outside
        window.addEventListener("mousedown", (e) => {
            // Close dialog modal when clicking outside
            if (this.isDialogOpen && this.dialogModal) {
                if (!this.dialogModal.contains(e.target)) {
                    this.closeDialog(false);
                }
            }

            // Close guide modal when clicking outside
            if (this.isGuideModalOpen && this.guideModal) {
                if (!this.guideModal.contains(e.target)) {
                    this.closeGuideModal();
                }
            }

            // Close import/export modal when clicking outside
            if (this.isImportExportModalOpen && this.importExportModal) {
                if (!this.importExportModal.contains(e.target)) {
                    this.closeImportExportModal();
                }
            }


            // Close command palette when clicking outside
            if (this.isCommandPaletteOpen && this.commandPalette) {
                if (!this.commandPalette.contains(e.target)) {
                    this.closeCommandPalette();
                }
            }
            // Close jump palette when clicking outside
            if (this.isJumpPaletteOpen && this.jumpPalette) {
                if (!this.jumpPalette.contains(e.target)) {
                    this.closeJumpPalette();
                }
            }
            // Close project menu when clicking outside
            if (this.isProjectMenuOpen && this.projectMenu) {
                if (!this.projectMenu.contains(e.target) && !this.projectSelectorBtn.contains(e.target)) {
                    this.closeProjectMenu();
                }
            }
            if (this.propFilterCard && this.propFilterCard.style.display !== "none") {
                if (this.propFilterCard.contains(e.target)) return;
                if (e.target && (e.target.tagName === "OPTION" || e.target.tagName === "SELECT")) return;
                if (e.target === this.canvasView.canvas) {
                    const hit = this.canvasView.hitTest(e.clientX, e.clientY);
                    if (hit.hitPropFilter) {
                        return; // Let handle/badge click handler toggle it
                    }
                }
                this.closePropertyQuickFilter();
            }
        });

        this.renderBreadcrumbs();
    }

    /**
     * Show bottom sequence HUD indicator with current prefix steps.
     * @param {string[]} steps
     */
    showSequenceHUD(steps) {
        if (!this.sequenceIndicator) return;
        const displaySteps = steps.map(s => {
            const clean = s.startsWith("Key") ? s.slice(3) : (s.startsWith("Digit") ? s.slice(5) : s);
            return `<kbd style="background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(56, 189, 248, 0.6); border-radius: 4px; padding: 2px 7px; color: #38bdf8; font-weight: 700; font-family: monospace;">${clean}</kbd>`;
        }).join(` <span style="color: #64748b; font-size: 11px;">▸</span> `);

        this.sequenceIndicator.innerHTML = `
            <span style="font-size: 15px;">⌨️</span>
            <div style="display: flex; align-items: center; gap: 6px;">
                <span style="color: #94a3b8; font-size: 12px; font-weight: 500;">Sequence:</span>
                ${displaySteps}
                <span style="color: #38bdf8; animation: pulse 1s infinite;">…</span>
            </div>
            <span style="color: #64748b; font-size: 11px; margin-left: 6px; border-left: 1px solid rgba(51, 65, 85, 0.8); padding-left: 10px;">Esc to cancel</span>
        `;
        this.sequenceIndicator.style.display = "flex";
    }

    /** Hide bottom sequence HUD indicator */
    hideSequenceHUD() {
        if (this.sequenceIndicator) {
            this.sequenceIndicator.style.display = "none";
        }
    }

    // --- Property Quick-Filter Floating Card ---


    togglePropertyQuickFilter(node) {
        if (this.activeFilterNode === node && this.propFilterCard.style.display !== "none") {
            this.closePropertyQuickFilter();
        } else {
            this.openPropertyQuickFilter(node);
        }
    }

    openPropertyQuickFilter(entity) {
        if (!entity) return;
        this.activeFilterNode = entity;

        const isNode = entity.hasOwnProperty("x");
        const cardWidth = 260;
        let left, top;

        if (isNode) {
            const screenPos = this.camera.worldToScreen(entity.x, entity.y);
            const m = this.canvasView.computeNodeMetrics(entity);
            left = Math.round(screenPos.x - cardWidth / 2);
            top = Math.round(screenPos.y + (m.height / 2) * this.camera.zoom + 12);
        } else {
            const center = this.canvasView.getRelationshipPillCenter(entity);
            const screenPos = this.camera.worldToScreen(center.x, center.y);
            left = Math.round(screenPos.x - cardWidth / 2);
            top = Math.round(screenPos.y + (center.h / 2) * this.camera.zoom + 12);
        }

        // Clamp to screen bounds so it's always in view
        const margin = 12;
        left = Math.max(margin, Math.min(window.innerWidth - cardWidth - margin, left));
        if (top + 240 > window.innerHeight) {
            if (isNode) {
                const screenPos = this.camera.worldToScreen(entity.x, entity.y);
                const m = this.canvasView.computeNodeMetrics(entity);
                top = Math.round(screenPos.y - (m.height / 2) * this.camera.zoom - 240);
            } else {
                const center = this.canvasView.getRelationshipPillCenter(entity);
                const screenPos = this.camera.worldToScreen(center.x, center.y);
                top = Math.round(screenPos.y - (center.h / 2) * this.camera.zoom - 240);
            }
            top = Math.max(margin, top);
        }

        this.propFilterCard.style.left = `${left}px`;
        this.propFilterCard.style.top = `${top}px`;
        this.propFilterCard.style.width = `${cardWidth}px`;
        this.propFilterCard.style.display = "flex";

        this.pushOverlay("propFilter");
        this.renderPropertyQuickFilterContent();
    }

    closePropertyQuickFilter() {
        this.removeOverlay("propFilter");
        this.activeFilterNode = null;
        if (this.propFilterCard) {
            this.propFilterCard.style.display = "none";
        }
    }

    renderPropertyQuickFilterContent(focusKey = null) {
        if (!this.propFilterCard || !this.activeFilterNode) return;
        this.propFilterCard.innerHTML = "";

        const node = this.activeFilterNode;
        if (!node.properties) node.properties = {};

        const isNode = node.hasOwnProperty("x");

        // Top Row: Filter Search Input + Floating "+ Add" Action Button
        const topRow = document.createElement("div");
        topRow.style.cssText = "display: flex; align-items: center; gap: 6px;";

        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = isNode ? "Filter bubble properties..." : "Filter action properties...";
        searchInput.style.cssText = `
            flex: 1;
            min-width: 0;
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(168, 85, 247, 0.4);
            border-radius: 4px;
            color: #f8fafc;
            padding: 4px 8px;
            font-size: 11px;
            outline: none;
        `;
        searchInput.addEventListener("focus", () => {
            searchInput.style.borderColor = "#c084fc";
        });
        searchInput.addEventListener("blur", () => {
            searchInput.style.borderColor = "rgba(168, 85, 247, 0.4)";
        });
        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                if (searchInput.value.trim().length > 0) {
                    searchInput.value = "";
                    searchInput.dispatchEvent(new Event("input"));
                    this.propFilterCard.focus();
                } else {
                    this.closePropertyQuickFilter();
                }
                e.stopPropagation();
                e.preventDefault();
            }
        });
        topRow.appendChild(searchInput);

        // Floating Action: "+ Add" button
        const addBtn = document.createElement("button");
        addBtn.innerHTML = "+ Add";
        addBtn.title = isNode ? "Add a new property to this bubble" : "Add a new property to this action";
        addBtn.style.cssText = `
            flex-shrink: 0;
            background: rgba(168, 85, 247, 0.2);
            border: 1px solid rgba(168, 85, 247, 0.6);
            color: #c084fc;
            border-radius: 4px;
            padding: 4px 8px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
            white-space: nowrap;
        `;
        addBtn.addEventListener("mouseenter", () => {
            addBtn.style.background = "rgba(168, 85, 247, 0.4)";
            addBtn.style.color = "#ffffff";
        });
        addBtn.addEventListener("mouseleave", () => {
            addBtn.style.background = "rgba(168, 85, 247, 0.2)";
            addBtn.style.color = "#c084fc";
        });
        addBtn.addEventListener("click", () => {
            let nextNum = Object.keys(node.properties).length + 1;
            let newKey = `prop${nextNum}`;
            while (node.properties[newKey] !== undefined) {
                nextNum++;
                newKey = `prop${nextNum}`;
            }
            node.properties[newKey] = (this.store.doc.types && this.store.doc.types[0]) || "text";
            this.store.notify();
            this.renderPropertyQuickFilterContent(newKey);
        });
        topRow.appendChild(addBtn);

        this.propFilterCard.appendChild(topRow);

        // Body: 2-column scrollable table
        const tableContainer = document.createElement("div");
        tableContainer.style.cssText = "display: flex; flex-direction: column; gap: 4px; overflow-y: auto; max-height: 160px;";

        const renderRows = (filterText = "") => {
            tableContainer.innerHTML = "";
            const allProps = Object.entries(node.properties || {});
            const filtered = allProps.filter(([k]) => k.toLowerCase().includes(filterText.toLowerCase()));

            if (filtered.length === 0) {
                const empty = document.createElement("div");
                empty.textContent = allProps.length === 0 ? (isNode ? "No properties on bubble" : "No properties on action") : "No matching properties";
                empty.style.cssText = "font-size: 11px; color: #64748b; font-style: italic; padding: 4px;";
                tableContainer.appendChild(empty);
                return;
            }

            for (const [key, type] of filtered) {
                const row = document.createElement("div");
                row.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: rgba(30, 41, 59, 0.6);
                    border: 1px solid rgba(51, 65, 85, 0.5);
                    border-radius: 4px;
                    padding: 2px 6px;
                    font-size: 11px;
                `;

                // Single-click editable Key Input
                const keyInput = document.createElement("input");
                keyInput.type = "text";
                keyInput.value = key;
                keyInput.style.cssText = `
                    flex: 1;
                    min-width: 0;
                    background: transparent;
                    border: 1px solid transparent;
                    border-radius: 3px;
                    color: #f1f5f9;
                    font-weight: 500;
                    font-size: 11px;
                    padding: 2px 4px;
                    outline: none;
                `;
                keyInput.addEventListener("focus", () => {
                    keyInput.style.background = "rgba(15, 23, 42, 0.8)";
                    keyInput.style.borderColor = "#c084fc";
                });
                let isCommitted = false;
                keyInput.addEventListener("blur", () => {
                    keyInput.style.background = "transparent";
                    keyInput.style.borderColor = "transparent";
                    if (!isCommitted) commitKeyChange();
                });
                keyInput.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.stopPropagation();
                        e.preventDefault();
                        isCommitted = true;
                        commitKeyChange();
                        this.propFilterCard.focus();
                    } else if (e.key === "Escape") {
                        keyInput.value = key;
                        isCommitted = true;
                        keyInput.blur();
                        this.propFilterCard.focus();
                        e.stopPropagation();
                        e.preventDefault();
                    }
                });

                const commitKeyChange = () => {
                    const newKey = keyInput.value.trim();
                    if (!newKey || newKey === key) {
                        keyInput.value = key;
                        return;
                    }
                    if (node.properties[newKey] !== undefined) {
                        // Key already exists, revert
                        keyInput.value = key;
                        return;
                    }
                    // Rebuild properties preserving key insertion order
                    const updated = {};
                    for (const [k, v] of Object.entries(node.properties)) {
                        if (k === key) {
                            updated[newKey] = v;
                        } else {
                            updated[k] = v;
                        }
                    }
                    node.properties = updated;
                    this.store.notify();
                    renderRows(searchInput.value.trim());
                };

                row.appendChild(keyInput);

                // Type Dropdown Select
                const typeSelect = document.createElement("select");
                typeSelect.style.cssText = `
                    background: #1e1b4b;
                    border: 1px solid rgba(168, 85, 247, 0.6);
                    border-radius: 4px;
                    color: #f3e8ff;
                    font-family: monospace;
                    font-size: 10px;
                    font-weight: 600;
                    padding: 2px 4px;
                    cursor: pointer;
                    outline: none;
                `;
                for (const t of (this.store.doc.types || ["text", "number"])) {
                    const opt = document.createElement("option");
                    opt.value = t;
                    opt.textContent = t;
                    opt.style.cssText = "background: #0f172a; color: #f8fafc;";
                    if (t === type) opt.selected = true;
                    typeSelect.appendChild(opt);
                }
                typeSelect.addEventListener("change", () => {
                    node.properties[key] = typeSelect.value;
                    this.store.notify();
                });
                row.appendChild(typeSelect);

                // Remove Button (✕)
                const delBtn = document.createElement("button");
                delBtn.innerHTML = "✕";
                delBtn.title = `Delete "${key}"`;
                delBtn.style.cssText = `
                    background: transparent;
                    border: none;
                    color: #64748b;
                    font-size: 11px;
                    cursor: pointer;
                    padding: 2px 4px;
                    border-radius: 3px;
                    line-height: 1;
                    transition: all 0.1s ease;
                `;
                delBtn.addEventListener("mouseenter", () => {
                    delBtn.style.color = "#f43f5e";
                    delBtn.style.background = "rgba(244, 63, 94, 0.2)";
                });
                delBtn.addEventListener("mouseleave", () => {
                    delBtn.style.color = "#64748b";
                    delBtn.style.background = "transparent";
                });
                delBtn.addEventListener("click", () => {
                    delete node.properties[key];
                    this.store.notify();
                    renderRows(searchInput.value.trim());
                });
                row.appendChild(delBtn);

                tableContainer.appendChild(row);

                if (focusKey && key === focusKey) {
                    setTimeout(() => {
                        keyInput.focus();
                        keyInput.select();
                    }, 20);
                }
            }
        };

        searchInput.addEventListener("input", () => {
            renderRows(searchInput.value.trim());
        });

        renderRows("");
        this.propFilterCard.appendChild(tableContainer);

        // Autofocus search input if not focusing a newly added property
        if (!focusKey) {
            setTimeout(() => searchInput.focus(), 20);
        }
    }

    // --- Project Management Menu ---

    /** Update label on top-bar project selector button. */
    updateProjectSelectorLabel() {
        if (!this.projectSelectorBtn) return;
        const name = this.store ? this.store.projectName : "Project";
        this.projectSelectorBtn.innerHTML = `
            <span style="font-size: 14px;">📁</span>
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;">${name || "Project"}</span>
            <span style="font-size: 10px; opacity: 0.6; margin-left: 2px;">▾</span>
        `;
        this.projectSelectorBtn.title = `Project: ${name} (Click to switch or manage)`;
    }

    toggleProjectMenu() {
        if (this.isProjectMenuOpen) {
            this.closeProjectMenu();
        } else {
            this.openProjectMenu();
        }
    }

    openProjectMenu() {
        this.isProjectMenuOpen = true;
        this.pushOverlay("projects");
        if (this.projectSelectorBtn && this.projectMenu) {
            const rect = this.projectSelectorBtn.getBoundingClientRect();
            this.projectMenu.style.top = `${rect.bottom + 6}px`;
            this.projectMenu.style.left = `${rect.left}px`;
            this.projectMenu.style.display = "flex";
        }
        this.renderProjectMenuContent();
    }

    closeProjectMenu() {
        this.isProjectMenuOpen = false;
        this.removeOverlay("projects");
        if (this.projectMenu) {
            this.projectMenu.style.display = "none";
        }
    }

    async renderProjectMenuContent() {
        if (!this.projectMenu) return;
        this.projectMenu.innerHTML = "";

        const list = await this.store.listProjects();

        // Header
        const header = document.createElement("div");
        header.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding-bottom: 6px; border-bottom: 1px solid rgba(51, 65, 85, 0.7);";

        const title = document.createElement("span");
        title.textContent = "Projects";
        title.style.cssText = "font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8;";
        header.appendChild(title);

        const newBtn = document.createElement("button");
        newBtn.textContent = "+ New";
        newBtn.title = "Create new project";
        newBtn.style.cssText = `
            background: rgba(59, 130, 246, 0.2);
            border: 1px solid rgba(59, 130, 246, 0.5);
            color: #93c5fd;
            border-radius: 4px;
            padding: 2px 8px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
        `;
        newBtn.addEventListener("mouseenter", () => {
            newBtn.style.background = "rgba(59, 130, 246, 0.35)";
        });
        newBtn.addEventListener("mouseleave", () => {
            newBtn.style.background = "rgba(59, 130, 246, 0.2)";
        });
        newBtn.addEventListener("click", async () => {
            const name = await this.customPrompt("New project name:", "New Project", "Create Project", "Create");
            if (name && name.trim()) {
                await this.store.createProject(name.trim(), this.camera);
                this.closeProjectMenu();
            }
        });
        header.appendChild(newBtn);
        this.projectMenu.appendChild(header);

        // Project List Container
        const listContainer = document.createElement("div");
        listContainer.style.cssText = "display: flex; flex-direction: column; gap: 4px; overflow-y: auto; max-height: 280px;";

        for (const proj of list) {
            const isActive = proj.id === this.store.projectId;
            const item = document.createElement("div");
            item.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 6px 8px;
                border-radius: 6px;
                background: ${isActive ? "rgba(59, 130, 246, 0.18)" : "rgba(30, 41, 59, 0.5)"};
                border: 1px solid ${isActive ? "rgba(59, 130, 246, 0.5)" : "transparent"};
                cursor: pointer;
                transition: all 0.15s ease;
            `;
            item.addEventListener("mouseenter", () => {
                if (!isActive) {
                    item.style.background = "rgba(255, 255, 255, 0.08)";
                }
            });
            item.addEventListener("mouseleave", () => {
                if (!isActive) {
                    item.style.background = "rgba(30, 41, 59, 0.5)";
                }
            });

            // Name and active marker
            const nameLabel = document.createElement("div");
            nameLabel.style.cssText = `
                flex: 1;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: 13px;
                font-weight: ${isActive ? "600" : "400"};
                color: ${isActive ? "#60a5fa" : "#f1f5f9"};
                display: flex;
                align-items: center;
                gap: 6px;
            `;
            nameLabel.innerHTML = `<span>${isActive ? "✓" : "📁"}</span><span style="overflow: hidden; text-overflow: ellipsis;">${proj.name}</span>`;
            nameLabel.addEventListener("click", async () => {
                if (!isActive) {
                    await this.store.switchProject(proj.id, this.camera);
                }
                this.closeProjectMenu();
            });
            item.appendChild(nameLabel);

            // Action buttons container
            const actions = document.createElement("div");
            actions.style.cssText = "display: flex; align-items: center; gap: 4px; margin-left: 6px;";

            // Rename (✏️)
            const renameBtn = document.createElement("button");
            renameBtn.innerHTML = "✏️";
            renameBtn.title = "Rename project";
            renameBtn.style.cssText = "background: transparent; border: none; font-size: 11px; cursor: pointer; padding: 2px; opacity: 0.7;";
            renameBtn.addEventListener("mouseenter", () => renameBtn.style.opacity = "1");
            renameBtn.addEventListener("mouseleave", () => renameBtn.style.opacity = "0.7");
            renameBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const newName = await this.customPrompt("Rename project:", proj.name, "Rename Project", "Save");
                if (newName && newName.trim()) {
                    await this.store.renameProject(proj.id, newName.trim());
                    this.renderProjectMenuContent();
                }
            });
            actions.appendChild(renameBtn);

            // Duplicate (📋)
            const dupBtn = document.createElement("button");
            dupBtn.innerHTML = "📋";
            dupBtn.title = "Duplicate project";
            dupBtn.style.cssText = "background: transparent; border: none; font-size: 11px; cursor: pointer; padding: 2px; opacity: 0.7;";
            dupBtn.addEventListener("mouseenter", () => dupBtn.style.opacity = "1");
            dupBtn.addEventListener("mouseleave", () => dupBtn.style.opacity = "0.7");
            dupBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                await this.store.duplicateProject(proj.id, this.camera);
                this.closeProjectMenu();
            });
            actions.appendChild(dupBtn);

            // Delete (🗑️)
            const delBtn = document.createElement("button");
            delBtn.innerHTML = "🗑️";
            delBtn.title = "Delete project";
            delBtn.style.cssText = "background: transparent; border: none; font-size: 11px; cursor: pointer; padding: 2px; opacity: 0.7;";
            delBtn.addEventListener("mouseenter", () => delBtn.style.opacity = "1");
            delBtn.addEventListener("mouseleave", () => delBtn.style.opacity = "0.7");
            delBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const confirmed = await this.customConfirm(
                    `Delete project "${proj.name}"? This cannot be undone.`,
                    "Delete Project",
                    true,
                    "Delete"
                );
                if (confirmed) {
                    await this.store.deleteProject(proj.id, this.camera);
                    this.renderProjectMenuContent();
                }
            });

            actions.appendChild(delBtn);

            item.appendChild(actions);
            listContainer.appendChild(item);
        }

        this.projectMenu.appendChild(listContainer);
    }

    // --- Quick Jump Palette (Jump to Bubble / Layer) ---

    toggleJumpPalette() {
        if (this.isJumpPaletteOpen) {
            this.closeJumpPalette();
        } else {
            this.openJumpPalette();
        }
    }

    openJumpPalette() {
        this.isJumpPaletteOpen = true;
        this.pushOverlay("jumpPalette");
        if (this.jumpPalette) {
            this.jumpPalette.style.display = "flex";
            this.jumpSelectedIndex = 0;
            this.renderJumpPalette();
        }
    }

    closeJumpPalette() {
        this.isJumpPaletteOpen = false;
        this.removeOverlay("jumpPalette");
        if (this.jumpPalette) {
            this.jumpPalette.style.display = "none";
        }
    }

    renderJumpPalette() {
        if (!this.jumpPalette) return;
        this.jumpPalette.innerHTML = "";

        // Search Input Header
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "Jump to bubble or layer... (↑/↓ to navigate, Enter to jump)";
        searchInput.style.cssText = `
            background: rgba(30, 41, 59, 0.9);
            border: 1px solid rgba(59, 130, 246, 0.6);
            border-radius: 6px;
            color: #f8fafc;
            font-size: 14px;
            padding: 8px 12px;
            outline: none;
            width: 100%;
            box-sizing: border-box;
            box-shadow: 0 0 10px rgba(59, 130, 246, 0.15);
        `;

        // Results Container
        const resultsContainer = document.createElement("div");
        resultsContainer.style.cssText = "display: flex; flex-direction: column; gap: 4px; max-height: 280px; overflow-y: auto; margin-top: 4px;";

        const getMatches = (query) => {
            const q = query.trim().toLowerCase();
            const matches = [];

            // Always add Root option if query matches root or is empty
            if (!q || "root".includes(q) || "project".includes(q)) {
                matches.push({
                    type: "root",
                    label: "Root Layer",
                    ns: "Root",
                    node: null,
                    isCurrent: this.store.currentParentId === null,
                    childCount: this.store.doc.nodes.filter(n => n.parentId === null).length
                });
            }

            for (const node of this.store.doc.nodes) {
                const ns = this.getNodeNamespace(node);
                const label = node.label || "";
                const desc = node.description || "";

                if (!q || label.toLowerCase().includes(q) || ns.toLowerCase().includes(q) || desc.toLowerCase().includes(q)) {
                    matches.push({
                        type: "node",
                        label: label,
                        ns: ns,
                        node: node,
                        isCurrent: this.store.currentParentId === node.id || (this.canvasView.selectedNode && this.canvasView.selectedNode.id === node.id),
                        childCount: this.store.doc.nodes.filter(n => n.parentId === node.id).length
                    });
                }
            }

            return matches.slice(0, 30);
        };

        let currentMatches = getMatches("");

        const updateHighlight = () => {
            Array.from(resultsContainer.children).forEach((child, i) => {
                const isSel = i === this.jumpSelectedIndex;
                child.style.background = isSel ? "rgba(59, 130, 246, 0.25)" : "rgba(30, 41, 59, 0.5)";
                child.style.borderColor = isSel ? "rgba(59, 130, 246, 0.6)" : "transparent";
            });
            const selEl = resultsContainer.children[this.jumpSelectedIndex];
            if (selEl && selEl.scrollIntoViewIfNeeded) {
                selEl.scrollIntoViewIfNeeded(false);
            }
        };

        const renderRows = () => {
            resultsContainer.innerHTML = "";
            if (currentMatches.length === 0) {
                const empty = document.createElement("div");
                empty.textContent = "No matching bubbles found";
                empty.style.cssText = "font-size: 12px; color: #64748b; font-style: italic; padding: 10px; text-align: center;";
                resultsContainer.appendChild(empty);
                return;
            }

            if (this.jumpSelectedIndex >= currentMatches.length) {
                this.jumpSelectedIndex = Math.max(0, currentMatches.length - 1);
            }

            currentMatches.forEach((item, idx) => {
                const isSelected = idx === this.jumpSelectedIndex;
                const row = document.createElement("div");
                row.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 10px;
                    border-radius: 6px;
                    background: ${isSelected ? "rgba(59, 130, 246, 0.25)" : "rgba(30, 41, 59, 0.5)"};
                    border: 1px solid ${isSelected ? "rgba(59, 130, 246, 0.6)" : "transparent"};
                    cursor: pointer;
                    transition: all 0.1s ease;
                `;

                row.addEventListener("mouseenter", () => {
                    this.jumpSelectedIndex = idx;
                    updateHighlight();
                });

                row.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    this.executeJump(item);
                });

                row.addEventListener("click", () => {
                    this.executeJump(item);
                });

                // Left: Icon + Label + Path
                const left = document.createElement("div");
                left.style.cssText = "display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;";

                const icon = document.createElement("span");
                icon.textContent = item.type === "root" ? "🏠" : (item.childCount > 0 ? "📁" : "🫧");
                icon.style.cssText = "font-size: 14px; opacity: 0.9;";
                left.appendChild(icon);

                const info = document.createElement("div");
                info.style.cssText = "display: flex; flex-direction: column; overflow: hidden;";

                const titleRow = document.createElement("div");
                titleRow.style.cssText = "font-size: 13px; font-weight: 600; color: #f1f5f9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
                titleRow.textContent = item.label;
                info.appendChild(titleRow);

                const pathRow = document.createElement("div");
                pathRow.style.cssText = "font-size: 11px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
                pathRow.textContent = item.ns.split(".").join(" › ");
                info.appendChild(pathRow);

                left.appendChild(info);
                row.appendChild(left);

                // Right: Badges
                const right = document.createElement("div");
                right.style.cssText = "display: flex; align-items: center; gap: 6px; margin-left: 8px;";

                if (item.childCount > 0) {
                    const badge = document.createElement("span");
                    badge.textContent = `${item.childCount} inside`;
                    badge.style.cssText = "font-size: 10px; background: rgba(59, 130, 246, 0.2); color: #93c5fd; padding: 2px 6px; border-radius: 4px;";
                    right.appendChild(badge);
                }

                if (item.isCurrent) {
                    const curBadge = document.createElement("span");
                    curBadge.textContent = "Current Layer";
                    curBadge.style.cssText = "font-size: 10px; background: rgba(16, 185, 129, 0.2); color: #6ee7b7; padding: 2px 6px; border-radius: 4px;";
                    right.appendChild(curBadge);
                }

                row.appendChild(right);
                resultsContainer.appendChild(row);
            });

            // Ensure selected element is scrolled into view
            const selectedEl = resultsContainer.children[this.jumpSelectedIndex];
            if (selectedEl && selectedEl.scrollIntoViewIfNeeded) {
                selectedEl.scrollIntoViewIfNeeded(false);
            }
        };

        searchInput.addEventListener("input", () => {
            this.jumpSelectedIndex = 0;
            currentMatches = getMatches(searchInput.value);
            renderRows();
        });

        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                if (currentMatches.length > 0) {
                    this.jumpSelectedIndex = (this.jumpSelectedIndex + 1) % currentMatches.length;
                    updateHighlight();
                }
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (currentMatches.length > 0) {
                    this.jumpSelectedIndex = (this.jumpSelectedIndex - 1 + currentMatches.length) % currentMatches.length;
                    updateHighlight();
                }
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (currentMatches[this.jumpSelectedIndex]) {
                    this.executeJump(currentMatches[this.jumpSelectedIndex]);
                }
            } else if (e.key === "Escape") {
                e.preventDefault();
                this.closeJumpPalette();
            }
        });

        this.jumpPalette.appendChild(searchInput);
        this.jumpPalette.appendChild(resultsContainer);
        renderRows();

        setTimeout(() => searchInput.focus(), 20);
    }

    executeJump(item) {
        if (!item) return;

        if (item.type === "root") {
            this.store.currentParentId = null;
            this.canvasView.selectedNode = null;
            this.canvasView.selectedRelationship = null;
            this.store.notify();
            this.camera.fitToNodes(this.store.getVisibleNodes());
        } else if (item.node) {
            const target = item.node;
            // Navigate to the layer containing target
            this.store.currentParentId = target.parentId;
            this.canvasView.selectedNode = target;
            this.canvasView.selectedRelationship = null;
            this.store.notify();

            // Center camera directly on target node
            this.camera.x = target.x;
            this.camera.y = target.y;
            if (this.camera.onTransformChange) this.camera.onTransformChange();
        }

        this.closeJumpPalette();
    }

    // --- Command Palette (Spotlight / Actions Super Menu) ---

    toggleCommandPalette() {
        if (this.isCommandPaletteOpen) {
            this.closeCommandPalette();
        } else {
            this.openCommandPalette();
        }
    }

    openCommandPalette() {
        this.isCommandPaletteOpen = true;
        this.pushOverlay("commandPalette");
        if (this.commandPalette) {
            this.commandPalette.style.display = "flex";
            this.commandSelectedIndex = 0;
            this.renderCommandPalette();
        }
    }

    closeCommandPalette() {
        this.isCommandPaletteOpen = false;
        this.removeOverlay("commandPalette");
        if (this.commandPalette) {
            this.commandPalette.style.display = "none";
        }
    }

    renderCommandPalette() {
        if (!this.commandPalette) return;
        this.commandPalette.innerHTML = "";

        // Search Input Header
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "Type a command or action... (↑/↓ to navigate, Enter to execute)";
        searchInput.style.cssText = `
            background: rgba(30, 41, 59, 0.9);
            border: 1px solid rgba(168, 85, 247, 0.6);
            border-radius: 6px;
            color: #f8fafc;
            font-size: 14px;
            padding: 8px 12px;
            outline: none;
            width: 100%;
            box-sizing: border-box;
            box-shadow: 0 0 10px rgba(168, 85, 247, 0.15);
        `;

        // Results Container
        const resultsContainer = document.createElement("div");
        resultsContainer.style.cssText = "display: flex; flex-direction: column; gap: 4px; max-height: 290px; overflow-y: auto; margin-top: 4px;";

        const allActions = this.actionRegistry.getAllActions();

        const getMatches = (query) => {
            const q = query.trim().toLowerCase();
            if (!q) return allActions;
            return allActions.filter(act => {
                const title = (act.title || "").toLowerCase();
                const desc = (act.description || "").toLowerCase();
                const id = act.id.toLowerCase();
                const triggers = this.actionRegistry.getTriggersForAction(act.id).join(" ").toLowerCase();
                return title.includes(q) || desc.includes(q) || id.includes(q) || triggers.includes(q);
            });
        };

        let currentMatches = getMatches("");

        const updateHighlight = () => {
            Array.from(resultsContainer.children).forEach((child, i) => {
                const isSel = i === this.commandSelectedIndex;
                child.style.background = isSel ? "rgba(168, 85, 247, 0.25)" : "rgba(30, 41, 59, 0.5)";
                child.style.borderColor = isSel ? "rgba(168, 85, 247, 0.6)" : "transparent";
            });
            const selEl = resultsContainer.children[this.commandSelectedIndex];
            if (selEl && selEl.scrollIntoViewIfNeeded) {
                selEl.scrollIntoViewIfNeeded(false);
            }
        };

        const renderRows = () => {
            resultsContainer.innerHTML = "";
            if (currentMatches.length === 0) {
                const empty = document.createElement("div");
                empty.textContent = "No matching commands found";
                empty.style.cssText = "font-size: 12px; color: #64748b; font-style: italic; padding: 10px; text-align: center;";
                resultsContainer.appendChild(empty);
                return;
            }

            if (this.commandSelectedIndex >= currentMatches.length) {
                this.commandSelectedIndex = Math.max(0, currentMatches.length - 1);
            }

            currentMatches.forEach((act, idx) => {
                const isSelected = idx === this.commandSelectedIndex;
                const row = document.createElement("div");
                row.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 10px;
                    border-radius: 6px;
                    background: ${isSelected ? "rgba(168, 85, 247, 0.25)" : "rgba(30, 41, 59, 0.5)"};
                    border: 1px solid ${isSelected ? "rgba(168, 85, 247, 0.6)" : "transparent"};
                    cursor: pointer;
                    transition: all 0.1s ease;
                `;

                row.addEventListener("mouseenter", () => {
                    this.commandSelectedIndex = idx;
                    updateHighlight();
                });

                row.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    this.executeCommand(act);
                });

                row.addEventListener("click", () => {
                    this.executeCommand(act);
                });

                // Left: Title + Description
                const left = document.createElement("div");
                left.style.cssText = "display: flex; flex-direction: column; flex: 1; min-width: 0;";

                const titleRow = document.createElement("div");
                titleRow.style.cssText = "font-size: 13px; font-weight: 600; color: #f1f5f9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
                titleRow.textContent = act.title;
                left.appendChild(titleRow);

                if (act.description) {
                    const descRow = document.createElement("div");
                    descRow.style.cssText = "font-size: 11px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
                    descRow.textContent = act.description;
                    left.appendChild(descRow);
                }

                row.appendChild(left);

                // Right: Shortcut pills
                const triggers = this.actionRegistry.getTriggersForAction(act.id);
                if (triggers.length > 0) {
                    const right = document.createElement("div");
                    right.style.cssText = "display: flex; align-items: center; gap: 4px; margin-left: 8px;";
                    for (const trig of triggers.slice(0, 2)) {
                        const pill = document.createElement("span");
                        pill.textContent = trig;
                        pill.style.cssText = "font-size: 10px; font-family: monospace; background: rgba(51, 65, 85, 0.7); border: 1px solid rgba(100, 116, 139, 0.4); color: #cbd5e1; padding: 2px 5px; border-radius: 4px;";
                        right.appendChild(pill);
                    }
                    row.appendChild(right);
                }

                resultsContainer.appendChild(row);
            });

            const selectedEl = resultsContainer.children[this.commandSelectedIndex];
            if (selectedEl && selectedEl.scrollIntoViewIfNeeded) {
                selectedEl.scrollIntoViewIfNeeded(false);
            }
        };

        searchInput.addEventListener("input", () => {
            this.commandSelectedIndex = 0;
            currentMatches = getMatches(searchInput.value);
            renderRows();
        });

        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                if (currentMatches.length > 0) {
                    this.commandSelectedIndex = (this.commandSelectedIndex + 1) % currentMatches.length;
                    updateHighlight();
                }
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (currentMatches.length > 0) {
                    this.commandSelectedIndex = (this.commandSelectedIndex - 1 + currentMatches.length) % currentMatches.length;
                    updateHighlight();
                }
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (currentMatches[this.commandSelectedIndex]) {
                    this.executeCommand(currentMatches[this.commandSelectedIndex]);
                }
            } else if (e.key === "Escape") {
                e.preventDefault();
                this.closeCommandPalette();
            }
        });

        this.commandPalette.appendChild(searchInput);
        this.commandPalette.appendChild(resultsContainer);
        renderRows();

        setTimeout(() => searchInput.focus(), 20);
    }

    executeCommand(action) {
        if (!action) return;
        this.closeCommandPalette();
        const context = {
            store: this.store,
            canvasView: this.canvasView,
            camera: this.camera,
            node: this.canvasView.selectedNode,
            relationship: this.canvasView.selectedRelationship
        };
        this.actionRegistry.execute(action.id, context);
    }

    // --- Breadcrumbs ---

    renderBreadcrumbs() {
        if (!this.breadcrumbContainer) return;
        this.breadcrumbContainer.innerHTML = "";

        const breadcrumbs = this.store.getBreadcrumbs();
        const isAtRoot = this.store.currentParentId == null;

        // Root button
        const rootBtn = this.createCrumbButton("Root", isAtRoot, () => {
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

    // --- Inspector Drawer ---

    toggleInspector(entity = null) {
        if (this.isInspectorOpen && (!entity || entity === this.inspectedEntity)) {
            this.closeInspector();
        } else {
            this.openInspector(entity || this.canvasView.selectedNode || this.canvasView.selectedRelationship);
        }
    }

    openInspector(entity, options = {}) {
        if (!entity) return;
        this.inspectedEntity = entity;
        this.isInspectorOpen = true;
        this.inspectorDrawer.style.display = "flex";
        this.pushOverlay("inspector");
        this.renderInspectorContent();

        if (options.focusSearch) {
            setTimeout(() => {
                const searchInput = this.inspectorDrawer.querySelector("input[placeholder*='Search name or namespace']");
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
            }, 50);
        }
    }

    closeInspector() {
        this.removeOverlay("inspector");
        this.isInspectorOpen = false;
        this.inspectedEntity = null;
        if (this.inspectorDrawer) this.inspectorDrawer.style.display = "none";
    }

    renderInspectorContent() {
        if (!this.inspectorDrawer || !this.inspectedEntity) return;
        this.inspectorDrawer.innerHTML = "";

        const entity = this.inspectedEntity;
        const isNode = entity.hasOwnProperty("x"); // nodes have x, y; rels have from, to

        // Header
        const header = document.createElement("div");
        header.style.cssText = `
            padding: 16px;
            border-bottom: 1px solid rgba(51, 65, 85, 0.7);
            display: flex;
            align-items: center;
            justify-content: space-between;
        `;

        const titleBox = document.createElement("div");
        titleBox.style.cssText = "display: flex; align-items: center; gap: 8px;";

        const badge = document.createElement("span");
        badge.textContent = isNode ? "Bubble" : "Action";
        badge.style.cssText = `
            background: ${isNode ? "rgba(56, 189, 248, 0.2)" : "rgba(251, 146, 60, 0.2)"};
            color: ${isNode ? "#38bdf8" : "#fb923c"};
            border: 1px solid ${isNode ? "rgba(56, 189, 248, 0.4)" : "rgba(251, 146, 60, 0.4)"};
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
        `;

        const title = document.createElement("span");
        title.textContent = entity.label;
        title.style.cssText = "font-size: 15px; font-weight: 600; color: #f8fafc;";

        titleBox.appendChild(badge);
        titleBox.appendChild(title);

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
        closeBtn.addEventListener("click", () => this.closeInspector());

        header.appendChild(titleBox);
        header.appendChild(closeBtn);
        this.inspectorDrawer.appendChild(header);

        // Body
        const body = document.createElement("div");
        body.style.cssText = "padding: 16px; display: flex; flex-direction: column; gap: 20px;";

        // 0. If Action: Render From -> To Navigation Jump Buttons
        if (!isNode) {
            const idToNode = new Map(this.store.doc.nodes.map(n => [n.id, n]));
            const fromNode = idToNode.get(entity.from);
            const toNode = idToNode.get(entity.to);

            const jumpRow = document.createElement("div");
            jumpRow.style.cssText = "display: flex; gap: 8px;";

            const createJumpBtn = (labelPrefix, targetNode, color) => {
                const btn = document.createElement("button");
                const nodeName = targetNode ? targetNode.label : `#${targetNode ? targetNode.id : "?"}`;
                btn.innerHTML = `<span style="color:#94a3b8">${labelPrefix}:</span> <strong>${nodeName}</strong> ↗`;
                btn.style.cssText = `
                    flex: 1;
                    background: rgba(30, 41, 59, 0.7);
                    border: 1px solid rgba(51, 65, 85, 0.7);
                    border-left: 3px solid ${color};
                    border-radius: 4px;
                    padding: 6px 8px;
                    font-size: 11px;
                    color: #f1f5f9;
                    cursor: pointer;
                    text-align: left;
                    transition: all 0.15s ease;
                `;
                btn.addEventListener("mouseenter", () => btn.style.background = "rgba(51, 65, 85, 0.5)");
                btn.addEventListener("mouseleave", () => btn.style.background = "rgba(30, 41, 59, 0.7)");
                btn.addEventListener("click", () => {
                    if (!targetNode) return;
                    // Jump to containing layer
                    this.store.currentParentId = targetNode.parentId;
                    this.store.notify();
                    this.canvasView.selectedNode = targetNode;
                    this.canvasView.lastFocusedNode = targetNode;
                    this.canvasView.selectedRelationship = null;
                    this.camera.x = targetNode.x;
                    this.camera.y = targetNode.y;
                    this.openInspector(targetNode);
                });
                return btn;
            };

            jumpRow.appendChild(createJumpBtn("From", fromNode, "#38bdf8"));
            jumpRow.appendChild(createJumpBtn("To", toNode, "#fb923c"));
            body.appendChild(jumpRow);
        }

        // 1. Label Field
        const labelGroup = document.createElement("div");
        labelGroup.style.cssText = "display: flex; flex-direction: column; gap: 6px;";
        const labelTitle = document.createElement("label");
        labelTitle.textContent = "Label";
        labelTitle.style.cssText = "font-size: 12px; font-weight: 600; color: #94a3b8;";

        const labelInput = document.createElement("input");
        labelInput.type = "text";
        labelInput.value = entity.label || "";
        labelInput.style.cssText = `
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid rgba(51, 65, 85, 0.8);
            border-radius: 4px;
            color: #f8fafc;
            padding: 6px 10px;
            font-size: 13px;
        `;
        labelInput.addEventListener("input", () => {
            entity.label = labelInput.value;
            title.textContent = entity.label;
            this.store.notify();
        });
        labelGroup.appendChild(labelTitle);
        labelGroup.appendChild(labelInput);
        body.appendChild(labelGroup);

        // 2. Description Field
        const descGroup = document.createElement("div");
        descGroup.style.cssText = "display: flex; flex-direction: column; gap: 6px;";
        const descTitle = document.createElement("label");
        descTitle.textContent = "Description / Notes";
        descTitle.style.cssText = "font-size: 12px; font-weight: 600; color: #94a3b8;";

        const descTextarea = document.createElement("textarea");
        descTextarea.rows = 3;
        descTextarea.value = entity.description || "";
        descTextarea.placeholder = "Add planning context, thoughts, or implementation notes...";
        descTextarea.style.cssText = `
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid rgba(51, 65, 85, 0.8);
            border-radius: 4px;
            color: #f8fafc;
            padding: 8px 10px;
            font-size: 12px;
            font-family: inherit;
            resize: vertical;
        `;
        descTextarea.addEventListener("input", () => {
            entity.description = descTextarea.value;
            this.store.notify();
        });
        descGroup.appendChild(descTitle);
        descGroup.appendChild(descTextarea);
        body.appendChild(descGroup);

        // 3. Properties Table
        const propsGroup = document.createElement("div");
        propsGroup.style.cssText = "display: flex; flex-direction: column; gap: 8px;";
        this.renderPropertiesEditor(propsGroup, entity);
        body.appendChild(propsGroup);

        // 4. Cross-layer search / Connections (if Node)
        if (isNode) {
            const relGroup = document.createElement("div");
            relGroup.style.cssText = "display: flex; flex-direction: column; gap: 8px;";
            this.renderCrossLayerConnectSection(relGroup, entity);
            body.appendChild(relGroup);
        }

        this.inspectorDrawer.appendChild(body);
    }

    renderPropertiesEditor(parentEl, entity) {
        if (!entity.properties) entity.properties = {};

        const headerRow = document.createElement("div");
        headerRow.style.cssText = "display: flex; align-items: center; justify-content: space-between;";

        const title = document.createElement("span");
        title.textContent = "Properties";
        title.style.cssText = "font-size: 12px; font-weight: 600; color: #94a3b8;";
        headerRow.appendChild(title);

        const addPropBtn = document.createElement("button");
        addPropBtn.textContent = "+ Add Property";
        addPropBtn.style.cssText = `
            background: rgba(56, 189, 248, 0.15);
            border: 1px solid rgba(56, 189, 248, 0.4);
            color: #38bdf8;
            border-radius: 4px;
            font-size: 11px;
            padding: 3px 8px;
            cursor: pointer;
        `;
        addPropBtn.addEventListener("click", () => {
            const defaultKey = `prop${Object.keys(entity.properties).length + 1}`;
            entity.properties[defaultKey] = this.store.doc.types[0] || "text";
            this.store.notify();
            this.renderInspectorContent();
        });
        headerRow.appendChild(addPropBtn);
        parentEl.appendChild(headerRow);

        const table = document.createElement("div");
        table.style.cssText = "display: flex; flex-direction: column; gap: 6px;";

        const entries = Object.entries(entity.properties);
        if (entries.length === 0) {
            const emptyText = document.createElement("div");
            emptyText.textContent = "No properties defined.";
            emptyText.style.cssText = "font-size: 12px; color: #64748b; font-style: italic;";
            table.appendChild(emptyText);
        }

        for (const [key, type] of entries) {
            const row = document.createElement("div");
            row.style.cssText = "display: flex; align-items: center; gap: 6px;";

            // Key Input
            const keyInput = document.createElement("input");
            keyInput.type = "text";
            keyInput.value = key;
            keyInput.style.cssText = `
                flex: 1;
                background: rgba(15, 23, 42, 0.8);
                border: 1px solid rgba(51, 65, 85, 0.8);
                border-radius: 4px;
                color: #f8fafc;
                padding: 4px 8px;
                font-size: 12px;
            `;
            keyInput.addEventListener("change", () => {
                const newKey = keyInput.value.trim();
                if (newKey && newKey !== key) {
                    const currentType = entity.properties[key];
                    delete entity.properties[key];
                    entity.properties[newKey] = currentType;
                    this.store.notify();
                    this.renderInspectorContent();
                }
            });
            row.appendChild(keyInput);

            // Type Dropdown
            const typeSelect = document.createElement("select");
            typeSelect.style.cssText = `
                width: 100px;
                background: rgba(15, 23, 42, 0.8);
                border: 1px solid rgba(51, 65, 85, 0.8);
                border-radius: 4px;
                color: #a5f3fc;
                padding: 4px;
                font-size: 12px;
                cursor: pointer;
            `;
            for (const t of this.store.doc.types) {
                const opt = document.createElement("option");
                opt.value = t;
                opt.textContent = t;
                if (t === type) opt.selected = true;
                typeSelect.appendChild(opt);
            }
            typeSelect.addEventListener("change", () => {
                entity.properties[key] = typeSelect.value;
                this.store.notify();
            });
            row.appendChild(typeSelect);

            // Delete property button
            const delBtn = document.createElement("button");
            delBtn.innerHTML = "✕";
            delBtn.title = `Delete property "${key}"`;
            delBtn.style.cssText = `
                background: transparent;
                border: none;
                color: #64748b;
                font-size: 12px;
                cursor: pointer;
                padding: 0 4px;
            `;
            delBtn.addEventListener("mouseenter", () => delBtn.style.color = "#f43f5e");
            delBtn.addEventListener("mouseleave", () => delBtn.style.color = "#64748b");
            delBtn.addEventListener("click", () => {
                delete entity.properties[key];
                this.store.notify();
                this.renderInspectorContent();
            });
            row.appendChild(delBtn);

            table.appendChild(row);
        }
        parentEl.appendChild(table);
    }

    renderCrossLayerConnectSection(parentEl, node) {
        const idToNode = new Map(this.store.doc.nodes.map(n => [n.id, n]));
        const allNodeRels = this.store.doc.relationships.filter(r => r.from === node.id || r.to === node.id);

        const visibleRels = allNodeRels.filter(r => !r.hidden);
        const hiddenRels = allNodeRels.filter(r => Boolean(r.hidden));

        // Helper to render an action item row
        const createActionRow = (rel, isVisibleSection) => {
            const isOutgoing = rel.from === node.id;
            const otherNode = idToNode.get(isOutgoing ? rel.to : rel.from);
            const otherLabel = otherNode ? otherNode.label : `#${isOutgoing ? rel.to : rel.from}`;

            const row = document.createElement("div");
            row.draggable = true;
            row.dataset.relId = rel.id.toString();
            row.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: rgba(15, 23, 42, 0.7);
                border: 1px solid rgba(51, 65, 85, 0.5);
                border-left: 3px solid ${isOutgoing ? "#38bdf8" : "#fb923c"};
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 12px;
                gap: 6px;
                cursor: grab;
                transition: background 0.15s ease;
            `;

            // Drag handle + Move (↓ / ↑) button
            const leftControls = document.createElement("div");
            leftControls.style.cssText = "display: flex; align-items: center; gap: 4px;";

            const dragGrip = document.createElement("span");
            dragGrip.innerHTML = "⋮⋮";
            dragGrip.title = "Drag to reorder or move between sections";
            dragGrip.style.cssText = "color: #64748b; font-size: 11px; cursor: grab;";
            leftControls.appendChild(dragGrip);

            const moveBtn = document.createElement("button");
            moveBtn.innerHTML = isVisibleSection ? "↓" : "↑";
            moveBtn.title = isVisibleSection ? "Hide from canvas (move to Drawer)" : "Show on canvas (move to Canvas)";
            moveBtn.style.cssText = `
                background: transparent;
                border: 1px solid rgba(100, 116, 139, 0.4);
                border-radius: 3px;
                color: ${isVisibleSection ? "#94a3b8" : "#38bdf8"};
                font-size: 11px;
                padding: 1px 4px;
                cursor: pointer;
                line-height: 1;
            `;
            moveBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                rel.hidden = isVisibleSection; // toggle
                this.store.notify();
                this.renderInspectorContent();
            });
            leftControls.appendChild(moveBtn);
            row.appendChild(leftControls);

            // Label text
            const labelCol = document.createElement("div");
            labelCol.style.cssText = "display: flex; flex-direction: column; gap: 1px; flex: 1;";

            const actionSpan = document.createElement("span");
            actionSpan.style.cssText = `font-weight: 500; color: ${isVisibleSection ? "#f1f5f9" : "#94a3b8"};`;
            actionSpan.textContent = `${isOutgoing ? "→" : "←"} ${rel.label}`;

            const targetSpan = document.createElement("span");
            targetSpan.style.cssText = "font-size: 10px; color: #64748b;";
            targetSpan.textContent = isOutgoing ? `to ${otherLabel}` : `from ${otherLabel}`;

            labelCol.appendChild(actionSpan);
            labelCol.appendChild(targetSpan);
            row.appendChild(labelCol);

            // Actions buttons: Inspect (📝) & Delete (✕)
            const btnGroup = document.createElement("div");
            btnGroup.style.cssText = "display: flex; align-items: center; gap: 4px;";

            const inspectRelBtn = document.createElement("button");
            inspectRelBtn.innerHTML = "📝";
            inspectRelBtn.title = "Inspect this action";
            inspectRelBtn.style.cssText = "background: transparent; border: none; font-size: 11px; cursor: pointer; padding: 2px;";
            inspectRelBtn.addEventListener("click", () => this.openInspector(rel));
            btnGroup.appendChild(inspectRelBtn);

            const delRelBtn = document.createElement("button");
            delRelBtn.innerHTML = "✕";
            delRelBtn.title = "Delete this action";
            delRelBtn.style.cssText = "background: transparent; border: none; color: #94a3b8; font-size: 12px; cursor: pointer; padding: 2px 4px;";
            delRelBtn.addEventListener("mouseenter", () => delRelBtn.style.color = "#f43f5e");
            delRelBtn.addEventListener("mouseleave", () => delRelBtn.style.color = "#94a3b8");
            delRelBtn.addEventListener("click", async () => {
                const confirmed = await this.customConfirm(
                    `Delete action "${rel.label}"?`,
                    "Delete Action",
                    true,
                    "Delete"
                );
                if (confirmed) {
                    this.store.removeRelationship(rel.id);
                    this.renderInspectorContent();
                }
            });
            btnGroup.appendChild(delRelBtn);

            row.appendChild(btnGroup);

            // Drag event listeners
            row.addEventListener("dragstart", (e) => {
                e.dataTransfer.setData("text/plain", rel.id.toString());
                row.style.opacity = "0.5";
            });
            row.addEventListener("dragend", () => {
                row.style.opacity = "1";
            });

            return row;
        };

        // Helper to setup a drop target list container with live drag indicator
        const setupDropList = (container, isVisibleTarget) => {
            let indicator = null;

            container.addEventListener("dragover", (e) => {
                e.preventDefault();
                container.style.background = "rgba(56, 189, 248, 0.08)";

                const afterElement = getDragAfterElement(container, e.clientY);

                if (!indicator) {
                    indicator = document.createElement("div");
                    indicator.id = "drop-indicator";
                    indicator.style.cssText = "height: 2px; background: #38bdf8; border-radius: 2px; margin: 2px 0; box-shadow: 0 0 6px #38bdf8;";
                }

                if (afterElement) {
                    container.insertBefore(indicator, afterElement);
                } else {
                    container.appendChild(indicator);
                }
            });

            const clearIndicator = () => {
                container.style.background = "transparent";
                if (indicator && indicator.parentNode) {
                    indicator.parentNode.removeChild(indicator);
                    indicator = null;
                }
            };

            container.addEventListener("dragleave", (e) => {
                if (!container.contains(e.relatedTarget)) {
                    clearIndicator();
                }
            });

            container.addEventListener("drop", (e) => {
                e.preventDefault();
                const afterElement = getDragAfterElement(container, e.clientY);
                clearIndicator();

                const draggedRelId = parseInt(e.dataTransfer.getData("text/plain"), 10);
                const draggedRel = this.store.doc.relationships.find(r => r.id === draggedRelId);
                if (draggedRel) {
                    draggedRel.hidden = !isVisibleTarget;

                    const currentIndex = this.store.doc.relationships.indexOf(draggedRel);
                    this.store.doc.relationships.splice(currentIndex, 1);

                    if (afterElement && afterElement.id !== "drop-indicator") {
                        const targetId = parseInt(afterElement.dataset.relId, 10);
                        const targetIdx = this.store.doc.relationships.findIndex(r => r.id === targetId);
                        this.store.doc.relationships.splice(targetIdx, 0, draggedRel);
                    } else {
                        this.store.doc.relationships.push(draggedRel);
                    }

                    this.store.notify();
                    this.renderInspectorContent();
                }
            });
        };

        const getDragAfterElement = (container, y) => {
            const draggableElements = [...container.querySelectorAll("[data-rel-id]:not([style*='opacity: 0.5'])")];
            for (const child of draggableElements) {
                const box = child.getBoundingClientRect();
                // If cursor is above the bottom 30% of the box, place before this child
                if (y < box.top + box.height * 0.7) {
                    return child;
                }
            }
            return null;
        };

        // --- Section 1: Visible Actions (Canvas) ---
        const visHeader = document.createElement("div");
        visHeader.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-top: 4px;";
        const visTitle = document.createElement("span");
        visTitle.innerHTML = `<strong>Visible on Canvas</strong> <span style="color:#38bdf8; font-size:11px;">(${visibleRels.length})</span>`;
        visTitle.style.cssText = "font-size: 12px; color: #94a3b8;";
        visHeader.appendChild(visTitle);
        parentEl.appendChild(visHeader);

        const visContainer = document.createElement("div");
        visContainer.style.cssText = "display: flex; flex-direction: column; gap: 5px; min-height: 28px; padding: 4px; border-radius: 4px; border: 1px dashed rgba(56, 189, 248, 0.25); margin-bottom: 12px; transition: background 0.15s ease;";
        setupDropList(visContainer, true);

        if (visibleRels.length === 0) {
            const emptyMsg = document.createElement("div");
            emptyMsg.textContent = "Drop actions here to show on canvas";
            emptyMsg.style.cssText = "font-size: 11px; color: #64748b; font-style: italic; padding: 4px;";
            visContainer.appendChild(emptyMsg);
        } else {
            for (const rel of visibleRels) {
                visContainer.appendChild(createActionRow(rel, true));
            }
        }
        parentEl.appendChild(visContainer);

        // --- Section 2: Hidden Actions (Drawer Only) ---
        const hiddenHeader = document.createElement("div");
        hiddenHeader.style.cssText = "display: flex; justify-content: space-between; align-items: center;";
        const hiddenTitle = document.createElement("span");
        hiddenTitle.innerHTML = `<strong>Hidden in Drawer</strong> <span style="color:#64748b; font-size:11px;">(${hiddenRels.length})</span>`;
        hiddenTitle.style.cssText = "font-size: 12px; color: #94a3b8;";
        hiddenHeader.appendChild(hiddenTitle);
        parentEl.appendChild(hiddenHeader);

        const hiddenContainer = document.createElement("div");
        hiddenContainer.style.cssText = "display: flex; flex-direction: column; gap: 5px; min-height: 28px; padding: 4px; border-radius: 4px; border: 1px dashed rgba(100, 116, 139, 0.3); margin-bottom: 16px; transition: background 0.15s ease;";
        setupDropList(hiddenContainer, false);

        if (hiddenRels.length === 0) {
            const emptyMsg = document.createElement("div");
            emptyMsg.textContent = "Drop actions here to hide from canvas";
            emptyMsg.style.cssText = "font-size: 11px; color: #64748b; font-style: italic; padding: 4px;";
            hiddenContainer.appendChild(emptyMsg);
        } else {
            for (const rel of hiddenRels) {
                hiddenContainer.appendChild(createActionRow(rel, false));
            }
        }
        parentEl.appendChild(hiddenContainer);

        // --- Section 3: Connect to Any Bubble ---
        const searchTitle = document.createElement("span");
        searchTitle.textContent = "Connect to Any Bubble (Cross-Layer)";
        searchTitle.style.cssText = "font-size: 12px; font-weight: 600; color: #94a3b8;";
        parentEl.appendChild(searchTitle);

        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "Search name or namespace path...";
        searchInput.style.cssText = `
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid rgba(51, 65, 85, 0.8);
            border-radius: 4px;
            color: #f8fafc;
            padding: 6px 10px;
            font-size: 12px;
        `;
        parentEl.appendChild(searchInput);

        const resultsContainer = document.createElement("div");
        resultsContainer.style.cssText = "display: flex; flex-direction: column; gap: 4px; max-height: 140px; overflow-y: auto;";
        parentEl.appendChild(resultsContainer);

        const updateResults = () => {
            resultsContainer.innerHTML = "";
            const q = searchInput.value.trim().toLowerCase();
            if (!q) return;

            const matches = this.store.doc.nodes
                .filter(n => n.id !== node.id)
                .map(n => ({ node: n, ns: this.getNodeNamespace(n) }))
                .filter(item => item.ns.toLowerCase().includes(q) || item.node.label.toLowerCase().includes(q));

            for (const item of matches.slice(0, 5)) {
                const row = document.createElement("button");
                row.style.cssText = `
                    text-align: left;
                    background: rgba(30, 41, 59, 0.6);
                    border: 1px solid rgba(51, 65, 85, 0.5);
                    border-radius: 4px;
                    padding: 5px 8px;
                    color: #cbd5e1;
                    font-size: 11px;
                    cursor: pointer;
                    display: flex;
                    justify-content: space-between;
                `;
                row.innerHTML = `<span><strong>${item.node.label}</strong> <span style="color:#64748b">(${item.ns})</span></span><span style="color:#38bdf8">+ Connect</span>`;
                row.addEventListener("click", async () => {
                    const actionLabel = await this.customPrompt(`Action from "${node.label}" to "${item.node.label}":`, "action", "Create Action", "Connect");
                    if (actionLabel && actionLabel.trim()) {
                        this.store.addRelationship(node.id, item.node.id, actionLabel.trim());
                        searchInput.value = "";
                        updateResults();
                        this.renderInspectorContent();
                    }
                });

                resultsContainer.appendChild(row);
            }
        };

        searchInput.addEventListener("input", updateResults);
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
        this.pushOverlay("settings");
        this.renderSettingsContent();
    }

    closeSettings() {
        this.removeOverlay("settings");
        this.isSettingsOpen = false;
        this.recordingActionId = null;
        this.settingsDrawer.style.display = "none";
    }

    renderSettingsContent() {
        if (!this.settingsDrawer) return;
        this.settingsDrawer.innerHTML = "";

        // Header with Title, Search Bar, and Close button
        const header = document.createElement("div");
        header.style.cssText = `
            padding: 12px 16px;
            border-bottom: 1px solid rgba(51, 65, 85, 0.7);
            display: flex;
            flex-direction: column;
            gap: 10px;
            background: rgba(15, 23, 42, 0.98);
            position: sticky;
            top: 0;
            z-index: 5;
        `;

        const topRow = document.createElement("div");
        topRow.style.cssText = "display: flex; align-items: center; justify-content: space-between;";

        const title = document.createElement("h2");
        title.textContent = "Settings";
        title.style.cssText = "margin: 0; font-size: 16px; font-weight: 600; color: #f8fafc;";

        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = "✕";
        closeBtn.title = "Close Settings (Esc)";
        closeBtn.style.cssText = `
            background: transparent;
            border: none;
            color: #94a3b8;
            font-size: 16px;
            cursor: pointer;
            padding: 4px 8px;
        `;
        closeBtn.addEventListener("click", () => this.closeSettings());

        topRow.appendChild(title);
        topRow.appendChild(closeBtn);
        header.appendChild(topRow);

        // Search Filter Input
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "Search settings, shortcuts, types...";
        searchInput.value = this.settingsSearchQuery || "";
        searchInput.style.cssText = `
            width: 100%;
            box-sizing: border-box;
            background: rgba(30, 41, 59, 0.85);
            border: 1px solid rgba(51, 65, 85, 0.9);
            border-radius: 6px;
            color: #f1f5f9;
            font-size: 12px;
            padding: 7px 10px;
            outline: none;
            transition: all 0.15s ease;
        `;
        searchInput.addEventListener("focus", () => {
            searchInput.style.borderColor = "#38bdf8";
            searchInput.style.boxShadow = "0 0 10px rgba(56, 189, 248, 0.25)";
        });
        searchInput.addEventListener("blur", () => {
            searchInput.style.borderColor = "rgba(51, 65, 85, 0.9)";
            searchInput.style.boxShadow = "none";
        });
        searchInput.addEventListener("input", () => {
            this.settingsSearchQuery = searchInput.value;
            this.filterSettingsSections();
        });

        header.appendChild(searchInput);
        this.settingsDrawer.appendChild(header);

        // Body Content
        const body = document.createElement("div");
        body.id = "settings-body-container";
        body.style.cssText = "padding: 16px; display: flex; flex-direction: column; gap: 24px;";

        // 1. Preferences Section
        const prefPanel = this.createPreferencesPanel();
        prefPanel.setAttribute("data-settings-section", "preferences");
        body.appendChild(prefPanel);

        // 2. Keybindings Section
        const keyPanel = this.createKeybindingsPanel();
        keyPanel.setAttribute("data-settings-section", "keybindings");
        body.appendChild(keyPanel);

        // 3. Custom Scalar Types Section
        const typesPanel = this.createScalarTypesPanel();
        typesPanel.setAttribute("data-settings-section", "types");
        body.appendChild(typesPanel);

        // 4. Import / Export Data Section
        const ioPanel = this.createImportExportPanel();
        ioPanel.setAttribute("data-settings-section", "importexport");
        body.appendChild(ioPanel);

        // 5. Storage / Reset Section
        const storagePanel = this.createStoragePanel();
        storagePanel.setAttribute("data-settings-section", "storage");
        body.appendChild(storagePanel);

        this.settingsDrawer.appendChild(body);

        if (this.settingsSearchQuery) {
            this.filterSettingsSections();
        }
    }

    /**
     * Filter settings sections and items according to settingsSearchQuery.
     */
    filterSettingsSections() {
        const query = (this.settingsSearchQuery || "").trim().toLowerCase();
        if (!this.settingsDrawer) return;

        const body = this.settingsDrawer.querySelector("#settings-body-container");
        if (!body) return;

        const sections = body.querySelectorAll("[data-settings-section]");
        let anyVisible = false;

        for (const section of sections) {
            // For keybindings section, filter individual cards as well
            if (section.getAttribute("data-settings-section") === "keybindings") {
                const cards = section.querySelectorAll("[data-action-card]");
                let matchedCardCount = 0;
                for (const card of cards) {
                    const text = (card.textContent || "").toLowerCase();
                    const match = !query || text.includes(query);
                    card.style.display = match ? "flex" : "none";
                    if (match) matchedCardCount++;
                }
                const sectionText = (section.querySelector("h3")?.textContent || "").toLowerCase();
                const sectionMatches = !query || sectionText.includes(query) || matchedCardCount > 0;
                section.style.display = sectionMatches ? "block" : "none";
                if (sectionMatches) anyVisible = true;
            } else {
                // For other sections, search their full text content
                const text = (section.textContent || "").toLowerCase();
                const match = !query || text.includes(query);
                section.style.display = match ? "block" : "none";
                if (match) anyVisible = true;
            }
        }

        // Empty state message
        let emptyMsg = body.querySelector("#settings-search-empty");
        if (!anyVisible && query) {
            if (!emptyMsg) {
                emptyMsg = document.createElement("div");
                emptyMsg.id = "settings-search-empty";
                emptyMsg.style.cssText = "text-align: center; color: #64748b; font-size: 13px; padding: 30px 10px;";
                body.appendChild(emptyMsg);
            }
            emptyMsg.innerHTML = `No settings found matching <strong style="color: #94a3b8;">"${query}"</strong>`;
            emptyMsg.style.display = "block";
        } else if (emptyMsg) {
            emptyMsg.style.display = "none";
        }
    }


    createPreferencesPanel() {
        const panel = document.createElement("div");

        const title = document.createElement("h3");
        title.textContent = "Inspector Behavior";
        title.style.cssText = "margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #38bdf8;";
        panel.appendChild(title);

        const list = document.createElement("div");
        list.style.cssText = "display: flex; flex-direction: column; gap: 8px;";

        // Toggle 1: Auto-open on focus
        const row1 = document.createElement("label");
        row1.style.cssText = "display: flex; align-items: center; gap: 8px; font-size: 13px; color: #e2e8f0; cursor: pointer;";
        const cb1 = document.createElement("input");
        cb1.type = "checkbox";
        cb1.checked = this.autoOpenInspector;
        cb1.style.cursor = "pointer";
        cb1.addEventListener("change", () => {
            this.autoOpenInspector = cb1.checked;
            this.saveSettings();
        });
        row1.appendChild(cb1);
        const span1 = document.createElement("span");
        span1.textContent = "Auto-open inspector on entity focus";
        row1.appendChild(span1);
        list.appendChild(row1);

        // Toggle 2: Auto-close on unfocus
        const row2 = document.createElement("label");
        row2.style.cssText = "display: flex; align-items: center; gap: 8px; font-size: 13px; color: #e2e8f0; cursor: pointer;";
        const cb2 = document.createElement("input");
        cb2.type = "checkbox";
        cb2.checked = this.autoCloseInspector;
        cb2.style.cursor = "pointer";
        cb2.addEventListener("change", () => {
            this.autoCloseInspector = cb2.checked;
            this.saveSettings();
        });
        row2.appendChild(cb2);
        const span2 = document.createElement("span");
        span2.textContent = "Auto-close inspector on canvas click (unfocus)";
        row2.appendChild(span2);
        list.appendChild(row2);

        // Setting 3: Drag Deadzone / Threshold Slider
        const row3 = document.createElement("div");
        row3.style.cssText = "display: flex; flex-direction: column; gap: 4px; margin-top: 6px;";
        const row3Header = document.createElement("div");
        row3Header.style.cssText = "display: flex; justify-content: space-between; font-size: 13px; color: #e2e8f0;";
        const row3Title = document.createElement("span");
        row3Title.textContent = "Drag Deadzone / Threshold:";
        const row3Val = document.createElement("span");
        row3Val.textContent = `${this.canvasView.dragThreshold}px`;
        row3Val.style.color = "#38bdf8";
        row3Val.style.fontWeight = "600";
        row3Header.appendChild(row3Title);
        row3Header.appendChild(row3Val);
        row3.appendChild(row3Header);

        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = "5";
        slider.max = "60";
        slider.value = this.canvasView.dragThreshold.toString();
        slider.style.cssText = "cursor: pointer; width: 100%; accent-color: #38bdf8;";
        slider.addEventListener("input", () => {
            this.canvasView.dragThreshold = parseInt(slider.value, 10);
            row3Val.textContent = `${this.canvasView.dragThreshold}px`;
        });
        slider.addEventListener("change", () => {
            this.saveSettings();
        });
        row3.appendChild(slider);
        list.appendChild(row3);

        // Setting 4: Always Snap to Grid Checkbox
        const row4 = document.createElement("label");
        row4.style.cssText = "display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: #e2e8f0; margin-top: 4px;";
        const check4 = document.createElement("input");
        check4.type = "checkbox";
        check4.checked = this.canvasView.alwaysSnapToGrid;
        check4.style.cursor = "pointer";
        check4.addEventListener("change", () => {
            this.canvasView.alwaysSnapToGrid = check4.checked;
            this.saveSettings();
        });
        const span4 = document.createElement("span");
        span4.textContent = "Always snap to grid (hold Shift to drag freeform)";
        row4.appendChild(check4);
        row4.appendChild(span4);
        list.appendChild(row4);

        // Setting 5: Snap Grid Size Slider
        const row5 = document.createElement("div");
        row5.style.cssText = "display: flex; flex-direction: column; gap: 4px; margin-top: 6px;";
        const row5Header = document.createElement("div");
        row5Header.style.cssText = "display: flex; justify-content: space-between; font-size: 13px; color: #e2e8f0;";
        const row5Title = document.createElement("span");
        row5Title.textContent = "Snap Grid Size:";
        const row5Val = document.createElement("span");
        row5Val.textContent = `${this.canvasView.snapGridSize}px`;
        row5Val.style.color = "#38bdf8";
        row5Val.style.fontWeight = "600";
        row5Header.appendChild(row5Title);
        row5Header.appendChild(row5Val);
        row5.appendChild(row5Header);

        const slider5 = document.createElement("input");
        slider5.type = "range";
        slider5.min = "10";
        slider5.max = "80";
        slider5.step = "10";
        slider5.value = this.canvasView.snapGridSize.toString();
        slider5.style.cssText = "cursor: pointer; width: 100%; accent-color: #38bdf8;";
        slider5.addEventListener("input", () => {
            this.canvasView.snapGridSize = parseInt(slider5.value, 10);
            row5Val.textContent = `${this.canvasView.snapGridSize}px`;
        });
        slider5.addEventListener("change", () => {
            this.saveSettings();
        });
        row5.appendChild(slider5);
        list.appendChild(row5);

        panel.appendChild(list);
        return panel;
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
            this.saveSettings();
            this.renderSettingsContent();
        });
        headerRow.appendChild(restoreBtn);
        panel.appendChild(headerRow);

        // Build inverted map: actionId -> trigger list
        const actionToTriggers = new Map();
        for (const [trigger, val] of this.actionRegistry.bindings.entries()) {
            const actionIds = Array.isArray(val) ? val : [val];
            for (const actionId of actionIds) {
                if (!actionToTriggers.has(actionId)) actionToTriggers.set(actionId, []);
                actionToTriggers.get(actionId).push(trigger);
            }
        }
        const conflicts = this.actionRegistry.detectConflicts();

        const cardsContainer = document.createElement("div");
        cardsContainer.style.cssText = "display: flex; flex-direction: column; gap: 12px;";

        const interactionOptions = [
            { label: "Double-click Node", value: "node:dblclick" },
            { label: "Click Node", value: "node:click" },
            { label: "Double-click Action", value: "relationship:dblclick" },
            { label: "Click Action", value: "relationship:click" },
            { label: "Double-click Canvas", value: "canvas:dblclick" },
            { label: "Click Canvas", value: "canvas:click" }
        ];

        const actions = this.actionRegistry.getAllActions();
        for (const action of actions) {
            const card = document.createElement("div");
            card.setAttribute("data-action-card", action.id);
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
            actionName.title = action.description || action.title;
            actionName.style.cssText = "font-size: 13px; font-weight: 600; color: #f1f5f9; cursor: help;";

            const actionDesc = document.createElement("div");
            actionDesc.textContent = action.description || "";
            actionDesc.title = action.description || "";
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
                const hasConflict = conflicts.has(trigger);
                const otherTitles = hasConflict ? conflicts.get(trigger).filter(t => t !== action.title) : [];

                const row = document.createElement("div");
                row.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: ${hasConflict ? "rgba(251, 191, 36, 0.08)" : "rgba(15, 23, 42, 0.7)"};
                    border: 1px solid ${hasConflict ? "rgba(251, 191, 36, 0.4)" : "rgba(51, 65, 85, 0.4)"};
                    border-radius: 4px;
                    padding: 4px 8px;
                `;

                const leftBadgeBox = document.createElement("div");
                leftBadgeBox.style.cssText = "display: flex; align-items: center; gap: 6px;";

                const isGesture = trigger.includes(":");
                const isSequence = trigger.includes(" ") || trigger.includes(" > ");
                const triggerBadge = document.createElement("span");
                if (isGesture) {
                    triggerBadge.textContent = interactionOptions.find(o => o.value === trigger)?.label || trigger;
                } else if (isSequence) {
                    const steps = ActionRegistry.splitTrigger(trigger).map(s => s.startsWith("Key") ? s.slice(3) : s);
                    triggerBadge.textContent = steps.join(" ➔ ");
                } else {
                    triggerBadge.textContent = trigger;
                }
                triggerBadge.style.cssText = `
                    font-family: ${isGesture ? "system-ui" : "monospace"};
                    font-size: 12px;
                    font-weight: 600;
                    color: ${hasConflict ? "#fde047" : (isGesture ? "#fbbf24" : (isSequence ? "#a78bfa" : "#38bdf8"))};
                `;
                leftBadgeBox.appendChild(triggerBadge);

                if (otherTitles.length > 0) {
                    const conflictTag = document.createElement("span");
                    conflictTag.textContent = `⚠️ Shared with ${otherTitles.join(", ")}`;
                    conflictTag.title = `This shortcut is shared with: ${otherTitles.join(", ")}. It will run whichever action is enabled in the current context.`;
                    conflictTag.style.cssText = `
                        font-size: 10px;
                        background: rgba(251, 191, 36, 0.15);
                        border: 1px solid rgba(251, 191, 36, 0.4);
                        color: #fde047;
                        padding: 2px 6px;
                        border-radius: 4px;
                    `;
                    leftBadgeBox.appendChild(conflictTag);
                }
                row.appendChild(leftBadgeBox);

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
                    this.actionRegistry.unbind(trigger, action.id);
                    this.saveSettings();
                    this.renderSettingsContent();
                });
                row.appendChild(delBtn);

                triggerList.appendChild(row);
            }
            card.appendChild(triggerList);

            // Add Keybind Row / Options
            const addRow = document.createElement("div");
            addRow.style.cssText = "display: flex; gap: 6px; margin-top: 4px;";

            const isRecordingKey = this.recordingActionId === `${action.id}:key`;
            const isRecordingSeq = this.recordingActionId === `${action.id}:seq`;

            // Detect Key / Combo button
            const recordBtn = document.createElement("button");
            recordBtn.textContent = isRecordingKey ? "Press key..." : "+ Key / Combo";
            recordBtn.title = "Record a single key or modifier combo (e.g. KeyE, Ctrl+KeyK, Shift+KeyI)";
            recordBtn.style.cssText = `
                flex: 1;
                background: ${isRecordingKey ? "#e0f2fe" : "rgba(2, 132, 199, 0.2)"};
                color: ${isRecordingKey ? "#0369a1" : "#38bdf8"};
                border: 1px solid ${isRecordingKey ? "#38bdf8" : "rgba(56, 189, 248, 0.4)"};
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 11px;
                font-weight: 500;
                cursor: pointer;
            `;

            recordBtn.addEventListener("click", () => {
                this.recordingActionId = `${action.id}:key`;
                this.renderSettingsContent();

                const heldKeys = new Set();

                const onKeyDown = (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    if (e.key === "Escape") {
                        cleanup();
                        return;
                    }

                    if (e.ctrlKey) heldKeys.add("Ctrl");
                    if (e.altKey) heldKeys.add("Alt");
                    if (e.shiftKey) heldKeys.add("Shift");
                    if (e.metaKey) heldKeys.add("Meta");

                    const code = e.code;
                    const isModifier = ["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(code);
                    if (!isModifier) {
                        const keyName = code.startsWith("Key") ? code : (code === "Space" ? "Space" : (code.startsWith("Digit") ? code : e.key));
                        heldKeys.add(keyName);
                    } else {
                        if (code.startsWith("Shift")) heldKeys.add("Shift");
                        else if (code.startsWith("Control")) heldKeys.add("Ctrl");
                        else if (code.startsWith("Alt")) heldKeys.add("Alt");
                        else if (code.startsWith("Meta")) heldKeys.add("Meta");
                    }

                    recordBtn.textContent = Array.from(heldKeys).join("+") + "...";
                };

                const onKeyUp = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    cleanup();

                    const order = ["Ctrl", "Alt", "Shift", "Meta"];
                    const modifiers = order.filter(m => heldKeys.has(m));
                    const normalKeys = Array.from(heldKeys).filter(k => !order.includes(k));
                    const parts = [...modifiers, ...normalKeys];

                    if (parts.length > 0) {
                        const newTrigger = parts.join("+");
                        this.actionRegistry.bind(newTrigger, action.id);
                        this.saveSettings();
                    }

                    this.recordingActionId = null;
                    this.renderSettingsContent();
                };

                const cleanup = () => {
                    window.removeEventListener("keydown", onKeyDown, true);
                    window.removeEventListener("keyup", onKeyUp, true);
                    this.recordingActionId = null;
                    this.renderSettingsContent();
                };

                window.addEventListener("keydown", onKeyDown, true);
                window.addEventListener("keyup", onKeyUp, true);
            });
            addRow.appendChild(recordBtn);

            // Record Sequence (Leader Key) button
            const recordSeqBtn = document.createElement("button");
            recordSeqBtn.textContent = isRecordingSeq ? "Type keys... (Enter done)" : "+ Sequence";
            recordSeqBtn.title = "Record sequential key presses (e.g. B then N -> B ➔ N). Press Enter to finish or Esc to cancel.";
            recordSeqBtn.style.cssText = `
                flex: 1;
                background: ${isRecordingSeq ? "#f3e8ff" : "rgba(168, 85, 247, 0.2)"};
                color: ${isRecordingSeq ? "#7e22ce" : "#c084fc"};
                border: 1px solid ${isRecordingSeq ? "#c084fc" : "rgba(168, 85, 247, 0.4)"};
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 11px;
                font-weight: 500;
                cursor: pointer;
            `;

            recordSeqBtn.addEventListener("click", () => {
                this.recordingActionId = `${action.id}:seq`;
                this.renderSettingsContent();

                const recordedSteps = [];

                const onSeqKeyDown = (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    if (e.key === "Escape") {
                        cleanupSeq();
                        return;
                    }

                    if (e.key === "Enter") {
                        cleanupSeq();
                        if (recordedSteps.length > 0) {
                            const newTrigger = recordedSteps.join(" ");
                            this.actionRegistry.bind(newTrigger, action.id);
                            this.saveSettings();
                        }
                        this.recordingActionId = null;
                        this.renderSettingsContent();
                        return;
                    }

                    const code = e.code;
                    const isModifier = ["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(code);
                    if (!isModifier) {
                        const stepName = code.startsWith("Key") ? code : (code === "Space" ? "Space" : (code.startsWith("Digit") ? code : e.key));
                        recordedSteps.push(stepName);
                        const displaySteps = recordedSteps.map(s => s.startsWith("Key") ? s.slice(3) : s).join(" ➔ ");
                        recordSeqBtn.textContent = `${displaySteps} (Enter to finish)`;
                    }
                };

                const cleanupSeq = () => {
                    window.removeEventListener("keydown", onSeqKeyDown, true);
                    this.recordingActionId = null;
                    this.renderSettingsContent();
                };

                window.addEventListener("keydown", onSeqKeyDown, true);
            });
            addRow.appendChild(recordSeqBtn);


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
                        this.saveSettings();
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

    createImportExportPanel() {
        const panel = document.createElement("div");

        const title = document.createElement("h3");
        title.textContent = "Import & Export";
        title.style.cssText = "margin: 0 0 6px 0; font-size: 14px; font-weight: 600; color: #38bdf8;";
        panel.appendChild(title);

        const desc = document.createElement("p");
        desc.textContent = "Backup, share, or import project documents via JSON file or token-lean outline text:";
        desc.style.cssText = "margin: 0 0 10px 0; font-size: 12px; color: #94a3b8;";
        panel.appendChild(desc);

        const grid = document.createElement("div");
        grid.style.cssText = "display: grid; grid-template-columns: 1fr 1fr; gap: 8px;";

        const btnStyle = `
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(51, 65, 85, 0.8);
            border-radius: 6px;
            color: #cbd5e1;
            font-size: 12px;
            font-weight: 500;
            padding: 8px 10px;
            cursor: pointer;
            transition: all 0.15s ease;
        `;

        // 1. Export JSON button
        const exportJsonBtn = document.createElement("button");
        exportJsonBtn.innerHTML = "💾 Export JSON";
        exportJsonBtn.title = "Download full project document as a .json file";
        exportJsonBtn.style.cssText = btnStyle;
        exportJsonBtn.addEventListener("mouseenter", () => exportJsonBtn.style.background = "rgba(56, 189, 248, 0.15)");
        exportJsonBtn.addEventListener("mouseleave", () => exportJsonBtn.style.background = "rgba(30, 41, 59, 0.8)");
        exportJsonBtn.addEventListener("click", () => this.downloadJsonFile());
        grid.appendChild(exportJsonBtn);

        // 2. Import JSON button
        const importJsonBtn = document.createElement("button");
        importJsonBtn.innerHTML = "📂 Import JSON";
        importJsonBtn.title = "Load project document from a .json file";
        importJsonBtn.style.cssText = btnStyle;
        importJsonBtn.addEventListener("mouseenter", () => importJsonBtn.style.background = "rgba(56, 189, 248, 0.15)");
        importJsonBtn.addEventListener("mouseleave", () => importJsonBtn.style.background = "rgba(30, 41, 59, 0.8)");
        importJsonBtn.addEventListener("click", () => this.triggerJsonFileInput());
        grid.appendChild(importJsonBtn);

        // 3. Export Outline button
        const exportOutlineBtn = document.createElement("button");
        exportOutlineBtn.innerHTML = "📋 Export Outline";
        exportOutlineBtn.title = "View or copy tab-indented hierarchical outline";
        exportOutlineBtn.style.cssText = btnStyle;
        exportOutlineBtn.addEventListener("mouseenter", () => exportOutlineBtn.style.background = "rgba(168, 85, 247, 0.15)");
        exportOutlineBtn.addEventListener("mouseleave", () => exportOutlineBtn.style.background = "rgba(30, 41, 59, 0.8)");
        exportOutlineBtn.addEventListener("click", () => this.openExportOutlineModal());
        grid.appendChild(exportOutlineBtn);

        // 4. Export Markdown (Doc/AI) button
        const exportMarkdownBtn = document.createElement("button");
        exportMarkdownBtn.innerHTML = "📝 Export Markdown (Doc/AI)";
        exportMarkdownBtn.title = "Export full namespaced system documentation and method signatures for AI ingestion";
        exportMarkdownBtn.style.cssText = btnStyle;
        exportMarkdownBtn.addEventListener("mouseenter", () => exportMarkdownBtn.style.background = "rgba(16, 185, 129, 0.15)");
        exportMarkdownBtn.addEventListener("mouseleave", () => exportMarkdownBtn.style.background = "rgba(30, 41, 59, 0.8)");
        exportMarkdownBtn.addEventListener("click", () => this.openExportMarkdownModal());
        grid.appendChild(exportMarkdownBtn);

        panel.appendChild(grid);
        return panel;
    }

    /**
     * Download the active project document as a .json file.
     */
    downloadJsonFile() {
        const jsonStr = this.store.exportJson();
        const safeName = (this.store.projectName || "project").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeName}.bubbles.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Open native file picker to import a .json document into active project.
     */
    triggerJsonFileInput() {
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".json,application/json";
        fileInput.style.display = "none";
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const content = evt.target.result;
                    this.store.importJson(content);
                    if (this.camera) {
                        this.camera.fitToNodes(this.store.getVisibleNodes());
                    }
                    await this.customAlert("Project document imported successfully!", "Import Complete");
                } catch (err) {
                    await this.customAlert("Failed to parse JSON file: " + err.message, "Import Error");
                }
            };
            reader.readAsText(file);
        });
        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);
    }

    /**
     * Open interactive Outline Export modal.
     */
    openExportOutlineModal() {
        if (!this.importExportModal) return;
        this.isImportExportModalOpen = true;
        this.pushOverlay("importExport");
        this.importExportModal.style.display = "flex";
        this.importExportModal.innerHTML = "";

        // Modal Header
        const header = document.createElement("div");
        header.style.cssText = "display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(51, 65, 85, 0.8); padding-bottom: 8px;";

        const title = document.createElement("h3");
        title.textContent = "📋 Export Project Outline";
        title.style.cssText = "margin: 0; font-size: 15px; font-weight: 600; color: #f1f5f9;";
        header.appendChild(title);

        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = "✕";
        closeBtn.style.cssText = "background: transparent; border: none; color: #94a3b8; font-size: 16px; cursor: pointer; padding: 2px 6px;";
        closeBtn.addEventListener("click", () => this.closeImportExportModal());
        header.appendChild(closeBtn);
        this.importExportModal.appendChild(header);

        // Description
        const desc = document.createElement("p");
        desc.style.cssText = "margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.4;";
        desc.textContent = "Token-lean tab-indented hierarchy of all bubbles, custom properties, and directional connections. Copy or save to use with LLMs or notes.";
        this.importExportModal.appendChild(desc);

        // Textarea
        const textarea = document.createElement("textarea");
        textarea.style.cssText = `
            flex: 1;
            min-height: 240px;
            background: rgba(15, 23, 42, 0.95);
            border: 1px solid rgba(51, 65, 85, 0.9);
            border-radius: 6px;
            color: #e2e8f0;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 12px;
            line-height: 1.5;
            padding: 10px;
            resize: vertical;
            outline: none;
            tab-size: 4;
        `;
        textarea.value = this.store.exportOutline();
        textarea.readOnly = true;
        this.importExportModal.appendChild(textarea);

        // Footer Actions
        const footer = document.createElement("div");
        footer.style.cssText = "display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 4px;";

        const copyBtn = document.createElement("button");
        copyBtn.textContent = "📋 Copy to Clipboard";
        copyBtn.style.cssText = `
            background: rgba(56, 189, 248, 0.2);
            border: 1px solid rgba(56, 189, 248, 0.5);
            color: #38bdf8;
            border-radius: 6px;
            padding: 6px 14px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
        `;
        copyBtn.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(textarea.value);
                copyBtn.textContent = "✓ Copied!";
                setTimeout(() => { copyBtn.textContent = "📋 Copy to Clipboard"; }, 1500);
            } catch {
                textarea.select();
                document.execCommand("copy");
                copyBtn.textContent = "✓ Copied!";
                setTimeout(() => { copyBtn.textContent = "📋 Copy to Clipboard"; }, 1500);
            }
        });
        footer.appendChild(copyBtn);

        const downloadOutlineBtn = document.createElement("button");
        downloadOutlineBtn.textContent = "💾 Download .txt";
        downloadOutlineBtn.style.cssText = `
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(51, 65, 85, 0.8);
            color: #cbd5e1;
            border-radius: 6px;
            padding: 6px 14px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
        `;
        downloadOutlineBtn.addEventListener("click", () => {
            const safeName = (this.store.projectName || "project").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
            const blob = new Blob([textarea.value], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${safeName}-outline.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
        footer.appendChild(downloadOutlineBtn);

        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "Close";
        cancelBtn.style.cssText = `
            background: transparent;
            border: 1px solid rgba(51, 65, 85, 0.8);
            color: #94a3b8;
            border-radius: 6px;
            padding: 6px 12px;
            font-size: 12px;
            cursor: pointer;
        `;
        cancelBtn.addEventListener("click", () => this.closeImportExportModal());
        footer.appendChild(cancelBtn);

        this.importExportModal.appendChild(footer);
        setTimeout(() => textarea.focus(), 30);
    }

    /**
     * Open interactive Markdown Documentation Export modal.
     */
    openExportMarkdownModal() {
        if (!this.importExportModal) return;
        this.isImportExportModalOpen = true;
        this.pushOverlay("importExport");
        this.importExportModal.style.display = "flex";
        this.importExportModal.innerHTML = "";

        // Modal Header
        const header = document.createElement("div");
        header.style.cssText = "display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(51, 65, 85, 0.8); padding-bottom: 8px;";

        const title = document.createElement("h3");
        title.textContent = "📝 Export Markdown Documentation (AI Ingestion)";
        title.style.cssText = "margin: 0; font-size: 15px; font-weight: 600; color: #f1f5f9;";
        header.appendChild(title);

        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = "✕";
        closeBtn.style.cssText = "background: transparent; border: none; color: #94a3b8; font-size: 16px; cursor: pointer; padding: 2px 6px;";
        closeBtn.addEventListener("click", () => this.closeImportExportModal());
        header.appendChild(closeBtn);
        this.importExportModal.appendChild(header);

        // Description
        const desc = document.createElement("p");
        desc.style.cssText = "margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.4;";
        desc.textContent = "Complete namespaced system documentation with typed method signatures, properties, and relationships. Optimized for AI prompts, technical specs, and Markdown viewers.";
        this.importExportModal.appendChild(desc);

        // Textarea
        const textarea = document.createElement("textarea");
        textarea.style.cssText = `
            flex: 1;
            min-height: 260px;
            background: rgba(15, 23, 42, 0.95);
            border: 1px solid rgba(51, 65, 85, 0.9);
            border-radius: 6px;
            color: #e2e8f0;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 12px;
            line-height: 1.5;
            padding: 10px;
            resize: vertical;
            outline: none;
            tab-size: 4;
        `;
        textarea.value = this.store.exportMarkdown();
        textarea.readOnly = true;
        this.importExportModal.appendChild(textarea);

        // Footer Actions
        const footer = document.createElement("div");
        footer.style.cssText = "display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 4px;";

        const copyBtn = document.createElement("button");
        copyBtn.textContent = "📋 Copy to Clipboard";
        copyBtn.style.cssText = `
            background: rgba(16, 185, 129, 0.2);
            border: 1px solid rgba(16, 185, 129, 0.5);
            color: #34d399;
            border-radius: 6px;
            padding: 6px 14px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
        `;
        copyBtn.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(textarea.value);
                copyBtn.textContent = "✓ Copied!";
                setTimeout(() => { copyBtn.textContent = "📋 Copy to Clipboard"; }, 1500);
            } catch {
                textarea.select();
                document.execCommand("copy");
                copyBtn.textContent = "✓ Copied!";
                setTimeout(() => { copyBtn.textContent = "📋 Copy to Clipboard"; }, 1500);
            }
        });
        footer.appendChild(copyBtn);

        const downloadMdBtn = document.createElement("button");
        downloadMdBtn.textContent = "💾 Download .md";
        downloadMdBtn.style.cssText = `
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(51, 65, 85, 0.8);
            color: #cbd5e1;
            border-radius: 6px;
            padding: 6px 14px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
        `;
        downloadMdBtn.addEventListener("click", () => {
            const safeName = (this.store.projectName || "project").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
            const blob = new Blob([textarea.value], { type: "text/markdown" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${safeName}-architecture.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
        footer.appendChild(downloadMdBtn);

        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "Close";
        cancelBtn.style.cssText = `
            background: transparent;
            border: 1px solid rgba(51, 65, 85, 0.8);
            color: #94a3b8;
            border-radius: 6px;
            padding: 6px 12px;
            font-size: 12px;
            cursor: pointer;
        `;
        cancelBtn.addEventListener("click", () => this.closeImportExportModal());
        footer.appendChild(cancelBtn);

        this.importExportModal.appendChild(footer);
        setTimeout(() => textarea.focus(), 30);
    }

    /** Compatibility alias */
    openImportExportModal(mode = "export") {
        this.openExportOutlineModal();
    }

    /** Close interactive Outline Import/Export modal */
    closeImportExportModal() {
        this.isImportExportModalOpen = false;
        this.removeOverlay("importExport");
        if (this.importExportModal) {
            this.importExportModal.style.display = "none";
        }
    }

    createStoragePanel() {

        const panel = document.createElement("div");
        panel.style.cssText = "border: 1px solid rgba(225, 29, 72, 0.4); border-radius: 6px; padding: 12px; background: rgba(225, 29, 72, 0.05);";

        const title = document.createElement("h3");
        title.textContent = "Danger Zone / Factory Reset";
        title.style.cssText = "margin: 0 0 6px 0; font-size: 14px; font-weight: 600; color: #fb7185;";
        panel.appendChild(title);

        const desc = document.createElement("p");
        desc.innerHTML = "<strong style='color: #f87171;'>Warning:</strong> Factory Reset permanently deletes <strong>ALL projects</strong>, custom types, keybindings, and stored view states across the entire application.";
        desc.style.cssText = "margin: 0 0 12px 0; font-size: 12px; color: #94a3b8; line-height: 1.4;";
        panel.appendChild(desc);

        const resetBtn = document.createElement("button");
        resetBtn.textContent = "⚠️ Factory Reset: Clear All Projects & Storage";
        resetBtn.style.cssText = `
            background: rgba(225, 29, 72, 0.2);
            border: 1px solid rgba(225, 29, 72, 0.6);
            color: #fda4af;
            border-radius: 6px;
            padding: 8px 14px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
        `;
        resetBtn.addEventListener("mouseenter", () => {
            resetBtn.style.background = "rgba(225, 29, 72, 0.35)";
        });
        resetBtn.addEventListener("mouseleave", () => {
            resetBtn.style.background = "rgba(225, 29, 72, 0.2)";
        });
        resetBtn.addEventListener("click", async () => {
            const confirmed = await this.customConfirm(
                "DANGER: Factory Reset will permanently delete ALL projects, all bubbles, all custom keybindings, and all local storage.\n\nAre you sure you want to proceed?",
                "Factory Reset",
                true,
                "Reset Everything"
            );
            if (confirmed) {
                if (this.store && this.store.db) {
                    await this.store.db.clear();
                }
                location.reload();
            }
        });


        panel.appendChild(resetBtn);
        return panel;
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

    // --- Quick Guide Modal ---

    toggleGuideModal() {
        if (this.isGuideModalOpen) {
            this.closeGuideModal();
        } else {
            this.openGuideModal();
        }
    }

    openGuideModal() {
        if (!this.guideModal) return;
        this.isGuideModalOpen = true;
        this.pushOverlay("guide");
        this.guideModal.style.display = "flex";
        this.renderGuideModal();
    }

    closeGuideModal() {
        this.isGuideModalOpen = false;
        this.removeOverlay("guide");
        if (this.guideModal) {
            this.guideModal.style.display = "none";
        }
    }

    renderGuideModal() {
        if (!this.guideModal) return;
        this.guideModal.innerHTML = "";

        // Header
        const header = document.createElement("div");
        header.style.cssText = "display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(51, 65, 85, 0.8); padding-bottom: 10px;";

        const title = document.createElement("h2");
        title.innerHTML = "❓ Quick Guide & Fundamentals";
        title.style.cssText = "margin: 0; font-size: 16px; font-weight: 700; color: #f8fafc;";

        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = "✕";
        closeBtn.title = "Close Guide (Esc)";
        closeBtn.style.cssText = "background: transparent; border: none; color: #94a3b8; font-size: 16px; cursor: pointer; padding: 4px 8px;";
        closeBtn.addEventListener("click", () => this.closeGuideModal());

        header.appendChild(title);
        header.appendChild(closeBtn);
        this.guideModal.appendChild(header);

        // Content
        const content = document.createElement("div");
        content.style.cssText = "display: flex; flex-direction: column; gap: 16px; font-size: 13px; color: #cbd5e1; line-height: 1.5;";

        // Section 1: Core Concepts
        const sec1 = document.createElement("div");
        sec1.innerHTML = `
            <h3 style="margin: 0 0 6px 0; font-size: 14px; font-weight: 600; color: #38bdf8;">1. Hierarchical Bubbles</h3>
            <p style="margin: 0 0 8px 0; color: #94a3b8;">
                Bubbles represent entities or sub-systems. Any bubble can contain its own isolated layer of child bubbles.
            </p>
            <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(51, 65, 85, 0.6); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
                <div>• <strong style="color: #f1f5f9;">Create Bubble:</strong> Double-click empty canvas</div>
                <div>• <strong style="color: #f1f5f9;">Enter Sub-Layer:</strong> Double-click any bubble node</div>
                <div>• <strong style="color: #f1f5f9;">Leave Sub-Layer:</strong> Press <kbd style="background: #1e293b; padding: 1px 5px; border-radius: 4px; border: 1px solid #475569;">Esc</kbd> or click breadcrumbs up top</div>
                <div>• <strong style="color: #f1f5f9;">Jump Directly:</strong> Click <strong style="color: #38bdf8;">🔍 Jump</strong> to search and jump to any layer instantly</div>
            </div>
        `;
        content.appendChild(sec1);

        // Section 2: Directional Actions / Connections
        const sec2 = document.createElement("div");
        sec2.innerHTML = `
            <h3 style="margin: 0 0 6px 0; font-size: 14px; font-weight: 600; color: #38bdf8;">2. Directional Connections</h3>
            <p style="margin: 0 0 8px 0; color: #94a3b8;">
                Hover over any bubble to reveal its floating handles on the right edge:
            </p>
            <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(51, 65, 85, 0.6); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
                <div>• <strong style="color: #f1f5f9;">Drag ⚡ handle:</strong> Drag from one bubble to another to establish a directional relationship</div>
                <div>• <strong style="color: #f1f5f9;">Click {} handle:</strong> Opens property quick-filter card for that bubble</div>
                <div>• <strong style="color: #f1f5f9;">Hold Shift:</strong> Snaps dragged bubbles to the grid interval</div>
            </div>
        `;
        content.appendChild(sec2);

        // Section 3: Navigation & Palettes
        const sec3 = document.createElement("div");
        sec3.innerHTML = `
            <h3 style="margin: 0 0 6px 0; font-size: 14px; font-weight: 600; color: #38bdf8;">3. Productivity Tools</h3>
            <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(51, 65, 85, 0.6); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
                <div>• <strong style="color: #f1f5f9;">⚡ Actions Palette:</strong> Search and run all editor commands instantly</div>
                <div>• <strong style="color: #f1f5f9;">⚙️ Settings:</strong> Custom keybindings, custom data types, grid snapping, and data import/export</div>
                <div>• <strong style="color: #f1f5f9;">📁 Projects Dropdown:</strong> Switch, create, duplicate, rename, or delete projects</div>
            </div>
        `;
        content.appendChild(sec3);

        // Footer notice
        const notice = document.createElement("div");
        notice.style.cssText = "background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; padding: 10px; font-size: 12px; color: #6ee7b7;";
        notice.innerHTML = `💡 <em>Tip:</em> To browse or rebind all keyboard shortcuts, open the <strong style="color: #f1f5f9; cursor: pointer; text-decoration: underline;" id="guide-open-settings">Settings Drawer</strong>.`;
        content.appendChild(notice);

        const openSettingsLink = notice.querySelector("#guide-open-settings");
        if (openSettingsLink) {
            openSettingsLink.addEventListener("click", () => {
                this.closeGuideModal();
                this.openSettings();
            });
        }

        this.guideModal.appendChild(content);
    }

    // --- Custom Alert / Confirm / Prompt Dialog ---

    /**
     * Show custom modal dialog with styled UI.
     * @param {Object} options
     * @param {string} options.title - Dialog title
     * @param {string} options.message - Body text / question
     * @param {"alert"|"confirm"|"prompt"} options.type - Dialog type
     * @param {string} [options.defaultValue] - Default text for prompt
     * @param {string} [options.confirmText] - Label for confirm button
     * @param {string} [options.cancelText] - Label for cancel button
     * @param {boolean} [options.isDanger] - Danger styling for confirm button
     * @returns {Promise<any>}
     */
    openDialog(options) {
        return new Promise((resolve) => {
            if (!this.dialogModal) return resolve(null);

            const {
                title = "Notice",
                message = "",
                type = "alert",
                defaultValue = "",
                confirmText = "OK",
                cancelText = "Cancel",
                isDanger = false
            } = options;

            this.isDialogOpen = true;
            this.pushOverlay("dialog");
            this.dialogModal.style.display = "flex";
            this.dialogModal.innerHTML = "";

            let cleanupKeyHandler = null;

            const finish = (result) => {
                if (cleanupKeyHandler) {
                    cleanupKeyHandler();
                    cleanupKeyHandler = null;
                }
                this._dialogCleanup = null;
                this._dialogResolve = null;
                this.closeDialog(result);
                resolve(result);
            };

            this._dialogCleanup = () => {
                if (cleanupKeyHandler) {
                    cleanupKeyHandler();
                    cleanupKeyHandler = null;
                }
            };
            this._dialogResolve = (val) => {
                resolve(val);
            };

            // Keyboard listener for confirm dialogs:
            // Accepted with Enter, Space, or clicking confirm
            // Cancelled with cancel button, clicking outside, or ANY other key
            if (type === "confirm") {
                const handleConfirmKey = (e) => {
                    // Ignore bare modifier keys (Ctrl, Shift, Alt, Meta)
                    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
                        return;
                    }

                    e.preventDefault();
                    e.stopPropagation();

                    if (e.key === "Enter" || e.code === "Space" || e.key === " ") {
                        finish(true);
                    } else {
                        finish(false);
                    }
                };

                window.addEventListener("keydown", handleConfirmKey, true);
                cleanupKeyHandler = () => {
                    window.removeEventListener("keydown", handleConfirmKey, true);
                };
            } else if (type === "alert") {
                const handleAlertKey = (e) => {
                    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    finish(true);
                };

                window.addEventListener("keydown", handleAlertKey, true);
                cleanupKeyHandler = () => {
                    window.removeEventListener("keydown", handleAlertKey, true);
                };
            }

            // Header
            const head = document.createElement("div");
            head.style.cssText = "display: flex; align-items: center; justify-content: space-between;";

            const titleEl = document.createElement("h3");
            titleEl.textContent = title;
            titleEl.style.cssText = `margin: 0; font-size: 15px; font-weight: 600; color: ${isDanger ? "#fb7185" : "#f1f5f9"};`;
            head.appendChild(titleEl);

            const closeX = document.createElement("button");
            closeX.innerHTML = "✕";
            closeX.style.cssText = "background: transparent; border: none; color: #94a3b8; font-size: 14px; cursor: pointer;";
            closeX.addEventListener("click", () => {
                finish(type === "confirm" ? false : null);
            });
            head.appendChild(closeX);
            this.dialogModal.appendChild(head);

            // Message Body
            const msgEl = document.createElement("div");
            msgEl.textContent = message;
            msgEl.style.cssText = "font-size: 13px; color: #cbd5e1; line-height: 1.5; white-space: pre-wrap;";
            this.dialogModal.appendChild(msgEl);

            // Prompt Input (if prompt type)
            let promptInput = null;
            if (type === "prompt") {
                promptInput = document.createElement("input");
                promptInput.type = "text";
                promptInput.value = defaultValue || "";
                promptInput.style.cssText = `
                    width: 100%;
                    box-sizing: border-box;
                    background: rgba(30, 41, 59, 0.9);
                    border: 1px solid rgba(56, 189, 248, 0.6);
                    border-radius: 6px;
                    color: #f1f5f9;
                    font-size: 13px;
                    padding: 8px 10px;
                    outline: none;
                `;
                promptInput.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        const val = promptInput.value;
                        finish(val);
                    } else if (e.key === "Escape") {
                        e.preventDefault();
                        finish(null);
                    }
                });
                this.dialogModal.appendChild(promptInput);
            }

            // Buttons Row
            const btnRow = document.createElement("div");
            btnRow.style.cssText = "display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 6px;";

            if (type !== "alert") {
                const cancelBtn = document.createElement("button");
                cancelBtn.textContent = cancelText;
                cancelBtn.style.cssText = `
                    background: transparent;
                    border: 1px solid rgba(51, 65, 85, 0.9);
                    color: #94a3b8;
                    border-radius: 6px;
                    padding: 6px 12px;
                    font-size: 12px;
                    cursor: pointer;
                `;
                cancelBtn.addEventListener("click", () => {
                    finish(type === "confirm" ? false : null);
                });
                btnRow.appendChild(cancelBtn);
            }

            const confirmBtn = document.createElement("button");
            confirmBtn.textContent = confirmText;
            confirmBtn.style.cssText = `
                background: ${isDanger ? "rgba(225, 29, 72, 0.25)" : "rgba(56, 189, 248, 0.25)"};
                border: 1px solid ${isDanger ? "rgba(225, 29, 72, 0.6)" : "rgba(56, 189, 248, 0.6)"};
                color: ${isDanger ? "#fda4af" : "#38bdf8"};
                border-radius: 6px;
                padding: 6px 14px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
            `;
            confirmBtn.addEventListener("click", () => {
                const val = type === "prompt" ? (promptInput ? promptInput.value : "") : true;
                finish(val);
            });
            btnRow.appendChild(confirmBtn);

            this.dialogModal.appendChild(btnRow);

            // Keyboard instruction hint for confirm dialogs
            if (type === "confirm") {
                const hintEl = document.createElement("div");
                hintEl.style.cssText = "font-size: 11px; color: #64748b; text-align: right; margin-top: 2px;";
                hintEl.innerHTML = `<kbd style="background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(51, 65, 85, 0.9); border-radius: 3px; padding: 1px 4px; color: #94a3b8; font-family: monospace;">Enter</kbd> / <kbd style="background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(51, 65, 85, 0.9); border-radius: 3px; padding: 1px 4px; color: #94a3b8; font-family: monospace;">Space</kbd> to confirm &nbsp;•&nbsp; Any other key to cancel`;
                this.dialogModal.appendChild(hintEl);
            }

            setTimeout(() => {
                if (promptInput) {
                    promptInput.focus();
                    promptInput.select();
                } else {
                    confirmBtn.focus();
                }
            }, 30);
        });
    }

    closeDialog(result = null) {
        if (this._dialogCleanup) {
            this._dialogCleanup();
            this._dialogCleanup = null;
        }
        if (this._dialogResolve) {
            const res = this._dialogResolve;
            this._dialogResolve = null;
            res(result);
        }
        this.isDialogOpen = false;
        this.removeOverlay("dialog");
        if (this.dialogModal) {
            this.dialogModal.style.display = "none";
        }
    }

    // Convenient async replacements for window alert/confirm/prompt
    customAlert(message, title = "Notice") {
        return this.openDialog({ type: "alert", title, message });
    }

    customConfirm(message, title = "Confirm", isDanger = false, confirmText = "Confirm") {
        return this.openDialog({ type: "confirm", title, message, isDanger, confirmText });
    }

    customPrompt(message, defaultValue = "", title = "Prompt", confirmText = "Submit") {
        return this.openDialog({ type: "prompt", title, message, defaultValue, confirmText });
    }
}

