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
        // stub
        return null;
    }

    /**
     * Retrieve a value by key.
     * @param {string} key
     * @returns {Promise<any>}
     */
    async get(key) {
        // stub
        return null;
    }

    /**
     * Set a value for key.
     * @param {string} key
     * @param {any} val
     * @returns {Promise<void>}
     */
    async set(key, val) {
        // stub
    }

    /**
     * Delete an entry by key.
     * @param {string} key
     * @returns {Promise<void>}
     */
    async delete(key) {
        // stub
    }

    /**
     * List all keys in store.
     * @returns {Promise<string[]>}
     */
    async keys() {
        // stub
        return [];
    }
}
