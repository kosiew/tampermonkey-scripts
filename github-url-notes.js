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
// @run-at       document-start
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
      padding: 3px 8px;
      margin: 0 4px;
      border-radius: 6px;
      font-size: 12px;
      border: 1px solid var(--color-border-default, #d0d7de);
      background-color: var(--color-canvas-default, #fff);
      color: var(--color-fg-default, #24292f);
      cursor: pointer;
      opacity: 0.8;
      transition: opacity 0.2s;
    }

    .gh-note-button:hover {
      opacity: 1;
    }

    .gh-note-button-primary {
      background-color: var(--color-success-fg, #2ea44f);
      color: var(--color-fg-on-emphasis, #fff);
      border: 1px solid rgba(27, 31, 36, 0.15);
    }

    .gh-note-button-container {
      display: inline-flex;
      gap: 4px;
      margin-left: 8px;
      align-items: center;
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
        <button class="gh-note-button gh-note-button-primary gh-note-save">Save</button>
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

  // Create button container and buttons
  async function createButtons() {
    // Remove any existing buttons first
    const existingButtons = document.querySelectorAll(
      ".gh-note-button-container"
    );
    existingButtons.forEach((button) => button.remove());

    let buttonPlaced = false;

    async function placeButton() {
      if (buttonPlaced) return;

      // Try specific GitHub locations in order of preference
      const possibleContainers = [
        // File view
        document.querySelector("#repos-header-breadcrumb-content"),
        // PR/Issue view
        document.querySelector("#partial-discussion-header .gh-header-show"),
        // Repository root
        document.querySelector(
          "#repository-container-header .AppHeader-localBar"
        ),
        // Fallbacks
        document.querySelector(".js-sticky-header-content"),
        document.querySelector("#partial-discussion-header > div.d-flex"),
        document.querySelector(".gh-header-actions"),
        document.querySelector(".pagehead-actions")
      ].filter(Boolean);

      const container = possibleContainers[0]; // Take the first available container

      if (container && !container.querySelector(".gh-note-button-container")) {
        const buttonContainer = document.createElement("div");
        buttonContainer.className = "gh-note-button-container";
        buttonContainer.style.display = "inline-flex";
        buttonContainer.style.alignItems = "center";
        buttonContainer.style.verticalAlign = "middle";
        buttonContainer.style.marginLeft = "8px";
        buttonContainer.style.position = "relative";
        buttonContainer.style.zIndex = "100";

        const mainButton = document.createElement("button");
        mainButton.className = "gh-note-button gh-note-button-primary";

        // Set initial button text based on whether there's an existing note
        const existingNote = await getNote();
        mainButton.textContent = existingNote ? "Edit Note" : "Save Note";

        buttonContainer.appendChild(mainButton);

        // Insert at the beginning of the container
        container.insertBefore(buttonContainer, container.firstChild);

        const modal = createNoteModal(mainButton);

        mainButton.onclick = async () => {
          const note = await getNote();
          modal.querySelector(".gh-note-textarea").value = note || "";
          modal.style.display = "block";
        };

        buttonPlaced = true;
      }
    }

    // Try to place button immediately and set up observers
    await placeButton();

    // Clean up existing observer
    if (window.ghNotesObserver) {
      window.ghNotesObserver.disconnect();
    }

    // Set up observers for both DOM changes and URL changes
    const observer = new MutationObserver(async () => {
      if (!buttonPlaced) {
        await placeButton();
      }
    });

    window.ghNotesObserver = observer;

    // Start observing with a more focused approach
    const targetNode = document.querySelector("main") || document.body;
    observer.observe(targetNode, {
      childList: true,
      subtree: true
    });

    // Also watch for navigation changes
    const navigationObserver = new MutationObserver(async (mutations) => {
      const urlChange = mutations.some(
        (mutation) =>
          mutation.target.nodeType === Node.ELEMENT_NODE &&
          (mutation.target.matches("head > title") ||
            mutation.target.matches('head > meta[property="og:url"]'))
      );

      if (urlChange) {
        buttonPlaced = false;
        await placeButton();
      }
    });

    navigationObserver.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Quick retries for dynamic content
    [100, 500, 1000].forEach((delay) => {
      setTimeout(async () => {
        if (!buttonPlaced) {
          await placeButton();
        }
      }, delay);
    });
  }

  // Clean up function to remove buttons and disconnect observer
  function cleanup() {
    const existingButtons = document.querySelectorAll(
      ".gh-note-button-container"
    );
    existingButtons.forEach((button) => button.remove());
    if (window.ghNotesObserver) {
      window.ghNotesObserver.disconnect();
    }
  }

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

  // Initialize as soon as DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createButtons);
  } else {
    createButtons();
  }

  // Handle GitHub's Turbo navigation
  document.addEventListener("turbo:load", () => {
    cleanup();
    createButtons();
  });
  document.addEventListener("turbo:render", () => {
    cleanup();
    createButtons();
  });

  // Also try again when the window loads (backup)
  window.addEventListener("load", createButtons);
})();
