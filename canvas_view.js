/**
 * @file Canvas rendering, hit testing, and direct manipulation state machine.
 */

class CanvasView {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {ProjectStore} store
     * @param {Camera} camera
     * @param {ActionRegistry} actionRegistry
     */
    constructor(canvas, store, camera, actionRegistry) {
        this.canvas = canvas;
        /** @type {CanvasRenderingContext2D} */
        this.ctx = canvas.getContext("2d");
        this.store = store;
        this.camera = camera;
        this.actionRegistry = actionRegistry;

        /** @type {'idle' | 'panning' | 'dragging_node' | 'connecting_action'} */
        this.mode = "idle";

        /** @type {BubbleNode|null} */
        this.selectedNode = null;

        /** @type {BubbleNode|null} Retains perspective when clicking off into unfocused state */
        this.lastFocusedNode = null;

        /** @type {BubbleRelationship|null} */
        this.selectedRelationship = null;

        /** @type {BubbleNode|null} */
        this.connectingSourceNode = null;

        /** @type {{x: number, y: number}|null} In world coordinates */
        this.connectingCurrentPoint = null;

        /** @type {BubbleNode|null} */
        this.hoveredNode = null;

        /** @type {boolean} */
        this.isActionHandleHovered = false;
        /** @type {boolean} */
        this.isInspectHandleHovered = false;
        /** @type {boolean} */
        this.isPropFilterHovered = false;
        /** @type {boolean} */
        this.isPropBadgeHovered = false;

        /** @type {number} Distance in screen pixels before mouse down counts as a drag */
        this.dragThreshold = 20;

        /** @type {{x: number, y: number}} Starting screen position when mouse went down */
        this.mouseDownScreenPos = { x: 0, y: 0 };

        /** @type {boolean} Whether movement has crossed dragThreshold */
        this.hasExceededDragThreshold = false;

        /** @type {{x: number, y: number}} */
        this.dragOffset = { x: 0, y: 0 };

        /** @type {{x: number, y: number}} */
        this.lastMousePos = { x: 0, y: 0 };

        this.bindEvents();
    }

    bindEvents() {
        this.canvas.addEventListener("mousedown", (e) => this.onMouseDown(e));
        window.addEventListener("mousemove", (e) => this.onMouseMove(e));
        window.addEventListener("mouseup", (e) => this.onMouseUp(e));
        this.canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
        this.canvas.addEventListener("dblclick", (e) => this.onDoubleClick(e));
    }

    /**
     * @param {BubbleNode} node
     * @returns {{width: number, height: number, radius: number, padX: number, padY: number}}
     */
    computeNodeMetrics(node) {
        this.ctx.font = "14px system-ui, -apple-system, sans-serif";
        const textWidth = this.ctx.measureText(node.label).width;
        const padX = 24;
        const padY = 16;
        const width = Math.max(80, textWidth + padX * 2);
        const height = 44;
        const radius = height / 2;
        return { width, height, radius, padX, padY };
    }

