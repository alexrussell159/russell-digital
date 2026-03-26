/**
 * Russell Digital — Component Loader
 * loadComponent.js
 *
 * Usage on any page:
 *   loadComponent('#header-placeholder', 'header.html');
 *   loadComponent('#footer-placeholder', 'footer.html');
 */

/**
 * Fetches an HTML file and injects it into a target element.
 * Runs any inline <script> tags found in the loaded HTML.
 *
 * @param {string} selector  - CSS selector for the placeholder element
 * @param {string} file      - Path to the HTML component file
 * @param {Function} [callback] - Optional function called after injection
 */
async function loadComponent(selector, file, callback) {
  const target = document.querySelector(selector);
  if (!target) {
    console.warn(`loadComponent: no element found for "${selector}"`);
    return;
  }

  try {
    const res = await fetch(file);
    if (!res.ok) throw new Error(`Failed to fetch ${file}: ${res.status}`);
    const html = await res.text();
    target.innerHTML = html;

    // Re-execute any <script> tags inside the loaded HTML
    target.querySelectorAll('script').forEach(oldScript => {
      const newScript = document.createElement('script');
      [...oldScript.attributes].forEach(attr => newScript.setAttribute(attr.name, attr.value));
      newScript.textContent = oldScript.textContent;
      oldScript.replaceWith(newScript);
    });

    if (typeof callback === 'function') callback();
  } catch (err) {
    console.error(`loadComponent error:`, err);
  }
}