// content.js - Smart Drop Professional
(function() {
  console.log("Smart Drop: Loading...");

  let sidebarOpen = false;
  let isDraggingFromSidebar = false;
  let currentDraggedFile = null;
  let dragOverTimeout = null;
  let currentTheme = 'dark';
  let aiProvider = 'openai';
  let aiKey = '';

  // ─── Shadow DOM Container ───
  const container = document.createElement('div');
  container.id = 'smart-drop-root';
  container.style.cssText = 'position:fixed;z-index:2147483647;top:0;right:0;pointer-events:none;';
  const host = container.attachShadow({ mode: 'open' });
  host.host.setAttribute('data-theme', 'dark');
  document.documentElement.appendChild(container);

  // ─── Inject Styles ───
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = chrome.runtime.getURL('sidebar.css');
  host.appendChild(styleLink);

  // ─── Sidebar HTML ───
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
          <button class="tab-btn" data-tab="ai">AI</button>
        </div>
        <div class="tab-panels">
          <div id="vault-panel" class="panel active">
            <div class="vault-toolbar" style="display:flex;justify-content:flex-end;margin-bottom:8px;flex-shrink:0;">
              <button class="icon-btn" id="refresh-vault" title="Refresh vault">🔄</button>
            </div>
            <div class="drop-zone" id="vault-upload">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span>Drop files or click to browse</span>
            </div>
            <input type="file" id="vault-file-input" multiple accept="*/*" style="display:none;">
            <div id="vault-grid" class="file-grid"></div>
          </div>
          <div id="drive-panel" class="panel">
            <div class="drive-config">
              <span class="drive-icon-wrapper">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6.29 20.39l3.42-5.93H2.13l4.16 5.93zM19.58 14.46h-7.58l-3.42 5.93h7.58l3.42-5.93zM14.29 2.54L10.87 8.47h7.62l3.42-5.93zM9.71 2.54L2.13 8.47h7.63l3.42-5.93z"/></svg>
              </span>
              <input type="text" id="drive-url" placeholder="Paste Google Drive folder link...">
              <button id="save-drive">Link</button>
            </div>
            <div id="drive-status"></div>
            <div id="drive-list" class="file-grid"></div>
            <div id="drive-detail" class="hidden">
              <div class="drive-detail-header">
                <button id="back-to-drive">&larr;</button>
                <span class="detail-name" id="detail-name"></span>
              </div>
              <div class="drive-detail-thumbnail">
                <img id="detail-thumb" src="">
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
          <div id="ai-panel" class="panel">
            <div id="ai-output" class="ai-output">
              <p style="color:var(--text-tertiary);text-align:center;padding:20px;">Select text on any page, then right-click and choose "Summarize with Smart Drop AI"<br>or type a message below.</p>
            </div>
            <div class="ai-input-area">
              <textarea id="ai-custom-prompt" placeholder="Ask AI anything..."></textarea>
              <button id="send-ai">Send</button>
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
            <div class="theme-toggle">
              <span>Dark Mode</span>
              <div class="theme-switch on" id="theme-switch"></div>
            </div>
          </div>
          <div class="settings-group">
            <label>AI Provider</label>
            <select id="settings-provider">
              <option value="openai">OpenAI (GPT-4o)</option>
              <option value="anthropic">Anthropic (Claude 3.5)</option>
              <option value="google">Google (Gemini 2.0 Flash)</option>
            </select>
          </div>
          <div class="settings-group">
            <label>API Key</label>
            <input type="password" id="settings-apikey" placeholder="Enter your API key">
          </div>
          <div class="settings-group">
            <label>Data</label>
            <button class="btn-danger" id="clear-vault">Clear Vault</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // ─── DOM References ───
  const sidebar = host.getElementById('smart-drop-sidebar');
  const vaultGrid = host.getElementById('vault-grid');
  const driveGrid = host.getElementById('drive-list');
  const driveStatus = host.getElementById('drive-status');
  const driveUrlInput = host.getElementById('drive-url');
  const settingsOverlay = host.getElementById('settings-overlay');
  const themeSwitch = host.getElementById('theme-switch');
  const settingsProvider = host.getElementById('settings-provider');
  const settingsApiKey = host.getElementById('settings-apikey');
  const aiOutput = host.getElementById('ai-output');
  const aiTextarea = host.getElementById('ai-custom-prompt');
  const dropZone = host.getElementById('vault-upload');
  const fileInput = host.getElementById('vault-file-input');

  // ─── Sidebar Toggle ───
  const toggleSidebar = () => {
    sidebarOpen = !sidebarOpen;
    sidebar.className = sidebarOpen ? 'expanded' : 'collapsed';
    if (!sidebarOpen) settingsOverlay.classList.remove('open');
  };

  const expandSidebar = () => {
    if (!sidebarOpen) { sidebarOpen = true; sidebar.className = 'expanded'; }
  };

  host.getElementById('pill-trigger').addEventListener('click', () => {
    toggleSidebar();
    if (sidebarOpen) renderVault();
  });
  host.getElementById('close-sidebar').addEventListener('click', toggleSidebar);

  // ─── Prevent background scroll when scrolling inside sidebar ───
  sidebar.addEventListener('wheel', (e) => {
    // Check which scrollable element the wheel event is targeting
    const target = e.target;
    const scrollable = target.closest('#vault-panel, #drive-list, #drive-detail, .ai-output, .settings-body');
    if (scrollable) {
      const { scrollTop, scrollHeight, clientHeight } = scrollable;
      const atTop = scrollTop <= 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
      // Only stop propagation if there's scrollable overflow to consume
      if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {
        e.stopPropagation();
      }
    }
  }, { passive: false });

  // ─── Vault Refresh Button ───
  host.getElementById('refresh-vault').addEventListener('click', () => {
    renderVault();
  });

  // ─── Click Outside to Close ───
  document.addEventListener('click', (e) => {
    if (!sidebarOpen) return;
    // Use composedPath to traverse Shadow DOM boundaries
    const path = e.composedPath();
    // If the click path doesn't include the sidebar, close it
    if (!path.includes(sidebar)) {
      toggleSidebar();
    }
  });

  // ─── Tab Switching ───
  host.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      host.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      host.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = host.getElementById(`${target}-panel`);
      if (panel) panel.classList.add('active');
      settingsOverlay.classList.remove('open');
      // Re-render vault when switching to it
      if (target === 'vault') renderVault();
    });
  });

  // ─── Settings Overlay ───
  host.getElementById('btn-settings').addEventListener('click', () => {
    const isOpen = settingsOverlay.classList.contains('open');
    if (isOpen) {
      settingsOverlay.classList.remove('open');
    } else {
      if (!sidebarOpen) expandSidebar();
      settingsOverlay.classList.add('open');
      // Sync UI
      settingsApiKey.value = aiKey;
      settingsProvider.value = aiProvider;
    }
  });

  host.getElementById('close-settings').addEventListener('click', () => {
    settingsOverlay.classList.remove('open');
  });

  // ─── Theme Toggle ───
  themeSwitch.addEventListener('click', () => {
    const isOn = themeSwitch.classList.contains('on');
    if (isOn) {
      themeSwitch.classList.remove('on');
      currentTheme = 'light';
      host.host.setAttribute('data-theme', 'light');
    } else {
      themeSwitch.classList.add('on');
      currentTheme = 'dark';
      host.host.setAttribute('data-theme', 'dark');
    }
    chrome.storage.local.set({ smartDropTheme: currentTheme });
  });

  // ─── Settings: Provider & API Key ───
  settingsProvider.addEventListener('change', () => {
    aiProvider = settingsProvider.value;
    chrome.storage.local.set({ aiProvider: aiProvider });
  });

  settingsApiKey.addEventListener('input', () => {
    aiKey = settingsApiKey.value.trim();
    chrome.storage.local.set({ aiKey: aiKey });
  });

  // ─── Clear Vault ───
  host.getElementById('clear-vault').addEventListener('click', () => {
    if (confirm('Delete all vault files? This cannot be undone.')) {
      if (db) {
        const trans = db.transaction([STORE_NAME], 'readwrite');
        trans.objectStore(STORE_NAME).clear().onsuccess = () => {
          renderVault();
          console.log("Smart Drop: Vault cleared");
        };
      }
    }
  });

  // ─── HELPERS ───
  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function setDriveStatus(msg, type) {
    driveStatus.innerText = msg || '';
    driveStatus.classList.remove('success', 'error', 'loading');
    if (type === 'success') driveStatus.classList.add('success');
    else if (type === 'error') driveStatus.classList.add('error');
    else if (type === 'loading') driveStatus.classList.add('loading');
  }

  // ─── INDEXEDDB ───
  const DB_NAME = 'SmartDropDB_v2';
  const STORE_NAME = 'vault';
  let db;

  const initDB = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE_NAME)) {
        d.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e.target.error);
  });

  const getFileIcon = (type) => {
    const t = (type || '').toLowerCase();
    if (t.startsWith('image/')) return '🖼️';
    if (t.includes('pdf')) return '📕';
    if (t.includes('zip') || t.includes('compressed') || t.includes('rar') || t.includes('gzip')) return '📦';
    if (t.includes('text') || t.includes('json') || t.includes('csv') || t.includes('xml')) return '📄';
    if (t.includes('video') || t.includes('mp4') || t.includes('webm')) return '🎬';
    if (t.includes('audio') || t.includes('mp3') || t.includes('wav')) return '🎵';
    if (t.includes('html') || t.includes('javascript') || t.includes('css')) return '💻';
    if (t.includes('spreadsheet') || t.includes('excel') || t.includes('xls')) return '📊';
    if (t.includes('presentation') || t.includes('powerpoint') || t.includes('ppt')) return '📽️';
    return '📁';
  };

  const renderVault = () => {
    if (!vaultGrid || !db) return;
    vaultGrid.innerHTML = '';
    const tx = db.transaction([STORE_NAME], 'readonly');
    tx.objectStore(STORE_NAME).getAll().onsuccess = (e) => {
      const files = e.target.result;
      if (!files || files.length === 0) {
        vaultGrid.innerHTML = '<div class="empty-state">Vault is empty<br><span style="font-size:11px;">Drop files here or click the zone above</span></div>';
        return;
      }
      files.forEach(file => {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.draggable = true;
        const isImage = (file.type || '').startsWith('image/');
        card.innerHTML = `
          <div class="file-preview-container">
            ${isImage ? `<img src="${file.data}" class="preview-img">` : `<span class="file-icon">${getFileIcon(file.type)}</span>`}
          </div>
          <div class="file-info">
            <span class="file-name">${escapeHtml(file.name)}</span>
            <button class="delete-file" data-id="${file.id}">&times;</button>
          </div>
        `;
        card.addEventListener('dragstart', (e) => {
          isDraggingFromSidebar = true;
          currentDraggedFile = file;
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData('text/plain', file.name);
          card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => {
          isDraggingFromSidebar = false;
          card.classList.remove('dragging');
        });
        card.querySelector('.delete-file').addEventListener('click', (ev) => {
          ev.stopPropagation();
          const id = parseInt(ev.target.getAttribute('data-id'));
          const t = db.transaction([STORE_NAME], 'readwrite');
          t.objectStore(STORE_NAME).delete(id).onsuccess = () => renderVault();
        });
        vaultGrid.appendChild(card);
      });
    };
  };

  const saveFile = (file) => {
    if (!file || !file.name) return;
    console.log("Smart Drop: Saving", file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      tx.objectStore(STORE_NAME).add({
        name: file.name,
        type: file.type || 'application/octet-stream',
        data: e.target.result,
        timestamp: Date.now()
      });
      tx.oncomplete = () => renderVault();
    };
    reader.onerror = () => console.error("Smart Drop: Read error", file.name);
    reader.readAsDataURL(file);
  };

  // ─── FETCH IMAGE FROM URL (for Chrome-internal drag) ───
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
      console.warn("Smart Drop: Image fetch failed", url, err.message);
      return null;
    }
  };

  // ─── VAULT DROP ZONE + CLICK ───
  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const files = fileInput.files;
    if (files.length > 0) {
      for (let f of files) saveFile(f);
      fileInput.value = '';
    }
  });

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
  });
  dropZone.addEventListener('dragover', () => dropZone.classList.add('dragover'));
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

  dropZone.addEventListener('drop', async (e) => {
    dropZone.classList.remove('dragover');
    const dt = e.dataTransfer;
    // Check for files
    if (dt.files && dt.files.length > 0) {
      for (let f of dt.files) saveFile(f);
      return;
    }
    // Check for image URLs dragged from Chrome
    const html = dt.getData('text/html');
    if (html) {
      const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (match && match[1]) {
        const f = await fetchImageFromUrl(match[1]);
        if (f) saveFile(f);
        return;
      }
    }
    const text = dt.getData('text/plain');
    if (text && (text.startsWith('http') || text.startsWith('data:'))) {
      if (text.startsWith('data:')) {
        const arr = text.split(',');
        const mime = (arr[0].match(/:(.*?);/) || ['', 'image/png'])[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8 = new Uint8Array(n);
        while (n--) u8[n] = bstr.charCodeAt(n);
        const blob = new Blob([u8], { type: mime });
        saveFile(new File([blob], 'image.' + mime.split('/')[1], { type: mime }));
      } else {
        const f = await fetchImageFromUrl(text);
        if (f) saveFile(f);
      }
    }
  });

  // ─── AUTO-EXPAND ON OS DRAG ───
  document.addEventListener('dragenter', (e) => {
    if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
      if (e.clientX > window.innerWidth - 80) {
        expandSidebar();
        host.querySelector('[data-tab="vault"]').click();
        dropZone.classList.add('dragover');
        clearTimeout(dragOverTimeout);
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
      clearTimeout(dragOverTimeout);
    }
  }, true);

  document.addEventListener('dragleave', () => {
    dragOverTimeout = setTimeout(() => dropZone.classList.remove('dragover'), 200);
  }, true);

  document.addEventListener('drop', () => dropZone.classList.remove('dragover'), true);

  // ─── SIDEBAR-TO-PAGE DROP ───
  document.addEventListener('dragover', (e) => {
    if (isDraggingFromSidebar) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  });

  document.addEventListener('drop', (e) => {
    if (isDraggingFromSidebar && currentDraggedFile) {
      e.preventDefault(); e.stopPropagation();
      const blob = dataURLtoBlob(currentDraggedFile.data);
      const file = new File([blob], currentDraggedFile.name, { type: currentDraggedFile.type });
      const dt = new DataTransfer(); dt.items.add(file);
      const target = e.target;
      if (target.tagName === 'INPUT' && target.type === 'file') {
        try {
          target.files = dt.files;
          target.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (err) {
          target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        }
      } else {
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      }
      currentDraggedFile = null;
      isDraggingFromSidebar = false;
    }
  }, true);

  function dataURLtoBlob(dataurl) {
    const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]); let n = bstr.length; const u8 = new Uint8Array(n);
    while (n--) u8[n] = bstr.charCodeAt(n);
    return new Blob([u8], { type: mime });
  }

  // ─── DRIVE FILE TYPE BADGE HELPER ───
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

  // ─── GOOGLE DRIVE ───
  host.getElementById('save-drive').addEventListener('click', () => {
    const url = driveUrlInput.value.trim();
    if (!url) { setDriveStatus('Please paste a Google Drive folder link.', 'error'); return; }
    const match = url.match(/folders\/([-\w]{25,})/) || url.match(/[-\w]{25,}/);
    const folderId = match ? (match[1] || match[0]) : null;
    if (folderId) {
      setDriveStatus('Linking folder...', 'loading');
      chrome.storage.local.set({ driveFolderId: folderId }, () => loadDriveFiles(folderId));
    } else {
      setDriveStatus('Invalid folder URL. Paste a full Google Drive folder link.', 'error');
    }
  });

  async function loadDriveFiles(folderId) {
    driveGrid.innerHTML = '<div class="empty-state">Authenticating...</div>';
    setDriveStatus('Requesting access...', 'loading');
    chrome.runtime.sendMessage({ action: "OPEN_AUTH_WINDOW" }, response => {
      if (chrome.runtime.lastError) {
        setDriveStatus('Extension error. Try reloading.', 'error');
        driveGrid.innerHTML = '<div class="empty-state" style="color:var(--danger);">Communication error</div>';
        return;
      }
      if (response && response.success) {
        setDriveStatus('Fetching files...', 'loading');
        fetchDriveFiles(response.token, folderId);
      } else {
        const err = response?.error || 'Authentication failed';
        setDriveStatus(`Auth failed: ${err}`, 'error');
        driveGrid.innerHTML = `<div class="empty-state" style="color:var(--danger);font-size:11px;line-height:1.6;">
          <strong>Authentication Failed</strong><br>${escapeHtml(err)}<br><br>
          <span style="color:var(--text-tertiary);">Ensure your OAuth Client ID is set in manifest.json and the Google Drive API is enabled.</span>
        </div>`;
      }
    });
  }

  let driveToken = null;
  let driveFileCache = [];

  async function fetchDriveFiles(token, folderId) {
    driveToken = token;
    driveGrid.innerHTML = '<div class="empty-state">Loading files...</div>';
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q='${encodeURIComponent(folderId)}'+in+parents&fields=files(id,name,mimeType,thumbnailLink,iconLink,webViewLink,webContentLink,size,modifiedTime)&pageSize=50`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const txt = await res.text();
        let msg = txt;
        try { msg = JSON.parse(txt).error?.message || txt; } catch {}
        throw new Error(`Drive API (${res.status}): ${msg}`);
      }
      const data = await res.json();
      driveGrid.innerHTML = '';
      driveFileCache = data.files || [];
      setDriveStatus(`Found ${driveFileCache.length} files.`, 'success');
      if (driveFileCache.length === 0) {
        driveGrid.innerHTML = '<div class="empty-state">No files in this folder</div>';
        return;
      }
      renderDriveGrid();
    } catch (err) {
      console.error("Smart Drop: Drive error", err);
      setDriveStatus(`Error: ${err.message}`, 'error');
      driveGrid.innerHTML = `<div class="empty-state" style="color:var(--danger);font-size:11px;">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderDriveGrid() {
    driveGrid.innerHTML = '';
    driveFileCache.forEach(file => {
      const card = document.createElement('div');
      card.className = 'file-card';
      const isImage = (file.mimeType || '').startsWith('image/');
      const thumbnail = file.thumbnailLink || file.iconLink || '';
      const [badgeText, badgeType] = getDriveFileTypeBadge(file.mimeType);
      card.innerHTML = `
        <div class="drive-file-type-badge ${badgeType}">${badgeText}</div>
        <div class="file-preview-container">
          <img src="${thumbnail}" class="preview-img" style="object-fit:${isImage ? 'cover' : 'contain'};padding:${isImage ? '0' : '8px'};">
        </div>
        <div class="file-info">
          <span class="file-name">${escapeHtml(file.name)}</span>
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

    // Use webContentLink for direct image viewing, or upscaled thumbnail for non-images
    if (isImage && file.webContentLink) {
      detailPreview.innerHTML = `<img src="${file.webContentLink}" onerror="this.style.display='none'">`;
    } else if (file.thumbnailLink && !isImage) {
      detailPreview.innerHTML = `<img src="${file.thumbnailLink.replace(/=s\d+/, '=s800')}" onerror="this.style.display='none'">`;
    } else {
      detailPreview.innerHTML = `<div class="preview-fallback">📄</div>`;
    }

    detailOpen.onclick = () => {
      window.open(file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`, '_blank');
    };

    // Show detail, hide grid
    driveGrid.style.display = 'none';
    host.getElementById('drive-detail').classList.remove('hidden');
  }

  function hideDriveDetail() {
    driveGrid.style.display = 'grid';
    host.getElementById('drive-detail').classList.add('hidden');
  }

  host.getElementById('back-to-drive').addEventListener('click', hideDriveDetail);

  // ─── AI CHAT ───
  host.getElementById('send-ai').addEventListener('click', () => {
    const prompt = aiTextarea.value.trim();
    if (!prompt) return;
    if (!aiKey) {
      aiOutput.innerHTML = '<p style="color:var(--danger);">Set your API key in Settings (⚙) first.</p>';
      return;
    }
    aiOutput.innerHTML = '<p style="color:var(--text-secondary);">Thinking...</p>';
    chrome.runtime.sendMessage({
      action: "AI_REQUEST",
      provider: aiProvider,
      apiKey: aiKey,
      text: prompt,
      prompt: prompt
    }, response => {
      if (chrome.runtime.lastError) {
        aiOutput.innerHTML = `<p style="color:var(--danger);">Error: ${escapeHtml(chrome.runtime.lastError.message)}</p>`;
        return;
      }
      if (response.success) {
        let content = '';
        if (aiProvider === 'google') {
          content = response.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
        } else if (aiProvider === 'anthropic') {
          content = response.data.content?.[0]?.text || 'No response';
        } else {
          content = response.data.choices?.[0]?.message?.content || 'No response';
        }
        const rendered = content.replace(/\n/g, '<br>')
          .replace(/```(\w+)?\n?/g, '<pre><code>')
          .replace(/```/g, '</code></pre>');
        aiOutput.innerHTML = `<p>${rendered}</p>`;
      } else {
        aiOutput.innerHTML = `<p style="color:var(--danger);">Error: ${escapeHtml(response.error)}</p>`;
      }
    });
  });

  aiTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      host.getElementById('send-ai').click();
    }
  });

  // ─── CONTEXT MENU SUMMARIZE ───
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "AI_SUMMARIZE") {
      if (!sidebarOpen) toggleSidebar();
      host.querySelector('[data-tab="ai"]').click();
      aiOutput.innerHTML = '<p style="color:var(--text-secondary);">Summarizing...</p>';
      chrome.runtime.sendMessage({
        action: "AI_REQUEST",
        provider: aiProvider,
        apiKey: aiKey,
        text: request.text
      }, response => {
        if (chrome.runtime.lastError) {
          aiOutput.innerHTML = `<p style="color:var(--danger);">Error: ${escapeHtml(chrome.runtime.lastError.message)}</p>`;
          return;
        }
        if (response.success) {
          let content = '';
          if (aiProvider === 'google') {
            content = response.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
          } else if (aiProvider === 'anthropic') {
            content = response.data.content?.[0]?.text || 'No response';
          } else {
            content = response.data.choices?.[0]?.message?.content || 'No response';
          }
          const rendered = content.replace(/\n/g, '<br>')
            .replace(/```(\w+)?\n?/g, '<pre><code>')
            .replace(/```/g, '</code></pre>');
          aiOutput.innerHTML = `<p>${rendered}</p>`;
        } else {
          aiOutput.innerHTML = `<p style="color:var(--danger);">Error: ${escapeHtml(response.error)}</p>`;
        }
      });
    }
  });

  // ─── INIT ───
  initDB().then(() => {
    console.log("Smart Drop: DB ready");
    renderVault();
    chrome.storage.local.get(['driveFolderId', 'aiKey', 'aiProvider', 'smartDropTheme'], (data) => {
      if (data.driveFolderId) {
        driveUrlInput.value = `https://drive.google.com/drive/folders/${data.driveFolderId}`;
        setDriveStatus('Folder saved. Click Link to load.', 'var(--text-tertiary)');
      }
      if (data.aiKey) { aiKey = data.aiKey; settingsApiKey.value = aiKey; }
      if (data.aiProvider) { aiProvider = data.aiProvider; settingsProvider.value = aiProvider; }
      if (data.smartDropTheme) {
        currentTheme = data.smartDropTheme;
        if (currentTheme === 'light') {
          themeSwitch.classList.remove('on');
          host.host.setAttribute('data-theme', 'light');
        }
      }
    });
  }).catch(err => console.error("Smart Drop: DB init failed", err));

  console.log("Smart Drop: Ready.");
})();