    /**
     * @param {number} screenX
     * @param {number} screenY
     * @returns {{node: BubbleNode|null, relationship: BubbleRelationship|null, hitHandle: boolean, hitInspectHandle: boolean, hitPropFilter: boolean, hitPropBadge?: boolean}}
     */
    hitTest(screenX, screenY) {
        const worldPos = this.camera.screenToWorld(screenX, screenY);
        const nodes = this.store.getVisibleNodes();

        // 1. Check handles for hovered or selected node first (including bridge zone)
        const activeNode = this.hoveredNode || this.selectedNode;
        if (activeNode) {
            const m = this.computeNodeMetrics(activeNode);
            const handleX = activeNode.x + m.width / 2 + 18; // ⚡ handle
            const inspectX = activeNode.x + m.width / 2 + 42; // 📝 handle
            const propX = activeNode.x + m.width / 2 + 66; // {} handle
            const handleY = activeNode.y;

            // Check {} property filter handle
            const dProp = Math.hypot(worldPos.x - propX, worldPos.y - handleY);
            if (dProp <= 13) {
                return { node: activeNode, relationship: null, hitHandle: false, hitInspectHandle: false, hitPropFilter: true, hitPropBadge: false };
            }

            // Check 📝 inspect handle
            const dInspect = Math.hypot(worldPos.x - inspectX, worldPos.y - handleY);
            if (dInspect <= 13) {
                return { node: activeNode, relationship: null, hitHandle: false, hitInspectHandle: true, hitPropFilter: false, hitPropBadge: false };
            }

            // Check ⚡ action handle
            const dHandle = Math.hypot(worldPos.x - handleX, worldPos.y - handleY);
            const inBridge = (
                worldPos.x >= activeNode.x + m.width / 2 - 4 &&
                worldPos.x <= propX + 14 &&
                Math.abs(worldPos.y - handleY) <= 14
            );

            if (dHandle <= 13 || (inBridge && worldPos.x <= handleX + 11)) {
                return { node: activeNode, relationship: null, hitHandle: true, hitInspectHandle: false, hitPropFilter: false, hitPropBadge: false };
            }

            if (inBridge) {
                return { node: activeNode, relationship: null, hitHandle: false, hitInspectHandle: false, hitPropFilter: false, hitPropBadge: false };
            }
        }

        // 2. Check property count badge {N} on visible nodes
        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = nodes[i];
            const propCount = Object.keys(node.properties || {}).length;
            if (propCount > 0) {
                const m = this.computeNodeMetrics(node);
                const propBadgeX = node.x - m.width / 2 + 4;
                const propBadgeY = node.y - m.height / 2 + 4;
                if (Math.hypot(worldPos.x - propBadgeX, worldPos.y - propBadgeY) <= 14) {
                    return { node, relationship: null, hitHandle: false, hitInspectHandle: false, hitPropFilter: true, hitPropBadge: true };
                }
            }
        }

        // 3. Check node bodies
        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = nodes[i];
            const m = this.computeNodeMetrics(node);

            const left = node.x - m.width / 2;
            const right = node.x + m.width / 2;
            const top = node.y - m.height / 2;
            const bottom = node.y + m.height / 2;

