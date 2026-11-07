/**
 * @file Camera handling pan, zoom, coordinate transforms, and dynamic auto-expanding bounds.
 */

class Camera {
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.x = 0;
        this.y = 0;
        this.zoom = 1;
        this.minZoom = 0.2;
        this.maxZoom = 3.0;

        /** Virtual bounding box around all current content */
        this.bounds = { minX: -2000, minY: -2000, maxX: 2000, maxY: 2000 };
        this.padding = 400;

        /** @type {(() => void)|null} Change callback */
        this.onTransformChange = null;
    }

    /**
     * Convert screen/pixel coordinate to virtual world coordinate.
     * @param {number} screenX
     * @param {number} screenY
     * @returns {{x: number, y: number}}
     */
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.canvas.width / (2 * (window.devicePixelRatio || 1))) / this.zoom + this.x,
            y: (screenY - this.canvas.height / (2 * (window.devicePixelRatio || 1))) / this.zoom + this.y
        };
    }

    /**
     * Convert virtual world coordinate to screen/pixel coordinate.
     * @param {number} worldX
     * @param {number} worldY
     * @returns {{x: number, y: number}}
     */
    worldToScreen(worldX, worldY) {
        const dpr = window.devicePixelRatio || 1;
        const cx = this.canvas.width / (2 * dpr);
        const cy = this.canvas.height / (2 * dpr);
        return {
            x: (worldX - this.x) * this.zoom + cx,
            y: (worldY - this.y) * this.zoom + cy
        };
    }

    /**
     * Pan camera by delta screen pixels.
     * @param {number} dx
     * @param {number} dy
     */
    pan(dx, dy) {
        this.x -= dx / this.zoom;
        this.y -= dy / this.zoom;
        if (this.onTransformChange) this.onTransformChange();
    }

    /**
     * Zoom into/out of a focal screen point.
     * @param {number} factor
     * @param {number} focalScreenX
     * @param {number} focalScreenY
     */
    zoomAt(factor, focalScreenX, focalScreenY) {
        const oldZoom = this.zoom;
        const newZoom = Math.min(this.maxZoom, Math.max(this.minZoom, oldZoom * factor));
        if (newZoom === oldZoom) return;

        // Keep world point under focal cursor fixed
        const worldFocal = this.screenToWorld(focalScreenX, focalScreenY);
        this.zoom = newZoom;
        const newWorldFocal = this.screenToWorld(focalScreenX, focalScreenY);

        this.x += (worldFocal.x - newWorldFocal.x);
        this.y += (worldFocal.y - newWorldFocal.y);
        if (this.onTransformChange) this.onTransformChange();
    }

    /**
     * Update auto-expanding virtual bounds based on list of active nodes.
     * @param {Array<{x: number, y: number}>} nodes
     */
    updateBounds(nodes) {
        if (!nodes || nodes.length === 0) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const n of nodes) {
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
        }
        this.bounds.minX = Math.min(this.bounds.minX, minX - this.padding);
        this.bounds.maxX = Math.max(this.bounds.maxX, maxX + this.padding);
        this.bounds.minY = Math.min(this.bounds.minY, minY - this.padding);
        this.bounds.maxY = Math.max(this.bounds.maxY, maxY + this.padding);
    }

    /**
     * Reset camera to center comfortably on visible nodes.
     * @param {Array<{x: number, y: number}>} [nodes]
     */
    fitToNodes(nodes = []) {
        if (!nodes || nodes.length === 0) {
            this.x = 0;
            this.y = 0;
            this.zoom = 1;
            if (this.onTransformChange) this.onTransformChange();
            return;
        }

        let sumX = 0;
        let sumY = 0;
        for (const n of nodes) {
            sumX += n.x;
            sumY += n.y;
        }
        this.x = sumX / nodes.length;
        this.y = sumY / nodes.length;
        this.zoom = 1;
        if (this.onTransformChange) this.onTransformChange();
    }

    /**
     * Apply camera transform matrix to 2D context.
     * @param {CanvasRenderingContext2D} ctx
     */
    applyTransform(ctx) {
        const dpr = window.devicePixelRatio || 1;
        const cx = this.canvas.width / (2 * dpr);
        const cy = this.canvas.height / (2 * dpr);

        ctx.translate(cx, cy);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-this.x, -this.y);
    }
}
