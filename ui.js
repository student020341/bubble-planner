/**
 * @file UI overlay components: Breadcrumbs, side drawer inspector, and shortcut handling.
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

        /** @type {HTMLElement|null} */
        this.drawerContainer = null;

        this.mount();
        this.store.subscribe(() => this.renderBreadcrumbs());
    }

    /** Mount DOM overlay elements for top bar and breadcrumbs */
    mount() {
        // Top navigation bar
        this.topBar = document.createElement("div");
        this.topBar.id = "top-bar";
        this.topBar.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 42px;
            background: rgba(15, 23, 42, 0.85);
            backdrop-filter: blur(8px);
            border-bottom: 1px solid rgba(51, 65, 85, 0.7);
            display: flex;
            align-items: center;
            padding: 0 16px;
            gap: 8px;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 14px;
            z-index: 10;
            user-select: none;
        `;

        this.breadcrumbContainer = document.createElement("div");
        this.breadcrumbContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            flex-grow: 1;
        `;

        this.topBar.appendChild(this.breadcrumbContainer);
        document.body.appendChild(this.topBar);

        this.renderBreadcrumbs();
    }

    /** Re-render breadcrumb trail based on store state */
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

        // Crumb items
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

    /**
     * Create an interactive breadcrumb pill button
     * @param {string} label
     * @param {boolean} isCurrent
     * @param {() => void} onClick
     * @returns {HTMLElement}
     */
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
}
