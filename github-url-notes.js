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
// @run-at       document-start
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

  // Enhanced debug logging with context tracking
  let logSequence = 0;
  function debugLog(message, data = null, type = "info") {
    logSequence++;
    const timestamp = new Date().toISOString();
    const prefix =
      type === "error"
        ? "❌"
        : type === "storage"
        ? "💾"
        : type === "init"
        ? "🚀"
        : type === "auth"
        ? "🔑"
        : "📝";
    const context = {
      seq: logSequence,
      readyState: document.readyState,
      url: window.location.href,
      isFrame: window !== window.top
    };
    const logMessage = `[GitHub Notes ${timestamp}] ${prefix} (${logSequence}) ${message}`;

    if (data) {
      console.log(logMessage, { ...context, ...data });
    } else {
      console.log(logMessage, context);
    }
  }

  // Enhanced header detection
  const HEADER_SELECTORS = [
    ".Header",
    'header[role="banner"]',
    "#repository-container-header",
    ".gh-header-actions"
  ];
  const MAX_HEADER_RETRIES = 10;
  const HEADER_RETRY_DELAY = 500;

  // Enhanced safe storage access wrapper with retry logic
  async function safeStorageAccess(key, action, maxRetries = 3) {
    debugLog(`🔄 Storage operation starting for: ${key}`, null, "storage");
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!GM) {
          throw new Error("GM object not available");
        }
        debugLog(
          `⏳ Executing storage action for: ${key} (attempt ${attempt})`,
          null,
          "storage"
        );
        const result = await action();
        debugLog(
          `✅ Storage operation successful for: ${key}`,
          { ...result },
          "storage"
        );
        return result;
      } catch (error) {
        lastError = error;
        debugLog(
          `❌ Storage attempt ${attempt} failed for: ${key}`,
          {
            error: error.message,
            stack: error.stack
          },
          "error"
        );

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    throw lastError;
  }

  // Enhanced header detection with retry logic
  async function findHeader() {
    debugLog("Starting header detection");

    for (let attempt = 1; attempt <= MAX_HEADER_RETRIES; attempt++) {
      for (const selector of HEADER_SELECTORS) {
        const header = document.querySelector(selector);
        if (header) {
          debugLog(`Header found using selector: ${selector}`);
          return header;
        }
      }

      debugLog(`Header detection attempt ${attempt} failed, waiting...`);
      await new Promise((resolve) => setTimeout(resolve, HEADER_RETRY_DELAY));
    }

    throw new Error("Header container not found after all retries");
  }

  // Enhanced initialization function
  async function initializeGist() {
    debugLog(
      "🔍 Checking initialization prerequisites",
      {
        isInitializing,
        isInitialized,
        hasGM: typeof GM !== "undefined",
        documentState: document.readyState
      },
      "init"
    );

    if (isInitializing) {
      debugLog("⚠️ Initialization already in progress", null, "init");
      return;
    }

    if (isInitialized) {
      debugLog("✅ Already initialized", null, "init");
      return;
    }

    isInitializing = true;

    try {
      // Wait for document to be interactive at minimum
      if (document.readyState === "loading") {
        debugLog("Waiting for document to be ready");
        await new Promise((resolve) => {
          document.addEventListener("DOMContentLoaded", resolve, {
            once: true
          });
        });
      }

      // Verify script environment
      if (typeof GM === "undefined") {
        throw new Error("GM APIs not available");
      }

      // Find header with retry logic
      const header = await findHeader();
      if (!header) {
        throw new Error("Could not find header container");
      }

      // Test storage access
      debugLog("Testing storage access...", null, "storage");
      const testKey = "storage_test";
      await safeStorageAccess(testKey, async () => {
        await GM.setValue(testKey, "test");
        const testValue = await GM.getValue(testKey);
        debugLog("Storage test result", { testValue }, "storage");
        return testValue;
      });

      // Continue with normal initialization
      // Check if we're on the OAuth callback page
      const params = new URLSearchParams(window.location.search);
      if (params.has("code") && params.has("state")) {
        debugLog("OAuth callback detected", {
          code: params.get("code")?.substring(0, 4) + "...",
          state: params.get("state")
        });
        await handleOAuthCallback(params);
        isInitializing = false;
        return;
      }

      if (!(await checkConfiguration())) {
        debugLog("Configuration check failed, aborting initialization");
        isInitializing = false;
        return;
      }

      // Safely retrieve stored values
      accessToken = await safeStorageAccess("github_token", () =>
        GM.getValue("github_token", null)
      );
      gistId = await safeStorageAccess("notes_gist_id", () =>
        GM.getValue("notes_gist_id", null)
      );

      debugLog("Retrieved stored values", {
        hasToken: !!accessToken,
        hasGistId: !!gistId,
        documentState: document.readyState
      });

      // Check for stale auth window
      const isAuthWindowOpen = await safeStorageAccess("auth_window_open", () =>
        GM.getValue(AUTH_WINDOW_KEY, false)
      );
      if (isAuthWindowOpen) {
        debugLog("Found stale auth window state, cleaning up");
        await cleanupAuth();
      }

      if (!accessToken) {
        debugLog("No access token found, initiating authentication");
        await authenticateGitHub();
      } else {
        debugLog("Access token exists, proceeding to load notes");
        await loadNotes();
      }

      isInitialized = true;
      debugLog("Initialization completed successfully");
    } catch (error) {
      debugLog(
        "💥 Initialization error",
        {
          error: error.message,
          stack: error.stack
        },
        "error"
      );
      // Schedule a retry if it was a temporary failure
      setTimeout(() => {
        if (!isInitialized) {
          debugLog("Retrying initialization");
          initializeGist();
        }
      }, 2000);
      return;
    }

    isInitializing = false;
  }

  async function cleanupAuth() {
    debugLog("Starting auth cleanup sequence", null, "auth");
    try {
      await safeStorageAccess("auth_state_clear", () =>
        GM.setValue(AUTH_STATE_KEY, "")
      );
      await safeStorageAccess("auth_window_clear", () =>
        GM.setValue(AUTH_WINDOW_KEY, false)
      );
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
      debugLog("Auth cleanup completed");
    } catch (error) {
      debugLog("Auth cleanup failed", { error: error.message }, "error");
    }
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
    buttonContainer.style = "display: flex; gap: 5px;margin-left: 10px;";

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
                transform: translate(-50%,-50%);
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                z-index: 1000;
            `;

    const textarea = document.createElement("textarea");
    textarea.value = note.text;
    textarea.style = "width: 400px;height: 200px;margin-bottom: 10px;";

    const buttonContainer = document.createElement("div");
    buttonContainer.style =
      "display: flex;gap: 10px;justify-content: flex-end;";

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

  // Setup observer function
  function setupObserver(headerContainer) {
    debugLog("Setting up mutation observer");
    const observer = new MutationObserver((mutations) => {
      debouncedAddNotesButton();
    });

    observer.observe(headerContainer, {
      childList: true,
      subtree: true
    });

    return observer;
  }

  // Initialize
  debugLog(
    "🏁 Script loading started",
    {
      timing: performance.now(),
      gmAvailable: typeof GM !== "undefined"
    },
    "init"
  );

  // Add menu commands
  GM.registerMenuCommand("Cleanup Old Notes", cleanupOldNotes);
  GM.registerMenuCommand("Export Notes", exportNotes);
  GM.registerMenuCommand("Import Notes", importNotes);
  GM.registerMenuCommand("Reconfigure GitHub Client ID", reconfigureClientId);

  // Document ready handler with enhanced logging
  const documentReady = async () => {
    debugLog(
      "📄 Document ready event triggered",
      {
        readyState: document.readyState,
        timing: performance.now()
      },
      "init"
    );

    try {
      const headerContainer = await findHeader();
      if (headerContainer) {
        debugLog("🎯 Setting up observer");
        const observer = setupObserver(headerContainer);
        await initializeGist();

        // Cleanup on page unload
        window.addEventListener(
          "unload",
          () => {
            observer.disconnect();
          },
          { once: true }
        );
      }
    } catch (error) {
      debugLog("⚠️ Setup failed", { error: error.message }, "error");
    }
  };

  // Update initialization timing
  if (document.readyState === "loading") {
    debugLog("⏳ Document still loading, adding ready listener", null, "init");
    document.addEventListener("DOMContentLoaded", documentReady);
  } else {
    debugLog(
      "📄 Document already ready, executing initialization",
      null,
      "init"
    );
    documentReady();
  }
})();
