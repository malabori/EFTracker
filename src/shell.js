import { refs } from './state.js';

const SHELL_HTML = `
    <div id="eft-wrap">
      <aside id="eft-side" aria-label="Site">
        <nav class="bubble">
          <div class="title">Menu</div>
          <ul class="snav primary">
            <li><a class="slink" href="/sign-in">Sign in</a></li>
            <li><a class="slink" href="/updates">Updates</a></li>
            <li><a class="slink" href="/blog">Blog</a></li>
          </ul>
          <div class="legal-text">
            <a href="/terms">Terms</a> •
            <a href="/privacy">Privacy</a> •
            <a href="/dmca">DMCA</a> •
            <a href="/sources">Data sources</a>
          </div>
        </nav>
      </aside>

      <button id="eft-burger" aria-expanded="false" aria-controls="eft-offcanvas" aria-label="Open menu">☰</button>
      <div id="eft-offcanvas" aria-hidden="true">
        <div class="panel" role="dialog" aria-modal="true" id="eft-offcanvas-panel">
          <button class="close" type="button" id="eft-offcanvas-close">Close</button>
          <nav class="bubble" aria-label="Mobile site">
            <div class="title">Menu</div>
            <ul class="snav primary">
              <li><a class="slink" href="/sign-in">Sign in</a></li>
              <li><a class="slink" href="/updates">Updates</a></li>
              <li><a class="slink" href="/blog">Blog</a></li>
            </ul>
            <div class="legal-text" style="margin-top:12px;">
              <a href="/terms">Terms</a> •
              <a href="/privacy">Privacy</a> •
              <a href="/dmca">DMCA</a> •
              <a href="/sources">Data sources</a>
            </div>
          </nav>
        </div>
      </div>

      <div id="eft-cw"><div class="shell" id="eft-shell"></div></div>
      <div id="eft-toast"><span id="eft-toast-msg"></span><span class="toast-actions"></span></div>
    </div>
    <nav id="eft-mobile-nav" aria-label="Bottom navigation">
      <button type="button" data-mnav="briefing"><span class="mnav-glyph">◫</span><span>Briefing</span></button>
      <button type="button" data-mnav="list"><span class="mnav-glyph">≡</span><span>List</span></button>
      <button type="button" data-mnav="search"><span class="mnav-glyph">⌕</span><span>Search</span></button>
      <button type="button" data-mnav="menu"><span class="mnav-glyph">☰</span><span>Menu</span></button>
    </nav>
  `;

export function ensureShell() {
  if (!document.getElementById('eft-shell')) {
    const mount = document.getElementById('eft-app');
    mount.innerHTML = SHELL_HTML;
  }
  refs.side = document.getElementById('eft-side');
  refs.app = document.getElementById('eft-shell');
  refs.toast = document.getElementById('eft-toast');
  refs.burger = document.getElementById('eft-burger');
  refs.offcanvas = document.getElementById('eft-offcanvas');
  refs.offcanvasClose = document.getElementById('eft-offcanvas-close');
}
