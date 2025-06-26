# Gemini Code Assistant Guidelines for This Repository

This document provides guidelines for the Gemini code assistant to follow when working on this repository.

## Project Overview

This repository is a collection of Tampermonkey user scripts. Each script is a standalone `.js` file designed to be loaded by the Tampermonkey browser extension to modify the behavior or appearance of specific websites.

## File and Code Conventions

When adding new scripts or modifying existing ones, please adhere to the following conventions to maintain consistency across the project.

### File Naming

-   **Use descriptive, kebab-case names** for new scripts.
    -   *Example:* `github-pull-request-helper.js`

### Script Structure

-   **Each script must be a single, self-contained `.js` file.**
-   **Use an Immediately Invoked Function Expression (IIFE)** to encapsulate your script's logic and prevent conflicts with the global scope of the host page.
    ```javascript
    (function () {
      "use strict";
      // Your script logic here...
    })();
    ```
-   **Enable strict mode** by including `"use strict";` at the beginning of your IIFE.

### Tampermonkey Metadata Block

-   **Every script must start with a `// ==UserScript==` metadata block.**
-   Include the following essential keys:
    -   `@name`: A human-readable name for the script.
    -   `@namespace`: Use `http://tampermonkey.net/` unless you have a specific reason not to.
    -   `@version`: Follow semantic versioning (e.g., `1.0`, `1.1.0`).
    -   `@description`: A brief explanation of what the script does.
    -   `@author`: Your name or alias.
    -   `@match`: The URL pattern(s) where the script should run. Be as specific as possible.
    -   `@grant`: Specify any special permissions required by the script (e.g., `GM_xmlhttpRequest`). Use `none` if no special permissions are needed.

    *Example:*
    ```javascript
    // ==UserScript==
    // @name         My New Script
    // @namespace    http://tampermonkey.net/
    // @version      0.1
    // @description  This is a new script that does something cool.
    // @author       Your Name
    // @match        https://example.com/*
    // @grant        none
    // ==/UserScript==
    ```

### Coding Style

-   **Variables:** Use `const` by default. Use `let` only for variables that need to be reassigned. Avoid `var`.
-   **Selectors:** When querying the DOM, prefer `document.querySelector` and `document.querySelectorAll`.
-   **Functions:** Write small, focused functions with descriptive names.
-   **Formatting:** Maintain consistent indentation (2 spaces) and spacing to ensure readability.
-   **Comments:** Add comments to explain complex logic or non-obvious code. For debugging, it's common to see styled `console.log` messages, which is an acceptable pattern in this repository.

By following these guidelines, we can ensure that the repository remains clean, consistent, and easy to maintain.
