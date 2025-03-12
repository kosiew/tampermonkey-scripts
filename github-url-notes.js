// ==UserScript==
// @name         GitHub URL Notes Manager
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Adds a button to manage notes for GitHub URLs with Gist storage
// @author       Siew Kam Onn
// @match        https://github.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.registerMenuCommand
// @grant        unsafeWindow
// @connect      api.github.com
// @connect      github.com
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  // Constants
  const CLEANUP_DAYS = 30;
  const GIST_DESCRIPTION = "GitHub URL Notes";
  const GIST_FILENAME = "github-url-notes.json";
  const AUTH_TIMEOUT = 60000;
  const AUTH_STATE_KEY = "auth_state";
  const AUTH_WINDOW_KEY = "auth_window_open";

  // State variables
  let notes = {};
  let accessToken = null;
  let gistId = null;
  let clientId = null;
  let authTimeoutId = null;
  let authWindow = null;
  let isInitialized = false;
  let isInitializing = false;

  function debugLog(message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[GitHub Notes ${timestamp}] ${message}`;
    if (data) {
      console.log(logMessage, data);
    } else {
      console.log(logMessage);
    }
  }

  // Safe storage access wrapper
  async function safeStorageAccess(action) {
    try {
      return await action();
    } catch (error) {
      debugLog("Storage access error:", error);
      return null;
    }
  }

  async function checkConfiguration() {
    debugLog("Checking configuration");
    try {
      clientId = await safeStorageAccess(() =>
        GM.getValue("github_client_id", null)
      );
      debugLog("Retrieved client ID:", clientId ? "exists" : "null");

      if (!clientId) {
        const input = prompt(
          "Please enter your GitHub OAuth App Client ID.\n" +
            "To create one:\n" +
            "1. Go to GitHub Settings > Developer settings > OAuth Apps\n" +
            '2. Click "New OAuth App"\n' +
            "3. Fill in:\n" +
            "   - Application name: GitHub URL Notes\n" +
            "   - Homepage URL: https://github.com\n" +
            "   - Authorization callback URL: https://github.com\n" +
            "4. Copy the Client ID and paste it here:"
        );

        if (input) {
          clientId = input.trim();
          await safeStorageAccess(() =>
            GM.setValue("github_client_id", clientId)
          );
          return true;
        } else {
          console.error("GitHub Client ID is required for the script to work");
          return false;
        }
      }
      return true;
    } catch (error) {
      debugLog("Configuration check error:", error);
      return false;
    }
  }

  // Add initialization queue
  const initQueue = [];
  let isProcessingQueue = false;

  async function processInitQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    while (initQueue.length > 0) {
      const task = initQueue.shift();
      try {
        await task();
      } catch (error) {
        debugLog("Error processing init task:", error);
      }
    }

    isProcessingQueue = false;
  }

  async function queueInitTask(task) {
    initQueue.push(task);
    if (!isProcessingQueue) {
      await processInitQueue();
    }
  }

  // Updated initialization function
  async function initializeGist() {
    if (isInitializing) {
      debugLog("Already initializing, skipping");
      return;
    }

    if (isInitialized) {
      debugLog("Already initialized, skipping");
      return;
    }

    isInitializing = true;
    debugLog("Starting initialization");

    try {
      // Check if we're on the OAuth callback page
      const params = new URLSearchParams(window.location.search);
      if (params.has("code") && params.has("state")) {
        debugLog("On OAuth callback page, handling callback");
        await handleOAuthCallback(params);
        isInitializing = false;
        return;
      }

      if (!(await checkConfiguration())) {
        isInitializing = false;
        return;
      }

      // Safely retrieve stored values
      accessToken = await safeStorageAccess(() =>
        GM.getValue("github_token", null)
      );
      gistId = await safeStorageAccess(() =>
        GM.getValue("notes_gist_id", null)
      );

      debugLog("Current state:", {
        hasToken: !!accessToken,
        hasGistId: !!gistId
      });

      // Check for stale auth window
      const isAuthWindowOpen = await safeStorageAccess(() =>
        GM.getValue(AUTH_WINDOW_KEY, false)
      );
      if (isAuthWindowOpen) {
        debugLog("Cleaning up stale auth state");
        await cleanupAuth();
      }

      if (!accessToken) {
        debugLog("No access token found, starting authentication");
        await authenticateGitHub();
      } else {
        debugLog("Access token exists, loading notes");
        await loadNotes();
      }

      isInitialized = true;
    } catch (error) {
      debugLog("Initialization error:", error);
    } finally {
      isInitializing = false;
    }
  }

  async function cleanupAuth() {
    debugLog("Cleaning up authentication state");
    // Clear any existing auth state
    await GM.setValue(AUTH_STATE_KEY, "");
    await GM.setValue(AUTH_WINDOW_KEY, false);
    if (authTimeoutId) {
      debugLog("Clearing auth timeout");
      clearTimeout(authTimeoutId);
      authTimeoutId = null;
    }
    if (authWindow && !authWindow.closed) {
      debugLog("Closing auth window");
      authWindow.close();
      authWindow = null;
    }
    debugLog("Auth cleanup complete");
  }

  async function authenticateGitHub() {
    debugLog("Starting GitHub authentication");
    // Check if auth window is already open
    const isAuthWindowOpen = await GM.getValue(AUTH_WINDOW_KEY, false);
    debugLog("Current auth window state:", { isAuthWindowOpen });

    if (isAuthWindowOpen) {
      debugLog(
        "Authentication window is already open, aborting new auth attempt"
      );
      return;
    }

    await cleanupAuth();

    // Generate a random state value for security
    const state = Math.random().toString(36).substring(7);
    debugLog("Generated auth state:", state);
    await GM.setValue(AUTH_STATE_KEY, state);
    await GM.setValue(AUTH_WINDOW_KEY, true);

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=gist&state=${state}`;
    debugLog("Opening auth window with URL:", authUrl);
    authWindow = window.open(authUrl, "_blank", "width=600,height=600");

    if (!authWindow) {
      debugLog("Error: Popup was blocked");
      await cleanupAuth();
      return;
    }

    // Set up auth timeout
    debugLog("Setting up auth timeout");
    authTimeoutId = setTimeout(async () => {
      debugLog("Auth timeout reached");
      await cleanupAuth();
    }, AUTH_TIMEOUT);

    // Set up one-time event listener for auth callback
    const authCallback = async function (event) {
      debugLog("Received postMessage event:", { origin: event.origin });
      if (event.origin !== "https://github.com") return;

      if (event.data.type === "oauth-token") {
        debugLog("Received oauth-token message");
        // Verify state to prevent CSRF
        const savedState = await GM.getValue(AUTH_STATE_KEY, "");
        debugLog("State verification:", {
          received: event.data.state,
          saved: savedState,
          matches: event.data.state === savedState
        });

        if (event.data.state !== savedState) {
          debugLog("Error: Invalid state parameter");
          return;
        }

        debugLog("Removing event listener and cleaning up auth state");
        window.removeEventListener("message", authCallback);
        await cleanupAuth();

        debugLog("Saving access token and proceeding");
        accessToken = event.data.token;
        await GM.setValue("github_token", accessToken);
        await createOrFindGist();
      }
    };

    debugLog("Adding message event listener");
    window.addEventListener("message", authCallback);

    // Check periodically if the window was closed manually
    debugLog("Setting up window close checker");
    const checkWindow = setInterval(async () => {
      if (authWindow && authWindow.closed) {
        debugLog("Auth window was closed manually");
        clearInterval(checkWindow);
        await cleanupAuth();
      }
    }, 1000);
  }

  async function createOrFindGist() {
    try {
      // First try to find existing gist
      const gists = await makeGitHubRequest("GET", "gists");
      const existingGist = gists.find(
        (g) => g.description === GIST_DESCRIPTION
      );

      if (existingGist) {
        gistId = existingGist.id;
      } else {
        // Create new gist if none exists
        const response = await makeGitHubRequest("POST", "gists", {
          description: GIST_DESCRIPTION,
          public: false,
          files: {
            [GIST_FILENAME]: {
              content: JSON.stringify({})
            }
          }
        });
        gistId = response.id;
      }

      await GM.setValue("notes_gist_id", gistId);
      await loadNotes();
    } catch (error) {
      console.error("Error creating/finding gist:", error);
    }
  }

  async function makeGitHubRequest(method, endpoint, data = null) {
    return new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: method,
        url: `https://api.github.com/${endpoint}`,
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        },
        data: data ? JSON.stringify(data) : null,
        onload: (response) => {
          if (response.status >= 200 && response.status < 300) {
            resolve(JSON.parse(response.responseText));
          } else {
            reject(new Error(`Request failed: ${response.status}`));
          }
        },
        onerror: reject
      });
    });
  }

  async function loadNotes() {
    try {
      if (!gistId) return;
      const gist = await makeGitHubRequest("GET", `gists/${gistId}`);
      const content = gist.files[GIST_FILENAME].content;
      notes = JSON.parse(content);
    } catch (error) {
      console.error("Error loading notes:", error);
      notes = {};
    }
  }

  async function saveNotes() {
    try {
      if (!gistId) return;
      await makeGitHubRequest("PATCH", `gists/${gistId}`, {
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify(notes, null, 2)
          }
        }
      });
    } catch (error) {
      console.error("Error saving notes:", error);
    }
  }

  function exportNotes() {
    const dataStr = JSON.stringify(notes, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `github-notes-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importNotes() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";

    input.onchange = async (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();

      reader.onload = async (event) => {
        try {
          const importedNotes = JSON.parse(event.target.result);
          notes = { ...notes, ...importedNotes };
          await saveNotes();
          alert("Notes imported successfully!");
        } catch (error) {
          alert("Error importing notes. Please check the file format.");
        }
      };

      reader.readAsText(file);
    };

    input.click();
  }

  function addNotesButton() {
    const container = document.querySelector(".Header");
    if (!container || container.querySelector(".notes-button")) return;

    const buttonContainer = document.createElement("div");
    buttonContainer.style = "display: flex; gap: 5px; margin-left: 10px;";

    const notesButton = document.createElement("button");
    notesButton.className = "btn btn-sm notes-button";
    notesButton.innerHTML = "Notes";
    notesButton.onclick = showNotesDialog;

    const exportButton = document.createElement("button");
    exportButton.className = "btn btn-sm";
    exportButton.innerHTML = "⬇️";
    exportButton.title = "Export Notes";
    exportButton.onclick = exportNotes;

    const importButton = document.createElement("button");
    importButton.className = "btn btn-sm";
    importButton.innerHTML = "⬆️";
    importButton.title = "Import Notes";
    importButton.onclick = importNotes;

    buttonContainer.appendChild(notesButton);
    buttonContainer.appendChild(exportButton);
    buttonContainer.appendChild(importButton);
    container.appendChild(buttonContainer);
  }

  function showNotesDialog() {
    const url = window.location.href;
    const note = notes[url] || { text: "", lastModified: Date.now() };

    const dialog = document.createElement("div");
    dialog.className = "notes-dialog";
    dialog.style = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            z-index: 1000;
        `;

    const textarea = document.createElement("textarea");
    textarea.value = note.text;
    textarea.style = "width: 400px; height: 200px; margin-bottom: 10px;";

    const buttonContainer = document.createElement("div");
    buttonContainer.style =
      "display: flex; gap: 10px; justify-content: flex-end;";

    const saveButton = document.createElement("button");
    saveButton.className = "btn btn-primary";
    saveButton.innerHTML = "Save";
    saveButton.onclick = async () => {
      notes[url] = {
        text: textarea.value,
        lastModified: Date.now()
      };
      await saveNotes();
      dialog.remove();
    };

    const closeButton = document.createElement("button");
    closeButton.className = "btn";
    closeButton.innerHTML = "Close";
    closeButton.onclick = () => dialog.remove();

    buttonContainer.appendChild(closeButton);
    buttonContainer.appendChild(saveButton);

    dialog.appendChild(textarea);
    dialog.appendChild(buttonContainer);
    document.body.appendChild(dialog);
  }

  async function cleanupOldNotes() {
    const now = Date.now();
    const threshold = now - CLEANUP_DAYS * 24 * 60 * 60 * 1000;

    let modified = false;
    for (const [url, note] of Object.entries(notes)) {
      if (note.lastModified < threshold) {
        delete notes[url];
        modified = true;
      }
    }

    if (modified) {
      await saveNotes();
      alert("Old notes have been cleaned up");
    } else {
      alert("No old notes to clean up");
    }
  }

  // Add menu command to reconfigure Client ID
  async function reconfigureClientId() {
    const confirmed = confirm(
      "Are you sure you want to reconfigure the GitHub Client ID? This will require re-authentication."
    );
    if (confirmed) {
      await cleanupAuth();
      await GM.setValue("github_client_id", null);
      await GM.setValue("github_token", null);
      await GM.setValue("notes_gist_id", null);
      clientId = null;
      accessToken = null;
      gistId = null;
      await initializeGist();
    }
  }

  // Debounce the addNotesButton function
  const debouncedAddNotesButton = debounce(() => {
    if (!isInitialized) {
      debugLog("Script not yet initialized, skipping button check");
      return;
    }
    debugLog("Debounced check for notes button");
    addNotesButton();
  }, 250); // 250ms debounce time

  // Add debounce function
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Initialize
  debugLog("Script initialization started");

  // Add menu commands
  GM.registerMenuCommand("Cleanup Old Notes", cleanupOldNotes);
  GM.registerMenuCommand("Export Notes", exportNotes);
  GM.registerMenuCommand("Import Notes", importNotes);
  GM.registerMenuCommand("Reconfigure GitHub Client ID", reconfigureClientId);

  // Observer for dynamic page updates with debouncing
  const observer = new MutationObserver(() => {
    debouncedAddNotesButton();
  });

  // Observer Callback
  document.addEventListener("DOMContentLoaded", () => {
    queueInitTask(async () => {
      const headerContainer = document.querySelector(".Header");
      if (headerContainer) {
        observer.observe(headerContainer, {
          childList: true,
          subtree: true
        });
        await initializeGist();
      }
    });
  });

  // Cleanup observer when page is unloaded
  window.addEventListener("unload", () => {
    observer.disconnect();
  });
})();
