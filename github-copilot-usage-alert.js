// ==UserScript==
// @name         GitHub Copilot Usage Alert
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Shows Copilot usage excess or deficit percentage on GitHub Copilot features page
// @author       Siew Kam Onn
// @match        https://github.com/settings/copilot/features
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @grant        GM_notification
// ==/UserScript==

(function() {
    'use strict';

    // Styles for the alert message
    const styleContent = `
        .copilot-usage-alert {
            margin-top: 8px;
            font-weight: bold;
            font-size: 14px;
        }
        .copilot-usage-excess {
            color: green;
        }
        .copilot-usage-deficit {
            color: red;
        }
    `;
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styleContent;
    document.head.appendChild(styleSheet);

    /**
     * Parses a percentage string (e.g. "45%") to a float value.
     * @param {string} text - The percentage text to parse
     * @returns {number|null} Parsed percentage or null if invalid
     */
    function parsePercentage(text) {
        const match = text.trim().match(/([0-9]+(?:\.[0-9]+)?)%/);
        return match ? parseFloat(match[1]) : null;
    }

    /**
     * Computes the expected percentage of the month that has elapsed.
     * @returns {number} Expected percentage (0-100)
     */
    function getExpectedPercent() {
        const now = new Date();
        const day = now.getDate();
        const year = now.getFullYear();
        const month = now.getMonth(); // zero-based
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        return (day / daysInMonth) * 100;
    }

    /**
     * Inserts the usage alert element into the page.
     * @param {string} message - The alert message text
     * @param {boolean} isExcess - True if excess usage (behind expected), false if deficit (ahead)
     */
    function showUsageAlert(message, isExcess) {
        const container = document.querySelector('#copilot-overages-usage > div > div');
        if (!container) return;

        // Remove any existing alert
        const existing = document.querySelector('.copilot-usage-alert');
        if (existing) existing.remove();

        const alertEl = document.createElement('div');
        alertEl.className = `copilot-usage-alert ${isExcess ? 'copilot-usage-excess' : 'copilot-usage-deficit'}`;
        alertEl.textContent = message;
        container.appendChild(alertEl);
    }

    /**
     * Checks the Copilot usage against expected usage and displays alert.
     */
    function checkCopilotUsage() {
        try {
            const usageEl = document.querySelector('#copilot-overages-usage > div > div > div');
            if (!usageEl) return;

            const percentText = usageEl.textContent || '';
            const actual = parsePercentage(percentText);
            if (actual === null) return;

            const expected = getExpectedPercent();
            const diff = expected - actual;
            const absDiff = Math.abs(diff).toFixed(2);

            if (diff >= 0) {
                // We are using less than expected (excess available)
                showUsageAlert(`Surplus: ${absDiff}%`, true);
            } else {
                // We are using more than expected (deficit)
                showUsageAlert(`Deficit: ${absDiff}%`, false);
            }

            // Optional: send a notification
            GM_notification({
                title: 'Copilot Usage Alert',
                text: diff >= 0
                    ? `You have used ${absDiff}% less than expected this month.`
                    : `You have used ${absDiff}% more than expected this month.`,
                timeout: 5000
            });

        } catch (err) {
            console.error('Copilot Usage Alert error:', err);
        }
    }

    /**
     * Initializes the script when the target container becomes available.
     */
    function initialize() {
        const container = document.querySelector('#copilot-overages-usage');
        if (container) {
            checkCopilotUsage();
        } else {
            // Retry if container not yet loaded
            setTimeout(initialize, 300);
        }
    }

    // Run on initial load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();
