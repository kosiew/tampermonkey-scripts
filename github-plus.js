// ==UserScript==
// @name         Github Plus
// @namespace    https://wpcomhappy.wordpress.com/
// @icon         https://raw.githubusercontent.com/soufianesakhi/feedly-filtering-and-sorting/master/web-ext/icons/128.png
// @version      1.1
// @description  Tool for enhancing Github for calypso issues
// @author       Siew "@xizun"
// @match        https://github.com/*/issues/*
// @require      http://code.jquery.com/jquery-3.4.1.min.js
// @require      http://code.jquery.com/ui/1.12.1/jquery-ui.js
// @require      https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require      https://unpkg.com/vue@2.6.12/dist/vue.min.js
// @require      https://unpkg.com/vue-select@3.11.2/dist/vue-select.js
// @resource     IMPORTED_CSS https://unpkg.com/vue-select@3.11.2/dist/vue-select.css
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function ($) {
  //function to create private scope with $ parameter
  const options = {
    DEBUG: true,
    WAIT_MILISECONDS: 1000
  };
  let lastHref;

  function dlog(message, level = 0) {
    if (options.DEBUG) {
      const styles = [
        "border: 1px solid #3E0E02",
        "color: white",
        "display: block",
        "text-shadow: 0 1px 0 rgba(0, 0, 0, 0.3)",
        "box-shadow: 0 1px 0 rgba(255, 255, 255, 0.4) inset, 0 5px 3px -5px rgba(0, 0, 0, 0.5), 0 -13px 5px -10px rgba(255, 255, 255, 0.4) inset",
        "line-height: 20px",
        "text-align: center",
        "font-weight: bold"
      ];

      if (level == 0) {
        styles.push("background: linear-gradient(#060dd3, #040647)");
      } else {
        styles.push("background: linear-gradient(#D33106, #571402)");
      }

      const _styles = styles.join(";");
      console.log(`%c ${message}`, _styles);
    }
  }

  function jQueryIsLoaded() {
    return typeof $ == "function";
  }

  function isJquery(elem) {
    return elem instanceof jQuery && elem.length > 0;
  }

  function addBorder(elem) {
    elem.css("border", "2px solid red");
  }

  function flashBorder(elem) {
    let style = { border: "3px solid blue" };
    elem.css(style);

    style = { border: "" };
    setTimeout(() => elem.css(style), options.WAIT_MILISECONDS);
  }

  function copyItemsToClipboard(items) {
    const WAIT_MILISECONDS_BETWEEN_COPY = 1000;

    const loop = setInterval(() => {
      if (items.length > 0) {
        const item = items.shift();
        dlog("copying ".concat(item));
        GM_setClipboard(item);
      } else {
        clearInterval(loop);
      }
    }, WAIT_MILISECONDS_BETWEEN_COPY);
  }

  function addStyle() {
    const vue_select_css = GM_getResourceText("IMPORTED_CSS");
    GM_addStyle(vue_select_css);
    const css = ``;
    GM_addStyle(css);
  }

  function waitForKeyElements(selector, f) {
    function _monitorSelector() {
      return new Promise((resolve, reject) => {
        let i = 0;
        const loop = setInterval(() => {
          const elem = $(selector);
          if (elem.length > 0 || i > options.FAIL_STOP) {
            clearInterval(loop);
            if (elem.length > 0) {
              resolve();
            } else {
              reject(`loop-out:i`);
            }
          }
          i++;
        }, options.WAIT_MILISECONDS);
      });
    }

    _monitorSelector(selector, f)
      .then(() => {
        f();
      })
      .catch((errorMessage) => {
        GM_notification({
          title: "Error",
          text: errorMessage,
          image: "https://i.stack.imgur.com/geLPT.png"
        });
      });
  }

  //private scope and using $ without worry of conflict
  dlog("loading Github Plus");

  function copyLink() {
    const href = location.href;
    GM_setClipboard(href);
  }

  function syntheticEnter(elem) {
    const syntheticChangeEvent = new Event("input", { bubbles: true });
    syntheticChangeEvent.simulated = true;
    const syntheticKeyboardEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      keyCode: 13
    });
    syntheticKeyboardEvent.simulated = true;
    elem.dispatchEvent(syntheticChangeEvent);
    elem.dispatchEvent(syntheticKeyboardEvent);
  }

  function addTriagedLabel() {
    // const link = $('<a href="/Automattic/wp-calypso/labels/Triaged" title="To be used when issues have been triaged." data-name="Triaged" style="--label-r:2;--label-g:103;--label-b:255;--label-h:216;--label-s:100;--label-l:50;" class="IssueLabel hx_IssueLabel width-fit mb-1 mr-1"> <span class="css-truncate css-truncate-target width-fit">Triaged</span></a>');
    // const labels = $('.js-issue-labels');
    // labels.append(link);
    // flashBorder(labels);

    const details = $("details#labels-select-menu");
    dlog(`details.length = ${details.length}`);
    details.prop("open", true);
    waitForKeyElements("input#label-filter-field", () => {
      const inp = $("input#label-filter-field");
      inp.val("Triaged");
      syntheticEnter(inp[0]);
    });
  }

  function addTriageButton(h) {
    const href = location.href;

    if (href.startsWith("https://github.com/Automattic/wp-calypso/issues/")) {
      const b = $("<button>Triage</button>");
      h.after(b);
      b.on("click", () => {
        addTriagedLabel();
        copyLink();
      });
    }
  }

  function addCopy(h) {
    h.on("click", () => {
      const itemsToCopy = [];
      const title = h.text();
      itemsToCopy.push(title);
      const link = location.href;
      itemsToCopy.push(link);
      const markup = `[${title.trim()}](${link})`;
      itemsToCopy.push(markup);
      copyItemsToClipboard(itemsToCopy);
      flashBorder(h);
    });
  }

  setInterval(() => {
    const href = location.href;
    if (href != lastHref) {
      const h = $("h1.gh-header-title .markdown-title"); // Issue
      if (h.length > 0) {
        addCopy(h);

        addTriageButton(h);
        lastHref = href;
        flashBorder(h);
      }
    }
  }, 2000);
})(jQuery); //invoke nameless function and pass it the jQuery object

// version 1.1
// . added syntheticEnter
