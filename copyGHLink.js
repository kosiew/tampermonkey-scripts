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

  function createButton(buttonLabel) {
    const button = document.createElement("button");
    button.className = "btn btn-sm";
    button.style.marginLeft = "10px";
    button.innerText = buttonLabel;
    return button;
  }

  // Create the copy buttons
  function createCopyButtons() {
    const titleElement = document.querySelector(".js-issue-title");
    const issueNumberElement = document.querySelector(".gh-header-number");
    const issueUrl = window.location.href;
    const title = titleElement.textContent.trim();
    const issueNumber = issueNumberElement.textContent.trim();

    const buttonLabel1 = "Copy as Markdown";
    const button1 = createButton(buttonLabel1);

    const buttonLabel2 = "Copy as Title with Link";
    const button2 = createButton(buttonLabel2);

    const buttonLabel3 = "Copy PR Title";
    const button3 = createButton(buttonLabel3);

    function addEventListener(button, markdown) {
      button.addEventListener("click", function () {
        const originalText = this.innerText;
        copyToClipboard(markdown);
        this.innerText = "Copied";
        setTimeout(() => (this.innerText = originalText), 2000);
      });
    }

    addEventListener(button1, "[" + title + "](" + issueUrl + ")");
    addEventListener(button2, `# ${issueNumber} ${title} - ${issueUrl}`);
    addEventListener(button3, title);

    titleElement.parentNode.insertBefore(button3, titleElement.nextSibling);
    titleElement.parentNode.insertBefore(button2, titleElement.nextSibling);
    titleElement.parentNode.insertBefore(button1, titleElement.nextSibling);
  }
  // Copy the given text to the clipboard
  function copyToClipboard(text) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        console.log("Text copied to clipboard");
      })
      .catch((error) => {
        console.error("Error copying text: ", error);
      });
  }

  // Call the function to create the copy buttons
  createCopyButtons();
})();
