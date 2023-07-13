// ==UserScript==
// @name         GitHub Copy Title and URL as Markdown
// @namespace    xizun
// @version      1.0
// @description  Adds a button to copy the title and URL of GitHub issues and pull requests as markdown
// @author       Siew Kam Onn
// @match        https://github.com/*/issues/*
// @match        https://github.com/*/pull/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // Create the copy button
  function createCopyButton() {
    var titleElement = document.querySelector(".js-issue-title");
    var issueNumberElement = document.querySelector(".gh-header-number");
    var issueUrl = window.location.href;

    const buttonLabel = "Copy as Markdown";
    // Create the button element
    var button = document.createElement("button");
    button.className = "btn btn-sm";
    button.style.marginLeft = "10px";
    button.innerText = buttonLabel;

    // Add an event listener to handle the button click
    button.addEventListener("click", function () {
      var markdown =
        "[" + titleElement.textContent.trim() + "](" + issueUrl + ")";
      copyToClipboard(markdown);
      button.innerText = "Copied";
      setTimeout(() => (button.innerText = buttonLabel), 2000);
    });

    // Insert the button after the title
    titleElement.parentNode.insertBefore(button, titleElement.nextSibling);
  }

  // Copy the given text to the clipboard
  function copyToClipboard(text) {
    var textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  // Call the function to create the copy button
  createCopyButton();
})();
