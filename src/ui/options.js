// The add-on's Options entry opens the settings view of the planner page.
import '../browser.js';

location.replace(browser.runtime.getURL('src/ui/planner.html#settings'));
