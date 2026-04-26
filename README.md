# Lazy Tab Manager

A browser extension for Chrome, Edge, and Firefox that keeps your tabs under control.

## Features

- **Duplicate tab detection** — when you open a URL that's already open, a banner appears asking if you want to switch to the existing tab or stay
- **Auto-suspend inactive tabs** — after a user-defined period of inactivity, tabs are replaced with a lightweight suspended page to save memory. Click "Wake up tab" to restore
- **Auto-close inactive tabs** — tabs that have been inactive for too long are automatically closed. Pinned tabs are never affected

## Installation

### Chrome / Edge

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this folder

### Firefox

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `manifest.json` from this folder

## Building

This extension ships two manifests since Chrome and Firefox require different background script declarations.

**Switch to Chrome manifest:**
```bash
node build.js chrome
```

**Switch to Firefox manifest:**
```bash
node build.js firefox
```

**Create a zip for store submission:**
```bash
node build.js chrome --zip
node build.js firefox --zip
```

## Configuration

Click the extension icon in the toolbar to quickly set suspend and auto-close timeouts. For more options, click **More options** to open the full settings page.

| Setting | Default | Description |
|---|---|---|
| Suspend after | 30 min | Inactive tabs are replaced with a suspended page |
| Close after | 120 min | Inactive tabs are permanently closed |

## File Structure

```
├── background.js         # Service worker — core logic
├── content.js            # In-page duplicate tab banner
├── popup.html/js         # Toolbar popup
├── options.html/js       # Full settings page
├── suspended.html/js     # Suspended tab page
├── build.js              # Manifest switcher + zip builder
├── manifest.chrome.json  # Manifest for Chrome & Edge
├── manifest.firefox.json # Manifest for Firefox
└── icons/
```
