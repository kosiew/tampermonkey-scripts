// ==UserScript==
// @name         ChatGPT Codex Job Completion Monitor
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Monitor for job completion on ChatGPT Codex by detecting when stop buttons disappear
// @author       Siew Kam Onn
// @match        https://chatgpt.com/codex*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=chatgpt.com
// @grant        GM.notification
// ==/UserScript==

(function () {
  "use strict";

  console.log("==> ChatGPT Codex Job Monitor script started");

  const CONFIG = {
    checkInterval: 1000, // Check every 1 second
    debounceDelay: 2000  // Wait 2 seconds before confirming job completion
  };

  /**
   * Represents a monitored job with its associated stop button and job name
   */
  class Job {
    constructor(stopButton, jobName, jobId) {
      this.stopButton = stopButton;
      this.jobName = jobName;
      this.jobId = jobId;
      this.isActive = true;
      this.lastSeen = Date.now();
    }

    /**
     * Updates the last seen timestamp for this job
     */
    updateLastSeen() {
      this.lastSeen = Date.now();
    }

    /**
     * Checks if this job should be considered completed (not seen for debounce period)
     * @returns {boolean} True if job should be considered completed
     */
    isCompleted() {
      return this.isActive && (Date.now() - this.lastSeen) > CONFIG.debounceDelay;
    }

    /**
     * Marks this job as completed
     */
    markCompleted() {
      this.isActive = false;
    }
  }

  /**
   * Main job monitor class that tracks stop buttons and job completions
   */
  class JobMonitor {
    constructor() {
      this.jobs = new Map(); // jobId -> Job
      this.monitorInterval = null;
      this.isMonitoring = false;
    }

    /**
     * Starts monitoring for job completions
     */
    startMonitoring() {
      if (this.isMonitoring) {
        console.log("==> Job monitoring already active");
        return;
      }

      console.log("==> Starting job monitoring");
      this.isMonitoring = true;
      this.monitorInterval = setInterval(() => {
        this.checkJobs();
      }, CONFIG.checkInterval);

      // Initial scan
      this.scanForJobs();
    }

    /**
     * Stops monitoring for job completions
     */
    stopMonitoring() {
      if (!this.isMonitoring) {
        return;
      }

      console.log("==> Stopping job monitoring");
      this.isMonitoring = false;
      if (this.monitorInterval) {
        clearInterval(this.monitorInterval);
        this.monitorInterval = null;
      }
    }

    /**
     * Scans the page for current stop buttons and associated job names
     */
    scanForJobs() {
      // Find all stop buttons currently on the page
      const stopButtons = document.querySelectorAll('button[data-testid="stop-button"], button[aria-label="Cancel task"]');
      
      console.log(`==> Found ${stopButtons.length} stop button(s)`);

      // Track which jobs are currently active
      const currentJobIds = new Set();

      stopButtons.forEach((stopButton, index) => {
        const jobInfo = this.extractJobInfo(stopButton);
        if (jobInfo) {
          const jobId = `job_${index}_${jobInfo.jobName.substring(0, 20)}`;
          currentJobIds.add(jobId);

          if (this.jobs.has(jobId)) {
            // Update existing job
            this.jobs.get(jobId).updateLastSeen();
          } else {
            // Create new job
            const job = new Job(stopButton, jobInfo.jobName, jobId);
            this.jobs.set(jobId, job);
            console.log(`==> New job detected: "${jobInfo.jobName}" (ID: ${jobId})`);
          }
        }
      });

      // Check for completed jobs (jobs that are no longer present)
      for (const [jobId, job] of this.jobs) {
        if (!currentJobIds.has(jobId) && job.isActive) {
          // Job's stop button is no longer present, update last seen
          // The actual completion check will happen in checkJobs()
        }
      }
    }

    /**
     * Extracts job information from a stop button's context
     * @param {HTMLElement} stopButton - The stop button element
     * @returns {Object|null} Job information or null if not found
     */
    extractJobInfo(stopButton) {
      try {
        // Look for job name in various possible locations relative to the stop button
        let jobNameElement = null;
        let currentElement = stopButton;

        // Search up the DOM tree for a job container
        for (let i = 0; i < 10 && currentElement; i++) {
          currentElement = currentElement.parentElement;
          if (!currentElement) break;

          // Look for job name patterns within this container
          jobNameElement = currentElement.querySelector('.font-medium span') ||
                          currentElement.querySelector('[class*="truncate"] span') ||
                          currentElement.querySelector('.text-token-text-primary span') ||
                          currentElement.querySelector('span');

          if (jobNameElement && jobNameElement.textContent.trim()) {
            break;
          }
        }

        if (!jobNameElement) {
          // Fallback: look for any nearby text that might be the job name
          const container = stopButton.closest('div');
          if (container) {
            const textNodes = this.getTextNodes(container);
            const meaningfulText = textNodes
              .map(node => node.textContent.trim())
              .filter(text => text.length > 3 && !text.includes('Cancel'))
              .join(' ');

            if (meaningfulText) {
              return {
                jobName: meaningfulText.substring(0, 100), // Limit length
                element: container
              };
            }
          }
        }

        const jobName = jobNameElement ? jobNameElement.textContent.trim() : 'Unknown Job';
        
        if (jobName && jobName !== 'Unknown Job') {
          console.log(`==> Extracted job name: "${jobName}"`);
          return {
            jobName: jobName,
            element: jobNameElement
          };
        }

        return null;
      } catch (error) {
        console.error("==> Error extracting job info:", error);
        return null;
      }
    }

    /**
     * Gets all text nodes within an element
     * @param {HTMLElement} element - The element to search
     * @returns {Array} Array of text nodes
     */
    getTextNodes(element) {
      const textNodes = [];
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.trim()) {
          textNodes.push(node);
        }
      }
      return textNodes;
    }

    /**
     * Checks all monitored jobs for completion
     */
    checkJobs() {
      // First, scan for current jobs to update their status
      this.scanForJobs();

      // Then check for completed jobs
      for (const [jobId, job] of this.jobs) {
        if (job.isCompleted()) {
          console.log(`==> Job completed: "${job.jobName}" (ID: ${jobId})`);
          this.notifyJobCompleted(job);
          job.markCompleted();
        }
      }

      // Clean up old completed jobs (keep them for a while for debugging)
      const cutoffTime = Date.now() - (5 * 60 * 1000); // 5 minutes
      for (const [jobId, job] of this.jobs) {
        if (!job.isActive && job.lastSeen < cutoffTime) {
          this.jobs.delete(jobId);
        }
      }
    }

    /**
     * Sends a notification when a job completes
     * @param {Job} job - The completed job
     */
    notifyJobCompleted(job) {
      const message = `Job completed: ${job.jobName}`;
      
      console.log(`==> ${message}`);

      // Send GM notification
      GM.notification({
        title: "ChatGPT Codex Job Completed",
        text: job.jobName,
        timeout: 5000
      });

      // Optional: Add visual notification on the page
      this.showPageNotification(job.jobName);
    }

    /**
     * Shows a brief visual notification on the page
     * @param {string} jobName - The name of the completed job
     */
    showPageNotification(jobName) {
      // Create a temporary notification element
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        max-width: 300px;
        word-wrap: break-word;
        animation: slideIn 0.3s ease-out;
      `;

      notification.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 4px;">Job Completed!</div>
        <div>${jobName}</div>
      `;

      // Add slide-in animation
      const style = document.createElement('style');
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);

      document.body.appendChild(notification);

      // Remove notification after 4 seconds
      setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
          if (style.parentNode) {
            style.parentNode.removeChild(style);
          }
        }, 300);
      }, 4000);
    }

    /**
     * Gets the current status of all monitored jobs
     * @returns {Object} Status information
     */
    getStatus() {
      const activeJobs = Array.from(this.jobs.values()).filter(job => job.isActive);
      const completedJobs = Array.from(this.jobs.values()).filter(job => !job.isActive);

      return {
        isMonitoring: this.isMonitoring,
        activeJobs: activeJobs.length,
        completedJobs: completedJobs.length,
        totalJobs: this.jobs.size,
        jobs: Array.from(this.jobs.values()).map(job => ({
          id: job.jobId,
          name: job.jobName,
          isActive: job.isActive,
          lastSeen: new Date(job.lastSeen).toLocaleTimeString()
        }))
      };
    }
  }

  // Create global job monitor instance
  const jobMonitor = new JobMonitor();

  /**
   * Initialize the script
   */
  function initializeScript() {
    console.log("==> Initializing ChatGPT Codex Job Monitor");
    console.log("==> Current page URL:", window.location.href);

    // Check if we're on the right page
    if (!window.location.href.includes('/codex')) {
      console.log("==> Not on Codex page, monitoring not started");
      return;
    }

    // Start monitoring
    jobMonitor.startMonitoring();

    // Add debugging function to window for manual testing
    window.jobMonitorStatus = () => {
      const status = jobMonitor.getStatus();
      console.log("==> Job Monitor Status:", status);
      return status;
    };

    console.log("==> Job monitor initialized. Use jobMonitorStatus() in console for status.");
  }

  /**
   * Handle page navigation (ChatGPT uses client-side routing)
   */
  function handlePageChange() {
    console.log("==> Page change detected");
    
    // Stop current monitoring
    jobMonitor.stopMonitoring();
    
    // Restart if on codex page
    setTimeout(() => {
      initializeScript();
    }, 1000); // Give the page time to load
  }

  // Initialize when page is ready
  if (document.readyState === "loading") {
    console.log("==> Document still loading, waiting for DOMContentLoaded");
    document.addEventListener("DOMContentLoaded", initializeScript);
  } else {
    console.log("==> Document already loaded, initializing immediately");
    initializeScript();
  }

  // Handle client-side navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      handlePageChange();
    }
  }).observe(document, { subtree: true, childList: true });

  // Also listen for popstate events
  window.addEventListener('popstate', handlePageChange);

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    jobMonitor.stopMonitoring();
  });
})();
