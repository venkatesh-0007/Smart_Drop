// background.js - Smart Drop Shared Service Worker
const DB_NAME = 'SmartDropDB_v2';
const STORE_NAME = 'vault';
let db = null;

// Initialize database inside Extension Origin context
const initDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = (e) => {
    const d = e.target.result;
    if (!d.objectStoreNames.contains(STORE_NAME)) {
      d.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    }
  };
  req.onsuccess = (e) => {
    db = e.target.result;
    migrateExistingData().then(() => resolve(db));
  };
  req.onerror = (e) => reject(e.target.error);
});

// Migrates old base64 data URLs to raw Blobs
const migrateExistingData = () => new Promise((resolve) => {
  const tx = db.transaction([STORE_NAME], 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.getAll().onsuccess = (e) => {
    const records = e.target.result || [];
    const promises = records.map(record => {
      if (record.data && !record.file) {
        try {
          const blob = dataURLtoBlob(record.data);
          if (blob) {
            record.file = blob;
            record.size = blob.size;
            record.timestamp = record.timestamp || Date.now();
            record.isFavorite = record.isFavorite || false;
            record.lastUsed = record.lastUsed || record.timestamp || Date.now();
            delete record.data; // Save storage space by removing base64 string
            return new Promise((res) => {
              const req = store.put(record);
              req.onsuccess = () => res();
              req.onerror = () => res();
            });
          }
        } catch (err) {
          console.error("Smart Drop background migration error:", record.name, err);
        }
      }
      return Promise.resolve();
    });
    Promise.all(promises).then(() => resolve());
  };
});

const dataURLtoBlob = (dataurl) => {
  if (!dataurl || !dataurl.includes(',')) return null;
  try {
    const arr = dataurl.split(',');
    const match = arr[0].match(/:(.*?);/);
    const mime = match ? match[1] : 'application/octet-stream';
    const bstr = atob(arr[1]); 
    let n = bstr.length; 
    const u8 = new Uint8Array(n);
    while (n--) u8[n] = bstr.charCodeAt(n);
    return new Blob([u8], { type: mime });
  } catch (e) {
    return null;
  }
};

const dbPromise = initDB();

async function getDB() {
  if (!db) {
    db = await dbPromise;
  }
  return db;
}

const getFileRecord = (id) => new Promise(async (resolve, reject) => {
  try {
    const database = await getDB();
    const tx = database.transaction([STORE_NAME], 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  } catch (err) {
    reject(err);
  }
});

// ─── MESSAGE LISTENERS ───
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "OPEN_AUTH_WINDOW") {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        console.error("Smart Drop Auth Error:", chrome.runtime.lastError.message);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, token: token });
      }
    });
    return true; 
  }

  // DATABASE CRUD ROUTING (runs under Extension Origin)
  if (request.action === "GET_VAULT_FILES") {
    handleGetVaultFiles(sendResponse);
    return true;
  }
  if (request.action === "SAVE_VAULT_FILE") {
    handleSaveVaultFile(request.fileRecord, request.arrayBuffer, sendResponse);
    return true;
  }
  if (request.action === "DELETE_VAULT_FILE") {
    handleDeleteVaultFile(request.id, sendResponse);
    return true;
  }
  if (request.action === "UPDATE_VAULT_FILE") {
    handleUpdateVaultFile(request.fileRecord, sendResponse);
    return true;
  }
  if (request.action === "CLEAR_VAULT") {
    handleClearVault(sendResponse);
    return true;
  }
  if (request.action === "GET_VAULT_SIZE") {
    handleGetVaultSize(sendResponse);
    return true;
  }
  if (request.action === "CHECK_DUPLICATE") {
    handleCheckDuplicate(request.name, request.size, sendResponse);
    return true;
  }
  if (request.action === "GET_FILE_CONTENT") {
    handleGetFileContent(request.id, sendResponse);
    return true;
  }
});

