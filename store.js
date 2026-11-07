/**
 * @file In-memory project state manager and actions.
 */

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
     * Import/merge project from tab-indented outline text.
     * Replaces or populates the active document.
     * @param {string} text
     */
    importOutline(text) {
        if (!text || !text.trim()) return;

        const rawLines = text.split(/\r?\n/);
        const nodes = [];
        const relationships = [];
        let nextNodeId = 1;
        let nextRelId = 1;
        const typesSet = new Set(this.doc.types || ["text", "number"]);

        // Stack to track current ancestor node hierarchy: [{ node, depth }]
        const stack = [];
        // Tracks current parsing section for the topmost node: null | "properties" | "rels"
        let currentSection = null;
        let sectionDepth = 0;

        // Pending relationships to link by label target after all nodes exist: { fromId, targetLabel, relLabel }
        const pendingRels = [];

        // Count per-parent layer nodes to arrange x, y positions nicely
        const layerCounts = new Map();

        const getNodePos = (parentId) => {
            const count = layerCounts.get(parentId) || 0;
            layerCounts.set(parentId, count + 1);
            const cols = 3;
            const col = count % cols;
            const row = Math.floor(count / cols);
            return {
                x: 200 + col * 220,
                y: 180 + row * 160
            };
        };

        for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
            const line = rawLines[lineIdx];
            if (!line.trim()) continue; // skip empty lines

            // Measure indentation depth (tabs count as 1 depth; 2 or 4 spaces count as 1 depth)
            const matchIndent = line.match(/^(\t+| +)/);
            let depth = 0;
            if (matchIndent) {
                const lead = matchIndent[0];
                if (lead.startsWith("\t")) {
                    depth = lead.length;
                } else {
                    depth = Math.floor(lead.length / 2); // standard 2 or 4 spaces
                }
            }

            let trimmed = line.trim();

            // Count leading carets (^) that indicate additional indentation level(s)
            while (trimmed.startsWith("^")) {
                depth += 1;
                trimmed = trimmed.slice(1).trim();
            }

            if (!trimmed) continue;

            const lower = trimmed.toLowerCase();

            // Special metadata blocks must be prefixed with an underscore (e.g. "_properties", "_rels")
            // This prevents normal bubbles named "properties" or "rels" from colliding with keywords.
            const isPropsSection = lower === "_properties" || lower === "_properties:";
            const isRelsSection = lower === "_rels" || lower === "_rels:";

            if (isPropsSection && stack.length > 0) {
                currentSection = "properties";
                sectionDepth = depth;
                continue;
            }
            if (isRelsSection && stack.length > 0) {
                currentSection = "rels";
                sectionDepth = depth;
                continue;
            }

            // Check if this line is an entry inside a section
            if (currentSection && depth > sectionDepth && stack.length > 0) {
                const currentNode = stack[stack.length - 1].node;
                const colonIdx = trimmed.indexOf(":");
                if (colonIdx !== -1) {
                    const key = trimmed.slice(0, colonIdx).trim();
                    const val = trimmed.slice(colonIdx + 1).trim();

                    if (currentSection === "properties") {
                        if (!currentNode.properties) currentNode.properties = {};
                        currentNode.properties[key] = val || "text";
                        if (val && !typesSet.has(val)) {
                            typesSet.add(val);
                        }
                    } else if (currentSection === "rels") {
                        pendingRels.push({
                            fromId: currentNode.id,
                            targetLabel: key,
                            relLabel: val || "related"
                        });
                    }
                    continue;
                }
            }

            // Otherwise, section has ended
            currentSection = null;

            // Adjust stack to find parent node at depth - 1
            while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
                stack.pop();
            }

            const parentNode = stack.length > 0 ? stack[stack.length - 1].node : null;
            const parentId = parentNode ? parentNode.id : null;
            const pos = getNodePos(parentId);

            const newNode = {
                id: nextNodeId++,
                parentId,
                label: trimmed,
                description: "",
                x: pos.x,
                y: pos.y,
                properties: {}
            };
            nodes.push(newNode);
            stack.push({ node: newNode, depth });
        }

        // Link pending relationships by label target
        const labelToNode = new Map();
        for (const n of nodes) {
            // First one wins if duplicates exist
            if (!labelToNode.has(n.label.toLowerCase())) {
                labelToNode.set(n.label.toLowerCase(), n);
            }
        }

        for (const pr of pendingRels) {
            let target = labelToNode.get(pr.targetLabel.toLowerCase());
            // Fallback: check if targetLabel is #<id>
            if (!target && pr.targetLabel.startsWith("#")) {
                const targetId = parseInt(pr.targetLabel.slice(1), 10);
                target = nodes.find(n => n.id === targetId);
            }
            if (target) {
                relationships.push({
                    id: nextRelId++,
                    from: pr.fromId,
                    to: target.id,
                    label: pr.relLabel,
                    description: "",
                    properties: {}
                });
            }
        }

        this.doc = {
            lastNodeId: nextNodeId - 1,
            lastRelId: nextRelId - 1,
            types: Array.from(typesSet),
            nodes,
            relationships
        };
        this.currentParentId = null;
        this.notify();
    }
}

