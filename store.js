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

        /** @type {ProjectDocument} Seeded with initial mock data for immediate UI testing */
        this.doc = {
            lastNodeId: 4,
            lastRelId: 1,
            types: ["text", "number"],
            nodes: [
                { id: 1, parentId: null, label: "Postal Service", description: "Root system", x: 400, y: 300, properties: { hq: "text" } },
                { id: 2, parentId: 1, label: "Post Office", description: "Central hub", x: 250, y: 300, properties: {} },
                { id: 3, parentId: 1, label: "Mail Truck", description: "Transport unit", x: 500, y: 220, properties: {} },
                { id: 4, parentId: 1, label: "Customer Location", description: "Recipient address", x: 500, y: 380, properties: { address: "text" } }
            ],
            relationships: [
                { id: 1, from: 3, to: 4, label: "delivery", description: "Delivers mail", properties: {} }
            ]
        };

        /** @type {number|null} Active view level (null = root level) */
        this.currentParentId = null;

        /** @type {Array<() => void>} Change listeners */
        this.listeners = [];
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
            this.saveProject();
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
     * @param {string} projectId
     * @returns {Promise<void>}
     */
    async loadProject(projectId) {
        if (!this.db) return;
        const saved = await this.db.get(projectId);
        if (saved) {
            this.doc = saved;
            this.currentParentId = null;
            this.notify();
        }
    }

    /**
     * Save active project to IndexedDB.
     * @returns {Promise<void>}
     */
    async saveProject() {
        if (!this.db) return;
        await this.db.set(this.projectId, this.doc);
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
                lines.push(`${indent}\tproperties`);
                for (const [k, v] of props) {
                    lines.push(`${indent}\t\t${k}: ${v}`);
                }
            }

            // Rels
            const rels = outRels.get(node.id) || [];
            if (rels.length > 0) {
                lines.push(`${indent}\trels`);
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
     * @param {string} text
     */
    importOutline(text) {
        // Will implement parser in future step
    }
}
