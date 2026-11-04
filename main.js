// World setup: 1:1 screen mapping so Camera manages virtual space
setWorld(0, 0, "fill", false);

/** @type CanvasRenderingContext2D */
const ctx = canvasContext2D;

// Initialize Store with mock data
const store = new ProjectStore();

// Initialize Camera
const camera = new Camera(canvas);
camera.fitToNodes(store.getVisibleNodes());

// Initialize Canvas Interaction View
const canvasView = new CanvasView(canvas, store, camera);

// Keyboard shortcuts: Esc to drill up
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        store.leaveBubble();
        canvasView.selectedNode = null;
        camera.fitToNodes(store.getVisibleNodes());
    }
});

// Main Loop logic and render
const logic = (dt) => {
    // State updates if needed
};

const render = (dt, cw, ch) => {
    canvasView.render();
};

loop([logic, render]);
