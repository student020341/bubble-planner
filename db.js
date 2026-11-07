/**
 * @file Minimal IndexedDB key-value wrapper for project persistence.
 */

class StorageDB {
    /**
     * @param {string} [dbName='bubbles_db'] - Name of the database.
     * @param {string} [storeName='projects'] - Name of the object store.
     */
    constructor(dbName = "bubbles_db", storeName = "projects") {
        this.dbName = dbName;
        this.storeName = storeName;
        /** @type {IDBDatabase|null} */
        this._db = null;
    }

    /**
     * Initialize connection to IndexedDB.
     * @returns {Promise<IDBDatabase>}
     */
    async init() {
        if (this._db) return this._db;
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
            req.onsuccess = () => {
                this._db = req.result;
                resolve(this._db);
            };
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Retrieve a value by key.
     * @param {string} key
     * @returns {Promise<any>}
     */
    async get(key) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, "readonly");
            const store = tx.objectStore(this.storeName);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Set a value for key.
     * @param {string} key
     * @param {any} val
     * @returns {Promise<void>}
     */
    async set(key, val) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, "readwrite");
            const store = tx.objectStore(this.storeName);
            const req = store.put(val, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Delete an entry by key.
     * @param {string} key
     * @returns {Promise<void>}
     */
    async delete(key) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, "readwrite");
            const store = tx.objectStore(this.storeName);
            const req = store.delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * List all keys in store.
     * @returns {Promise<string[]>}
     */
    async keys() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, "readonly");
            const store = tx.objectStore(this.storeName);
            const req = store.getAllKeys();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Clear all records in store.
     * @returns {Promise<void>}
     */
    async clear() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, "readwrite");
            const store = tx.objectStore(this.storeName);
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }
}
