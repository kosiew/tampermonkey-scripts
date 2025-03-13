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
// @grant        GM.registerMenuCommand
// @grant        GM.openInTab
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  const NOTES_KEY = "github_url_notes";

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
  function createNoteModal(mainButton) {
    const modal = document.createElement("div");
    modal.className = "gh-note-modal";
    modal.innerHTML = `
      <div class="gh-note-modal-content">
        <span class="gh-note-close">&times;</span>
        <h3>Note for this page</h3>
        <textarea class="gh-note-textarea"></textarea>
        <button class="gh-note-button gh-note-save">Save</button>
      </div>
    `;

    document.body.appendChild(modal);

    const textarea = modal.querySelector(".gh-note-textarea");
    const closeBtn = modal.querySelector(".gh-note-close");
    const saveBtn = modal.querySelector(".gh-note-save");

    closeBtn.onclick = () => (modal.style.display = "none");
    saveBtn.onclick = async () => {
      await saveNote(textarea.value);
      modal.style.display = "none";
      // Update button text after saving
      mainButton.textContent = textarea.value ? "Edit Note" : "Save Note";
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
      modal.querySelector(".gh-note-textarea").value = note || "";
      modal.style.display = "block";
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
  GM.registerMenuCommand("Delete Notes (Older than 180 days)", async () => {
    if (
      confirm("Are you sure you want to delete all notes older than 180 days?")
    ) {
      await deleteOldNotes();
    }
  });
  GM.registerMenuCommand("Open All Note URLs", openAllNoteUrls);
})();
