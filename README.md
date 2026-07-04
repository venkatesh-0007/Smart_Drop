# Smart Drop

Smart Drop is a premium, lightweight Chrome Extension floating workspace that simplifies file productivity. It allows you to store, organize, preview, and drag-and-drop frequently used files directly inside your browser.

---

## Key Features

### 📦 Local File Vault
* **High-Performance Storage:** Files are stored natively as raw `Blob` objects in the browser's local IndexedDB. This avoids slow base64 conversions and keeps memory usage low.
* **Instant Drag & Drop:** Drag files from your computer or webpages directly into the Vault, and drag Vault cards back out onto website upload areas.
* **Direct Desktop Dragging:** Start dragging a card and drop it onto your Desktop to download the file instantly.
* **Smart Category Filters:** Organize your vault with horizontal filters (*All, Images, Docs, PDFs, Sheets, Slides, Zips, Other*) matching MIME types and fallback file extensions.
* **Search & Sort:** Instantly search filenames and sort files by date added, name (A-Z), size, or recently used.
* **Metadata & Previews:** Hover cards to view size badges, or slide open a dedicated details panel to preview image formats, formatted plain text, JSON contents, PDFs, and full file parameters.

### 🚗 Google Drive Folder Integration
* **Folder Linkage:** Paste any Google Drive folder URL to extract folder IDs and link the directory.
* **OAuth Protected Access:** Securely authenticates with Google Drive API via `chrome.identity.getAuthToken` with readonly scopes.
* **Metadata Caching:** Cache Google Drive file lists locally for 5 minutes to bypass API rate limits and enable instant loading.
* **Independent Search:** Query files inside your connected Google Drive folder separately from your local Vault.

### ⚙ Premium UI/UX & Custom Components
* **Apple-Inspired Design:** Minimal, dark-first, clean visual layout with custom SVG icons, card-lifting transitions, and custom scroll tracks.
* **Density Selection:** Toggle spacing between comfortable Grid views and a compact list layout.
* **System Theme Integration:** Supports light mode, dark mode, or automatic synchronization with system settings.
* **Zero Layout Shift:** Content scripts inject a floating Shadow DOM panel to ensure page style isolation.
* **Toast & Confirmation Modals:** Integrated Shadow DOM notification alerts and modals for renaming, deleting, duplicate resolution, and clearing actions.

---

## Technical Stack
* **Runtime Environment:** Vanilla Javascript, Chrome Extension Manifest V3.
* **Local Databases:** IndexedDB (`SmartDropDB_v2`) for local binary file blobs, `chrome.storage.local` for settings and Google Drive metadata caching.
* **API Services:** Google Drive API v3.
* **Encapsulation:** Shadow DOM for strict z-index and style segregation.

---

## Installation & Setup
1. Clone this repository locally.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Toggle on **Developer Mode** in the top-right corner.
4. Click **Load unpacked** and select the `Smart_Drop` folder.

---

## OAuth Configuration for Developers
For the Google Drive integration to function, you must set your developer OAuth client ID in `manifest.json` under `"oauth2"`.
```json
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/drive.readonly"
    ]
  }
```
*Make sure to register your Chrome Extension ID (generated on loading the unpacked directory) in your Google Cloud Console Credentials tab under Chrome App Client ID parameters.*

---

## Privacy Model
* **Offline First:** Local Vault files are never sent to external servers. They are stored entirely locally on your device inside the browser's IndexedDB.
* **Permissions Minimalist:** Only requires `storage` (settings) and `identity` (Drive connection). No background telemetry, tracking, or network requests.
