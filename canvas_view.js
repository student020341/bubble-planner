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
     * @returns {{node: BubbleNode|null, hitHandle: boolean}}
     */
    hitTest(screenX, screenY) {
        const worldPos = this.camera.screenToWorld(screenX, screenY);
        const nodes = this.store.getVisibleNodes();

        // 1. Check action handle for hovered or selected node first (including bridge zone)
        const activeNode = this.hoveredNode || this.selectedNode;
        if (activeNode) {
            const m = this.computeNodeMetrics(activeNode);
            const handleX = activeNode.x + m.width / 2 + 18;
            const handleY = activeNode.y;
            const dHandle = Math.hypot(worldPos.x - handleX, worldPos.y - handleY);

            // Handle circle + bridge rectangle between bubble right edge and handle
            const inBridge = (
                worldPos.x >= activeNode.x + m.width / 2 - 4 &&
                worldPos.x <= handleX + 14 &&
                Math.abs(worldPos.y - handleY) <= 14
            );

            if (dHandle <= 14 || inBridge) {
                return { node: activeNode, hitHandle: true };
            }
        }

        // 2. Check node bodies
        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = nodes[i];
            const m = this.computeNodeMetrics(node);

            const left = node.x - m.width / 2;
            const right = node.x + m.width / 2;
            const top = node.y - m.height / 2;
            const bottom = node.y + m.height / 2;

            if (worldPos.x >= left && worldPos.x <= right && worldPos.y >= top && worldPos.y <= bottom) {
                return { node, hitHandle: false };
            }
        }
        return { node: null, hitHandle: false };
    }

    onMouseDown(e) {
        this.lastMousePos = { x: e.clientX, y: e.clientY };

        // Middle click or Space+click = Pan
        if (e.button === 1 || e.spaceKey) {
            this.mode = "panning";
            return;
        }

        if (e.button === 0) {
            const hit = this.hitTest(e.clientX, e.clientY);

            if (hit.hitHandle && hit.node) {
                // Dragging from action handle (lightning)
                this.mode = "connecting_action";
                this.connectingSourceNode = hit.node;
                this.connectingCurrentPoint = this.camera.screenToWorld(e.clientX, e.clientY);
                return;
            }

            if (hit.node) {
                this.selectedNode = hit.node;
                this.lastFocusedNode = hit.node;
                this.selectedRelationship = null;
                const worldPos = this.camera.screenToWorld(e.clientX, e.clientY);
                this.dragOffset = { x: hit.node.x - worldPos.x, y: hit.node.y - worldPos.y };
                this.mode = "dragging_node";
                return;
            }

            // Clicked empty canvas
            this.selectedNode = null;
            this.selectedRelationship = null;
            this.mode = "panning";
        }
    }

    onMouseMove(e) {
        const dx = e.clientX - this.lastMousePos.x;
        const dy = e.clientY - this.lastMousePos.y;
        this.lastMousePos = { x: e.clientX, y: e.clientY };

        if (this.mode === "panning") {
            this.camera.pan(dx, dy);
            return;
        }

        if (this.mode === "dragging_node" && this.selectedNode) {
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
        this.canvas.style.cursor = hit.hitHandle ? "crosshair" : hit.node ? "pointer" : "default";
    }

    onMouseUp(e) {
        if (this.mode === "connecting_action") {
            const hit = this.hitTest(e.clientX, e.clientY);
            if (hit.node && this.connectingSourceNode && hit.node.id !== this.connectingSourceNode.id) {
                const actionLabel = window.prompt("Action label (e.g. delivery, call, send):", "action");
                if (actionLabel) {
                    this.store.addRelationship(this.connectingSourceNode.id, hit.node.id, actionLabel);
                }
            }
            this.connectingSourceNode = null;
            this.connectingCurrentPoint = null;
        }

        if (this.mode === "dragging_node") {
            this.store.notify();
        }

        this.mode = "idle";
    }

    onWheel(e) {
        e.preventDefault();
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
        const rels = this.store.getVisibleRelationships();
        const idToNode = new Map(this.store.doc.nodes.map(n => [n.id, n]));
        const visibleIds = new Set(this.store.getVisibleNodes().map(n => n.id));

        // Group intra-layer relationships by node pair
        const pairGroups = new Map();
        for (const rel of rels) {
            const isFromVis = visibleIds.has(rel.from);
            const isToVis = visibleIds.has(rel.to);
            if (isFromVis && isToVis) {
                const pairKey = rel.from < rel.to ? `${rel.from}-${rel.to}` : `${rel.to}-${rel.from}`;
                if (!pairGroups.has(pairKey)) pairGroups.set(pairKey, []);
                pairGroups.get(pairKey).push(rel);
            }
        }

        for (const rel of rels) {
            const fromNode = idToNode.get(rel.from);
            const toNode = idToNode.get(rel.to);
            if (!fromNode || !toNode) continue;

            const isFromVisible = visibleIds.has(rel.from);
            const isToVisible = visibleIds.has(rel.to);

            // Determine action color theme based on perspective node (selectedNode or lastFocusedNode):
            const perspectiveNode = this.selectedNode || this.lastFocusedNode;
            let color;

            if (perspectiveNode) {
                const isActive = Boolean(this.selectedNode);
                if (rel.from === perspectiveNode.id) {
                    // Outgoing from focused (Bright Blue)
                    color = {
                        stroke: isActive ? "rgba(56, 189, 248, 0.95)" : "rgba(56, 189, 248, 0.75)",
                        fill: "#38bdf8",
                        border: "rgba(56, 189, 248, 0.6)",
                        text: "#bae6fd",
                        lineWidth: isActive ? 2.5 : 2
                    };
                } else if (rel.to === perspectiveNode.id) {
                    // Incoming to focused (Bright Coral)
                    color = {
                        stroke: isActive ? "rgba(251, 146, 60, 0.95)" : "rgba(251, 146, 60, 0.75)",
                        fill: "#fb923c",
                        border: "rgba(251, 146, 60, 0.6)",
                        text: "#fed7aa",
                        lineWidth: isActive ? 2.5 : 2
                    };
                } else {
                    // Option 1: Unrelated action retains soft, subtle directional color (not dead gray)
                    const isForward = rel.from < rel.to;
                    color = isForward ? {
                        stroke: "rgba(56, 189, 248, 0.35)",
                        fill: "rgba(56, 189, 248, 0.4)",
                        border: "rgba(56, 189, 248, 0.25)",
                        text: "#7dd3fc",
                        lineWidth: 1.5
                    } : {
                        stroke: "rgba(251, 146, 60, 0.35)",
                        fill: "rgba(251, 146, 60, 0.4)",
                        border: "rgba(251, 146, 60, 0.25)",
                        text: "#fdba74",
                        lineWidth: 1.5
                    };
                }
            } else {
                // No node has ever been focused yet: standard direction colors
                if (rel.from < rel.to) {
                    color = { stroke: "rgba(56, 189, 248, 0.8)", fill: "#38bdf8", border: "rgba(56, 189, 248, 0.5)", text: "#bae6fd", lineWidth: 2 };
                } else {
                    color = { stroke: "rgba(251, 146, 60, 0.8)", fill: "#fb923c", border: "rgba(251, 146, 60, 0.5)", text: "#fed7aa", lineWidth: 2 };
                }
            }

            // Intra-layer relationship
            if (isFromVisible && isToVisible) {
                const pairKey = rel.from < rel.to ? `${rel.from}-${rel.to}` : `${rel.to}-${rel.from}`;
                const group = pairGroups.get(pairKey) || [rel];
                const index = group.indexOf(rel);
                const total = group.length;

                // Compute curvature offset: 0 if single; alternating curves if multiple
                let curvature = 0;
                if (total > 1) {
                    const step = 36;
                    const sign = (index % 2 === 0 ? 1 : -1) * (rel.from < rel.to ? 1 : -1);
                    const magnitude = Math.ceil((index + 1) / 2) * step;
                    curvature = sign * magnitude;
                }

                this.drawArrow(ctx, fromNode, toNode, rel.label, curvature, color);
            } else {
                // Cross-layer relationship indicator
                const visibleNode = isFromVisible ? fromNode : toNode;
                const otherNode = isFromVisible ? toNode : fromNode;
                const isIncoming = !isFromVisible;
                this.drawCrossLayerIndicator(ctx, visibleNode, otherNode, rel.label, isIncoming);
            }
        }
    }

    drawArrow(ctx, from, to, label, curvature = 0, color = null) {
        ctx.save();
        const strokeColor = color ? color.stroke : "rgba(100, 200, 255, 0.75)";
        const fillColor = color ? color.fill : "rgba(100, 200, 255, 0.9)";
        const borderColor = color ? color.border : "rgba(100, 200, 255, 0.4)";
        const textColor = color ? color.text : "#ddd";

        ctx.strokeStyle = strokeColor;
        ctx.fillStyle = fillColor;
        ctx.lineWidth = (color && color.lineWidth) ? color.lineWidth : 2;

        const mTo = this.computeNodeMetrics(to);
        const targetRadius = mTo.width / 2;

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = -dy / dist;
        const ny = dx / dist;

        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const ctrlX = midX + nx * curvature;
        const ctrlY = midY + ny * curvature;

        const tangentAngle = Math.atan2(to.y - ctrlY, to.x - ctrlX);
        const endX = to.x - Math.cos(tangentAngle) * (targetRadius + 6);
        const endY = to.y - Math.sin(tangentAngle) * (mTo.height / 2 + 6);

        // Path
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        if (curvature === 0) {
            ctx.lineTo(endX, endY);
        } else {
            ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
        }
        ctx.stroke();

        // Arrow head
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - 10 * Math.cos(tangentAngle - Math.PI / 6), endY - 10 * Math.sin(tangentAngle - Math.PI / 6));
        ctx.lineTo(endX - 10 * Math.cos(tangentAngle + Math.PI / 6), endY - 10 * Math.sin(tangentAngle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();

        // Label
        if (label) {
            const labelX = curvature === 0 ? midX : 0.25 * from.x + 0.5 * ctrlX + 0.25 * to.x;
            const labelY = curvature === 0 ? midY : 0.25 * from.y + 0.5 * ctrlY + 0.25 * to.y;

            ctx.font = "11px system-ui, sans-serif";
            const textW = ctx.measureText(label).width;

            ctx.fillStyle = "#111";
            ctx.fillRect(labelX - textW / 2 - 4, labelY - 8, textW + 8, 16);
            ctx.strokeStyle = borderColor;
            ctx.strokeRect(labelX - textW / 2 - 4, labelY - 8, textW + 8, 16);

            ctx.fillStyle = textColor;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(label, labelX, labelY);
        }

        ctx.restore();
    }

    drawCrossLayerIndicator(ctx, node, otherNode, label, isIncoming) {
        ctx.save();
        ctx.font = "11px system-ui, sans-serif";
        const tag = isIncoming ? `← ${label} (from ${otherNode.label})` : `→ ${label} (to ${otherNode.label})`;
        const tw = ctx.measureText(tag).width;

        const m = this.computeNodeMetrics(node);
        const yOffset = isIncoming ? -m.height / 2 - 14 : m.height / 2 + 14;

        ctx.fillStyle = "rgba(255, 180, 50, 0.2)";
        ctx.strokeStyle = "rgba(255, 180, 50, 0.6)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);

        ctx.fillRect(node.x - tw / 2 - 6, node.y + yOffset - 9, tw + 12, 18);
        ctx.strokeRect(node.x - tw / 2 - 6, node.y + yOffset - 9, tw + 12, 18);

        ctx.fillStyle = "#ffc060";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(tag, node.x, node.y + yOffset);
        ctx.restore();
    }

    renderConnectingLine(ctx) {
        ctx.save();
        ctx.strokeStyle = "#ffdd44";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);

        ctx.beginPath();
        ctx.moveTo(this.connectingSourceNode.x, this.connectingSourceNode.y);
        ctx.lineTo(this.connectingCurrentPoint.x, this.connectingCurrentPoint.y);
        ctx.stroke();
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

        // Action Connector Handle (lightning bolt icon on right)
        if (isSelected || isHovered) {
            const handleX = node.x + m.width / 2 + 18;
            const handleY = node.y;
            ctx.fillStyle = this.isActionHandleHovered && isHovered ? "#ffdd44" : "rgba(255, 220, 60, 0.7)";
            ctx.beginPath();
            ctx.arc(handleX, handleY, 11, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#000";
            ctx.font = "bold 12px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("⚡", handleX, handleY);
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
