// NSF Expansion Audio Chip Loader
// Loads all expansion audio chip modules for the NSF player

(function() {
  'use strict';

  // Load emu2413 module first (required by VRC7)
  if (typeof window !== 'undefined' && typeof window.emu2413 === 'undefined') {
    try {
      const script = document.createElement('script');
      script.src = 'mappers/ApuEX/emu2413.js';
      script.onload = function() {
      };
      script.onerror = function() {
        console.warn('Failed to load emu2413 module');
      };
      document.head.appendChild(script);
    } catch (e) {
      console.warn('emu2413 module not available:', e);
    }
  }

  // Load VRC6 module
  if (typeof APU_VRC6 === 'undefined') {
    try {
      // Try to load from file
      const script = document.createElement('script');
      script.src = 'mappers/ApuEX/VRC6.js';
      script.onload = function() {
      };
      script.onerror = function() {
      };
      document.head.appendChild(script);
    } catch (e) {
    }
  }

  // Load MMC5 module
  if (typeof APU_MMC5 === 'undefined') {
    try {
      const script = document.createElement('script');
      script.src = 'mappers/ApuEX/MMC5.js';
      script.onload = function() {
      };
      script.onerror = function() {
        console.warn('Failed to load MMC5 module');
      };
      document.head.appendChild(script);
    } catch (e) {
    }
  }

  // Load VRC7 module
  if (typeof APU_VRC7 === 'undefined') {
    try {
      const script = document.createElement('script');
      script.src = 'mappers/ApuEX/VRC7.js';
      script.onload = function() {
      };
      script.onerror = function() {
      };
      document.head.appendChild(script);
    } catch (e) {
    }
  }

  // Load FME7 module
  if (typeof APU_FME7 === 'undefined') {
    try {
      const script = document.createElement('script');
      script.src = 'mappers/ApuEX/FME7.js';
      script.onload = function() {
      };
      script.onerror = function() {
      };
      document.head.appendChild(script);
    } catch (e) {
    }
  }

  // Load FDS module
  if (typeof APU_FDS === 'undefined') {
    try {
      const script = document.createElement('script');
      script.src = 'mappers/ApuEX/FDS.js';
      script.onload = function() {
      };
      script.onerror = function() {
      };
      document.head.appendChild(script);
    } catch (e) {
    }
  }

  // Load N106 module
  if (typeof APU_N106 === 'undefined') {
    try {
      const script = document.createElement('script');
      script.src = 'mappers/ApuEX/N106.js';
      script.onload = function() {
      };
      script.onerror = function() {
      };
      document.head.appendChild(script);
    } catch (e) {
    }
  }

})();