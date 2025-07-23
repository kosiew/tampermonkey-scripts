# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a collection of Tampermonkey user scripts for browser automation and enhancement. Each script is a standalone `.js` file that modifies the behavior or appearance of specific websites.

## Key Architecture

### Shared Infrastructure
- **tampermonkey-ui-library.js**: Core UI library providing reusable `TampermonkeyUI` class for creating floating buttons and feedback messages
- Scripts use `@require` to import the UI library from GitHub raw URL
- Common pattern: `UIManager` class that wraps `TampermonkeyUI` for consistent initialization

### Script Categories
- **GitHub Enhancement**: github-branches-bulk-delete.js, github-pr-ci-error-filter.js, github-pr-diff-button.js, github-autodone-ci-failures.js, github-copy-issue.js, github-plus.js
- **ChatGPT/AI Tools**: chatgpt-codex-job-monitor.js, chatgpt-scroll-buttons.js
- **Utility Scripts**: copyGHLink.js, copyListOfPRs.js, jsCopy.js, auto-close.js
- **Financial Tools**: klsescreener.js, odb.js, fcpo.js, fcpo2.js

## Development Commands

### Testing Scripts
- **Tampermonkey Installation**: Install Tampermonkey browser extension, then add scripts via "Create new script"
- **Local Testing**: Use `file://` URLs or serve via local HTTP server for testing `@require` imports
- **GitHub Raw URLs**: Scripts reference `https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/main/` for `@require` dependencies

### Script Validation
- **Syntax Check**: `node -c script-name.js` to validate JavaScript syntax
- **Metadata Validation**: Ensure all scripts start with `// ==UserScript==` block
- **URL Matching**: Verify `@match` patterns align with intended domains

### Common Patterns
- **IIFE Wrapper**: All scripts use `(function () { "use strict"; ... })();`
- **UIManager Pattern**: Most scripts include `class UIManager` for UI initialization
- **Event Handling**: Use `DOMContentLoaded` and `pjax:end` for GitHub SPA navigation
- **Storage**: Use `localStorage` for persisting user preferences

## File Structure Conventions

### Naming
- Use kebab-case for script names: `github-pr-helper.js`
- Descriptive names indicating target site + functionality

### Metadata Block Requirements
```javascript
// ==UserScript==
// @name         Script Name
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Brief description
// @author       You
// @match        https://target-domain.com/*
// @require      https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/main/tampermonkey-ui-library.js
// @grant        none|GM.notification
// ==/UserScript==
```

### Code Style
- Use `const` by default, `let` only when reassignment needed
- 2-space indentation
- Descriptive function names
- Console logging with prefixes for debugging: `console.log("[ScriptName] message")`