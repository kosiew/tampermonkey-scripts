// ==UserScript==
// @name         GitHub URL Notes Manager
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Adds buttons to manage notes for GitHub URLs with local storage and Gist backup
// @author       Siew Kam Onn
// @match        https://github.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @require      https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/refs/heads/main/tampermonkey-ui-library.js
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.registerMenuCommand
// @grant        GM.openInTab
// @grant        GM_xmlhttpRequest
// @grant        GM.notification
// ==/UserScript==

(function () {
  ("use strict");

  console.log(" ==> GitHub URL Notes Manager script started");

  const NOTES_KEY = "github_url_notes";
  const GIST_ID_KEY = "github_gist_id";
  // To get a Personal Access Token (classic) for Gists:
  // 1. Go to GitHub.com → Settings → Developer settings → Personal access tokens → Tokens (classic)
  // 2. Generate new token (classic)
  // 3. Add a note (e.g., "GitHub URL Notes Gist Access")
  // 4. Select only the "gist" scope
  // 5. Click "Generate token"
  // 6. Copy the token immediately (you won't see it again)
  // Important: Keep this token secret and never commit it to version control
  const GITHUB_TOKEN_KEY = "github_token";
  const FILE_NAME = "ghnotes.json"; // Name of the file in the Gist
  const USE_GIST_STORAGE_KEY = "use_gist_storage";

  const CONFIG = {
    buttonId: "gh-note-button"
  };

  /**
   * Class for managing the TampermonkeyUI instance
   */
  class UIManager {
    constructor(options = {}) {
      console.log(" ==> UIManager constructor called");
      this.ui = null;
      this.options = {
        containerClass: "tm-scripts-container",
        containerParent: ".Header",
        ...options
      };
    }

    /**
     * Initializes the UI manager by waiting for UI library to be available
     * @param {Function} initFn - The initialization function to call when UI is ready
     */
    waitForUILibrary(initFn) {
      console.log(
        " ==> waitForUILibrary called, checking for window.TampermonkeyUI"
      );
      if (window.TampermonkeyUI) {
        console.log(" ==> TampermonkeyUI found, creating UI instance");
        // Create UI instance from the shared library
        this.ui = new window.TampermonkeyUI(this.options);
        initFn();
      } else {
        console.log(" ==> TampermonkeyUI not found, retrying in 50ms");
        // Retry after a short delay
        setTimeout(() => this.waitForUILibrary(initFn), 50);
      }
    }

    /**
     * Gets the UI instance
     * @returns {TampermonkeyUI|null} The UI instance
     */
    getUI() {
      return this.ui;
    }

    /**
     * Adds a button using the UI instance
     * @param {Object} options - Button configuration options
     * @returns {HTMLElement} The created button
     */
    addButton(options) {
      console.log(" ==> Attempting to add button with options:", options);
      const button = this.ui.addButton(options);
      console.log(" ==> Button created:", button);
      return button;
    }

    /**
     * Shows feedback using the UI instance
     * @param {string} message - The message to display
     */
    showFeedback(message) {
      this.ui.showFeedback(message);
    }
  }

  // Create a global instance of the UI manager
  const uiManager = new UIManager();

  /**
   * GistManager - A reusable class for managing Gist-based storage in Tampermonkey scripts
   */
  class GistManager {
    constructor(
      gistIdKey,
      githubTokenKey,
      useGistStorageKey,
      defaultFileName = "data.json"
    ) {
      this.gistIdKey = gistIdKey;
      this.githubTokenKey = githubTokenKey;
      this.useGistStorageKey = useGistStorageKey;
      this.fileName = defaultFileName;
      this.useGistStorage = false;

      // Initialize the useGistStorage value
      this._initUseGistStorage();
    }

    async _initUseGistStorage() {
      this.useGistStorage = await GM.getValue(this.useGistStorageKey, false);
    }

    async refreshSettings() {
      await this._initUseGistStorage();
    }

    async isEnabled() {
      await this.refreshSettings();
      return this.useGistStorage;
    }

    /**
     * Fetch data from a Gist
     * @returns {Promise<Object|null>} The data from the Gist, or null if not available
     */
    async fetchFromGist() {
      const gistId = await GM.getValue(this.gistIdKey, "");
      const githubToken = await GM.getValue(this.githubTokenKey, "");

      if (!gistId || !githubToken) {
        console.error("Gist ID or GitHub token not set");
        return null;
      }

      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: `https://api.github.com/gists/${gistId}`,
          headers: {
            Authorization: `token ${githubToken}`,
            Accept: "application/vnd.github.v3+json"
          },
          onload: function (response) {
            if (response.status === 200) {
              const gistData = JSON.parse(response.responseText);
              if (gistData.files && gistData.files[this.fileName]) {
                try {
                  const content = gistData.files[this.fileName].content;
                  resolve(JSON.parse(content));
                } catch (e) {
                  console.error("Error parsing Gist content:", e);
                  resolve({});
                }
              } else {
                console.log("No file found in Gist, starting fresh");
                resolve({});
              }
            } else {
              reject(new Error(`Failed to fetch Gist: ${response.status}`));
            }
          }.bind(this),
          onerror: function (error) {
            reject(new Error(`Network error fetching Gist: ${error}`));
          }
        });
      });
    }

    /**
     * Save data to a Gist
     * @param {Object} data - The data to save
     * @returns {Promise<Object>} - The response from the Gist API
     */
    async saveToGist(data) {
      const gistId = await GM.getValue(this.gistIdKey, "");
      const githubToken = await GM.getValue(this.githubTokenKey, "");

      if (!gistId || !githubToken) {
        throw new Error("Gist ID or GitHub token not set");
      }

      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "PATCH",
          url: `https://api.github.com/gists/${gistId}`,
          headers: {
            Authorization: `token ${githubToken}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json"
          },
          data: JSON.stringify({
            files: {
              [this.fileName]: { content: JSON.stringify(data, null, 2) }
            }
          }),
          onload: function (response) {
            if (response.status === 200) {
              console.log("✅ Gist updated successfully");
              resolve(JSON.parse(response.responseText));
            } else {
              console.error("❌ Error updating Gist:", response);
              reject(new Error(`Failed to update Gist: ${response.status}`));
            }
          },
          onerror: function (error) {
            console.error("❌ Network error:", error);
            reject(new Error(`Network error updating Gist: ${error}`));
          }
        });
      });
    }

    /**
     * Configure Gist settings interactively
     * @returns {Promise<boolean>} True if configuration was completed, false if canceled
     */
    async configureSettings() {
      const currentGistId = await GM.getValue(this.gistIdKey, "");
      const currentToken = await GM.getValue(this.githubTokenKey, "");

      const gistId = prompt("Enter your Gist ID:", currentGistId);
      if (gistId === null) return false; // User cancelled

      const token = prompt(
        "Enter your GitHub token (with gist scope):",
        currentToken
      );
      if (token === null) return false; // User cancelled

      await GM.setValue(this.gistIdKey, gistId);
      await GM.setValue(this.githubTokenKey, token);

      const enableGist = confirm("Do you want to enable Gist synchronization?");
      await GM.setValue(this.useGistStorageKey, enableGist);

      // Update our cached value
      this.useGistStorage = enableGist;

      if (enableGist) {
        alert(
          "Gist synchronization is now enabled. Your data will be synced to your Gist."
        );
      } else {
        alert(
          "Gist synchronization is disabled. Your data will only be stored locally."
        );
      }

      return true;
    }
  }

  const gistManager = new GistManager(
    GIST_ID_KEY,
    GITHUB_TOKEN_KEY,
    USE_GIST_STORAGE_KEY,
    FILE_NAME
  );

  // Get useGistStorage at the top level to avoid repeated async calls
  let useGistStorage = false;
  GM.getValue(USE_GIST_STORAGE_KEY, false).then((value) => {
    useGistStorage = value;
  });

  // Styles for the modal and floating button
  const styles = `
    .gh-note-modal {
      display: none;
      position: fixed;
      z-index: 10000;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,0.4);
    }
    
    .gh-note-modal-content {
      background-color: var(--color-canvas-default, #fff);
      margin: 15% auto;
      padding: 20px;
      border: 1px solid var(--color-border-default, #d0d7de);
      border-radius: 6px;
      width: 50%;
      position: relative;
    }
    
    .gh-note-close {
      position: absolute;
      right: 10px;
      top: 5px;
      font-size: 20px;
      cursor: pointer;
    }
    
    .gh-note-textarea {
      width: 100%;
      min-height: 100px;
      margin: 10px 0;
      padding: 8px;
      border: 1px solid var(--color-border-default, #d0d7de);
      border-radius: 6px;
    }
    
    .gh-note-button-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 1000;
    }
    
    .gh-note-button {
      padding: 8px 16px;
      font-size: 14px;
      border-radius: 6px;
      border: 1px solid rgba(27, 31, 36, 0.15);
      background-color: var(--color-success-fg, #2ea44f);
      color: var(--color-fg-on-emphasis, #fff);
      cursor: pointer;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      transition: opacity 0.2s;
    }
    
    .gh-note-button:hover {
      opacity: 0.9;
    }
  `;

  // Add styles to page
  const styleSheet = document.createElement("style");
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  // Normalize GitHub URL by removing comment fragments
  function normalizeUrl(url) {
    const urlObj = new URL(url);
    // Remove fragments for comment URLs
    if (urlObj.hash && urlObj.hash.includes("#discussion_")) {
      urlObj.hash = "";
    }
    return urlObj.toString();
  }

  async function initNotes() {
    let notes = await GM.getValue(NOTES_KEY, {});

    // Refresh the useGistStorage value using the GistManager
    useGistStorage = await gistManager.isEnabled();

    if (useGistStorage) {
      try {
        // Use the GistManager to fetch notes
        const gistData = await gistManager.fetchFromGist();

        // Extract notes from the nested structure if using the specific format
        const gistNotes = gistData?.github_url_notes || gistData;

        if (gistNotes) {
          // Merge with local notes, preferring the more recent version for each URL
          for (const [url, gistNoteData] of Object.entries(gistNotes)) {
            if (
              !notes[url] ||
              new Date(notes[url].timestamp) < new Date(gistNoteData.timestamp)
            ) {
              notes[url] = gistNoteData;
            }
          }
          // Save merged notes back to local storage
          await GM.setValue(NOTES_KEY, notes);
        }
      } catch (error) {
        console.error("Failed to fetch notes from Gist:", error);
      }
    }

    return notes;
  }

  // Save note for current URL
  async function saveNote(note) {
    const notes = await initNotes();
    const url = normalizeUrl(window.location.href);
    notes[url] = {
      note,
      timestamp: new Date().toISOString()
    };
    await GM.setValue(NOTES_KEY, notes);

    // useGistStorage is refreshed in initNotes()
    if (useGistStorage) {
      try {
        // Create the nested structure with github_url_notes property
        const nestedNotes = {
          github_url_notes: notes
        };

        // Use the GistManager to save notes
        await gistManager.saveToGist(nestedNotes);
      } catch (error) {
        console.error("Failed to save notes to Gist:", error);
      }
    }
    GM.notification({
      title: "GitHub Notes",
      text: "Note saved successfully!",
      timeout: 2000
    });
  }

  // Get note for current URL
  async function getNote() {
    const notes = await initNotes();
    const url = normalizeUrl(window.location.href);
    return notes[url]?.note || "";
  }

  async function deleteNote() {
    const notes = await initNotes();
    const url = normalizeUrl(window.location.href);
    if (notes[url]) {
      delete notes[url];
      await GM.setValue(NOTES_KEY, notes);

      // useGistStorage is refreshed in initNotes()
      if (useGistStorage) {
        try {
          // Create the nested structure with github_url_notes property
          const nestedNotes = {
            github_url_notes: notes
          };

          // Use the GistManager to save notes
          await gistManager.saveToGist(nestedNotes);
        } catch (error) {
          console.error("Failed to update Gist after deletion:", error);
        }
      }
    }
  }

  // Force sync between local storage and Gist
  async function syncWithGist() {
    // Refresh the useGistStorage value
    useGistStorage = await gistManager.isEnabled();

    if (!useGistStorage) {
      const enableGist = confirm(
        "Gist synchronization is currently disabled. Would you like to enable it?"
      );
      if (enableGist) {
        await gistManager.configureSettings();
      } else {
        return;
      }
    }

    try {
      const localNotes = await GM.getValue(NOTES_KEY, {});

      // Use the GistManager to fetch notes
      const gistData = await gistManager.fetchFromGist();

      // Extract notes from the nested structure if using the specific format
      const gistNotes = gistData?.github_url_notes || gistData;

      if (!gistNotes) {
        alert(
          "Failed to fetch notes from Gist. Please check your Gist ID and GitHub token."
        );
        return;
      }

      // Merge notes, preferring more recent versions
      const mergedNotes = { ...gistNotes };

      for (const [url, localNoteData] of Object.entries(localNotes)) {
        if (
          !mergedNotes[url] ||
          new Date(mergedNotes[url].timestamp) <
            new Date(localNoteData.timestamp)
        ) {
          mergedNotes[url] = localNoteData;
        }
      }

      // Save merged notes to both local storage and Gist
      await GM.setValue(NOTES_KEY, mergedNotes);

      // Create the nested structure with github_url_notes property
      const nestedNotes = {
        github_url_notes: mergedNotes
      };

      // Use the GistManager to save notes
      await gistManager.saveToGist(nestedNotes);

      alert(
        `Successfully synced notes. Total notes: ${
          Object.keys(mergedNotes).length
        }`
      );
    } catch (error) {
      console.error("Sync failed:", error);
      alert(`Failed to sync with Gist: ${error.message}`);
    }
  }

  // Configure Gist settings using the GistManager
  async function configureGistSettings() {
    await gistManager.configureSettings();
    // Update our cached value
    useGistStorage = await gistManager.isEnabled();
  }

  // Create modal for editing notes
  function createNoteModal(mainButton) {
    const modal = document.createElement("div");
    modal.className = "gh-note-modal";
    modal.innerHTML = `
      <div class="gh-note-modal-content">
        <span class="gh-note-close">&times;</span>
        <h3>Note for this page</h3>
        <textarea class="gh-note-textarea"></textarea>
        <div style="display: flex; gap: 10px;">
          <button class="gh-note-button gh-note-save">Save</button>
          <button class="gh-note-button gh-note-delete" style="background-color: #d73a49; display: none;">Delete Note</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const textarea = modal.querySelector(".gh-note-textarea");
    const closeBtn = modal.querySelector(".gh-note-close");
    const saveBtn = modal.querySelector(".gh-note-save");
    const deleteBtn = modal.querySelector(".gh-note-delete");

    closeBtn.onclick = () => (modal.style.display = "none");
    saveBtn.onclick = async () => {
      await saveNote(textarea.value);
      modal.style.display = "none";
      // Update button text after saving
      mainButton.textContent = textarea.value ? "Edit Note" : "Add Note";
    };

    deleteBtn.onclick = async () => {
      // Copy text to clipboard before deletion
      if (textarea.value) {
        try {
          await navigator.clipboard.writeText(textarea.value);
          console.log("Note copied to clipboard");
        } catch (err) {
          console.error("Failed to copy note to clipboard:", err);
        }
      }

      await deleteNote();
      modal.style.display = "none";
      // Update button text after deletion
      mainButton.textContent = "Add Note";
      alert("Note deleted and content copied to clipboard");
    };

    // Close modal when clicking outside
    window.onclick = (event) => {
      if (event.target === modal) {
        modal.style.display = "none";
      }
    };

    return modal;
  }

  // Export notes to JSON file
  async function exportNotes() {
    const notes = await initNotes();
    const blob = new Blob([JSON.stringify(notes, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "github-notes.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Import notes from JSON file
  function importNotes() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const notes = JSON.parse(event.target.result);
            await GM.setValue(NOTES_KEY, notes);

            // Refresh useGistStorage to get the latest value
            useGistStorage = await GM.getValue(USE_GIST_STORAGE_KEY, false);

            if (useGistStorage) {
              try {
                await saveNotesToGist(notes);
                alert("Notes imported successfully to local storage and Gist!");
              } catch (error) {
                alert(
                  "Notes imported to local storage but failed to update Gist"
                );
              }
            } else {
              alert("Notes imported successfully!");
            }
          } catch (error) {
            alert("Error importing notes: Invalid file format");
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }

  // Function to delete notes older than 180 days
  async function deleteOldNotes() {
    const notes = await initNotes();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 180); // 180 days ago

    let deletedCount = 0;
    const updatedNotes = {};

    for (const [url, noteData] of Object.entries(notes)) {
      const noteDate = new Date(noteData.timestamp);
      if (noteDate > cutoffDate) {
        updatedNotes[url] = noteData;
      } else {
        deletedCount++;
      }
    }

    await GM.setValue(NOTES_KEY, updatedNotes);

    // useGistStorage is refreshed in initNotes()
    if (useGistStorage) {
      // Create the nested structure with github_url_notes property
      const nestedNotes = {
        github_url_notes: updatedNotes
      };

      // Use the GistManager to save notes
      await gistManager.saveToGist(nestedNotes);
    }

    if (deletedCount > 0) {
      alert(
        `Deleted ${deletedCount} note${
          deletedCount === 1 ? "" : "s"
        } older than 180 days.`
      );
    } else {
      alert("No notes found older than 180 days.");
    }
  }

  // Function to open all URLs with notes in new tabs
  async function openAllNoteUrls() {
    const notes = await initNotes();
    const urls = Object.keys(notes);

    if (urls.length === 0) {
      alert("No saved notes found.");
      return;
    }

    const confirmMessage = `Open ${urls.length} URLs with notes in new tabs?`;
    if (!confirm(confirmMessage)) {
      return;
    }

    // Open URLs in new tabs
    urls.forEach((url) => {
      window.open(url, "_blank");
    });
  }

  async function initializeScript() {
    console.log(" ==> initializeScript function called");
    if (document.getElementById(CONFIG.buttonId)) {
      console.log(" ==> Button already exists, skipping creation");
      return;
    }

    const existingNote = await getNote();
    const buttonText = existingNote ? "Edit Note" : "Add Note";
    console.log(" ==> Creating button with text:", buttonText);

    // Add button with custom styling
    const mainButton = uiManager.addButton({
      id: CONFIG.buttonId,
      text: buttonText,
      title: "Add or edit a note for this GitHub url",
      onClick: async () => {}
    });

    console.log(
      " ==> Button created with ID:",
      CONFIG.buttonId,
      "Element:",
      mainButton
    );

    const modal = createNoteModal(mainButton);

    mainButton.onclick = async () => {
      const note = await getNote();
      const textarea = modal.querySelector(".gh-note-textarea");
      const deleteBtn = modal.querySelector(".gh-note-delete");

      textarea.value = note || "";

      // Show or hide delete button based on note existence
      if (note) {
        deleteBtn.style.display = "inline-block";
      } else {
        deleteBtn.style.display = "none";
      }

      modal.style.display = "block";

      // Autofocus the textarea after the modal is visible
      setTimeout(() => {
        textarea.focus();
      }, 10);
    };
  }

  if (document.readyState === "loading") {
    console.log(" ==> Document still loading, waiting for DOMContentLoaded");
    document.addEventListener("DOMContentLoaded", () =>
      uiManager.waitForUILibrary(initializeScript)
    );
  } else {
    console.log(" ==> Document already loaded, waiting for UI library");
    uiManager.waitForUILibrary(initializeScript);
  }

  // Handle GitHub's Turbo navigation
  // document.addEventListener("turbo:load", createButtons);
  // document.addEventListener("turbo:render", createButtons);

  // // Also handle regular page loads
  // window.addEventListener("load", createButtons);

  // Register Tampermonkey menu commands
  GM.registerMenuCommand("Export GitHub Notes", exportNotes);
  GM.registerMenuCommand("Import GitHub Notes", importNotes);
  GM.registerMenuCommand("Configure Gist Settings", configureGistSettings);
  GM.registerMenuCommand("Sync with Gist", syncWithGist);
  GM.registerMenuCommand("Delete Notes (Older than 180 days)", async () => {
    if (
      confirm("Are you sure you want to delete all notes older than 180 days?")
    ) {
      await deleteOldNotes();
    }
  });
  GM.registerMenuCommand("Open All Note URLs", openAllNoteUrls);
})();