async function handleGetVaultFiles(sendResponse) {
  try {
    const database = await getDB();
    const tx = database.transaction([STORE_NAME], 'readonly');
    tx.objectStore(STORE_NAME).getAll().onsuccess = (e) => {
      const records = e.target.result || [];
      // Omit binary content when returning list metadata to prevent serialization errors
      const metadataList = records.map(r => {
        const meta = { ...r };
        delete meta.file;
        return meta;
      });
      sendResponse({ success: true, files: metadataList });
    };
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleSaveVaultFile(fileRecord, arrayBuffer, sendResponse) {
  try {
    const database = await getDB();
    const tx = database.transaction([STORE_NAME], 'readwrite');
    
    // Save arrayBuffer directly inside the record (no Blob conversions inside SW)
    fileRecord.file = arrayBuffer;

    tx.objectStore(STORE_NAME).add(fileRecord);
    tx.oncomplete = () => {
      sendResponse({ success: true });
      broadcastUpdate();
    };
    tx.onerror = (err) => {
      sendResponse({ success: false, error: err.target.error?.message || "Write error" });
    };
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleDeleteVaultFile(id, sendResponse) {
  try {
    const database = await getDB();
    const tx = database.transaction([STORE_NAME], 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => {
      sendResponse({ success: true });
      broadcastUpdate();
    };
    tx.onerror = (err) => {
      sendResponse({ success: false, error: err.target.error?.message || "Delete error" });
    };
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleUpdateVaultFile(fileRecord, sendResponse) {
  try {
    const database = await getDB();
    const tx = database.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    store.get(fileRecord.id).onsuccess = (e) => {
      const existing = e.target.result;
      if (existing) {
        // Defensive check: keep existing binary payload if the update record contains empty/null file field
        const fileFieldIsEmpty = !fileRecord.file || 
                                 (typeof fileRecord.file === 'object' && Object.keys(fileRecord.file).length === 0);
        if (fileFieldIsEmpty && existing.file) {
          fileRecord.file = existing.file;
        }
        store.put(fileRecord);
      }
    };

    tx.oncomplete = () => {
      sendResponse({ success: true });
      broadcastUpdate();
    };
    tx.onerror = (err) => {
      sendResponse({ success: false, error: err.target.error?.message || "Update error" });
    };
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleClearVault(sendResponse) {
  try {
    const database = await getDB();
    const tx = database.transaction([STORE_NAME], 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => {
      sendResponse({ success: true });
      broadcastUpdate();
    };
    tx.onerror = (err) => {
      sendResponse({ success: false, error: err.target.error?.message || "Clear error" });
    };
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleGetVaultSize(sendResponse) {
  try {
    const database = await getDB();
    const tx = database.transaction([STORE_NAME], 'readonly');
    tx.objectStore(STORE_NAME).getAll().onsuccess = (e) => {
      const records = e.target.result || [];
      let total = 0;
      records.forEach(r => {
        if (r.size) total += r.size;
      });
      sendResponse({ success: true, size: total });
    };
  } catch (err) {
    sendResponse({ success: false, size: 0, error: err.message });
  }
}

async function handleCheckDuplicate(name, size, sendResponse) {
  try {
    const database = await getDB();
    const tx = database.transaction([STORE_NAME], 'readonly');
    let duplicate = null;
    tx.objectStore(STORE_NAME).openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const val = cursor.value;
        if (val.name === name && val.size === size) {
          duplicate = val;
          // Return duplicate info without serialization issues
          const duplicateMeta = { ...duplicate };
          delete duplicateMeta.file;
          sendResponse({ success: true, duplicate: duplicateMeta });
          return;
        }
        cursor.continue();
      } else {
        sendResponse({ success: true, duplicate: null });
      }
    };
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleGetFileContent(id, sendResponse) {
  try {
    const record = await getFileRecord(id);
    if (record && record.file) {
      // Send raw arrayBuffer from database record
      sendResponse({ success: true, arrayBuffer: record.file, type: record.type });
    } else {
      sendResponse({ success: false, error: "File not found" });
    }
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

function broadcastUpdate() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      try {
        chrome.tabs.sendMessage(tab.id, { action: "VAULT_UPDATED" });
      } catch (err) {
        // Tab may not have content script injected
      }
    });
  });
}