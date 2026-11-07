/**
 * Convert newlines, carriage returns, tabs, and backslashes into code literals (\n, \r, \t, \\).
 * @param {string} text
 * @returns {string}
 */
function escapeOutlineText(text) {
    if (!text) return "";
    return text
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
}

class ProjectStore {
    /**
     * @param {StorageDB} [db] - Optional storage persistence instance.
     */
    constructor(db = null) {
        /** @type {StorageDB|null} */
        this.db = db;

        /** @type {string} */
        this.projectId = "default";
        /** @type {string} */
        this.projectName = "Postal Service Demo";

        /** @type {ProjectDocument} Seeded with initial mock data for immediate UI testing */
        this.doc = {
            lastNodeId: 4,
            lastRelId: 1,
            types: ["text", "number"],
            nodes: [
                { id: 1, parentId: null, label: "Postal Service", description: "Root system", x: 400, y: 300, properties: { hq: "text", zip_code: "number", active: "text", supervisor: "text" } },
                { id: 2, parentId: 1, label: "Post Office", description: "Central hub", x: 250, y: 300, properties: {} },
                { id: 3, parentId: 1, label: "Mail Truck", description: "Transport unit", x: 500, y: 220, properties: {} },
                { id: 4, parentId: 1, label: "Customer Location", description: "Recipient address", x: 500, y: 380, properties: { address: "text", delivery_window: "text", signature_required: "text" } }
            ],
            relationships: [
                { id: 1, from: 3, to: 4, label: "delivery", description: "Delivers mail", properties: {} }
            ]
        };

        /** @type {number|null} Active view level (null = root level) */
        this.currentParentId = null;

        /** @type {Array<() => void>} Change listeners */
        this.listeners = [];

        /** @type {number|null} Auto-save debounce timer */
        this._saveTimeout = null;
        /** @type {number|null} View state debounce timer */
        this._viewStateTimeout = null;

        /** @type {((status: "saving"|"saved") => void)|null} */
        this.onSaveStatusChange = null;
    }

    /**
     * The node representing the current level we are inside of (null if root).
     * @returns {BubbleNode|null}
     */
    get currentBubble() {
        if (this.currentParentId == null) return null;
        return this.doc.nodes.find(n => n.id === this.currentParentId) || null;
    }

    /**
     * All nodes belonging to the current layer.
     * @returns {BubbleNode[]}
     */
    get currentLayerNodes() {
        return this.doc.nodes.filter(n => n.parentId === this.currentParentId);
    }

    /**
     * Subscribe to state change notifications.
     * @param {() => void} listener
     * @returns {() => void} Unsubscribe function
     */
    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    /** Notify all listeners of state change and trigger auto-save if db exists. */
    notify() {
        for (const listener of this.listeners) {
            listener();
        }
        if (this.db) {
            this.debouncedSaveProject();
        }
    }

    // --- Navigation ---

    /**
     * Drill down into a bubble.
     * @param {number} nodeId
     */
    enterBubble(nodeId) {
        const target = this.doc.nodes.find(n => n.id === nodeId);
        if (target) {
            this.currentParentId = nodeId;
            this.notify();
        }
    }

    /**
     * Navigate up to parent bubble or root.
     */
    leaveBubble() {
        if (this.currentParentId == null) return;
        const current = this.currentBubble;
        this.currentParentId = current ? current.parentId : null;
        this.notify();
    }

    /**
     * Return breadcrumb chain from root down to current parent.
     * @returns {BubbleNode[]}
     */
    getBreadcrumbs() {
        const trail = [];
        let cur = this.currentBubble;
        while (cur) {
            trail.unshift(cur);
            cur = cur.parentId != null ? this.doc.nodes.find(n => n.id === cur.parentId) : null;
        }
        return trail;
    }

    /**
     * Get nodes visible at current drill-down level.
     * @returns {BubbleNode[]}
     */
    getVisibleNodes() {
        return this.currentLayerNodes;
    }

