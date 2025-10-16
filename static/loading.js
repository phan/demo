/**
 * Loading indicator functionality for Phan-in-Browser
 * Provides progress feedback during WASM loading and initialization
 */

var LoadingIndicator = {
    overlay: null,
    messageEl: null,
    barEl: null,
    percentEl: null,
    currentPercent: 0,

    init: function() {
        this.overlay = document.getElementById('loading-overlay');
        this.messageEl = document.getElementById('loading-message');
        this.barEl = document.getElementById('loading-bar');
        this.percentEl = document.getElementById('loading-percent');
    },

    show: function(message, percent) {
        if (!this.overlay) this.init();

        this.overlay.classList.add('show');
        if (message !== undefined) {
            this.update(message, percent);
        }
    },

    update: function(message, percent) {
        if (!this.overlay) this.init();

        if (message !== undefined) {
            this.messageEl.textContent = message;
        }

        if (percent !== undefined) {
            this.currentPercent = Math.min(100, Math.max(0, percent));
            this.barEl.style.width = this.currentPercent + '%';
            this.percentEl.textContent = Math.round(this.currentPercent) + '%';
        }
    },

    hide: function() {
        if (!this.overlay) this.init();

        this.overlay.classList.remove('show');
        // Reset after animation completes
        setTimeout(function() {
            if (!LoadingIndicator.overlay.classList.contains('show')) {
                LoadingIndicator.currentPercent = 0;
                LoadingIndicator.barEl.style.width = '0%';
                LoadingIndicator.percentEl.textContent = '';
            }
        }, 300);
    }
};
