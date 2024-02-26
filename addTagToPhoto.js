javascript: (function () {
  function hoverOver(element, onHover) {
    console.log(
      `%c👀  ==> [hoverOver] 👀`,
      "background-color: #0595DE; color: yellow; padding: 8px; border-radius: 4px;",
      { element }
    );
    // Simulate a mouseover event to trigger the hover state
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    // Call the onHover callback function, if provided
    if (onHover) {
      onHover();
    }
  }

  function hoverLeave(element, onLeave) {
    // Simulate a mouseleave event to trigger the leave state
    element.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));

    // Call the onLeave callback function, if provided
    if (onLeave) {
      onLeave();
    }
  }

  function waitForElement(childSelector, timeoutDuration = 5000) {
    return new Promise((resolve, reject) => {
      const intervalId = setInterval(() => {
        const element = document.querySelector(childSelector);
        if (element) {
          clearInterval(intervalId);
          resolve(element);
        }
      }, 100); // Check every 100ms

      // Set a timeout to stop checking if the element doesn't appear
      setTimeout(() => {
        clearInterval(intervalId);
        reject(new Error(`Timeout waiting for element: ${childSelector}`));
      }, timeoutDuration);
    });
  }

  function waitForElementAndAct(selector, action, timeout = 5000) {
    // Default timeout of 30 seconds
    console.log(
      `%c==> waitForElementAndAct[${selector}]:`,
      "background-color: #0595DE; color: yellow; padding: 8px; border-radius: 4px;"
    );

    return new Promise((resolve, reject) => {
      const startTime = Date.now(); // Record the start time for timeout checks
      const observer = new MutationObserver((mutationsList, observer) => {
        for (const mutation of mutationsList) {
          if (mutation.type === "childList") {
            mutation.addedNodes.forEach((node) => {
              // Check if the added node matches the selector
              if (node.nodeType === 1 && node.matches(selector)) {
                action(node); // Perform the specified action on the node
                observer.disconnect(); // Stop observing after the action is performed
                resolve(); // Resolve the promise successfully
              } else {
                console.log(
                  `%c👀  ==> [observer - not match] 👀`,
                  "background-color: #0595DE; color: yellow; padding: 8px; border-radius: 4px;",
                  { node }
                );
              }
            });
          }
        }

        // Check for timeout
        if (Date.now() - startTime > timeout) {
          observer.disconnect(); // Stop observing due to timeout
          reject(
            new Error(`waitForElementAndAct timed out waiting for ${selector}`)
          );
        }
      });

      const config = { childList: true, subtree: true };
      observer.observe(document.body, config);
    });
  }

  async function addTagToSelectedPhotos() {
    const selector = "div.tile-selection";
    const selectors = document.querySelectorAll(selector);
    const photoTiles = [];
    selectors.forEach((checkmark) => {
      const tile = checkmark.closest("div.photo-tile");
      photoTiles.push(tile);
      checkmark.click();
    });
    const tag = "test123"; // getTag();
    for (const photo of photoTiles) {
      await addTagToPhoto(photo, tag);
    }
  }

  function getTag() {
    return prompt("Enter the tag to add to the selected photos");
  }

  function hoverOverImage(photo) {
    // find child element img.photo
    const img = photo.querySelector("img.photo");
    hoverOver(img);
  }

  async function clickDetailButton() {
    const selector = "button[aria-label='Show detailed information']";
    // Directly click the button if it's expected to be immediately available
    let detailButton = document.querySelector(selector);
    if (!detailButton) {
      detailButton = await waitForElement(selector);
    }
    detailButton.click();
  }

  async function clickAddTagButton() {
    const addTagSelector = "button.add-tag-button";
    const addTagButton = await waitForElement(addTagSelector);
    addTagButton.click();
  }

  async function addTag(tag) {
    // wait for the tag input field to appear
    const tagInputSelector = "div.add-tag-input input";
    const tagInput = await waitForElement(tagInputSelector);
    tagInput.value = tag;
    tagInput.dispatchEvent(new Event("input", { bubbles: true }));
    tagInput.dispatchEvent(new Event("change", { bubbles: true }));
    tagInput.dispatchEvent(new Event("blur", { bubbles: true }));
    const enterKeyEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true
    });
    tagInput.dispatchEvent(enterKeyEvent);
  }

  async function clickCloseButton() {
    // which has this selector div.details-panel button[aria-label='Close']
    const closeButtonSelector = "div.details-panel button[aria-label='Close']";
    const closeButton = await waitForElement(closeButtonSelector);
    if (closeButton) {
      closeButton.click();
    }
  }

  async function addTagToPhoto(photo, tag) {
    console.log(
      `%c==> [addTagToPhoto]`,
      "background-color: #0595DE; color: yellow; padding: 8px; border-radius: 4px;",
      { photo }
    );

    hoverOverImage(photo);

    await clickDetailButton();

    await clickAddTagButton();

    await addTag(tag);
    await clickCloseButton();
    hoverLeave(img);
  }
})();
