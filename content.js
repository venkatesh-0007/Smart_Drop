// content.js - Smart Drop Professional File Sidebar
(function() {
  console.log("Smart Drop: Loading...");

  // ─── STATE MANAGEMENT ───
  const State = {
    sidebarOpen: false,
    isDraggingFromSidebar: false,
    currentDraggedFile: null,
    dragOverTimeout: null,
    currentTheme: 'dark',
    defaultTab: 'vault',
    cardDensity: 'comfortable',
    currentObjectURLs: new Set(),
    driveFiles: [],
    driveSearchQuery: '',
    vaultSearchQuery: '',
    vaultCategory: 'all',
    vaultSort: 'date-desc',
    dismissedOnboarding: false,
    driveToken: null
  };

  // ─── DATABASE ACTIONS RELAY ───
  const getVaultStorageSize = () => new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "GET_VAULT_SIZE" }, response => {
      resolve(response?.success ? response.size : 0);
    });
  });

  const checkDuplicate = (name, size) => new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "CHECK_DUPLICATE", name, size }, response => {
      resolve(response?.success ? response.duplicate : null);
    });
  });

  const deleteFileById = (id) => new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "DELETE_VAULT_FILE", id }, response => {
      resolve(response?.success || false);
    });
  });

  // ─── VAULT MEMORY CACHE ───
  const VaultCache = {
    files: new Map(), // fileId -> File object
    clear() {
      console.log(`[DEBUG CONTENT] Clearing VaultCache`);
      this.files.clear();
    },
    set(id, fileObj) {
      console.log(`[DEBUG CONTENT] Caching file ID: ${id}, Name: ${fileObj.name}, Size: ${fileObj.size}, MIME: ${fileObj.type}`);
      this.files.set(id, fileObj);
    },
    get(id) {
      const fileObj = this.files.get(id);
      if (fileObj) {
        console.log(`[DEBUG CONTENT] Cache HIT for file ID: ${id}, Name: ${fileObj.name}`);
      } else {
        console.log(`[DEBUG CONTENT] Cache MISS for file ID: ${id}`);
      }
      return fileObj;
    }
  };

  const getFileContent = (id) => new Promise((resolve) => {
    console.log(`[DEBUG CONTENT] Requesting file content from background worker for ID: ${id}`);
    chrome.runtime.sendMessage({ action: "GET_FILE_CONTENT", id }, response => {
      if (response && response.success && response.arrayBuffer) {
        const blob = new Blob([response.arrayBuffer], { type: response.type });
        console.log(`[DEBUG CONTENT] Content response received for ID: ${id}. Blob instanceof Blob: ${blob instanceof Blob}, size: ${blob.size}, MIME: ${blob.type}`);
        resolve(blob);
      } else {
        console.warn(`[DEBUG CONTENT] Content response failed or empty for ID: ${id}. Error:`, response?.error);
        resolve(null);
      }
    });
  });

  // ─── SHADOW DOM SETUPS ───
  const container = document.createElement('div');
  container.id = 'smart-drop-root';
  container.style.cssText = 'position:fixed;z-index:2147483647;top:0;right:0;pointer-events:none;';
  const host = container.attachShadow({ mode: 'open' });
  host.host.setAttribute('data-theme', 'dark');
  document.documentElement.appendChild(container);

  // Inject Stylesheet link
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = chrome.runtime.getURL('sidebar.css');
  host.appendChild(styleLink);

  // Sidebar Layout
  host.innerHTML += `
    <div id="smart-drop-sidebar" class="collapsed" style="pointer-events:auto;">
      <div id="pill-trigger"><div class="pill-dot"></div></div>
      <div id="sidebar-content">
        <div class="sidebar-header">
          <span class="title">Smart Drop</span>
          <div class="header-actions">
            <button class="icon-btn" id="btn-settings" title="Settings">⚙</button>
            <button id="close-sidebar">&times;</button>
          </div>
        </div>
        <div class="sidebar-tabs">
          <button class="tab-btn active" data-tab="vault">Vault</button>
          <button class="tab-btn" data-tab="drive">Drive</button>
        </div>
        
        <div class="tab-panels">
          <!-- VAULT PANEL -->
          <div id="vault-panel" class="panel active">
            <div class="vault-toolbar">
              <div class="search-input-wrapper">
                <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="vault-search" placeholder="Search Vault...">
                <button id="clear-vault-search" class="clear-btn hidden">&times;</button>
              </div>
              <div class="sort-wrapper">
                <select id="vault-sort" title="Sort by">
                  <option value="date-desc">Newest First</option>
                  <option value="date-asc">Oldest First</option>
                  <option value="name-asc">Name (A-Z)</option>
                  <option value="name-desc">Name (Z-A)</option>
                  <option value="size-desc">Largest First</option>
                  <option value="size-asc">Smallest First</option>
                  <option value="used-desc">Recently Used</option>
                </select>
              </div>
            </div>
            
            <div class="categories-bar-container">
              <div class="categories-bar">
                <button class="cat-btn active" data-category="all">All</button>
                <button class="cat-btn" data-category="image">Images</button>
                <button class="cat-btn" data-category="document">Docs</button>
                <button class="cat-btn" data-category="pdf">PDFs</button>
                <button class="cat-btn" data-category="spreadsheet">Sheets</button>
                <button class="cat-btn" data-category="presentation">Slides</button>
                <button class="cat-btn" data-category="archive">Zips</button>
                <button class="cat-btn" data-category="other">Other</button>
              </div>
            </div>

            <div class="drop-zone" id="vault-upload">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span>Drag files or click to add</span>
              <div id="upload-progress-bar" class="hidden"><div class="progress-fill"></div></div>
            </div>
            <input type="file" id="vault-file-input" multiple accept="*/*" style="display:none;">
            <div id="vault-grid" class="file-grid"></div>
          </div>
          
          <!-- DRIVE PANEL -->
          <div id="drive-panel" class="panel">
            <div class="drive-config">
              <span class="drive-icon-wrapper">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6.29 20.39l3.42-5.93H2.13l4.16 5.93zM19.58 14.46h-7.58l-3.42 5.93h7.58l3.42-5.93zM14.29 2.54L10.87 8.47h7.62l3.42-5.93zM9.71 2.54L2.13 8.47h7.63l3.42-5.93z"/></svg>
              </span>
              <input type="text" id="drive-url" placeholder="Paste Google Drive folder link...">
              <button id="save-drive">Link</button>
            </div>
            
            <div id="drive-toolbar" class="hidden">
              <div class="search-input-wrapper">
                <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="drive-search" placeholder="Search Drive files...">
                <button id="clear-drive-search" class="clear-btn hidden">&times;</button>
              </div>
              <button class="icon-btn" id="refresh-drive" title="Refresh files">🔄</button>
              <button class="icon-btn" id="disconnect-drive" title="Unlink folder">✖</button>
            </div>

            <div id="drive-status"></div>
            <div id="drive-list" class="file-grid"></div>
            
            <div id="drive-detail" class="hidden">
              <div class="drive-detail-header">
                <button id="back-to-drive">&larr;</button>
                <span class="detail-name" id="detail-name"></span>
              </div>
              <div class="drive-detail-thumbnail">
                <img id="detail-thumb" src="" referrerpolicy="no-referrer">
              </div>
              <div class="drive-detail-meta" id="detail-meta"></div>
              <div class="drive-detail-preview" id="detail-preview"></div>
              <div class="drive-open-btn-wrapper">
                <button id="detail-open" class="drive-open-btn">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  Open in Google Drive
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Settings Overlay -->
      <div id="settings-overlay">
        <div class="settings-header">
          <span>Settings</span>
          <button id="close-settings">&times;</button>
        </div>
        <div class="settings-body">
          <div class="settings-group">
            <label>Appearance</label>
            <div class="setting-row">
              <span>Theme</span>
              <select id="setting-theme">
                <option value="dark">Dark Mode</option>
                <option value="light">Light Mode</option>
                <option value="system">Use System Default</option>
              </select>
            </div>
          </div>
          
          <div class="settings-group">
            <label>General Preferences</label>
            <div class="setting-row">
              <span>Default Opening Tab</span>
              <select id="setting-default-tab">
                <option value="vault">Vault</option>
                <option value="drive">Google Drive</option>
              </select>
            </div>
            <div class="setting-row">
              <span>Card Density</span>
              <select id="setting-card-density">
                <option value="comfortable">Comfortable Grid</option>
                <option value="compact">Compact List</option>
              </select>
            </div>
          </div>

          <div class="settings-group">
            <label>Storage Information</label>
            <div class="storage-info-row">
              <div class="progress-track"><div id="storage-progress-fill" class="progress-fill"></div></div>
              <span id="storage-usage-text">Calculating usage...</span>
            </div>
            <span class="storage-note">Note: Vault uses local browser IndexedDB storage. Max storage limit is set dynamically by Google Chrome (typically 50-60% of your disk space).</span>
          </div>

          <div class="settings-group">
            <label>Data & Privacy</label>
            <p class="privacy-notice">Smart Drop is privacy-first. All Vault files remain stored entirely offline in your local browser IndexedDB. No files, logs, or analytics are uploaded to external servers.</p>
            <button class="btn-danger" id="clear-vault">Clear Vault</button>
          </div>
          
          <div class="settings-footer">
            <span>Smart Drop v1.1</span>
          </div>
        </div>
      </div>
      
      <!-- Preview Panel Overlay -->
      <div id="preview-overlay" class="slide-panel">
        <div class="slide-panel-header">
          <button id="close-preview" class="icon-btn">&larr;</button>
          <span class="slide-panel-title">File Preview</span>
          <button id="download-preview" class="icon-btn" title="Download file">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        </div>
        <div class="slide-panel-body">
          <div id="preview-content-container"></div>
          <div class="file-details-table">
            <div class="detail-row"><span class="detail-label">Name</span><span class="detail-val" id="meta-name"></span></div>
            <div class="detail-row"><span class="detail-label">Size</span><span class="detail-val" id="meta-size"></span></div>
            <div class="detail-row"><span class="detail-label">Type</span><span class="detail-val" id="meta-type"></span></div>
            <div class="detail-row"><span class="detail-label">Added</span><span class="detail-val" id="meta-added"></span></div>
            <div class="detail-row"><span class="detail-label">Last Used</span><span class="detail-val" id="meta-used"></span></div>
          </div>
        </div>
      </div>
      
      <!-- Toast Notification Area -->
      <div id="toast-container"></div>
    </div>
  `;

  // ─── DOM SELECTORS ───
  const sidebar = host.getElementById('smart-drop-sidebar');
  const vaultGrid = host.getElementById('vault-grid');
  const driveGrid = host.getElementById('drive-list');
  const driveStatus = host.getElementById('drive-status');
  const driveUrlInput = host.getElementById('drive-url');
  const settingsOverlay = host.getElementById('settings-overlay');
  const previewOverlay = host.getElementById('preview-overlay');
  const dropZone = host.getElementById('vault-upload');
  const fileInput = host.getElementById('vault-file-input');

  const settingTheme = host.getElementById('setting-theme');
  const settingDefaultTab = host.getElementById('setting-default-tab');
  const settingCardDensity = host.getElementById('setting-card-density');
  
  const vaultSearch = host.getElementById('vault-search');
  const clearVaultSearch = host.getElementById('clear-vault-search');
  const vaultSort = host.getElementById('vault-sort');
  
  const driveSearchInput = host.getElementById('drive-search');
  const clearDriveSearch = host.getElementById('clear-drive-search');

  // ─── UTILITIES & HELPERS ───
  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function setDriveStatus(msg, type) {
    driveStatus.innerText = msg || '';
    driveStatus.className = '';
    if (type) driveStatus.classList.add(type);
  }

  const applyCardDensityClass = () => {
    vaultGrid.className = `file-grid density-${State.cardDensity}`;
    driveGrid.className = `file-grid density-${State.cardDensity}`;
  };

  // ─── TOAST & DIALOG SYSTEMS ───
  const showToast = (message, type = 'info') => {
    const container = host.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else {
      iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `
      <span class="toast-icon">${iconSvg}</span>
      <span class="toast-msg">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => toast.classList.add('visible'), 10);

    setTimeout(() => {
      toast.classList.remove('visible');
      toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
  };

  const showConfirmModal = ({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', isDestructive = false }) => {
    return new Promise((resolve) => {
      const existing = host.getElementById('custom-confirm-modal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'custom-confirm-modal';
      modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-content">
          <div class="modal-header"><h3>${escapeHtml(title)}</h3></div>
          <div class="modal-body"><p>${escapeHtml(message)}</p></div>
          <div class="modal-footer">
            <button class="modal-btn modal-cancel-btn">${escapeHtml(cancelText)}</button>
            <button class="modal-btn modal-confirm-btn ${isDestructive ? 'destructive' : ''}">${escapeHtml(confirmText)}</button>
          </div>
        </div>
      `;

      sidebar.appendChild(modal);

      const close = (value) => {
        modal.classList.remove('open');
        setTimeout(() => {
          modal.remove();
          resolve(value);
        }, 200);
      };

      modal.querySelector('.modal-cancel-btn').onclick = () => close(false);
      modal.querySelector('.modal-confirm-btn').onclick = () => close(true);
      modal.querySelector('.modal-backdrop').onclick = () => close(false);

      setTimeout(() => modal.classList.add('open'), 10);
    });
  };

  const showPromptModal = ({ title, message, defaultValue = '', confirmText = 'Save', cancelText = 'Cancel' }) => {
    return new Promise((resolve) => {
      const existing = host.getElementById('custom-prompt-modal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'custom-prompt-modal';
      modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-content">
          <div class="modal-header"><h3>${escapeHtml(title)}</h3></div>
          <div class="modal-body">
            <p>${escapeHtml(message)}</p>
            <input type="text" id="modal-prompt-input" value="${escapeHtml(defaultValue)}">
          </div>
          <div class="modal-footer">
            <button class="modal-btn modal-cancel-btn">${escapeHtml(cancelText)}</button>
            <button class="modal-btn modal-confirm-btn">${escapeHtml(confirmText)}</button>
          </div>
        </div>
      `;

      sidebar.appendChild(modal);
      const input = modal.querySelector('#modal-prompt-input');
      input.focus();
      input.select();

      input.onkeydown = (e) => {
        if (e.key === 'Enter') close(input.value.trim());
        else if (e.key === 'Escape') close(null);
      };

      const close = (value) => {
        modal.classList.remove('open');
        setTimeout(() => {
          modal.remove();
          resolve(value);
        }, 200);
      };

      modal.querySelector('.modal-cancel-btn').onclick = () => close(null);
      modal.querySelector('.modal-confirm-btn').onclick = () => close(input.value.trim() || null);
      modal.querySelector('.modal-backdrop').onclick = () => close(null);

      setTimeout(() => modal.classList.add('open'), 10);
    });
  };

  const showDuplicateModal = (filename, size) => new Promise((resolve) => {
    const existing = host.getElementById('custom-duplicate-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'custom-duplicate-modal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <div class="modal-header"><h3>Duplicate File</h3></div>
        <div class="modal-body">
          <p>A file named <strong>${escapeHtml(filename)}</strong> (${(size / 1024).toFixed(1)} KB) already exists. How do you want to proceed?</p>
        </div>
        <div class="modal-footer vertical">
          <button class="modal-btn action-replace">Replace existing file</button>
          <button class="modal-btn action-both">Keep both (rename copy)</button>
          <button class="modal-btn modal-cancel-btn">Cancel upload</button>
        </div>
      </div>
    `;

    sidebar.appendChild(modal);

    const close = (action) => {
      modal.classList.remove('open');
      setTimeout(() => {
        modal.remove();
        resolve(action);
      }, 200);
    };

    modal.querySelector('.action-replace').onclick = () => close('replace');
    modal.querySelector('.action-both').onclick = () => close('both');
    modal.querySelector('.modal-cancel-btn').onclick = () => close('cancel');
    modal.querySelector('.modal-backdrop').onclick = () => close('cancel');

    setTimeout(() => modal.classList.add('open'), 10);
  });

  // ─── VAULT CONTROLLER ───
  function getFileCategory(type, name) {
    const mime = (type || '').toLowerCase();
    const ext = name.split('.').pop().toLowerCase();
    
    if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
      return 'image';
    }
    if (mime.includes('pdf') || ext === 'pdf') {
      return 'pdf';
    }
    if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('sheet') || mime.includes('csv') || ['xls', 'xlsx', 'csv', 'ods'].includes(ext)) {
      return 'spreadsheet';
    }
    if (mime.includes('presentation') || mime.includes('powerpoint') || mime.includes('slide') || ['ppt', 'pptx', 'odp'].includes(ext)) {
      return 'presentation';
    }
    if (mime.includes('zip') || mime.includes('compressed') || mime.includes('rar') || mime.includes('tar') || mime.includes('gzip') || ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
      return 'archive';
    }
    if (mime.startsWith('text/') || mime.includes('document') || mime.includes('word') || mime.includes('json') || mime.includes('javascript') || mime.includes('xml') || ['txt', 'doc', 'docx', 'rtf', 'json', 'md', 'html', 'xml', 'js', 'css'].includes(ext)) {
      return 'document';
    }
    return 'other';
  }

  const getFileIconSVG = (type, name) => {
    const cat = getFileCategory(type, name);
    if (cat === 'image') {
      return `<svg class="file-icon-svg cat-image" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    }
    if (cat === 'pdf') {
      return `<svg class="file-icon-svg cat-pdf" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h3a2 2 0 0 0 0-4H9v6"/></svg>`;
    }
    if (cat === 'spreadsheet') {
      return `<svg class="file-icon-svg cat-sheet" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`;
    }
    if (cat === 'presentation') {
      return `<svg class="file-icon-svg cat-slide" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="2" y1="10" x2="22" y2="10"/><path d="M12 17v4"/><path d="M8 21h8"/></svg>`;
    }
    if (cat === 'archive') {
      return `<svg class="file-icon-svg cat-archive" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`;
    }
    if (cat === 'document') {
      return `<svg class="file-icon-svg cat-doc" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
    }
    if (type && type.startsWith('audio/')) {
      return `<svg class="file-icon-svg cat-audio" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    }
    if (type && type.startsWith('video/')) {
      return `<svg class="file-icon-svg cat-video" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>`;
    }
    return `<svg class="file-icon-svg cat-other" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  };

  const showProgress = (show) => {
    const bar = host.getElementById('upload-progress-bar');
    if (bar) {
      if (show) bar.classList.remove('hidden');
      else bar.classList.add('hidden');
    }
  };

  const updateProgressFill = (pct) => {
    const fill = host.querySelector('#upload-progress-bar .progress-fill');
    if (fill) fill.style.width = `${pct}%`;
  };

  const saveFileDirectly = async (file) => {
    if (!file || !file.name) return;

    // Check duplicates
    const duplicate = await checkDuplicate(file.name, file.size);
    if (duplicate) {
      const action = await showDuplicateModal(file.name, file.size);
      if (action === 'cancel') {
        showToast('Upload cancelled', 'info');
        return;
      }
      if (action === 'replace') {
        await deleteFileById(duplicate.id);
      } else if (action === 'both') {
        const extIndex = file.name.lastIndexOf('.');
        let baseName = file.name;
        let ext = '';
        if (extIndex !== -1) {
          baseName = file.name.substring(0, extIndex);
          ext = file.name.substring(extIndex);
        }
        file = new File([file], `${baseName} (Copy)${ext}`, { type: file.type });
      }
    }

    return new Promise(async (resolve) => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const fileRecord = {
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          timestamp: Date.now(),
          lastUsed: Date.now(),
          isFavorite: false
        };

        chrome.runtime.sendMessage({ action: "SAVE_VAULT_FILE", fileRecord, arrayBuffer }, response => {
          if (response?.success) {
            showToast(`Saved ${file.name}`, 'success');
            resolve(true);
          } else {
            showToast(`Failed to save: ${file.name}`, 'error');
            resolve(false);
          }
        });
      } catch (err) {
        showToast(`Failed to read file: ${err.message}`, 'error');
        resolve(false);
      }
    });
  };

  const saveMultipleFiles = async (files) => {
    if (!files || files.length === 0) return;
    showProgress(true);
    for (let i = 0; i < files.length; i++) {
      updateProgressFill(((i + 1) / files.length) * 100);
      await saveFileDirectly(files[i]);
    }
    showProgress(false);
    renderVault();
    updateSettingsUI();
  };

  const renderVault = () => {
    if (!vaultGrid) return;
    
    cleanupObjectUrls();
    vaultGrid.innerHTML = '<div class="grid-loading">Loading Vault...</div>';

    chrome.runtime.sendMessage({ action: "GET_VAULT_FILES" }, response => {
      if (!response || !response.success) {
        vaultGrid.innerHTML = '<div class="empty-state">Failed to load Vault files</div>';
        return;
      }

      let files = response.files || [];

      // Sort files
      files.sort((a, b) => {
        if (State.vaultSort === 'date-desc') return (b.timestamp || 0) - (a.timestamp || 0);
        if (State.vaultSort === 'date-asc') return (a.timestamp || 0) - (b.timestamp || 0);
        if (State.vaultSort === 'name-asc') return a.name.localeCompare(b.name);
        if (State.vaultSort === 'name-desc') return b.name.localeCompare(a.name);
        if (State.vaultSort === 'size-desc') return (b.size || 0) - (a.size || 0);
        if (State.vaultSort === 'size-asc') return (a.size || 0) - (b.size || 0);
        if (State.vaultSort === 'used-desc') return (b.lastUsed || b.timestamp || 0) - (a.lastUsed || a.timestamp || 0);
        return 0;
      });

      // Filter by search
      if (State.vaultSearchQuery) {
        const query = State.vaultSearchQuery.toLowerCase();
        files = files.filter(f => f.name.toLowerCase().includes(query));
      }

      // Filter by category
      if (State.vaultCategory !== 'all') {
        files = files.filter(f => getFileCategory(f.type, f.name) === State.vaultCategory);
      }

      vaultGrid.innerHTML = '';

      if (files.length === 0) {
        if (State.vaultSearchQuery) {
          vaultGrid.innerHTML = `
            <div class="empty-state">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span>No matching files found</span>
            </div>`;
        } else if (State.vaultCategory !== 'all') {
          vaultGrid.innerHTML = `
            <div class="empty-state">
              <span>No files in this category</span>
            </div>`;
        } else {
          let onboardingHtml = '';
          if (!State.dismissedOnboarding) {
            onboardingHtml = `
              <div class="onboarding-card" id="vault-onboarding">
                <h4>Quick Workspace Guide</h4>
                <p>1. Drag files from your computer into this Vault.</p>
                <p>2. Drag saved cards back onto webpage upload areas or your desktop.</p>
                <p>3. Use categories above to filter, or the search bar to find files.</p>
                <button id="btn-dismiss-onboarding" class="modal-btn">Got it</button>
              </div>
            `;
          }
          vaultGrid.innerHTML = `
            <div class="empty-state">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span>Vault is empty</span>
              <p>Drag files here or click to add</p>
              ${onboardingHtml}
            </div>`;
          
          if (!State.dismissedOnboarding) {
            setTimeout(() => {
              const btn = host.getElementById('btn-dismiss-onboarding');
              if (btn) {
                btn.onclick = () => {
                  State.dismissedOnboarding = true;
                  chrome.storage.local.set({ smartDropOnboardingDismissed: true }, () => {
                    renderVault();
                  });
                };
              }
            }, 10);
          }
        }
        return;
      }

      // Clear or manage memory cache appropriately (we keep cache persistent across redraws for instant thumbnails)
      files.forEach(file => {
        const card = document.createElement('div');
        card.className = `file-card density-${State.cardDensity}`;
        card.draggable = true;

        if (file.isFavorite) card.classList.add('is-favorite');

        const isImage = getFileCategory(file.type, file.name) === 'image';
        const iconHtml = getFileIconSVG(file.type, file.name);

        let previewHtml = `<span class="file-icon">${iconHtml}</span>`;
        if (isImage) {
          previewHtml = `<div class="preview-img-placeholder">${iconHtml}</div>`;
        }

        const sizeStr = file.size ? `${(file.size / 1024).toFixed(1)} KB` : '0 KB';

        card.innerHTML = `
          <div class="file-preview-container">
            ${previewHtml}
            <div class="favorite-badge">★</div>
          </div>
          <div class="file-info">
            <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
            <span class="file-size-badge">${sizeStr}</span>
            <button class="file-menu-trigger" title="File Actions">&#8226;&#8226;&#8226;</button>
          </div>
        `;

        // Helper to update card thumbnail element when image is preloaded
        const updateCardThumbnail = (fileId, fileObj) => {
          const placeholder = card.querySelector('.preview-img-placeholder');
          if (placeholder) {
            console.log(`[DEBUG CONTENT] Mounting image thumbnail frame for file ID: ${fileId}`);
            const frameUrl = chrome.runtime.getURL('thumbnail.html') + `?id=${fileId}&fit=cover`;
            placeholder.outerHTML = `<iframe src="${frameUrl}" class="preview-img" style="border:none;width:100%;height:100%;"></iframe>`;
          }
        };

        // Cache preloaded File objects
        const cachedFileObj = VaultCache.get(file.id);
        if (cachedFileObj) {
          if (isImage) {
            setTimeout(() => updateCardThumbnail(file.id, cachedFileObj), 0);
          }
        } else {
          // Asynchronously prefetch binary content and cache it
          getFileContent(file.id).then(blob => {
            if (blob) {
              const fileObj = new File([blob], file.name, { type: file.type || blob.type, lastModified: file.timestamp });
              VaultCache.set(file.id, fileObj);
              if (isImage) {
                updateCardThumbnail(file.id, fileObj);
              }
            } else {
              console.error(`[DEBUG CONTENT] Prefetch returned empty blob for file ID: ${file.id}`);
            }
          }).catch(err => {
            console.error(`[DEBUG CONTENT] Prefetch failed for file ID: ${file.id}:`, err);
          });
        }

        // OUTBOUND DRAG HANDLING
        card.addEventListener('dragstart', (e) => {
          const fileObj = VaultCache.get(file.id);
          if (!fileObj) {
            console.warn(`[DEBUG CONTENT] dragstart: File ID ${file.id} not preloaded yet!`);
            // Fallback
            State.isDraggingFromSidebar = true;
            State.currentDraggedFile = null;
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('text/plain', file.name);
            return;
          }

          console.log(`[DEBUG CONTENT] dragstart: File ID ${file.id} initialized. Name: ${fileObj.name}, Size: ${fileObj.size}`);

          State.isDraggingFromSidebar = true;
          State.currentDraggedFile = fileObj;
          card.classList.add('dragging');

          e.dataTransfer.effectAllowed = 'copy';
          
          // Populate the drag payload:
          // 1. text/plain for filename/fallback
          e.dataTransfer.setData('text/plain', fileObj.name);

          // 2. Add the real File object natively to items
          try {
            e.dataTransfer.items.add(fileObj);
            console.log(`[DEBUG CONTENT] Added File to DataTransfer items. Count: ${e.dataTransfer.items.length}`);
          } catch (err) {
            console.error(`[DEBUG CONTENT] Failed to add File to DataTransfer items:`, err);
          }

          // 3. DownloadURL for desktop drags
          const tempUrl = URL.createObjectURL(fileObj);
          State.currentObjectURLs.add(tempUrl);
          console.log(`[DEBUG CONTENT] Created temporary drag DownloadURL object URL: ${tempUrl}`);
          
          const downloadString = `${fileObj.type || 'application/octet-stream'}:${fileObj.name}:${tempUrl}`;
          e.dataTransfer.setData("DownloadURL", downloadString);

          // 4. Internal metadata
          e.dataTransfer.setData('application/json', JSON.stringify({ fileId: file.id, name: file.name, source: 'smart-drop' }));
        });

        card.addEventListener('dragend', () => {
          console.log(`[DEBUG CONTENT] dragend: Dragging finished/cancelled.`);
          State.isDraggingFromSidebar = false;
          State.currentDraggedFile = null;
          card.classList.remove('dragging');
        });

        card.addEventListener('dblclick', async () => {
          const fileObj = VaultCache.get(file.id);
          if (fileObj) {
            openPreview(fileObj, file.id, file.timestamp);
          } else {
            showToast("Loading file content, please try again...", "info");
            const blob = await getFileContent(file.id);
            if (blob) {
              const fObj = new File([blob], file.name, { type: file.type || blob.type, lastModified: file.timestamp });
              VaultCache.set(file.id, fObj);
              openPreview(fObj, file.id, file.timestamp);
            } else {
              showToast("Failed to load file data", "error");
            }
          }
        });

        card.querySelector('.file-menu-trigger').addEventListener('click', (ev) => {
          ev.stopPropagation();
          openFileActionsMenu(file, ev.currentTarget);
        });

        vaultGrid.appendChild(card);
      });
    });
  };

  // ─── FILE PREVIEWS ───
  const openFileInNewTab = (fileObj, fileId) => {
    chrome.runtime.sendMessage({ action: "UPDATE_LAST_USED", id: fileId });

    console.log(`[DEBUG CONTENT] Opening file in new tab. Name: ${fileObj.name}, Type: ${fileObj.type}`);
    const objectUrl = URL.createObjectURL(fileObj);
    State.currentObjectURLs.add(objectUrl);
    console.log(`[DEBUG CONTENT] Created temporary new-tab object URL: ${objectUrl}`);

    window.open(objectUrl, '_blank');

    // Safe lifecycle revocation: allow the browser 15 seconds to fetch and display the content
    setTimeout(() => {
      console.log(`[DEBUG CONTENT] Revoking temporary new-tab object URL: ${objectUrl}`);
      URL.revokeObjectURL(objectUrl);
      State.currentObjectURLs.delete(objectUrl);
    }, 15000);
  };

  const openPreview = async (fileObj, fileId, timestamp) => {
    chrome.runtime.sendMessage({ action: "UPDATE_LAST_USED", id: fileId });

    const container = host.getElementById('preview-content-container');
    container.innerHTML = '<div class="preview-loading">Generating preview...</div>';

    host.getElementById('meta-name').innerText = fileObj.name;
    host.getElementById('meta-size').innerText = `${(fileObj.size / 1024).toFixed(1)} KB`;
    host.getElementById('meta-type').innerText = fileObj.type || 'Unknown';
    host.getElementById('meta-added').innerText = new Date(timestamp).toLocaleString();
    host.getElementById('meta-used').innerText = new Date().toLocaleString();

    if (!(fileObj instanceof File) && !(fileObj instanceof Blob)) {
      console.error("[DEBUG CONTENT] Preview target is not a valid File or Blob!", fileObj);
      container.innerHTML = '<div class="preview-error">File payload invalid</div>';
      previewOverlay.classList.add('open');
      return;
    }

    const objectUrl = URL.createObjectURL(fileObj);
    State.currentObjectURLs.add(objectUrl);
    console.log(`[DEBUG CONTENT] Created preview object URL: ${objectUrl}`);

    const downloadBtn = host.getElementById('download-preview');
    downloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileObj.name;
      a.click();
    };

    const type = (fileObj.type || '').toLowerCase();
    const ext = fileObj.name.split('.').pop().toLowerCase();

    if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
      const frameUrl = chrome.runtime.getURL('thumbnail.html') + `?id=${fileId}&fit=contain`;
      container.innerHTML = `<iframe src="${frameUrl}" class="full-preview-img-frame" style="border:none;width:100%;height:100%;"></iframe>`;
    } else if (type.startsWith('text/') || ['json', 'csv', 'js', 'css', 'html', 'xml', 'txt', 'md'].includes(ext)) {
      try {
        const text = await fileObj.text();
        const snippet = text.length > 50000 ? text.substring(0, 50000) + '\n\n[Truncated for performance]' : text;
        container.innerHTML = `<pre class="preview-text-box"><code>${escapeHtml(snippet)}</code></pre>`;
      } catch (err) {
        container.innerHTML = `<div class="preview-error">Failed to load text content.</div>`;
      }
    } else if (type.includes('pdf') || ext === 'pdf') {
      container.innerHTML = `
        <div class="pdf-preview-fallback">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h3a2 2 0 0 0 0-4H9v6"/></svg>
          <span>PDF Document</span>
          <button class="modal-btn" id="pdf-view-btn">View Document</button>
        </div>
      `;
      container.querySelector('#pdf-view-btn').onclick = () => {
        window.open(objectUrl, '_blank');
      };
    } else {
      container.innerHTML = `
        <div class="preview-fallback-card">
          <span class="preview-fallback-icon">${getFileIconSVG(file.type, file.name)}</span>
          <span class="preview-fallback-text">Preview not available for this file type</span>
        </div>
      `;
    }

    previewOverlay.classList.add('open');
  };

  // ─── FILE ACTIONS MENU ───
  const openFileActionsMenu = (file, triggerElement) => {
    let menu = host.getElementById('file-actions-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'file-actions-menu';
      menu.className = 'dropdown-menu hidden';
      sidebar.appendChild(menu);
    }

    const isFav = file.isFavorite || false;

    menu.innerHTML = `
      <button class="menu-item action-preview">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        Preview
      </button>
      <button class="menu-item action-open-tab">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Open in New Tab
      </button>
      <button class="menu-item action-favorite">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        ${isFav ? 'Unfavorite' : 'Favorite'}
      </button>
      <button class="menu-item action-rename">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        Rename
      </button>
      <button class="menu-item action-download">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download
      </button>
      <button class="menu-item action-delete destructive">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        Delete
      </button>
    `;

    const rect = triggerElement.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();

    menu.style.top = `${rect.bottom - sidebarRect.top + sidebar.scrollTop}px`;
    menu.style.left = `${rect.left - sidebarRect.left - 100}px`;
    menu.classList.remove('hidden');

    menu.querySelector('.action-preview').onclick = async () => {
      menu.classList.add('hidden');
      const fileObj = VaultCache.get(file.id);
      if (fileObj) {
        openPreview(fileObj, file.id, file.timestamp);
      } else {
        showToast("Loading file preview...", "info");
        const blob = await getFileContent(file.id);
        if (blob) {
          const fObj = new File([blob], file.name, { type: file.type || blob.type, lastModified: file.timestamp });
          VaultCache.set(file.id, fObj);
          openPreview(fObj, file.id, file.timestamp);
        } else {
          showToast("Failed to load file preview", "error");
        }
      }
    };

    menu.querySelector('.action-open-tab').onclick = async () => {
      menu.classList.add('hidden');
      const fileObj = VaultCache.get(file.id);
      if (fileObj) {
        openFileInNewTab(fileObj, file.id);
      } else {
        showToast("Loading file content...", "info");
        const blob = await getFileContent(file.id);
        if (blob) {
          const fObj = new File([blob], file.name, { type: file.type || blob.type, lastModified: file.timestamp });
          VaultCache.set(file.id, fObj);
          openFileInNewTab(fObj, file.id);
        } else {
          showToast("Failed to open file", "error");
        }
      }
    };

    menu.querySelector('.action-favorite').onclick = () => {
      menu.classList.add('hidden');
      file.isFavorite = !file.isFavorite;
      const updateRecord = { ...file };
      delete updateRecord.file;
      chrome.runtime.sendMessage({ action: "UPDATE_VAULT_FILE", fileRecord: updateRecord }, response => {
        if (response?.success) {
          renderVault();
          showToast(file.isFavorite ? 'Added to Favorites' : 'Removed from Favorites', 'success');
        }
      });
    };

    menu.querySelector('.action-rename').onclick = async () => {
      menu.classList.add('hidden');
      const newName = await showPromptModal({
        title: 'Rename File',
        message: 'Enter new name:',
        defaultValue: file.name
      });
      if (newName && newName !== file.name) {
        file.name = newName;
        // Update name in cache
        const cachedFile = VaultCache.get(file.id);
        if (cachedFile) {
          const updatedFile = new File([cachedFile], newName, { type: cachedFile.type, lastModified: Date.now() });
          VaultCache.set(file.id, updatedFile);
        }

        const updateRecord = { ...file };
        delete updateRecord.file;
        chrome.runtime.sendMessage({ action: "UPDATE_VAULT_FILE", fileRecord: updateRecord }, response => {
          if (response?.success) {
            renderVault();
            showToast('File renamed', 'success');
          }
        });
      }
    };

    menu.querySelector('.action-download').onclick = async () => {
      menu.classList.add('hidden');
      const fileObj = VaultCache.get(file.id);
      if (fileObj) {
        chrome.runtime.sendMessage({ action: "UPDATE_LAST_USED", id: file.id });
        const url = URL.createObjectURL(fileObj);
        State.currentObjectURLs.add(url);
        console.log(`[DEBUG CONTENT] Created download URL: ${url}`);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = fileObj.name;
        a.click();
        
        // Revoke after a safe 5-second interval
        setTimeout(() => {
          console.log(`[DEBUG CONTENT] Revoking download URL: ${url}`);
          URL.revokeObjectURL(url);
          State.currentObjectURLs.delete(url);
        }, 5000);
      } else {
        showToast("Download failed", "error");
      }
    };

    menu.querySelector('.action-delete').onclick = async () => {
      menu.classList.add('hidden');
      const conf = await showConfirmModal({
        title: 'Delete File',
        message: `Are you sure you want to delete "${file.name}"?`,
        confirmText: 'Delete',
        isDestructive: true
      });
      if (conf) {
        await deleteFileById(file.id);
        VaultCache.files.delete(file.id);
        renderVault();
        updateSettingsUI();
        showToast('Deleted file', 'success');
      }
    };

    const closeMenu = (e) => {
      if (!menu.contains(e.target) && e.target !== triggerElement) {
        menu.classList.add('hidden');
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 10);
  };

  // ─── GOOGLE DRIVE ───
  function getDriveFileTypeBadge(mimeType) {
    const m = (mimeType || '').toLowerCase();
    if (m.startsWith('image/')) return ['IMG', 'image'];
    if (m.startsWith('video/')) return ['VID', 'video'];
    if (m.includes('spreadsheet') || m.includes('excel') || m.includes('sheet')) return ['SHT', 'spreadsheet'];
    if (m.includes('presentation') || m.includes('powerpoint') || m.includes('slide')) return ['SLD', 'presentation'];
    if (m.includes('document') || m.includes('word') || m.includes('pdf') || m.includes('text')) return ['DOC', 'document'];
    if (m.includes('folder')) return ['DIR', 'folder'];
    return ['FILE', 'document'];
  }

  const parseFolderId = (url) => {
    if (!url) return null;
    const folderMatch = url.match(/folders\/([-\w]{25,})/);
    if (folderMatch) return folderMatch[1];
    const idMatch = url.match(/^([-\w]{25,})$/);
    if (idMatch) return idMatch[1];
    return null;
  };

  host.getElementById('save-drive').addEventListener('click', () => {
    const url = driveUrlInput.value.trim();
    const folderId = parseFolderId(url);
    if (folderId) {
      setDriveStatus('Connecting Folder...', 'loading');
      chrome.storage.local.set({ driveFolderId: folderId }, () => loadDriveFiles(folderId));
    } else {
      setDriveStatus('Invalid folder URL. Paste full Drive folder link.', 'error');
      showToast('Invalid Google Drive URL', 'error');
    }
  });

  async function loadDriveFiles(folderId) {
    driveGrid.innerHTML = '<div class="grid-loading">Authenticating Drive...</div>';
    setDriveStatus('Requesting OAuth token...', 'loading');
    
    chrome.runtime.sendMessage({ action: "OPEN_AUTH_WINDOW" }, response => {
      if (chrome.runtime.lastError) {
        setDriveStatus('Communication error.', 'error');
        driveGrid.innerHTML = '<div class="empty-state">Relay script unresponsive. Reload tab.</div>';
        return;
      }
      if (response && response.success) {
        setDriveStatus('Fetching metadata...', 'loading');
        fetchDriveFiles(response.token, folderId);
      } else {
        const err = response?.error || 'Authorization denied';
        setDriveStatus(`Connection failed.`, 'error');
        driveGrid.innerHTML = `
          <div class="empty-state" style="color:var(--danger);line-height:1.5;">
            <strong>OAuth Authorization Failed</strong><br>
            <span style="font-size:11px;color:var(--text-secondary);">${escapeHtml(err)}</span>
          </div>`;
      }
    });
  }

  async function fetchDriveFiles(token, folderId) {
    State.driveToken = token;
    driveGrid.innerHTML = '<div class="grid-loading">Fetching folder files...</div>';
    
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q='${encodeURIComponent(folderId)}'+in+parents&fields=files(id,name,mimeType,thumbnailLink,iconLink,webViewLink,webContentLink,size,modifiedTime)&pageSize=50`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.status === 401) {
        chrome.identity.removeCachedAuthToken({ token: token }, () => {
          setDriveStatus('Reconnecting...', 'loading');
          loadDriveFiles(folderId);
        });
        return;
      }

      if (!res.ok) {
        const txt = await res.text();
        let msg = txt;
        try { msg = JSON.parse(txt).error?.message || txt; } catch {}
        throw new Error(msg);
      }

      const data = await res.json();
      State.driveFiles = data.files || [];
      
      chrome.storage.local.set({
        driveCacheFiles: State.driveFiles,
        driveCacheFolderId: folderId,
        driveCacheTimestamp: Date.now()
      });

      setDriveStatus(`Sync success. (${State.driveFiles.length} files)`, 'success');
      
      host.getElementById('drive-toolbar').classList.remove('hidden');
      host.querySelector('.drive-config').classList.add('hidden');
      
      renderDriveGrid();
    } catch (err) {
      setDriveStatus(`Error: ${err.message}`, 'error');
      driveGrid.innerHTML = `<div class="empty-state" style="color:var(--danger);">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderDriveGrid() {
    driveGrid.innerHTML = '';
    let files = State.driveFiles || [];

    if (State.driveSearchQuery) {
      const q = State.driveSearchQuery.toLowerCase();
      files = files.filter(f => f.name.toLowerCase().includes(q));
    }

    if (files.length === 0) {
      driveGrid.innerHTML = '<div class="empty-state">No files matched search query</div>';
      return;
    }

    files.forEach(file => {
      const card = document.createElement('div');
      card.className = `file-card density-${State.cardDensity}`;
      const isImage = (file.mimeType || '').startsWith('image/');
      const thumbnail = file.thumbnailLink || file.iconLink || '';
      const [badgeText, badgeType] = getDriveFileTypeBadge(file.mimeType);

      card.innerHTML = `
        <div class="drive-file-type-badge ${badgeType}">${badgeText}</div>
        <div class="file-preview-container">
          <img src="${thumbnail}" class="preview-img" style="object-fit:${isImage ? 'cover' : 'contain'};padding:${isImage ? '0' : '8px'};" referrerpolicy="no-referrer">
        </div>
        <div class="file-info">
          <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
        </div>
      `;
      card.addEventListener('click', () => showDriveDetail(file));
      driveGrid.appendChild(card);
    });
  }

  function showDriveDetail(file) {
    const detailThumb = host.getElementById('detail-thumb');
    const detailName = host.getElementById('detail-name');
    const detailMeta = host.getElementById('detail-meta');
    const detailPreview = host.getElementById('detail-preview');
    const detailOpen = host.getElementById('detail-open');

    detailName.innerText = file.name;
    const sizeStr = file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'Unknown size';
    const dateStr = file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : '';
    detailMeta.innerText = `${file.mimeType || 'File'} · ${sizeStr} · ${dateStr}`;

    const isImage = (file.mimeType || '').startsWith('image/');
    if (isImage && (file.thumbnailLink || file.iconLink)) {
      detailThumb.src = file.thumbnailLink || file.iconLink;
      detailThumb.classList.add('visible');
    } else {
      detailThumb.classList.remove('visible');
    }

    if (isImage && file.webContentLink) {
      detailPreview.innerHTML = `<img src="${file.webContentLink}" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
    } else if (file.thumbnailLink && !isImage) {
      detailPreview.innerHTML = `<img src="${file.thumbnailLink.replace(/=s\d+/, '=s800')}" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
    } else {
      detailPreview.innerHTML = `<div class="preview-fallback">📄</div>`;
    }

    detailOpen.onclick = () => {
      window.open(file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`, '_blank');
    };

    driveGrid.style.display = 'none';
    host.getElementById('drive-detail').classList.remove('hidden');
  }

  function hideDriveDetail() {
    driveGrid.style.display = 'grid';
    host.getElementById('drive-detail').classList.add('hidden');
  }

  host.getElementById('back-to-drive').addEventListener('click', hideDriveDetail);

  const loadCachedDriveFolder = () => {
    chrome.storage.local.get(['driveCacheFiles', 'driveCacheFolderId', 'driveCacheTimestamp'], (data) => {
      const folderId = data.driveCacheFolderId;
      const timestamp = data.driveCacheTimestamp;

      if (folderId) {
        driveUrlInput.value = `https://drive.google.com/drive/folders/${folderId}`;
        
        if (data.driveCacheFiles && timestamp && (Date.now() - timestamp < 300000)) {
          State.driveFiles = data.driveCacheFiles;
          setDriveStatus('Loaded from cache.', 'success');
          
          host.getElementById('drive-toolbar').classList.remove('hidden');
          host.querySelector('.drive-config').classList.add('hidden');
          renderDriveGrid();
        } else {
          loadDriveFiles(folderId);
        }
      } else {
        setDriveStatus('No folder connected.', 'info');
        driveGrid.innerHTML = '<div class="empty-state">Link a Google Drive folder above to view files</div>';
        host.getElementById('drive-toolbar').classList.add('hidden');
        host.querySelector('.drive-config').classList.remove('hidden');
      }
    });
  };

  // ─── SETTINGS LOGIC ───
  const applyTheme = (themeName) => {
    let activeTheme = themeName;
    if (themeName === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      activeTheme = isDark ? 'dark' : 'light';
    }
    host.host.setAttribute('data-theme', activeTheme);
  };

  const updateSettingsUI = async () => {
    const usageText = host.getElementById('storage-usage-text');
    const progressFill = host.getElementById('storage-progress-fill');
    if (usageText) {
      const size = await getVaultStorageSize();
      const mb = size / (1024 * 1024);
      usageText.innerText = `Used: ${mb.toFixed(2)} MB`;
      const percentage = Math.min((mb / 100) * 100, 100);
      if (progressFill) progressFill.style.width = `${percentage}%`;
    }
  };

  // ─── DRAG & DROP ON PAGE ACTIONS ───
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
  });
  dropZone.addEventListener('dragover', () => dropZone.classList.add('dragover'));
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

  const fetchImageFromUrl = async (url) => {
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('Not an image');
      const ext = blob.type.split('/')[1] || 'png';
      const name = url.split('/').pop().split('?')[0] || `image.${ext}`;
      return new File([blob], name, { type: blob.type });
    } catch (err) {
      return null;
    }
  };

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

  dropZone.addEventListener('drop', async (e) => {
    dropZone.classList.remove('dragover');
    const dt = e.dataTransfer;
    if (dt.files && dt.files.length > 0) {
      saveMultipleFiles(dt.files);
      return;
    }
    const html = dt.getData('text/html');
    if (html) {
      const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (match && match[1]) {
        const f = await fetchImageFromUrl(match[1]);
        if (f) saveMultipleFiles([f]);
        return;
      }
    }
    const text = dt.getData('text/plain');
    if (text && (text.startsWith('http') || text.startsWith('data:'))) {
      if (text.startsWith('data:')) {
        const arr = text.split(',');
        const mime = (arr[0].match(/:(.*?);/) || ['', 'image/png'])[1];
        const blob = dataURLtoBlob(text);
        if (blob) {
          saveMultipleFiles([new File([blob], 'image.' + mime.split('/')[1], { type: mime })]);
        }
      } else {
        const f = await fetchImageFromUrl(text);
        if (f) saveMultipleFiles([f]);
      }
    }
  });

  document.addEventListener('dragenter', (e) => {
    if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
      if (e.clientX > window.innerWidth - 80) {
        expandSidebar();
        host.querySelector('[data-tab="vault"]').click();
        dropZone.classList.add('dragover');
        clearTimeout(State.dragOverTimeout);
      }
    }
  }, true);

  document.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
      if (e.clientX > window.innerWidth - 380) {
        dropZone.classList.add('dragover');
      } else {
        dropZone.classList.remove('dragover');
      }
      clearTimeout(State.dragOverTimeout);
    }
  }, true);

  document.addEventListener('dragleave', () => {
    State.dragOverTimeout = setTimeout(() => dropZone.classList.remove('dragover'), 200);
  }, true);

  document.addEventListener('drop', () => dropZone.classList.remove('dragover'), true);

  // Helper to safely clean up drag state
  const cleanDragState = () => {
    console.log(`[DEBUG CONTENT] Cleaning drag state.`);
    State.isDraggingFromSidebar = false;
    State.currentDraggedFile = null;
    const draggingCards = host.querySelectorAll('.file-card.dragging');
    draggingCards.forEach(c => c.classList.remove('dragging'));
  };

  // DROP FROM VAULT OUT TO PAGE TARGETS
  document.addEventListener('dragover', (e) => {
    if (State.isDraggingFromSidebar && State.currentDraggedFile) { 
      e.preventDefault(); 
      e.dataTransfer.dropEffect = 'copy'; 
    }
  });

  document.addEventListener('drop', (e) => {
    // Avoid handling our own synthetic drops
    if (e._isSmartDropSynthetic) {
      console.log(`[DEBUG CONTENT] Ignoring synthetic Smart Drop event in document drop handler.`);
      return;
    }

    if (State.isDraggingFromSidebar && State.currentDraggedFile) {
      const fileObj = State.currentDraggedFile;
      console.log(`[DEBUG CONTENT] Intercepted drop event on page. Target: ${e.target.tagName}, ID: ${e.target.id}, Class: ${e.target.className}`);

      // We handle the drop, so prevent browser defaults
      e.preventDefault(); 
      e.stopPropagation();

      // Check if dropped onto a file input (or child of a file input)
      const fileInput = e.composedPath().find(el => el.tagName === 'INPUT' && el.type === 'file');
      
      if (fileInput) {
        console.log(`[DEBUG CONTENT] File input detected! Injecting File.`);
        try {
          const dt = new DataTransfer();
          dt.items.add(fileObj);
          fileInput.files = dt.files;
          
          console.log(`[DEBUG CONTENT] DataTransfer file count assigned to input: ${fileInput.files.length}`);

          // Dispatch bubbling input and change events so page frameworks detect the change
          fileInput.dispatchEvent(new Event('input', { bubbles: true }));
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          
          showToast(`Uploaded ${fileObj.name} to input`, 'success');
          
          if (fileObj.id) {
            chrome.runtime.sendMessage({ action: "UPDATE_LAST_USED", id: fileObj.id });
          }
        } catch (err) {
          console.error(`[DEBUG CONTENT] Error injecting file into input:`, err);
          showToast("Failed to upload file to input", "error");
        }
        cleanDragState();
        return;
      }

      // For custom website drop zones, dispatch a single synthetic DragEvent with a populated DataTransfer
      console.log(`[DEBUG CONTENT] Custom dropzone target. Dispatching synthetic drop event.`);
      try {
        const dt = new DataTransfer();
        dt.items.add(fileObj);
        
        const syntheticEvent = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt
        });
        
        // Custom flag to prevent recursion
        syntheticEvent._isSmartDropSynthetic = true;

        const target = e.target;
        target.dispatchEvent(syntheticEvent);

        if (!syntheticEvent.defaultPrevented) {
          console.log(`[DEBUG CONTENT] Synthetic event not prevented by website drop handler.`);
          showToast("This website may not accept browser-generated file drops.", "info");
        } else {
          console.log(`[DEBUG CONTENT] Synthetic event successfully handled by website.`);
          showToast(`Dropped ${fileObj.name}`, "success");
          if (fileObj.id) {
            chrome.runtime.sendMessage({ action: "UPDATE_LAST_USED", id: fileObj.id });
          }
        }
      } catch (err) {
        console.error(`[DEBUG CONTENT] Custom dropzone dispatch failed:`, err);
        showToast("This website does not accept browser-generated file drops.", "info");
      }

      cleanDragState();
    }
  }, true);

  const cleanupObjectUrls = () => {
    State.currentObjectURLs.forEach(url => URL.revokeObjectURL(url));
    State.currentObjectURLs.clear();
  };

  // ─── TABS & CONTROLS BINDING ───
  const toggleSidebar = () => {
    State.sidebarOpen = !State.sidebarOpen;
    sidebar.className = State.sidebarOpen ? 'expanded' : 'collapsed';
    if (!State.sidebarOpen) {
      settingsOverlay.classList.remove('open');
      previewOverlay.classList.remove('open');
      cleanupObjectUrls();
    }
  };

  const expandSidebar = () => {
    if (!State.sidebarOpen) {
      State.sidebarOpen = true;
      sidebar.className = 'expanded';
    }
  };

  host.getElementById('pill-trigger').addEventListener('click', () => {
    toggleSidebar();
    if (State.sidebarOpen) {
      renderVault();
      updateSettingsUI();
    }
  });
  host.getElementById('close-sidebar').addEventListener('click', toggleSidebar);

  document.addEventListener('click', (e) => {
    if (!State.sidebarOpen) return;
    const path = e.composedPath();
    if (!path.includes(sidebar)) {
      toggleSidebar();
    }
  });

  host.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      host.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      host.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      const panel = host.getElementById(`${tab}-panel`);
      if (panel) panel.classList.add('active');
      
      settingsOverlay.classList.remove('open');
      previewOverlay.classList.remove('open');
      cleanupObjectUrls();
      
      if (tab === 'vault') renderVault();
      else if (tab === 'drive') loadCachedDriveFolder();
    });
  });

  host.getElementById('btn-settings').addEventListener('click', () => {
    const isOpen = settingsOverlay.classList.contains('open');
    if (isOpen) {
      settingsOverlay.classList.remove('open');
    } else {
      expandSidebar();
      settingsOverlay.classList.add('open');
      updateSettingsUI();
    }
  });

  host.getElementById('close-settings').addEventListener('click', () => {
    settingsOverlay.classList.remove('open');
  });

  host.getElementById('close-preview').addEventListener('click', () => {
    previewOverlay.classList.remove('open');
    cleanupObjectUrls();
  });

  // ─── SEARCH & FILTER INPUTS BINDING ───
  vaultSearch.addEventListener('input', () => {
    State.vaultSearchQuery = vaultSearch.value;
    if (State.vaultSearchQuery) clearVaultSearch.classList.remove('hidden');
    else clearVaultSearch.classList.add('hidden');
    renderVault();
  });

  clearVaultSearch.addEventListener('click', () => {
    vaultSearch.value = '';
    State.vaultSearchQuery = '';
    clearVaultSearch.classList.add('hidden');
    renderVault();
  });

  vaultSort.addEventListener('change', () => {
    State.vaultSort = vaultSort.value;
    renderVault();
  });

  host.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      host.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.vaultCategory = btn.getAttribute('data-category');
      renderVault();
    });
  });

  if (driveSearchInput) {
    driveSearchInput.addEventListener('input', () => {
      State.driveSearchQuery = driveSearchInput.value.trim();
      if (State.driveSearchQuery) clearDriveSearch.classList.remove('hidden');
      else clearDriveSearch.classList.add('hidden');
      renderDriveGrid();
    });
  }

  if (clearDriveSearch) {
    clearDriveSearch.addEventListener('click', () => {
      driveSearchInput.value = '';
      State.driveSearchQuery = '';
      clearDriveSearch.classList.add('hidden');
      renderDriveGrid();
    });
  }

  host.getElementById('refresh-drive').addEventListener('click', () => {
    chrome.storage.local.get(['driveCacheFolderId'], (data) => {
      if (data.driveCacheFolderId) {
        loadDriveFiles(data.driveCacheFolderId);
      }
    });
  });

  host.getElementById('disconnect-drive').addEventListener('click', async () => {
    const confirm = await showConfirmModal({
      title: 'Unlink Folder',
      message: 'Unlink Google Drive folder? Remote files will not be deleted.',
      confirmText: 'Unlink',
      isDestructive: true
    });
    if (confirm) {
      chrome.storage.local.remove(['driveFolderId', 'driveCacheFiles', 'driveCacheFolderId', 'driveCacheTimestamp'], () => {
        driveUrlInput.value = '';
        State.driveFiles = [];
        setDriveStatus('Folder unlinked.', 'info');
        driveGrid.innerHTML = '<div class="empty-state">Link a Google Drive folder above to view files</div>';
        host.getElementById('drive-toolbar').classList.add('hidden');
        host.querySelector('.drive-config').classList.remove('hidden');
        showToast('Google Drive folder unlinked', 'info');
      });
    }
  });

  dropZone.addEventListener('click', (e) => {
    if (e.target.id === 'btn-dismiss-onboarding') return;
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      saveMultipleFiles(fileInput.files);
      fileInput.value = '';
    }
  });

  if (settingTheme) {
    settingTheme.addEventListener('change', () => {
      State.currentTheme = settingTheme.value;
      chrome.storage.local.set({ smartDropTheme: State.currentTheme }, () => {
        applyTheme(State.currentTheme);
        showToast('Theme updated', 'success');
      });
    });
  }

  if (settingDefaultTab) {
    settingDefaultTab.addEventListener('change', () => {
      State.defaultTab = settingDefaultTab.value;
      chrome.storage.local.set({ defaultTab: State.defaultTab }, () => {
        showToast('Default tab updated', 'success');
      });
    });
  }

  if (settingCardDensity) {
    settingCardDensity.addEventListener('change', () => {
      State.cardDensity = settingCardDensity.value;
      chrome.storage.local.set({ cardDensity: State.cardDensity }, () => {
        applyCardDensityClass();
        renderVault();
        showToast('Grid layout updated', 'success');
      });
    });
  }

  host.getElementById('clear-vault').addEventListener('click', async () => {
    const confirm = await showConfirmModal({
      title: 'Clear Vault',
      message: 'Delete ALL files in your Vault? This action is destructive and cannot be undone.',
      confirmText: 'Clear All',
      isDestructive: true
    });
    if (confirm) {
      chrome.runtime.sendMessage({ action: "CLEAR_VAULT" }, response => {
        if (response?.success) {
          renderVault();
          updateSettingsUI();
          showToast('Vault cleared completely', 'success');
        }
      });
    }
  });

  // ─── TAB-TO-TAB BROADCASTED EVENTS LISTENER ───
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "VAULT_UPDATED") {
      renderVault();
      updateSettingsUI();
    }
  });

  // ─── KEYBOARD & FOCUS ACCESSIBILITY ───
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const confirmModals = host.querySelectorAll('#custom-confirm-modal, #custom-prompt-modal, #custom-duplicate-modal');
      if (confirmModals.length > 0) {
        confirmModals[confirmModals.length - 1].remove();
        return;
      }
      if (previewOverlay.classList.contains('open')) {
        previewOverlay.classList.remove('open');
        cleanupObjectUrls();
        return;
      }
      if (settingsOverlay.classList.contains('open')) {
        settingsOverlay.classList.remove('open');
        return;
      }
      const actionMenu = host.getElementById('file-actions-menu');
      if (actionMenu && !actionMenu.classList.contains('hidden')) {
        actionMenu.classList.add('hidden');
        return;
      }
      if (State.sidebarOpen) {
        toggleSidebar();
      }
    }
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    chrome.storage.local.get(['smartDropTheme'], (data) => {
      const themeName = data.smartDropTheme || 'dark';
      if (themeName === 'system') {
        applyTheme('system');
      }
    });
  });

  // ─── INITIALIZATION ───
  chrome.storage.local.get([
    'smartDropTheme', 
    'defaultTab', 
    'cardDensity', 
    'smartDropOnboardingDismissed'
  ], (data) => {
    State.currentTheme = data.smartDropTheme || 'dark';
    State.defaultTab = data.defaultTab || 'vault';
    State.cardDensity = data.cardDensity || 'comfortable';
    State.dismissedOnboarding = data.smartDropOnboardingDismissed || false;

    if (settingTheme) settingTheme.value = State.currentTheme;
    if (settingDefaultTab) settingDefaultTab.value = State.defaultTab;
    if (settingCardDensity) settingCardDensity.value = State.cardDensity;

    applyTheme(State.currentTheme);
    applyCardDensityClass();
    renderVault();
    updateSettingsUI();

    if (State.defaultTab === 'drive') {
      host.querySelector('[data-tab="drive"]').click();
    } else {
      host.querySelector('[data-tab="vault"]').click();
    }
  });

  console.log("Smart Drop: Ready.");
})();