            if (worldPos.x >= left && worldPos.x <= right && worldPos.y >= top && worldPos.y <= bottom) {
                return { node, relationship: null, hitHandle: false, hitInspectHandle: false, hitPropFilter: false, hitPropBadge: false };
            }
        }

        // 3. Check action label hit boxes
        if (this.renderedLabelBoxes) {
            for (const item of this.renderedLabelBoxes) {
                if (
                    worldPos.x >= item.box.x &&
                    worldPos.x <= item.box.x + item.box.w &&
                    worldPos.y >= item.box.y &&
                    worldPos.y <= item.box.y + item.box.h
                ) {
                    return {
                        node: null,
                        relationship: item.rel,
                        hitHandle: false,
                        hitInspectHandle: false,
                        hitPropFilter: false,
                        labelX: item.box.x + item.box.w / 2,
                        labelY: item.box.y + item.box.h / 2
                    };
                }
            }
        }

        return { node: null, relationship: null, hitHandle: false, hitInspectHandle: false, hitPropFilter: false };
    }

    onMouseDown(e) {
        this.lastMousePos = { x: e.clientX, y: e.clientY };
        this.mouseDownScreenPos = { x: e.clientX, y: e.clientY };
        this.hasExceededDragThreshold = false;

        // Middle click or Space+click = Pan
        if (e.button === 1 || e.spaceKey) {
            this.mode = "panning";
            return;
        }

        if (e.button === 0) {
            const hit = this.hitTest(e.clientX, e.clientY);

            if (hit.hitPropFilter && hit.node) {
                this.selectedNode = hit.node;
                this.lastFocusedNode = hit.node;
                this.selectedRelationship = null;
                if (window.uiController) {
                    window.uiController.togglePropertyQuickFilter(hit.node);
                }
                e.stopPropagation();
                return;
            }

            if (hit.hitInspectHandle && hit.node) {
                this.selectedNode = hit.node;
                this.lastFocusedNode = hit.node;
                this.selectedRelationship = null;
                this.actionRegistry.execute("inspectEntity", {
                    store: this.store,
                    canvasView: this,
                    camera: this.camera,
                    node: hit.node
                });
                return;
            }

            if (hit.hitHandle && hit.node) {
                this.mode = "connecting_action";
                this.connectingSourceNode = hit.node;
                this.connectingCurrentPoint = this.camera.screenToWorld(e.clientX, e.clientY);
                return;
            }

            if (hit.relationship) {
                this.selectedRelationship = hit.relationship;
                this.selectedNode = null;
                this.mode = "idle";

                if (window.uiController) {
                    if (window.uiController.isInspectorOpen || window.uiController.autoOpenInspector) {
                        window.uiController.openInspector(hit.relationship);
                    }
                }
                return;
            }

            if (hit.node) {
                this.selectedNode = hit.node;
                this.lastFocusedNode = hit.node;
                this.selectedRelationship = null;
                const worldPos = this.camera.screenToWorld(e.clientX, e.clientY);
                this.dragOffset = { x: hit.node.x - worldPos.x, y: hit.node.y - worldPos.y };
                this.mode = "dragging_node";

                if (window.uiController) {
                    if (window.uiController.isInspectorOpen || window.uiController.autoOpenInspector) {
                        window.uiController.openInspector(hit.node);
                    }
                }

                this.actionRegistry.trigger("node:click", {
                    store: this.store,
                    canvasView: this,
                    camera: this.camera,
                    node: hit.node,
                    worldPos,
                    originalEvent: e
                });
                return;
            }

            // Clicked empty canvas
            this.selectedNode = null;
            this.selectedRelationship = null;
            this.mode = "panning";

            if (window.uiController && window.uiController.autoCloseInspector) {
                window.uiController.closeInspector();
            }

            const worldPos = this.camera.screenToWorld(e.clientX, e.clientY);
            this.actionRegistry.trigger("canvas:click", {
                store: this.store,
                canvasView: this,
                camera: this.camera,
                worldPos,
                originalEvent: e
            });
        }
    }

    onMouseMove(e) {
        const dx = e.clientX - this.lastMousePos.x;
        const dy = e.clientY - this.lastMousePos.y;
        this.lastMousePos = { x: e.clientX, y: e.clientY };

        const totalDist = Math.hypot(e.clientX - this.mouseDownScreenPos.x, e.clientY - this.mouseDownScreenPos.y);
        this.hasExceededDragThreshold = (totalDist >= this.dragThreshold);

        if (this.mode === "panning") {
            if (window.uiController) window.uiController.closePropertyQuickFilter();
            this.camera.pan(dx, dy);
            return;
        }

        if (this.mode === "dragging_node" && this.selectedNode) {
            if (window.uiController) window.uiController.closePropertyQuickFilter();
            const worldPos = this.camera.screenToWorld(e.clientX, e.clientY);
            this.selectedNode.x = worldPos.x + this.dragOffset.x;
            this.selectedNode.y = worldPos.y + this.dragOffset.y;
            this.camera.updateBounds(this.store.getVisibleNodes());
            return;
        }

        if (this.mode === "connecting_action") {
            this.connectingCurrentPoint = this.camera.screenToWorld(e.clientX, e.clientY);
            return;
        }

        // Hover test for cursor & handle display
        const hit = this.hitTest(e.clientX, e.clientY);
        this.hoveredNode = hit.node;
        this.isActionHandleHovered = hit.hitHandle;
        this.isInspectHandleHovered = hit.hitInspectHandle;
        this.isPropFilterHovered = hit.hitPropFilter && !hit.hitPropBadge;
        this.isPropBadgeHovered = Boolean(hit.hitPropBadge);
        this.canvas.style.cursor = (hit.hitHandle || hit.hitInspectHandle || hit.hitPropFilter) ? "pointer" : hit.relationship ? "pointer" : hit.node ? "grab" : "default";
    }

    onMouseUp(e) {
        if (this.mode === "connecting_action") {
            if (!this.hasExceededDragThreshold) {
                // Treated as a CLICK on ⚡ handle: focus node and open inspector on "Connect to Any Bubble"
                if (this.connectingSourceNode) {
                    this.selectedNode = this.connectingSourceNode;
                    this.lastFocusedNode = this.connectingSourceNode;
                    this.selectedRelationship = null;
                    if (window.uiController) {
                        window.uiController.openInspector(this.connectingSourceNode, { focusSearch: true });
                    }
                }
            } else {
                // Treated as a DRAG to connect: test target node
                const hit = this.hitTest(e.clientX, e.clientY);
                if (hit.node && this.connectingSourceNode && hit.node.id !== this.connectingSourceNode.id) {
                    const actionLabel = window.prompt("Action label (e.g. delivery, call, send):", "action");
                    if (actionLabel) {
                        this.store.addRelationship(this.connectingSourceNode.id, hit.node.id, actionLabel);
                    }
                }
            }
            this.connectingSourceNode = null;
            this.connectingCurrentPoint = null;
        }

        if (this.mode === "dragging_node" || this.mode === "dragging_action_label") {
            this.store.notify();
        }

        this.mode = "idle";
    }

    onWheel(e) {
        e.preventDefault();
        if (window.uiController) window.uiController.closePropertyQuickFilter();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        this.camera.zoomAt(factor, e.clientX, e.clientY);
    }

    onDoubleClick(e) {
        const hit = this.hitTest(e.clientX, e.clientY);
        const worldPos = this.camera.screenToWorld(e.clientX, e.clientY);

        const context = {
            store: this.store,
            canvasView: this,
            camera: this.camera,
            node: hit.node,
            worldPos,
            originalEvent: e
        };

        if (hit.node) {
            this.actionRegistry.trigger("node:dblclick", context);
        } else {
            this.actionRegistry.trigger("canvas:dblclick", context);
        }
    }

    render() {
        const ctx = this.ctx;
        const dpr = window.devicePixelRatio || 1;
        const cw = window.innerWidth;
        const ch = window.innerHeight;

        // Clear full canvas
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cw * dpr, ch * dpr);
        ctx.restore();

        // World transform pass
        ctx.save();
        this.camera.applyTransform(ctx);

        // 1. Draw grid / bounds hint
        this.renderGrid(ctx);

        // 2. Draw relationships (lines/arrows)
        this.renderRelationships(ctx);

        // 3. Draw temporary connecting line if dragging
        if (this.mode === "connecting_action" && this.connectingSourceNode && this.connectingCurrentPoint) {
            this.renderConnectingLine(ctx);
        }

        // 4. Draw nodes
        const nodes = this.store.getVisibleNodes();
        for (const node of nodes) {
            this.renderNode(ctx, node);
        }

        ctx.restore();

        // 5. Draw screen HUD (breadcrumbs & info overlay)
        this.renderHUD(ctx);
    }

    renderGrid(ctx) {
        const bounds = this.camera.bounds;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
        ctx.lineWidth = 1;
        const step = 80;

        ctx.beginPath();
        for (let x = bounds.minX; x <= bounds.maxX; x += step) {
            ctx.moveTo(x, bounds.minY);
            ctx.lineTo(x, bounds.maxY);
        }
        for (let y = bounds.minY; y <= bounds.maxY; y += step) {
            ctx.moveTo(bounds.minX, y);
            ctx.lineTo(bounds.maxX, y);
        }
        ctx.stroke();
    }

    renderRelationships(ctx) {
        this.renderedLabelBoxes = [];
        const allRels = this.store.getVisibleRelationships();
        const rels = allRels.filter(r => !r.hidden);

        const idToNode = new Map(this.store.doc.nodes.map(n => [n.id, n]));
        const visibleIds = new Set(this.store.getVisibleNodes().map(n => n.id));

        // Group intra-layer relationships by undirected pair (nodeA < nodeB)
        const pairGroups = new Map();
        const crossLayerRels = [];

        for (const rel of rels) {
            const isFromVis = visibleIds.has(rel.from);
            const isToVis = visibleIds.has(rel.to);

            if (isFromVis && isToVis) {
                const nodeAId = Math.min(rel.from, rel.to);
                const nodeBId = Math.max(rel.from, rel.to);
                const pairKey = `${nodeAId}-${nodeBId}`;

                if (!pairGroups.has(pairKey)) {
                    pairGroups.set(pairKey, {
                        nodeA: idToNode.get(nodeAId),
                        nodeB: idToNode.get(nodeBId),
                        rels: []
                    });
                }
                pairGroups.get(pairKey).rels.push(rel);
            } else {
                crossLayerRels.push(rel);
            }
        }

        // Pass 1: Draw Straight Directional Trunk Lines (1 or 2 lines per pair)
        const pendingLabels = [];

        for (const pair of pairGroups.values()) {
            const { nodeA, nodeB, rels: groupRels } = pair;
            if (!nodeA || !nodeB) continue;

            // Check which directional flows exist in this pair
            const hasAtoB = groupRels.some(r => r.from === nodeA.id);
            const hasBtoA = groupRels.some(r => r.from === nodeB.id);
            const isBidirectional = hasAtoB && hasBtoA;

            const dx = nodeB.x - nodeA.x;
            const dy = nodeB.y - nodeA.y;
            const dist = Math.hypot(dx, dy) || 1;
            const nx = -dy / dist; // Perpendicular normal
            const ny = dx / dist;

            const gutter = isBidirectional ? 8 : 0;

            // Draw A -> B trunk line if present
            if (hasAtoB) {
                const color = this.computeTrunkColor(nodeA.id, nodeB.id, groupRels);
                this.drawStraightTrunk(ctx, nodeA, nodeB, nx * gutter, ny * gutter, color);
            }

            // Draw B -> A trunk line if present
            if (hasBtoA) {
                const color = this.computeTrunkColor(nodeB.id, nodeA.id, groupRels);
                this.drawStraightTrunk(ctx, nodeB, nodeA, -nx * gutter, -ny * gutter, color);
            }

            // Collect labels in order: stack vertically at (midX, midY)
            const midX = (nodeA.x + nodeB.x) / 2;
            const midY = (nodeA.y + nodeB.y) / 2;
            const total = groupRels.length;
            const verticalStep = 24;

            for (let i = 0; i < total; i++) {
                const rel = groupRels[i];
                const isFromA = rel.from === nodeA.id;
                const rungOffset = (i - (total - 1) / 2) * verticalStep;
                const labelColor = this.computeActionColor(rel);

                pendingLabels.push({
                    rel,
                    label: `${isFromA ? "→" : "←"} ${rel.label}`,
                    x: midX,
                    y: midY + rungOffset,
                    color: labelColor
                });
            }
        }

        // Cross-layer descriptors
        for (const rel of crossLayerRels) {
            const fromNode = idToNode.get(rel.from);
            const toNode = idToNode.get(rel.to);
            if (!fromNode || !toNode) continue;

            const isFromVis = visibleIds.has(rel.from);
            const visibleNode = isFromVis ? fromNode : toNode;
            const otherNode = isFromVis ? toNode : fromNode;
            const isIncoming = !isFromVis;

            pendingLabels.push({
                isCrossLayer: true,
                node: visibleNode,
                otherNode,
                label: rel.label,
                isIncoming,
                rel
            });
        }

        // Pass 2: Draw all label pills ON TOP of all trunk lines
        for (const desc of pendingLabels) {
            if (desc.isCrossLayer) {
                this.drawCrossLayerIndicator(ctx, desc.node, desc.otherNode, desc.label, desc.isIncoming, desc.rel);
            } else {
                this.drawCenteredPillLabel(ctx, desc);
            }
        }
    }

    computeTrunkColor(fromId, toId, groupRels) {
        const perspectiveNode = this.selectedNode || this.lastFocusedNode;
        const isActive = Boolean(this.selectedNode);

        // If one of the rels in this trunk is actively selected
        const hasSelectedRel = groupRels.some(r => r.id === (this.selectedRelationship && this.selectedRelationship.id) && r.from === fromId);
        if (hasSelectedRel) {
            return { stroke: "#38bdf8", fill: "#38bdf8", lineWidth: 3 };
        }

        if (perspectiveNode) {
            if (fromId === perspectiveNode.id) {
                return { stroke: isActive ? "rgba(56, 189, 248, 0.95)" : "rgba(56, 189, 248, 0.75)", fill: "#38bdf8", lineWidth: 2.5 };
            } else if (toId === perspectiveNode.id) {
                return { stroke: isActive ? "rgba(251, 146, 60, 0.95)" : "rgba(251, 146, 60, 0.75)", fill: "#fb923c", lineWidth: 2.5 };
            } else {
                return fromId < toId
                    ? { stroke: "rgba(56, 189, 248, 0.35)", fill: "rgba(56, 189, 248, 0.4)", lineWidth: 1.5 }
                    : { stroke: "rgba(251, 146, 60, 0.35)", fill: "rgba(251, 146, 60, 0.4)", lineWidth: 1.5 };
            }
        } else {
            return fromId < toId
                ? { stroke: "rgba(56, 189, 248, 0.8)", fill: "#38bdf8", lineWidth: 2 }
                : { stroke: "rgba(251, 146, 60, 0.8)", fill: "#fb923c", lineWidth: 2 };
        }
    }

    computeActionColor(rel) {
        const perspectiveNode = this.selectedNode || this.lastFocusedNode;
        const isActive = Boolean(this.selectedNode);

        if (rel === this.selectedRelationship) {
            return { stroke: "#38bdf8", fill: "#38bdf8", border: "#00c3ff", text: "#ffffff" };
        }

        if (perspectiveNode) {
            if (rel.from === perspectiveNode.id) {
                return {
                    stroke: isActive ? "rgba(56, 189, 248, 0.95)" : "rgba(56, 189, 248, 0.75)",
                    border: "rgba(56, 189, 248, 0.6)",
                    text: "#bae6fd"
                };
            } else if (rel.to === perspectiveNode.id) {
                return {
                    stroke: isActive ? "rgba(251, 146, 60, 0.95)" : "rgba(251, 146, 60, 0.75)",
                    border: "rgba(251, 146, 60, 0.6)",
                    text: "#fed7aa"
                };
            } else {
                const isForward = rel.from < rel.to;
                return isForward ? {
                    stroke: "rgba(56, 189, 248, 0.35)",
                    border: "rgba(56, 189, 248, 0.35)",
                    text: "#7dd3fc"
                } : {
                    stroke: "rgba(251, 146, 60, 0.35)",
                    border: "rgba(251, 146, 60, 0.35)",
                    text: "#fdba74"
                };
            }
        } else {
            return rel.from < rel.to
                ? { stroke: "rgba(56, 189, 248, 0.8)", border: "rgba(56, 189, 248, 0.5)", text: "#bae6fd" }
                : { stroke: "rgba(251, 146, 60, 0.8)", border: "rgba(251, 146, 60, 0.5)", text: "#fed7aa" };
        }
    }

    drawStraightTrunk(ctx, fromNode, toNode, offsetNormalX, offsetNormalY, color) {
        ctx.save();
        ctx.strokeStyle = color.stroke;
        ctx.fillStyle = color.fill;
        ctx.lineWidth = color.lineWidth || 2;

        const mTo = this.computeNodeMetrics(toNode);

        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        const angle = Math.atan2(dy, dx);

        const startX = fromNode.x + offsetNormalX;
        const startY = fromNode.y + offsetNormalY;

        // Accurate pill edge intersection for target node
        // Compute distance from node center to boundary along line angle
        const cosA = Math.abs(Math.cos(angle));
        const sinA = Math.abs(Math.sin(angle));
        const halfW = mTo.width / 2;
        const halfH = mTo.height / 2;
        // Clamp to rounded box boundary
        const stopDist = Math.min(halfW / (cosA || 0.001), halfH / (sinA || 0.001)) + 5;

        const endX = (toNode.x + offsetNormalX) - Math.cos(angle) * stopDist;
        const endY = (toNode.y + offsetNormalY) - Math.sin(angle) * stopDist;

        // Straight line
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Arrow head (aligned strictly with the line vector)
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - 9 * Math.cos(angle - Math.PI / 6), endY - 9 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(endX - 9 * Math.cos(angle + Math.PI / 6), endY - 9 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    drawCenteredPillLabel(ctx, desc) {
        const { label, x, y, color, rel } = desc;
        if (!label) return;

        ctx.save();
        const borderColor = color ? color.border : "rgba(100, 200, 255, 0.4)";
        const textColor = color ? color.text : "#ddd";

        ctx.font = "11px system-ui, sans-serif";
        const textW = ctx.measureText(label).width;

        const isSelected = rel && rel === this.selectedRelationship;
        const pillW = textW + 16;
        const pillH = 18;
        const pillX = x - pillW / 2;
        const pillY = y - pillH / 2;

        if (rel) {
            this.renderedLabelBoxes.push({ rel, box: { x: pillX, y: pillY, w: pillW, h: pillH } });
        }

        // Solid background completely masks trunk lines passing underneath
        ctx.fillStyle = isSelected ? "#0f172a" : "#0a0f16";
        ctx.fillRect(pillX, pillY, pillW, pillH);

        ctx.strokeStyle = isSelected ? "#00c3ff" : borderColor;
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.strokeRect(pillX, pillY, pillW, pillH);

        ctx.fillStyle = isSelected ? "#38bdf8" : textColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x, y);

        ctx.restore();
    }

    drawCrossLayerIndicator(ctx, node, otherNode, label, isIncoming, rel = null) {
        ctx.save();
        ctx.font = "11px system-ui, sans-serif";
        const tag = isIncoming ? `← ${label} (from ${otherNode.label})` : `→ ${label} (to ${otherNode.label})`;
        const tw = ctx.measureText(tag).width;

        const m = this.computeNodeMetrics(node);
        const yOffset = isIncoming ? -m.height / 2 - 14 : m.height / 2 + 14;

        const isSelected = rel && rel === this.selectedRelationship;

        const badgeX = node.x - tw / 2 - 6;
        const badgeY = node.y + yOffset - 9;
        const badgeW = tw + 12;
        const badgeH = 18;

        if (rel) {
            this.renderedLabelBoxes.push({ rel, box: { x: badgeX, y: badgeY, w: badgeW, h: badgeH } });
        }

        // Blue if outgoing, Coral if incoming
        const bgColor = isSelected ? "#0f172a" : isIncoming ? "rgba(251, 146, 60, 0.15)" : "rgba(56, 189, 248, 0.15)";
        const borderColor = isSelected ? "#00c3ff" : isIncoming ? "rgba(251, 146, 60, 0.6)" : "rgba(56, 189, 248, 0.6)";
        const textColor = isSelected ? "#38bdf8" : isIncoming ? "#fed7aa" : "#bae6fd";

        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = isSelected ? 2 : 1;
        if (!isSelected) ctx.setLineDash([3, 3]);

        ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
        ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

        ctx.fillStyle = textColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(tag, node.x, node.y + yOffset);
        ctx.restore();
    }

    renderConnectingLine(ctx) {
        ctx.save();
        const m = this.computeNodeMetrics(this.connectingSourceNode);
        const handleX = this.connectingSourceNode.x + m.width / 2 + 18;
        const handleY = this.connectingSourceNode.y;

        const worldThreshold = this.dragThreshold / this.camera.zoom;

        if (!this.hasExceededDragThreshold) {
            // Inside Deadzone: Draw faint deadzone boundary circle
            ctx.strokeStyle = "rgba(255, 220, 60, 0.4)";
            ctx.fillStyle = "rgba(255, 220, 60, 0.05)";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);

            ctx.beginPath();
            ctx.arc(handleX, handleY, worldThreshold, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Soft tether to cursor
            ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(handleX, handleY);
            ctx.lineTo(this.connectingCurrentPoint.x, this.connectingCurrentPoint.y);
            ctx.stroke();
        } else {
            // Exceeded Deadzone: Active drag-to-connect line
            ctx.strokeStyle = "#ffdd44";
            ctx.lineWidth = 2.5;
            ctx.setLineDash([6, 4]);

            ctx.beginPath();
            ctx.moveTo(handleX, handleY);
            ctx.lineTo(this.connectingCurrentPoint.x, this.connectingCurrentPoint.y);
            ctx.stroke();

            // Drag target ring under cursor
            ctx.fillStyle = "rgba(255, 220, 60, 0.8)";
            ctx.beginPath();
            ctx.arc(this.connectingCurrentPoint.x, this.connectingCurrentPoint.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    renderNode(ctx, node) {
        const m = this.computeNodeMetrics(node);
        const isSelected = node === this.selectedNode;
        const isHovered = node === this.hoveredNode;

        const childCount = this.store.doc.nodes.filter(n => n.parentId === node.id).length;

        ctx.save();

        // Node Body (Rounded Pill)
        ctx.fillStyle = isSelected ? "#2a3b4c" : isHovered ? "#222a33" : "#181e26";
        ctx.strokeStyle = isSelected ? "#00c3ff" : isHovered ? "#66a0cc" : "#445566";
        ctx.lineWidth = isSelected ? 2.5 : 1.5;

        const left = node.x - m.width / 2;
        const top = node.y - m.height / 2;
        const r = m.radius;

        ctx.beginPath();
        ctx.roundRect(left, top, m.width, m.height, r);
        ctx.fill();
        ctx.stroke();

        // Label
        ctx.fillStyle = "#f0f4f8";
        ctx.font = "14px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(node.label, node.x, node.y);

        // Child Badge (indicates drill-down layer exists)
        if (childCount > 0) {
            const badgeX = node.x + m.width / 2 - 4;
            const badgeY = node.y - m.height / 2 + 4;
            ctx.fillStyle = "#00c3ff";
            ctx.beginPath();
            ctx.arc(badgeX, badgeY, 9, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#000";
            ctx.font = "bold 10px system-ui";
            ctx.fillText(childCount.toString(), badgeX, badgeY);
        }

        // Property Count Badge (shows {N} if node has properties defined)
        const propCount = Object.keys(node.properties || {}).length;
        if (propCount > 0) {
            const propBadgeX = node.x - m.width / 2 + 4;
            const propBadgeY = node.y - m.height / 2 + 4;
            const isBadgeHovered = this.isPropBadgeHovered && this.hoveredNode === node;
            const rBadge = isBadgeHovered ? 11 : 9;

            ctx.fillStyle = isBadgeHovered ? "#c084fc" : "rgba(168, 85, 247, 0.9)"; // Purple, lighter on hover
            ctx.beginPath();
            ctx.arc(propBadgeX, propBadgeY, rBadge, 0, Math.PI * 2);
            ctx.fill();

            if (isBadgeHovered) {
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            ctx.fillStyle = "#fff";
            ctx.font = isBadgeHovered ? "bold 10px system-ui" : "bold 9px system-ui";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(propCount.toString(), propBadgeX, propBadgeY);
        }

        // Contextual Handles (⚡ Action, 📝 Inspect, {} Prop Filter on right)
        if (isSelected || isHovered) {
            const handleX = node.x + m.width / 2 + 18;
            const inspectX = node.x + m.width / 2 + 42;
            const propX = node.x + m.width / 2 + 66;
            const handleY = node.y;

            // 1. Action Handle (⚡)
            const isActionHovered = this.isActionHandleHovered && isHovered;
            ctx.fillStyle = isActionHovered ? "#ffdd44" : "rgba(255, 220, 60, 0.75)";
            ctx.beginPath();
            ctx.arc(handleX, handleY, isActionHovered ? 12 : 11, 0, Math.PI * 2);
            ctx.fill();

            if (isActionHovered) {
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            ctx.fillStyle = "#000";
            ctx.font = "bold 12px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("⚡", handleX, handleY);

            // 2. Inspect Handle (📝)
            const isInspectHovered = this.isInspectHandleHovered && isHovered;
            ctx.fillStyle = isInspectHovered ? "#38bdf8" : "rgba(56, 189, 248, 0.8)";
            ctx.beginPath();
            ctx.arc(inspectX, handleY, isInspectHovered ? 12 : 11, 0, Math.PI * 2);
            ctx.fill();

            if (isInspectHovered) {
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            ctx.fillStyle = "#000";
            ctx.font = "11px sans-serif";
            ctx.fillText("📝", inspectX, handleY);

            // 3. Properties Quick-Filter Handle ({})
            const isPropHovered = this.isPropFilterHovered && isHovered;
            ctx.fillStyle = isPropHovered ? "#c084fc" : "rgba(168, 85, 247, 0.85)";
            ctx.beginPath();
            ctx.arc(propX, handleY, isPropHovered ? 12 : 11, 0, Math.PI * 2);
            ctx.fill();

            if (isPropHovered) {
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            ctx.fillStyle = "#fff";
            ctx.font = isPropHovered ? "bold 11px monospace" : "bold 10px monospace";
            ctx.fillText("{}", propX, handleY);
        }

        ctx.restore();
    }

    renderHUD(ctx) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Help hint on bottom
        ctx.font = "12px system-ui, sans-serif";
        ctx.fillStyle = "#64748b";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("Double-click: Drill In / Add  |  Drag ⚡: Connect  |  Esc: Back up  |  E: Edit  |  Del: Delete", 20, window.innerHeight - 18);

        ctx.restore();
    }
}
