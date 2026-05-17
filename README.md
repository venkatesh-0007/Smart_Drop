# Smart Drop

Smart Drop is a Chrome Extension that adds a modern floating sidebar to every webpage for file management, Google Drive access, and AI-powered tools.

## Features

* Drag and drop files into a browser vault
* Drag saved files back onto websites
* Google Drive folder integration
* AI text summarization and chat
* Dark & Light mode
* Apple-inspired floating UI

## AI Providers

* OpenAI GPT-4o
* Claude 3.5 Sonnet
* Gemini 2.0 Flash

## Tech Stack

* JavaScript
* Chrome Extension Manifest V3
* IndexedDB
* Google Drive API
* Shadow DOM

## Installation

1. Clone the repository

```bash id="zd4xol"
git clone https://github.com/venkatesh-0007/Smart_Drop.git
```

2. Open Chrome Extensions

```text id="9i7nvq"
chrome://extensions
```

3. Enable **Developer Mode**

4. Click **Load unpacked**

5. Select the `Smart_Drop` folder

## Project Structure

```bash id="r23gcl"
Smart_Drop/
├── manifest.json
├── background.js
├── content.js
├── sidebar.css
└── README.md
```

## Permissions Used

* Storage
* Identity
* Active Tab
* Context Menus

## Future Plans

* Cloud sync
* File search
* Local LLM support
* Better AI workflows
