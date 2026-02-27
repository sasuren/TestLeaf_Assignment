/**
 * Initialize app configuration
 */
import { initializeAppConfig, applyAppHeader } from '../config/configUtils.js';

// Apply config immediately and also on DOM load
initializeAppConfig();
// header depends on DOM elements so run after load if necessary
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyAppHeader);
} else {
  applyAppHeader();
}

console.log('🎨 App config initialized');