    /**
     * Get relationships relevant to the visible nodes.
     * Intra-layer actions are directly between visible nodes.
     * Cross-layer actions involve at least one node in the visible layer.
     * @returns {BubbleRelationship[]}
     */
    getVisibleRelationships() {
        const visibleIds = new Set(this.getVisibleNodes().map(n => n.id));
        return this.doc.relationships.filter(r => visibleIds.has(r.from) || visibleIds.has(r.to));
    }

    // --- Node Actions ---

    /**
     * Add a node at the current view level.
     * @param {string} label
     * @param {number} x
     * @param {number} y
     * @returns {BubbleNode}
     */
    addNode(label, x, y) {
        const node = {
            id: ++this.doc.lastNodeId,
            parentId: this.currentParentId,
            label: label || `Node ${this.doc.lastNodeId}`,
            x,
            y,
            properties: {}
        };
        this.doc.nodes.push(node);
        this.notify();
        return node;
    }

    /**
     * Update node properties, position, or label.
     * @param {number} id
     * @param {Partial<BubbleNode>} patch
     */
    updateNode(id, patch) {
        const node = this.doc.nodes.find(n => n.id === id);
        if (node) {
            Object.assign(node, patch);
            this.notify();
        }
    }

    /**
     * Delete node and cascade-delete its sub-bubbles and attached relationships.
     * @param {number} id
     */
    removeNode(id) {
        const toDeleteIds = new Set([id]);
        let changed = true;
        while (changed) {
            changed = false;
            for (const n of this.doc.nodes) {
                if (n.parentId != null && toDeleteIds.has(n.parentId) && !toDeleteIds.has(n.id)) {
                    toDeleteIds.add(n.id);
                    changed = true;
                }
            }
        }

        this.doc.nodes = this.doc.nodes.filter(n => !toDeleteIds.has(n.id));
        this.doc.relationships = this.doc.relationships.filter(
            r => !toDeleteIds.has(r.from) && !toDeleteIds.has(r.to)
        );
        this.notify();
    }

    // --- Relationship Actions ---

    /**
     * Connect two nodes with an action.
     * @param {number} fromId
     * @param {number} toId
     * @param {string} label
     * @returns {BubbleRelationship}
     */
    addRelationship(fromId, toId, label) {
        const rel = {
            id: ++this.doc.lastRelId,
            from: fromId,
            to: toId,
            label: label || "action",
            properties: {}
        };
        this.doc.relationships.push(rel);
        this.notify();
        return rel;
    }

    /**
     * Update relationship properties or label.
     * @param {number} id
     * @param {Partial<BubbleRelationship>} patch
     */
    updateRelationship(id, patch) {
        const rel = this.doc.relationships.find(r => r.id === id);
        if (rel) {
            Object.assign(rel, patch);
            this.notify();
        }
    }

    /**
     * Remove relationship by id.
     * @param {number} id
     */
    removeRelationship(id) {
        this.doc.relationships = this.doc.relationships.filter(r => r.id !== id);
        this.notify();
    }

    // --- Persistence & IO ---

    /**
     * Load project from IndexedDB.
    /**
     * Debounced auto-save of active project to IndexedDB.
    /**
     * @param {"saving"|"saved"} status
     */
    setSaveStatus(status) {
        if (this.onSaveStatusChange) {
            this.onSaveStatusChange(status);
        }
    }

    /**
     * Debounced auto-save of active project to IndexedDB.
     */
    debouncedSaveProject() {
        if (!this.db) return;
        this.setSaveStatus("saving");
        if (this._saveTimeout) clearTimeout(this._saveTimeout);
        this._saveTimeout = setTimeout(async () => {
            this._saveTimeout = null;
            await this.saveProject();
            if (!this._viewStateTimeout) {
                this.setSaveStatus("saved");
            }
        }, 300);
    }

