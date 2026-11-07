# Bubbles 🫧

A fast, lightweight, hierarchical visual system planner built entirely with pure vanilla JavaScript and HTML5 Canvas.

**Zero build tools. Zero external dependencies. 100% client-side.**

Live demo: https://student020341.github.io/bubble-planner/

---

## ✨ Features

- **Hierarchical Nesting:** Create top-level system concepts and drill down into isolated sub-layers to model architecture, user flows, state machines, and microservices without canvas clutter.
- **Directional Actions / Relationships:** Wire nodes together with typed, directed connections. Re-route connections by dragging pills, and inspect action properties directly.
- **Typed Metadata & Properties:** Define custom scalar property types (`text`, `number`, `boolean`, `select`, etc.) at the project level, and attach custom properties and multiline descriptions to both bubbles and actions.
- **Productivity-First Keyboard Navigation:**
  - **⚡ Actions Palette (`Ctrl+Space`)**: Instantly search and execute every editor command.
  - **🔍 Quick Jump (`Ctrl+K` or `J`)**: Fuzzy-search and teleport to any bubble across any layer in the hierarchy.
  - **Vim-style sequential keybindings**: Bind chords or sequences (e.g. `g > r` or `KeyB KeyN`).
  - **Custom Keybinding Manager**: Rebind any action, detect trigger conflicts, and filter settings with search.
- **Safe Confirmations:** Deletions require explicit confirmation (`Enter` or `Space` to confirm, any other key to cancel).
- **Data Persistence & Portability:**
  - **IndexedDB Multi-Project Persistence:** Seamless local storage supporting switching, creating, duplicating, renaming, and deleting projects.
  - **Lossless JSON Export & Import:** Full-fidelity backups including viewports, hierarchies, and custom property schemas.
  - **Token-Efficient Outline Export:** Produces clean, tab-indented outlines with encoded literals (`\n`, `\t`) and structured `_description`, `_properties`, and `_rels` blocks.
  - **Markdown Documentation & AI Ingestion Export:** Formats complete namespaced type hierarchies, scalar property tables, and typed method signatures for technical specs and prompt ingestion.

---

## 🚀 Getting Started

Because Bubbles has no build steps or external dependencies, running or trying it out requires zero setup:

