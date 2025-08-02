/**
 * IndexedDB helper module to abstract basic CRUD operations.
 * This mirrors the original `db` object in index.js so that
 * state can be persisted without duplicating logic. Exporting
 * a singleton object allows other modules to share the same
 * connection and transactions.
 */

const db = {
    _dbPromise: null,
    /**
     * Opens a connection to the IndexedDB database named `temarioDB`.
     * If the database does not exist, it is created with object stores
     * for topics, sections and a generic key/value store.
     *
     * @returns {Promise<IDBDatabase>} A promise that resolves with the database instance.
     */
    connect() {
        if (this._dbPromise) return this._dbPromise;

        this._dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open('temarioDB', 1);

            request.onerror = () => {
                console.error('IndexedDB error:', request.error);
                reject('Error opening IndexedDB.');
            };

            request.onsuccess = (e) => {
                resolve(e.target.result);
            };

            request.onupgradeneeded = (e) => {
                const dbInstance = e.target.result;
                if (!dbInstance.objectStoreNames.contains('topics')) {
                    dbInstance.createObjectStore('topics', { keyPath: 'id' });
                }
                if (!dbInstance.objectStoreNames.contains('sections')) {
                    dbInstance.createObjectStore('sections', { keyPath: 'id' });
                }
                if (!dbInstance.objectStoreNames.contains('keyvalue')) {
                    dbInstance.createObjectStore('keyvalue', { keyPath: 'key' });
                }
            };
        });
        return this._dbPromise;
    },

    /**
     * Returns an object store in the specified mode. Internal use only.
     *
     * @param {string} storeName The name of the object store
     * @param {IDBTransactionMode} mode The transaction mode ('readonly' or 'readwrite')
     * @returns {Promise<IDBObjectStore>} A promise that resolves with the object store
     */
    async _getStore(storeName, mode) {
        const database = await this.connect();
        return database.transaction(storeName, mode).objectStore(storeName);
    },

    /**
     * Writes a value into an object store.
     *
     * @param {string} storeName The store to write into
     * @param {any} value The value to store (must include the key)
     * @returns {Promise<any>} A promise that resolves with the result key
     */
    async set(storeName, value) {
        const store = await this._getStore(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.put(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => {
                console.error(`Error setting value in ${storeName}:`, e.target.error);
                reject(e.target.error);
            };
        });
    },

    /**
     * Reads a value from an object store by key.
     *
     * @param {string} storeName The store to read from
     * @param {any} key The record key
     * @returns {Promise<any>} A promise that resolves with the stored value
     */
    async get(storeName, key) {
        const store = await this._getStore(storeName, 'readonly');
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => {
                console.error(`Error getting value from ${storeName}:`, e.target.error);
                reject(e.target.error);
            };
        });
    },

    /**
     * Reads all records from an object store.
     *
     * @param {string} storeName The store to read from
     * @returns {Promise<any[]>} A promise that resolves with an array of all records
     */
    async getAll(storeName) {
        const store = await this._getStore(storeName, 'readonly');
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => {
                console.error(`Error getting all from ${storeName}:`, e.target.error);
                reject(e.target.error);
            };
        });
    }
};

export default db;