    /**
     * Fetch list of all project metadata records.
     * @returns {Promise<Array<{ id: string, name: string, updatedAt: number }>>}
     */
    async listProjects() {
        if (!this.db) return [{ id: "default", name: "Postal Service Demo", updatedAt: Date.now() }];
        const list = await this.db.get("projects_meta");
        if (Array.isArray(list) && list.length > 0) {
            return list;
        }
        // Initialize default record
        const defaultList = [{ id: "default", name: "Postal Service Demo", updatedAt: Date.now() }];
        await this.db.set("projects_meta", defaultList);
        return defaultList;
    }

    /**
     * Save updated project metadata list.
     * @param {Array<{ id: string, name: string, updatedAt: number }>} list
     * @returns {Promise<void>}
     */
    async saveProjectsList(list) {
        if (!this.db) return;
        await this.db.set("projects_meta", list);
    }

    /**
     * Get ID of active project.
     * @returns {Promise<string>}
     */
    async getActiveProjectId() {
        if (!this.db) return "default";
        const id = await this.db.get("active_project_id");
        return id || "default";
    }

    /**
     * Save active project to IndexedDB.
     * @returns {Promise<void>}
     */
    async saveProject() {
        if (!this.db) return;
        await this.db.set("project_" + this.projectId, this.doc);
        const list = await this.listProjects();
        const p = list.find(item => item.id === this.projectId);
        if (p) {
            p.updatedAt = Date.now();
            await this.saveProjectsList(list);
        }
    }

    /**
     * Debounced auto-save of active view state (current layer + camera).
     * @param {Camera} camera
     */
    debouncedSaveViewState(camera) {
        if (!this.db) return;
        this.setSaveStatus("saving");
        if (this._viewStateTimeout) clearTimeout(this._viewStateTimeout);
        this._viewStateTimeout = setTimeout(async () => {
            this._viewStateTimeout = null;
            await this.saveViewState(camera);
            if (!this._saveTimeout) {
                this.setSaveStatus("saved");
            }
        }, 300);
    }

    /**
     * Save active view state (current layer + camera) to IndexedDB.
     * @param {Camera} camera
     * @returns {Promise<void>}
     */
    async saveViewState(camera) {
        if (!this.db) return;
        const state = {
            currentParentId: this.currentParentId,
            camera: camera ? { x: camera.x, y: camera.y, zoom: camera.zoom } : null
        };
        await this.db.set("view_state_" + this.projectId, state);
    }

    /**
     * Load project from IndexedDB.
     * @param {string} [projectId]
     * @returns {Promise<boolean>}
     */
    async loadProject(projectId = this.projectId) {
        if (!this.db) return false;
        this.projectId = projectId;
        const saved = await this.db.get("project_" + projectId);
        if (saved && Array.isArray(saved.nodes)) {
            this.doc = saved;
            return true;
        }
        return false;
    }

    /**
     * Switch active project, saving current state first.
     * @param {string} projectId
     * @param {Camera} [camera]
     * @returns {Promise<boolean>}
     */
    async switchProject(projectId, camera = null) {
        if (!this.db) return false;

        // 1. Flush any pending saves for current project
        if (this._saveTimeout) {
            clearTimeout(this._saveTimeout);
            this._saveTimeout = null;
            await this.saveProject();
        }
        if (this._viewStateTimeout && camera) {
            clearTimeout(this._viewStateTimeout);
            this._viewStateTimeout = null;
            await this.saveViewState(camera);
        }

        // 2. Set new active project
        this.projectId = projectId;
        await this.db.set("active_project_id", projectId);

        // Update active project name in store
        const list = await this.listProjects();
        const meta = list.find(p => p.id === projectId);
        this.projectName = meta ? meta.name : "Untitled Project";

        // 3. Load document
        const loaded = await this.loadProject(projectId);
        if (!loaded) {
            // Seed blank if doc didn't exist
            this.doc = {
                lastNodeId: 1,
                lastRelId: 0,
                types: ["text", "number"],
                nodes: [
                    { id: 1, parentId: null, label: this.projectName, description: "", x: 400, y: 300, properties: {} }
                ],
                relationships: []
            };
            await this.saveProject();
        }

        // 4. Restore view state
        const savedViewState = await this.db.get("view_state_" + projectId);
        let restoredCamera = false;
        if (savedViewState) {
            if (savedViewState.currentParentId !== undefined) {
                const layerExists = savedViewState.currentParentId === null || 
                                    this.doc.nodes.some(n => n.id === savedViewState.currentParentId);
                this.currentParentId = layerExists ? savedViewState.currentParentId : null;
            } else {
                this.currentParentId = null;
            }

            if (camera && savedViewState.camera && typeof savedViewState.camera.zoom === "number") {
                camera.x = savedViewState.camera.x;
                camera.y = savedViewState.camera.y;
                camera.zoom = savedViewState.camera.zoom;
                restoredCamera = true;
            }
        } else {
            this.currentParentId = null;
        }

        if (camera && !restoredCamera) {
            camera.fitToNodes(this.getVisibleNodes());
        }

        this.notify();
        return true;
    }

