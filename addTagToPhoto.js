javascript: (function () {
  function waitForElementAndAct(selector, action) {
    console.log(
      `%c==> waitForElementAndAct[${selector}]:`,
      "background-color: #0595DE; color: yellow; padding: 8px; border-radius: 4px;"
    );
    // Create a MutationObserver to observe changes in the DOM
    const observer = new MutationObserver((mutationsList, observer) => {
      for (const mutation of mutationsList) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            // Check if the added node matches the selector
            if (node.nodeType === 1 && node.matches(selector)) {
              action(node); // Perform the specified action on the node
              observer.disconnect(); // Stop observing after the action is performed
            }
          });
        }
      }
    });

    // Configuration for the observer (which mutations to observe)
    const config = { childList: true, subtree: true };

    // Start observing the document body for changes
    observer.observe(document.body, config);
  }
  function addTagToSelectedPhotos() {
    const selector = "div.tile-selection";
    const selectedPhotos = document.querySelectorAll(selector);
    selectedPhotos.forEach((photo) => {
      photo.click();
    });
    const tag = getTag();
    selectedPhotos.forEach((photo) => {
      addTagToPhoto(photo, tag);
    });
    selectedPhotos.forEach((photo) => {
      photo.click();
    });
  }

  function getTag() {
    return prompt("Enter the tag to add to the selected photos");
  }

  function addTagToPhoto(photo, tag) {
    console.log(
      `%c==> [addTagToPhoto]`,
      "background-color: #0595DE; color: yellow; padding: 8px; border-radius: 4px;",
      { photo }
    );
    const selector = "button[aria-label='Show detailed information']";
    // Directly click the button if it's expected to be immediately available
    const detailButton = photo.querySelector(selector);
    if (detailButton) {
      detailButton.click();
    } else {
      // If the button might not be immediately available, wait for it
      waitForElementAndAct(selector, (button) => button.click());
    }

    // Then, wait for the tag input field to appear
    const tagInputSelector = "div.add-tag-input input";
    waitForElementAndAct(tagInputSelector, (tagInput) => {
      tagInput.value = tag;
      tagInput.dispatchEvent(new Event("input", { bubbles: true }));
      tagInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Finally, click the "Close" button
    // which has this selector div.details-panel button[aria-label='Close']
    const closeButtonSelector = "div.details-panel button[aria-label='Close']";
    const closeButton = photo.querySelector(closeButtonSelector);
    if (closeButton) {
      closeButton.click();
    } else {
      waitForElementAndAct(closeButtonSelector, (button) => button.click());
    }
  }
})();
