# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key Architecture

### Shared Infrastructure
- **tampermonkey-ui-library.js**: Core UI library providing reusable `TampermonkeyUI` class for creating floating buttons and feedback messages
- Scripts use `@require` to import the UI library from GitHub raw URL
- Common pattern: `UIManager` class that wraps `TampermonkeyUI` for consistent initialization

## Development Commands

### Script Validation
- **Syntax Check**: `node -c script-name.js` to validate JavaScript syntax
- **Metadata Validation**: Ensure all scripts start with `// ==UserScript==` block, include `@downloadURL`/`@updateURL`, and have a bumped `@version`
- **URL Matching**: Verify `@match` patterns align with intended domains

### Common Patterns
- **Event Handling**: Use `DOMContentLoaded` and `pjax:end` for GitHub SPA navigation
- **Storage**: Use `localStorage` for persisting user preferences

## File Structure Conventions

### Metadata Block Requirements
```javascript
// ==UserScript==
// @name         Script Name
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Brief description
// @author       You
// @match        https://target-domain.com/*
// @require      https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/main/tampermonkey-ui-library.js
// @grant        none|GM.notification
// @downloadURL  https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/main/script-name.js
// @updateURL    https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/main/script-name.js
// ==/UserScript==
```

### Auto-Update Convention
- Every installable script sets `@downloadURL` and `@updateURL` to its own raw GitHub URL on `main` (file name must match exactly)
- Never point these at upstream sources (e.g. Greasy Fork) — Tampermonkey would overwrite local changes with the upstream script
- **Bump `@version` on every change pushed to `main`**; Tampermonkey only updates when the remote version is higher
- Use numeric versions (`0.1`, `1.2`, `0.1.1`), not dates; new scripts start at `0.1`
- Shared libraries loaded via `@require` (`tampermonkey-ui-library.js`, `tampermonkey-utils.js`) don't need update URLs
- Installed copies only pick up a changed update URL after a one-time reinstall from the raw URL

### Code Style
- Console logging with prefixes for debugging: `console.log("[ScriptName] message")`