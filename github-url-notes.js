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
// @connect      api.github.com
// @connect      github.com
// ==/UserScript==

(function () {
  "use strict";

  const CLEANUP_DAYS = 30; // Days after which unused notes can be removed
  const GIST_DESCRIPTION = "GitHub URL Notes";
  const CLIENT_ID = "YOUR_GITHUB_CLIENT_ID"; // You'll need to create this in GitHub Developer Settings
  const GIST_FILENAME = "github-url-notes.json";

  let notes = {};
  let accessToken = null;
  let gistId = null;

  async function initializeGist() {
    accessToken = await GM.getValue("github_token", null);
    gistId = await GM.getValue("notes_gist_id", null);

    if (!accessToken) {
      await authenticateGitHub();
    } else {
      await loadNotes();
    }
  }

  function authenticateGitHub() {
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&scope=gist`;
    const authWindow = window.open(authUrl, "_blank", "width=600,height=600");

    // Listen for the OAuth callback
    window.addEventListener("message", async function (event) {
      if (event.origin !== "https://github.com") return;
      if (event.data.type === "oauth-token") {
        accessToken = event.data.token;
        await GM.setValue("github_token", accessToken);
        authWindow.close();
        await createOrFindGist();
      }
    });
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

  // Initialize
  initializeGist();

  // Add menu commands
  GM.registerMenuCommand("Cleanup Old Notes", cleanupOldNotes);
  GM.registerMenuCommand("Export Notes", exportNotes);
  GM.registerMenuCommand("Import Notes", importNotes);

  // Observer for dynamic page updates
  const observer = new MutationObserver(() => {
    addNotesButton();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Run on page load
  window.addEventListener("load", addNotesButton);
})();