### Option 1: Live Web App (GitHub Pages)
You can use the live application directly in your browser:
**👉 [https://student020341.github.io/bubble-planner/](https://student020341.github.io/bubble-planner/)**

### Option 2: Direct File Open
Clone the repository and double-click `index.html` (or open it directly in any modern browser):
```text
file:///path/to/bubbles/index.html
```

### Option 3: Local HTTP Server
Run a lightweight local server:
```bash
python3 -m http.server 8000
```
Then open [http://localhost:8000](http://localhost:8000).

---

## 💡 Core Concepts & Fundamentals

### 1. Hierarchical Bubbles
Bubbles represent entities, subsystems, components, or thoughts.
- **Create a Bubble:** Double-click any empty space on the canvas.
- **Drill Down (Enter Layer):** Double-click any bubble node to enter its isolated internal canvas.
- **Drill Up (Leave Layer):** Press `Esc` or click the breadcrumbs at the top of the screen.
- **Jump to Layer (`Ctrl+K` / `J`):** Search for any bubble name across the entire project to jump straight into it.
- **Grid Snapping:** Hold `Shift` while dragging to snap bubbles to the grid.

### 2. Directional Connections & Actions
Connect bubbles to describe actions, data flow, API calls, or relationships.
- **Connect Bubbles:** Hover over a bubble to reveal the floating `⚡` connector handle on its right side. Click and drag from the handle to a target bubble.
- **Rename Action:** Double-click the action pill on the connector line, or select it and press `E` or `L`.
- **Hide Action:** Click "Hide Action" in the Inspector to declutter the canvas and move the action into the connected bubbles' hidden drawer.
- **Re-route Action:** Click and drag either the source or target pill of an action to reconnect it to a different bubble.
- **Action Details:** Select an action and press `I` to view and edit its description and custom properties.

### 3. Properties & Inspector
Attach structured metadata to entities and relationships.
- **Quick-Filter Card (`P`):** Press `P` or click the `{}` handle on any selected bubble or action pill to open an in-place property editor.
- **Inspector Drawer (`I`):** View the full inspector panel for in-depth editing of titles, multiline notes/descriptions, and properties.
- **Custom Data Types:** Open Settings (`Ctrl+,`) to define schema types (text, numbers, booleans, tags, selections) that appear across all bubbles and actions.

---

## ⌨️ Default Keyboard & Mouse Shortcuts

| Trigger | Action | Description |
| :--- | :--- | :--- |
| `Double Click (Canvas)` | **Create Bubble** | Prompt to create a new bubble at the cursor location |
| `Double Click (Bubble)` | **Enter Bubble** | Drill down into the bubble's internal sub-layer |
| `Double Click (Action)` | **Edit Label** | Rename the clicked connection or action pill |
| `Escape` | **Leave Bubble** | Drill up to the parent bubble or root layer |
| `Ctrl + Space` | **Actions Palette** | Open palette to search and run all editor commands |
| `Ctrl + K` or `J` | **Jump to Layer** | Fuzzy search across all layers and jump to a bubble |
| `E` or `L` | **Edit Label** | Rename selected bubble or connection |
| `H` | **Hide Action** | Hide selected action from canvas and move to hidden drawer |
| `P` | **Property Filter** | Open inline property quick-filter card on selection |
| `I` | **Inspect Item** | Open inspector drawer for selected bubble or action |
| `Delete` / `Backspace` | **Delete Selection** | Prompt to delete selected bubble or connection |
| `Ctrl + ,` | **Settings** | Open settings drawer (shortcuts, data types, preferences) |
| `Shift + Drag` | **Grid Snapping** | Snap bubble to grid interval while dragging |
| `Scroll Wheel` | **Zoom** | Zoom canvas in / out centered at cursor |
| `Middle Mouse Drag` / `Space + Drag` | **Pan Canvas** | Pan the viewport |

> **Note on Confirmations:** When deleting, press `Enter` or `Space` to confirm, or press **any other key** (or click Cancel) to dismiss safely without deleting.

---

## 📤 Export & Data Formats

### 1. JSON Export / Import (`Full Fidelity`)
Use the **Export JSON** and **Import JSON** commands in the header menu or Actions Palette (`Ctrl+Space`) to back up and restore complete projects.
- Preserves node positions, camera coordinates, nested parent-child hierarchies, relationships, and custom property schemas.
- Ideal for version control, project archiving, and sharing complete workspaces.

### 2. Outline Export (`Token-Efficient / LLM-Friendly`)
Use **Export Outline** in the menu or palette to generate a clean, tab-indented textual representation of your entire architecture.
- Encodes multiline descriptions with code literals (`\n`, `\t`) to maintain single-line indent rules.
- Explicitly groups metadata and relationships under `_description`, `_properties`, and `_rels` blocks:

```text
Authentication Service
	_description: Core OAuth2 and JWT service provider\nSupports PKCE flow
	_properties
		status: production
		runtime: node20
	_rels
		User Database: queries_user_record
			_description: Validates credential hashes
			_properties
				protocol: postgres
		Notification Worker: dispatch_welcome_email
			_properties
				queue: sqs
	Token Store
		_description: In-memory token blacklist and refresh sessions
		_properties
			engine: redis
```

### 3. Markdown Documentation (`AI Ingestion & Technical Specs`)
Use **Export Markdown (Doc/AI)** in the Settings drawer or Actions Palette (`Ctrl+Space`) to generate full system ontology documentation:
- **Namespaced Type Paths:** Namespaces every entity hierarchically (`Postal Service.Customer Location`).
- **Typed Method Signatures:** Formats actions as callable signatures with destination entities and action properties as typed parameters:
  ```text
  deliver_mail(target: Postal Service.Customer Location, tracking_id: text, priority: number)
  ```
- **Entity Specifications:** Documents descriptions, scalar property tables, sub-components, and inbound action references.
- **Consolidated System Directory:** Summarizes all inter-entity actions in a complete system matrix.

---

## 🏗️ Project Architecture

Bubbles is intentionally organized into decoupled vanilla ES modules without bundlers or transpilation:

- **`index.html`**: Canvas container, base CSS reset, and script tags.
- **`models.js`**: Core data models (`BubbleNode`, `BubbleRelationship`, `ProjectData`, `CustomPropertyType`).
- **`store.js`**: State container (`ProjectStore`) handling hierarchies, undo/state tracking, and outline serialization.
- **`db.js`**: Client-side IndexedDB persistence adapter.
- **`camera.js`**: Infinite 2D pan/zoom camera transform manager.
- **`canvas_view.js`**: Canvas rendering engine, hit testing, drag-to-connect interaction, and drawing loops.
- **`actions.js`**: Command registry, keyboard chord/sequence parser, and shortcut dispatcher.
- **`ui.js`**: HTML/CSS overlays, drawers (Inspector, Settings, Quick Guide), palettes, modals, and property cards.
- **`main.js`**: Application bootstrapping, event listener binding, and wiring between modules.

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