    /**
     * Create a new project document and switch to it.
     * @param {string} name
     * @param {Camera} [camera]
     * @returns {Promise<string>} Created project ID
     */
    async createProject(name = "New Project", camera = null) {
        const id = "proj_" + Date.now();
        const trimmedName = name.trim() || "New Project";
        const newDoc = {
            lastNodeId: 1,
            lastRelId: 0,
            types: ["text", "number"],
            nodes: [
                { id: 1, parentId: null, label: trimmedName, description: "", x: 400, y: 300, properties: {} }
            ],
            relationships: []
        };

        if (this.db) {
            await this.db.set("project_" + id, newDoc);
            const list = await this.listProjects();
            list.push({ id, name: trimmedName, updatedAt: Date.now() });
            await this.saveProjectsList(list);
            await this.switchProject(id, camera);
        } else {
            this.projectId = id;
            this.projectName = trimmedName;
            this.doc = newDoc;
            this.currentParentId = null;
            if (camera) camera.fitToNodes(this.getVisibleNodes());
            this.notify();
        }

        return id;
    }

    /**
     * Rename an existing project.
     * @param {string} projectId
     * @param {string} newName
     * @returns {Promise<void>}
     */
    async renameProject(projectId, newName) {
        const trimmed = newName.trim() || "Untitled Project";
        if (this.db) {
            const list = await this.listProjects();
            const meta = list.find(p => p.id === projectId);
            if (meta) {
                meta.name = trimmed;
                meta.updatedAt = Date.now();
                await this.saveProjectsList(list);
            }
        }
        if (this.projectId === projectId) {
            this.projectName = trimmed;
        }
        this.notify();
    }

    /**
     * Duplicate an existing project.
     * @param {string} projectId
     * @param {Camera} [camera]
     * @returns {Promise<string>}
     */
    async duplicateProject(projectId, camera = null) {
        const list = await this.listProjects();
        const sourceMeta = list.find(p => p.id === projectId);
        const baseName = sourceMeta ? sourceMeta.name : "Project";
        const newName = `${baseName} (Copy)`;
        const newId = "proj_" + Date.now();

        let docToClone = null;
        if (projectId === this.projectId) {
            docToClone = JSON.parse(JSON.stringify(this.doc));
        } else if (this.db) {
            docToClone = await this.db.get("project_" + projectId);
        }
        if (!docToClone) {
            docToClone = JSON.parse(JSON.stringify(this.doc));
        }

        if (this.db) {
            await this.db.set("project_" + newId, docToClone);
            list.push({ id: newId, name: newName, updatedAt: Date.now() });
            await this.saveProjectsList(list);
            await this.switchProject(newId, camera);
        }

        return newId;
    }

