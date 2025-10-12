(function(){
  class EFTrackerEmbed extends HTMLElement {
    async connectedCallback(){
      const src = this.getAttribute('src');
      if (!src) return;
      try {
        const res = await fetch(src, { cache: 'no-cache' });
        const html = await res.text();
        // Inject HTML
        this.innerHTML = html;
        // Re-execute any scripts inside the injected HTML
        this.querySelectorAll('script').forEach(old => {
          const s = document.createElement('script');
          for (const {name, value} of Array.from(old.attributes)) s.setAttribute(name, value);
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
