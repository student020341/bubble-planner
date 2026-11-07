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

        /** @type {boolean} Whether to automatically open inspector when an entity is focused */
        this.autoOpenInspector = false;

        /** @type {boolean} Whether to automatically close inspector when clicking off / unfocusing */
        this.autoCloseInspector = false;

        /** @type {string|null} Action ID currently recording a new trigger */
        this.recordingActionId = null;

        /** @type {Array<string>} Active overlay stack in LIFO order */
        this.overlayStack = [];

        this.mount();
        this.store.subscribe(() => {
            this.renderBreadcrumbs();
            if (this.activeFilterNode) {
                const nodeStillVisible = this.store.getVisibleNodes().some(n => n.id === this.activeFilterNode.id);
                if (!nodeStillVisible) {
                    this.closePropertyQuickFilter();
                } else {
                    const isTypingInFilter = this.propFilterCard && this.propFilterCard.contains(document.activeElement);
                    if (!isTypingInFilter) {
                        this.renderPropertyQuickFilterContent();
                    }
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

        // Right side top-bar actions
        const rightBar = document.createElement("div");
        rightBar.style.cssText = "display: flex; align-items: center; gap: 8px;";

        const inspectBtn = document.createElement("button");
        inspectBtn.innerHTML = "📝 Inspect (I)";
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
                window.alert("Select a bubble or connection first to inspect it.");
            }
        });
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

        // Close quick-filter card when clicking outside
        window.addEventListener("mousedown", (e) => {
            if (this.propFilterCard && this.propFilterCard.style.display !== "none") {
                if (this.propFilterCard.contains(e.target)) return;
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

    // --- Property Quick-Filter Floating Card ---

    togglePropertyQuickFilter(node) {
        if (this.activeFilterNode === node && this.propFilterCard.style.display !== "none") {
            this.closePropertyQuickFilter();
        } else {
            this.openPropertyQuickFilter(node);
        }
    }

    openPropertyQuickFilter(node) {
        if (!node) return;
        this.activeFilterNode = node;

        const screenPos = this.camera.worldToScreen(node.x, node.y);
        const m = this.canvasView.computeNodeMetrics(node);
        const cardWidth = 260;

        let left = Math.round(screenPos.x - cardWidth / 2);
        let top = Math.round(screenPos.y + (m.height / 2) * this.camera.zoom + 12);

        // Clamp to screen bounds so it's always in view
        const margin = 12;
        left = Math.max(margin, Math.min(window.innerWidth - cardWidth - margin, left));
        if (top + 240 > window.innerHeight) {
            top = Math.round(screenPos.y - (m.height / 2) * this.camera.zoom - 240);
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

        // Top Row: Filter Search Input + Floating "+ Add" Action Button
        const topRow = document.createElement("div");
        topRow.style.cssText = "display: flex; align-items: center; gap: 6px;";

        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "Filter properties...";
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
        addBtn.title = "Add a new property to this bubble";
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
                empty.textContent = allProps.length === 0 ? "No properties on bubble" : "No matching properties";
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
                keyInput.addEventListener("blur", () => {
                    keyInput.style.background = "transparent";
                    keyInput.style.borderColor = "transparent";
                    commitKeyChange();
                });
                keyInput.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        keyInput.blur();
                    } else if (e.key === "Escape") {
                        keyInput.value = key;
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
                    background: rgba(168, 85, 247, 0.15);
                    border: 1px solid rgba(168, 85, 247, 0.4);
                    border-radius: 4px;
                    color: #c084fc;
                    font-family: monospace;
                    font-size: 10px;
                    padding: 2px 4px;
                    cursor: pointer;
                    outline: none;
                `;
                for (const t of (this.store.doc.types || ["text", "number"])) {
                    const opt = document.createElement("option");
                    opt.value = t;
                    opt.textContent = t;
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
            delRelBtn.addEventListener("click", () => {
                this.store.removeRelationship(rel.id);
                this.renderInspectorContent();
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
                row.addEventListener("click", () => {
                    const actionLabel = window.prompt(`Action from "${node.label}" to "${item.node.label}":`, "action");
                    if (actionLabel) {
                        this.store.addRelationship(node.id, item.node.id, actionLabel);
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

        // 1. Inspector Behavior Preferences
        body.appendChild(this.createPreferencesPanel());

        // 2. Keybindings Section
        body.appendChild(this.createKeybindingsPanel());

        // 3. Custom Scalar Types Section
        body.appendChild(this.createScalarTypesPanel());

        // 4. Storage / Reset Section
        body.appendChild(this.createStoragePanel());

        this.settingsDrawer.appendChild(body);
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
        row3.appendChild(slider);
        list.appendChild(row3);

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
