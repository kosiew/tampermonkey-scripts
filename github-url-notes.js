// ==UserScript==
// @name         GitHub URL Notes Manager
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Adds buttons to manage notes for GitHub URLs with local storage
// @author       Siew Kam Onn
// @match        https://github.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// ==/UserScript==

(function () {
  "use strict";

  const NOTES_KEY = "github_url_notes";

  // Styles for the modal
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
    
    .gh-note-button {
      padding: 5px 16px;
      margin: 0 8px;
      border-radius: 6px;
      border: 1px solid var(--color-border-default, #d0d7de);
      background-color: var(--color-canvas-default, #fff);
      color: var(--color-fg-default, #24292f);
      cursor: pointer;
    }
    
    .gh-note-button-primary {
      background-color: var(--color-success-fg, #2ea44f);
      color: var(--color-fg-on-emphasis, #fff);
      border: 1px solid rgba(27, 31, 36, 0.15);
    }
    
    .gh-note-button-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      display: flex;
      gap: 10px;
      z-index: 9999;
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
    const notes = await GM.getValue(NOTES_KEY, {});
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
  }

  // Get note for current URL
  async function getNote() {
    const notes = await initNotes();
    const url = normalizeUrl(window.location.href);
    return notes[url]?.note || "";
  }

  // Create modal for editing notes
  function createNoteModal() {
    const modal = document.createElement("div");
    modal.className = "gh-note-modal";
    modal.innerHTML = `
      <div class="gh-note-modal-content">
        <span class="gh-note-close">&times;</span>
        <h3>Note for this page</h3>
        <textarea class="gh-note-textarea"></textarea>
        <button class="gh-note-button gh-note-button-primary gh-note-save">Save</button>
        <button class="gh-note-button gh-note-cancel">Cancel</button>
      </div>
    `;

    document.body.appendChild(modal);

    const textarea = modal.querySelector(".gh-note-textarea");
    const closeBtn = modal.querySelector(".gh-note-close");
    const saveBtn = modal.querySelector(".gh-note-save");
    const cancelBtn = modal.querySelector(".gh-note-cancel");

    closeBtn.onclick = () => (modal.style.display = "none");
    cancelBtn.onclick = () => (modal.style.display = "none");
    saveBtn.onclick = async () => {
      await saveNote(textarea.value);
      modal.style.display = "none";
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
            alert("Notes imported successfully!");
          } catch (error) {
            alert("Error importing notes: Invalid file format");
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }

  // Create button container and buttons
  function createButtons() {
    const container = document.createElement("div");
    container.className = "gh-note-button-container";

    const editButton = document.createElement("button");
    editButton.className = "gh-note-button gh-note-button-primary";
    editButton.textContent = "Edit Note";

    const exportButton = document.createElement("button");
    exportButton.className = "gh-note-button";
    exportButton.textContent = "Export Notes";

    const importButton = document.createElement("button");
    importButton.className = "gh-note-button";
    importButton.textContent = "Import Notes";

    container.appendChild(editButton);
    container.appendChild(exportButton);
    container.appendChild(importButton);

    document.body.appendChild(container);

    const modal = createNoteModal();

    editButton.onclick = async () => {
      const note = await getNote();
      modal.querySelector(".gh-note-textarea").value = note;
      modal.style.display = "block";
    };

    exportButton.onclick = exportNotes;
    importButton.onclick = importNotes;
  }

  // Initialize
  createButtons();
})();
