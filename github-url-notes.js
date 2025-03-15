// ==UserScript==
// @name         GitHub URL Notes Manager
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Adds buttons to manage notes for GitHub URLs with local storage and Gist backup
// @author       Siew Kam Onn
// @match        https://github.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.registerMenuCommand
// @grant        GM.openInTab
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(function () {
  ("use strict");

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

  // Initialize notes storage
  async function initNotes() {
    let notes = await GM.getValue(NOTES_KEY, {});

    // Refresh the useGistStorage value
    useGistStorage = await GM.getValue(USE_GIST_STORAGE_KEY, false);

    if (useGistStorage) {
      try {
        const gistNotes = await fetchNotesFromGist();
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
        await saveNotesToGist(notes);
      } catch (error) {
        console.error("Failed to save notes to Gist:", error);
      }
    }
  }

  // Get note for current URL
  async function getNote() {
    const notes = await initNotes();
    const url = normalizeUrl(window.location.href);
    return notes[url]?.note || "";
  }

  // Delete note for current URL
  async function deleteNote() {
    const notes = await initNotes();
    const url = normalizeUrl(window.location.href);
    if (notes[url]) {
      delete notes[url];
      await GM.setValue(NOTES_KEY, notes);

      // useGistStorage is refreshed in initNotes()
      if (useGistStorage) {
        try {
          await saveNotesToGist(notes);
        } catch (error) {
          console.error("Failed to update Gist after deletion:", error);
        }
      }
    }
  }

  // Fetch notes from Gist
  async function fetchNotesFromGist() {
    const gistId = await GM.getValue(GIST_ID_KEY, "");
    const githubToken = await GM.getValue(GITHUB_TOKEN_KEY, "");

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
            if (gistData.files && gistData.files[FILE_NAME]) {
              try {
                const content = gistData.files[FILE_NAME].content;
                const parsedContent = JSON.parse(content);

                // Extract notes from the nested structure
                if (parsedContent && parsedContent.github_url_notes) {
                  resolve(parsedContent.github_url_notes);
                } else {
                  // Handle legacy format (direct notes object)
                  console.log("Converting legacy format to nested structure");
                  resolve(parsedContent);
                }
              } catch (e) {
                console.error("Error parsing Gist content:", e);
                resolve({});
              }
            } else {
              console.log("No notes file found in Gist, starting fresh");
              resolve({});
            }
          } else {
            reject(new Error(`Failed to fetch Gist: ${response.status}`));
          }
        },
        onerror: function (error) {
          reject(new Error(`Network error fetching Gist: ${error}`));
        }
      });
    });
  }

  // Save notes to Gist
  async function saveNotesToGist(notes) {
    const gistId = await GM.getValue(GIST_ID_KEY, "");
    const githubToken = await GM.getValue(GITHUB_TOKEN_KEY, "");

    if (!gistId || !githubToken) {
      throw new Error("Gist ID or GitHub token not set");
    }

    // Create a clean copy with only note entries, filtering out any non-URL keys
    const cleanNotes = {};
    for (const [key, value] of Object.entries(notes)) {
      // Only include entries that look like URLs and have proper note format
      if (
        key.startsWith("http") &&
        value &&
        typeof value === "object" &&
        value.note !== undefined &&
        value.timestamp !== undefined
      ) {
        cleanNotes[key] = value;
      }
    }

    // Create the nested structure with github_url_notes property
    const nestedNotes = {
      github_url_notes: cleanNotes
    };

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
            [FILE_NAME]: { content: JSON.stringify(nestedNotes, null, 2) }
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

  // Force sync between local storage and Gist
  async function syncWithGist() {
    // Refresh the useGistStorage value
    useGistStorage = await GM.getValue(USE_GIST_STORAGE_KEY, false);

    if (!useGistStorage) {
      const enableGist = confirm(
        "Gist synchronization is currently disabled. Would you like to enable it?"
      );
      if (enableGist) {
        await configureGistSettings();
      } else {
        return;
      }
    }

    try {
      const localNotes = await GM.getValue(NOTES_KEY, {});
      const gistNotes = await fetchNotesFromGist();

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
      await saveNotesToGist(mergedNotes);

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

  // Configure Gist settings
  async function configureGistSettings() {
    const currentGistId = await GM.getValue(GIST_ID_KEY, "");
    const currentToken = await GM.getValue(GITHUB_TOKEN_KEY, "");

    const gistId = prompt("Enter your Gist ID:", currentGistId);
    if (gistId === null) return; // User cancelled

    const token = prompt(
      "Enter your GitHub token (with gist scope):",
      currentToken
    );
    if (token === null) return; // User cancelled

    await GM.setValue(GIST_ID_KEY, gistId);
    await GM.setValue(GITHUB_TOKEN_KEY, token);

    const enableGist = confirm("Do you want to enable Gist synchronization?");
    await GM.setValue(USE_GIST_STORAGE_KEY, enableGist);

    // Update our cached value
    useGistStorage = enableGist;

    if (enableGist) {
      alert(
        "Gist synchronization is now enabled. Your notes will be synced to your Gist."
      );
    } else {
      alert(
        "Gist synchronization is disabled. Your notes will only be stored locally."
      );
    }
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
      mainButton.textContent = textarea.value ? "Edit Note" : "Save Note";
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
      mainButton.textContent = "Save Note";
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
      await saveNotesToGist(updatedNotes);
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

  async function createButtons() {
    if (document.querySelector(".gh-note-button-container")) return;

    const container = document.createElement("div");
    container.className = "gh-note-button-container";

    const mainButton = document.createElement("button");
    mainButton.className = "gh-note-button";

    // Set initial button text based on whether there's an existing note
    const existingNote = await getNote();
    mainButton.textContent = existingNote ? "Edit Note" : "Save Note";

    container.appendChild(mainButton);
    document.body.appendChild(container);

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

  // Initialize
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createButtons);
  } else {
    createButtons();
  }

  // Handle GitHub's Turbo navigation
  document.addEventListener("turbo:load", createButtons);
  document.addEventListener("turbo:render", createButtons);

  // Also handle regular page loads
  window.addEventListener("load", createButtons);

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
