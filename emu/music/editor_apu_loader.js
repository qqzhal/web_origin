// Simplified NSF Expansion Audio Chip Loader for Editor
// Only loads essential modules without UI dependencies

(function() {
  'use strict';

  // Load emu2413 module first (required by VRC7)
  if (typeof window !== 'undefined' && typeof window.emu2413 === 'undefined') {
    try {
      const script = document.createElement('script');
      script.src = '../mappers/ApuEX/emu2413.js';
      script.onload = function() {
        console.log('emu2413 module loaded');
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
      const script = document.createElement('script');
      script.src = '../mappers/ApuEX/VRC6.js';
      script.onload = function() {
        console.log('VRC6 module loaded');
      };
      script.onerror = function() {
        console.warn('Failed to load VRC6 module');
      };
      document.head.appendChild(script);
    } catch (e) {
      console.warn('VRC6 module not available:', e);
    }
  }

  // Load MMC5 module
  if (typeof APU_MMC5 === 'undefined') {
    try {
      const script = document.createElement('script');
      script.src = '../mappers/ApuEX/MMC5.js';
      script.onload = function() {
        console.log('MMC5 module loaded');
      };
      script.onerror = function() {
        console.warn('Failed to load MMC5 module');
      };
      document.head.appendChild(script);
    } catch (e) {
      console.warn('MMC5 module not available:', e);
    }
  }

  // Load VRC7 module
  if (typeof APU_VRC7 === 'undefined') {
    try {
      const script = document.createElement('script');
      script.src = '../mappers/ApuEX/VRC7.js';
      script.onload = function() {
        console.log('VRC7 module loaded');
      };
      script.onerror = function() {
        console.warn('Failed to load VRC7 module');
      };
      document.head.appendChild(script);
    } catch (e) {
      console.warn('VRC7 module not available:', e);
    }
  }

  // Load FME7 module
  if (typeof APU_FME7 === 'undefined') {
    try {
      const script = document.createElement('script');
      script.src = '../mappers/ApuEX/FME7.js';
      script.onload = function() {
        console.log('FME7 module loaded');
      };
      script.onerror = function() {
        console.warn('Failed to load FME7 module');
      };
      document.head.appendChild(script);
    } catch (e) {
      console.warn('FME7 module not available:', e);
    }
  }

  // Load FDS module
  if (typeof APU_FDS === 'undefined') {
    try {
      const script = document.createElement('script');
      script.src = '../mappers/ApuEX/FDS.js';
      script.onload = function() {
        console.log('FDS module loaded');
      };
      script.onerror = function() {
        console.warn('Failed to load FDS module');
      };
      document.head.appendChild(script);
    } catch (e) {
      console.warn('FDS module not available:', e);
    }
  }

  // Load N106 module
  if (typeof APU_N106 === 'undefined') {
    try {
      const script = document.createElement('script');
      script.src = '../mappers/ApuEX/N106.js';
      script.onload = function() {
        console.log('N106 module loaded');
      };
      script.onerror = function() {
        console.warn('Failed to load N106 module');
      };
      document.head.appendChild(script);
    } catch (e) {
      console.warn('N106 module not available:', e);
    }
  }

})();