    /**
     * Delete a project and switch to another one if it was active.
     * @param {string} projectId
     * @param {Camera} [camera]
     * @returns {Promise<void>}
     */
    async deleteProject(projectId, camera = null) {
        if (!this.db) return;

        const list = await this.listProjects();
        // If it's the last remaining project, create a fresh one first
        if (list.length <= 1) {
            await this.createProject("Untitled Project", camera);
            return this.deleteProject(projectId, camera);
        }

        const remaining = list.filter(p => p.id !== projectId);
        await this.saveProjectsList(remaining);
        await this.db.delete("project_" + projectId);
        await this.db.delete("view_state_" + projectId);

        if (this.projectId === projectId) {
            const nextProj = remaining[remaining.length - 1];
            await this.switchProject(nextProj.id, camera);
        } else {
            this.notify();
        }
    }

    /**
     * Export active document to JSON string.
     * @returns {string}
     */
    exportJson() {
        return JSON.stringify(this.doc, null, 2);
    }

    /**
     * Import document from JSON string or object.
     * @param {string|ProjectDocument} data
     */
    importJson(data) {
        const parsed = typeof data === "string" ? JSON.parse(data) : data;
        if (parsed && Array.isArray(parsed.nodes)) {
            this.doc = parsed;
            this.currentParentId = null;
            this.notify();
        }
    }

    /**
     * Export project as token-lean tab-indented outline text.
     * @returns {string}
     */
    exportOutline() {
        const idToNode = new Map(this.doc.nodes.map(n => [n.id, n]));
        const childrenMap = new Map();
        for (const node of this.doc.nodes) {
            const pid = node.parentId;
            if (!childrenMap.has(pid)) childrenMap.set(pid, []);
            childrenMap.get(pid).push(node);
        }

        const outRels = new Map();
        for (const rel of this.doc.relationships) {
            if (!outRels.has(rel.from)) outRels.set(rel.from, []);
            outRels.get(rel.from).push(rel);
        }

        const lines = [];

        const dumpNode = (node, depth) => {
            const indent = "\t".repeat(depth);
            lines.push(`${indent}${node.label}`);

            // Description
            if (node.description && node.description.trim()) {
                const escapedDesc = escapeOutlineText(node.description.trim());
                lines.push(`${indent}\t_description: ${escapedDesc}`);
            }

            // Properties
            const props = Object.entries(node.properties || {});
            if (props.length > 0) {
                lines.push(`${indent}\t_properties`);
                for (const [k, v] of props) {
                    lines.push(`${indent}\t\t${k}: ${v}`);
                }
            }

            // Rels
            const rels = outRels.get(node.id) || [];
            if (rels.length > 0) {
                lines.push(`${indent}\t_rels`);
                for (const r of rels) {
                    const target = idToNode.get(r.to);
                    const targetLabel = target ? target.label : `#${r.to}`;
                    lines.push(`${indent}\t\t${targetLabel}: ${r.label}`);

                    // Action description
                    if (r.description && r.description.trim()) {
                        lines.push(`${indent}\t\t\t_description: ${escapeOutlineText(r.description.trim())}`);
                    }

                    // Action properties
                    const relProps = Object.entries(r.properties || {});
                    if (relProps.length > 0) {
                        lines.push(`${indent}\t\t\t_properties`);
                        for (const [k, v] of relProps) {
                            lines.push(`${indent}\t\t\t\t${k}: ${v}`);
                        }
                    }
                }
            }

            // Sub-bubbles
            const children = childrenMap.get(node.id) || [];
            for (const child of children) {
                dumpNode(child, depth + 1);
            }
        };

        const roots = childrenMap.get(null) || [];
        for (const root of roots) {
            dumpNode(root, 0);
        }

        return lines.join("\n");
    }

    /**
     * Compute the fully qualified dot-delimited namespace for a node.
     * E.g. "Postal Service.Customer Location"
     * @param {number} nodeId
     * @param {Map<number, BubbleNode>} [idToNode]
     * @returns {string}
     */
    getNodeNamespace(nodeId, idToNode = null) {
        if (!idToNode) {
            idToNode = new Map(this.doc.nodes.map(n => [n.id, n]));
        }
        const parts = [];
        let curr = idToNode.get(nodeId);
        const visited = new Set();
        while (curr && !visited.has(curr.id)) {
            visited.add(curr.id);
            const label = curr.label && curr.label.trim() ? curr.label.trim() : `Node#${curr.id}`;
            parts.unshift(label);
            if (curr.parentId === null || curr.parentId === undefined) {
                break;
            }
            curr = idToNode.get(curr.parentId);
        }
        return parts.length > 0 ? parts.join(".") : `#${nodeId}`;
    }

