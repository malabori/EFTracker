(function () {
  // Resolve `src` against the current page and require the resulting
  // origin to be either same-origin or on the host element's explicit
  // `allowed-hosts="a.com,b.com"` list. Returns the parsed URL or
  // throws — kept pure so it's straightforward to unit-test in
  // isolation if/when an export is added.
  function resolveAllowedSrc(src, baseHref, currentOrigin, allowedAttr) {
    const url = new URL(src, baseHref);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Embed src must use http(s)');
    }
    if (url.origin === currentOrigin) return url;
    const allowed = (allowedAttr || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (!allowed.includes(url.hostname)) {
      throw new Error(
        'Embed src ' +
          url.hostname +
          ' is not on the allowlist. Add allowed-hosts="' +
          url.hostname +
          '" to opt in.'
      );
    }
    return url;
  }

  class EFTrackerEmbed extends HTMLElement {
    async connectedCallback() {
      const src = this.getAttribute('src');
      if (!src) return;
      let url;
      try {
        url = resolveAllowedSrc(
          src,
          location.href,
          location.origin,
          this.getAttribute('allowed-hosts')
        );
      } catch (e) {
        this.innerHTML =
          '<div style="color:#d85e5e">EFTRACKER embed: ' + e.message + '</div>';
        console.error('EFTRACKER embed:', e);
        return;
      }

      try {
        const res = await fetch(url.href, { cache: 'no-cache' });
        const html = await res.text();
        this.innerHTML = html;
        // Re-execute scripts that arrived as innerHTML (browsers don't
        // run them otherwise).
        this.querySelectorAll('script').forEach(old => {
          const s = document.createElement('script');
          for (const { name, value } of Array.from(old.attributes)) {
            s.setAttribute(name, value);
          }
          s.textContent = old.textContent;
          old.replaceWith(s);
        });
        this.dispatchEvent(new CustomEvent('eftracker:loaded'));
      } catch (e) {
        this.innerHTML = '<div style="color:#d85e5e">Failed to load EFTRACKER.</div>';
        console.error('EFTRACKER embed error:', e);
      }
    }
  }
  customElements.define('eftracker-embed', EFTrackerEmbed);
})();