    /**
     * Export complete system architecture and entity ontology as structured Markdown
     * for technical documentation and unambiguous AI ingestion.
     * @returns {string}
     */
    exportMarkdown() {
        const idToNode = new Map(this.doc.nodes.map(n => [n.id, n]));
        const childrenMap = new Map();
        for (const node of this.doc.nodes) {
            const pid = node.parentId;
            if (!childrenMap.has(pid)) childrenMap.set(pid, []);
            childrenMap.get(pid).push(node);
        }

        const outRels = new Map();
        const inRels = new Map();
        for (const rel of this.doc.relationships) {
            if (!outRels.has(rel.from)) outRels.set(rel.from, []);
            outRels.get(rel.from).push(rel);

            if (!inRels.has(rel.to)) inRels.set(rel.to, []);
            inRels.get(rel.to).push(rel);
        }

        const escapeTableCell = (str) => {
            if (!str) return "-";
            return String(str).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
        };

        const lines = [];

        // 1. Document Title & Header
        const projectName = (this.projectName || "System Architecture").trim();
        lines.push(`# System Architecture Documentation: ${projectName}`);
        lines.push("");
        lines.push("> Auto-generated system ontology, type specifications, and action signatures for technical documentation and AI ingestion.");
        lines.push("");

        // 2. Scalar Primitives / Types
        const registeredTypes = Array.isArray(this.doc.types) && this.doc.types.length > 0 ? this.doc.types : ["text", "number"];
        lines.push("## Registered Scalar Types");
        lines.push("");
        for (const t of registeredTypes) {
            lines.push(`- \`${t}\``);
        }
        lines.push("");

        // 3. Types / Entities Section
        lines.push("## Types & Components");
        lines.push("");

        const dumpTypeMarkdown = (node) => {
            const ns = this.getNodeNamespace(node.id, idToNode);
            const parentNode = node.parentId !== null && node.parentId !== undefined ? idToNode.get(node.parentId) : null;
            const parentNs = parentNode ? this.getNodeNamespace(parentNode.id, idToNode) : "*(Root Level)*";

            lines.push(`### \`${ns}\``);
            lines.push("");
            lines.push(`- **Namespace**: \`${ns}\``);
            lines.push(`- **Type Name**: ${node.label || "*(Unnamed)*"}`);
            lines.push(`- **Parent**: ${parentNode ? `\`${parentNs}\`` : "*(Root Level)*"}`);
            lines.push("");

            // Description
            lines.push("#### Description");
            if (node.description && node.description.trim()) {
                lines.push(node.description.trim());
            } else {
                lines.push("*No description provided.*");
            }
            lines.push("");

            // Properties
            lines.push("#### Properties");
            const props = Object.entries(node.properties || {});
            if (props.length > 0) {
                lines.push("| Property | Scalar Type |");
                lines.push("| :--- | :--- |");
                for (const [k, v] of props) {
                    lines.push(`| \`${escapeTableCell(k)}\` | \`${escapeTableCell(v)}\` |`);
                }
            } else {
                lines.push("*No custom properties defined.*");
            }
            lines.push("");

            // Child Types
            const children = childrenMap.get(node.id) || [];
            if (children.length > 0) {
                lines.push("#### Child Types / Sub-Components");
                for (const child of children) {
                    const childNs = this.getNodeNamespace(child.id, idToNode);
                    lines.push(`- \`${childNs}\``);
                }
                lines.push("");
            }

            // Actions (Outgoing)
            const rels = outRels.get(node.id) || [];
            lines.push("#### Actions & Methods");
            if (rels.length > 0) {
                for (const r of rels) {
                    const targetNode = idToNode.get(r.to);
                    const targetNs = targetNode ? this.getNodeNamespace(targetNode.id, idToNode) : `#${r.to}`;
                    const actionName = (r.label && r.label.trim()) || "action";

                    // Build parameter signature: target + action properties
                    const relProps = Object.entries(r.properties || {});
                    const paramSignatures = [`target: ${targetNs}`];
                    for (const [k, v] of relProps) {
                        paramSignatures.push(`${k}: ${v}`);
                    }
                    const signature = `${actionName}(${paramSignatures.join(", ")})`;

                    lines.push(`##### \`${signature}\``);
                    lines.push("");
                    lines.push(`- **Target**: \`${targetNs}\``);
                    if (r.description && r.description.trim()) {
                        lines.push(`- **Description**: ${r.description.trim()}`);
                    } else {
                        lines.push("- **Description**: *No description provided.*");
                    }
                    lines.push("- **Parameters**:");
                    lines.push("  | Parameter | Type | Source | Description / Notes |");
                    lines.push("  | :--- | :--- | :--- | :--- |");
                    lines.push(`  | \`target\` | \`${escapeTableCell(targetNs)}\` | Destination | Target receiving entity |`);
                    for (const [k, v] of relProps) {
                        lines.push(`  | \`${escapeTableCell(k)}\` | \`${escapeTableCell(v)}\` | Action Property | Parameter for this action |`);
                    }
                    lines.push("");
                }
            } else {
                lines.push("*No outgoing actions defined.*");
                lines.push("");
            }

            // Inbound Actions
            const inbound = inRels.get(node.id) || [];
            if (inbound.length > 0) {
                lines.push("#### Inbound Actions");
                for (const inRel of inbound) {
                    const sourceNode = idToNode.get(inRel.from);
                    const sourceNs = sourceNode ? this.getNodeNamespace(sourceNode.id, idToNode) : `#${inRel.from}`;
                    const actionName = (inRel.label && inRel.label.trim()) || "action";
                    lines.push(`- From \`${sourceNs}\`: \`${actionName}\``);
                }
                lines.push("");
            }

            lines.push("---");
            lines.push("");

            // Recursively process children
            for (const child of children) {
                dumpTypeMarkdown(child);
            }
        };

        const roots = childrenMap.get(null) || [];
        for (const root of roots) {
            dumpTypeMarkdown(root);
        }

        // 4. Consolidated Actions Summary Table
        lines.push("## System Actions Directory");
        lines.push("");
        lines.push("Complete listing of all actions connecting entities across the system.");
        lines.push("");

        if (this.doc.relationships.length > 0) {
            lines.push("| Action / Method | Source | Target | Parameters | Description |");
            lines.push("| :--- | :--- | :--- | :--- | :--- |");
            for (const rel of this.doc.relationships) {
                const sourceNode = idToNode.get(rel.from);
                const targetNode = idToNode.get(rel.to);
                const sourceNs = sourceNode ? this.getNodeNamespace(sourceNode.id, idToNode) : `#${rel.from}`;
                const targetNs = targetNode ? this.getNodeNamespace(targetNode.id, idToNode) : `#${rel.to}`;
                const actionName = (rel.label && rel.label.trim()) || "action";
                const relProps = Object.entries(rel.properties || {});
                const paramStr = relProps.length > 0 ? relProps.map(([k, v]) => `${k}: ${v}`).join(", ") : "*(none)*";
                const desc = rel.description && rel.description.trim() ? rel.description.trim() : "-";

                lines.push(`| \`${escapeTableCell(actionName)}\` | \`${escapeTableCell(sourceNs)}\` | \`${escapeTableCell(targetNs)}\` | \`${escapeTableCell(paramStr)}\` | ${escapeTableCell(desc)} |`);
            }
            lines.push("");
        } else {
            lines.push("*No relationships or actions defined in project.*");
            lines.push("");
        }

        return lines.join("\n");
    }
}

