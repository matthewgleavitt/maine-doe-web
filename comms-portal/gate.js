/*
 * Maine DOE Communications Portal — passphrase gate.
 *
 * Purpose: friction layer, not real security. Prevents casual URL-sharing
 * without an Azure sign-in. The passphrase lives in the Employee Handbook.
 *
 * Notes on security:
 *  - Passphrase hash is PBKDF2-SHA256 (200k iterations) with a static salt.
 *    That defeats trivial rainbow tables but not a determined attacker who
 *    reads the source.
 *  - Anyone who inspects DevTools can bypass the gate entirely by deleting
 *    the overlay from the DOM. That's fine — this is a "don't share the
 *    link casually" layer, not access control.
 *  - The unlock is stored in localStorage under this origin only. Unlock
 *    once per browser and every portal page opens without prompting.
 *  - The public calendar (calendar/index.html) is NOT gated. It's the same
 *    public URL people are used to.
 */
(function () {
  var STORAGE_KEY = 'doe_portal_unlock_v2';
  var SALT = 'maine-doe-comms-portal-v1-2026';
  var ITERATIONS = 200000;
  var EXPECTED_HASH = 'd2ea8e72b3bd2d432fa75140377bc30ec9b083e35b6fd81206f630a819989201';

  // If this page is inside an iframe on the same origin (portal shell around
  // the tools), skip the gate — the parent already vouches for us.
  try { if (window.top !== window.self) return; } catch (e) { /* cross-origin, fall through */ }

  // Already unlocked?
  try {
    if (localStorage.getItem(STORAGE_KEY) === EXPECTED_HASH) return;
  } catch (e) { /* localStorage blocked; still gate */ }

  function hexOf(buf) {
    var a = new Uint8Array(buf);
    var s = '';
    for (var i = 0; i < a.length; i++) s += (a[i] < 16 ? '0' : '') + a[i].toString(16);
    return s;
  }

  async function hashPass(pass) {
    var enc = new TextEncoder();
    var keyMat = await crypto.subtle.importKey(
      'raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']
    );
    var bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode(SALT), iterations: ITERATIONS, hash: 'SHA-256' },
      keyMat,
      256
    );
    return hexOf(bits);
  }

  function drawGate() {
    var css = ''
      + '#doe-gate-root{position:fixed;inset:0;z-index:2147483647;'
      + 'background:radial-gradient(ellipse at top,#162d44,#0c1926 60%);'
      + 'display:flex;align-items:center;justify-content:center;padding:24px;'
      + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#e2e8f0}'
      + '#doe-gate-card{background:rgba(15,28,42,.85);border:1px solid rgba(255,255,255,.08);'
      + 'border-radius:16px;padding:34px 32px 30px;max-width:420px;width:100%;'
      + 'box-shadow:0 30px 80px rgba(0,0,0,.5),0 4px 16px rgba(0,0,0,.35);'
      + 'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}'
      + '#doe-gate-eyebrow{font-size:11px;letter-spacing:.16em;text-transform:uppercase;'
      + 'color:#42c3f7;font-weight:800;margin-bottom:8px}'
      + '#doe-gate-title{font-size:22px;font-weight:800;color:#fff;line-height:1.2;margin-bottom:8px}'
      + '#doe-gate-sub{font-size:13px;color:#94a3b8;line-height:1.55;margin-bottom:22px;font-weight:500}'
      + '#doe-gate-form{display:flex;flex-direction:column;gap:12px}'
      + '#doe-gate-input{width:100%;padding:12px 14px;border-radius:10px;'
      + 'border:1.5px solid rgba(255,255,255,.15);background:rgba(0,0,0,.35);'
      + 'color:#fff;font-size:15px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;'
      + 'outline:none;letter-spacing:.05em;box-sizing:border-box}'
      + '#doe-gate-input:focus{border-color:#42c3f7;box-shadow:0 0 0 3px rgba(66,195,247,.18)}'
      + '#doe-gate-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:2px}'
      + '#doe-gate-remember{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:#94a3b8;font-weight:500;cursor:pointer}'
      + '#doe-gate-remember input{accent-color:#42c3f7;width:14px;height:14px;cursor:pointer}'
      + '#doe-gate-btn{padding:11px 22px;border-radius:10px;border:0;'
      + 'background:linear-gradient(135deg,#42c3f7,#0d7ba0);color:#fff;'
      + 'font-size:14px;font-weight:800;letter-spacing:.02em;cursor:pointer;'
      + 'box-shadow:0 4px 14px rgba(66,195,247,.3);transition:transform .1s ease}'
      + '#doe-gate-btn:hover{transform:translateY(-1px)}'
      + '#doe-gate-btn:disabled{opacity:.5;cursor:wait;transform:none}'
      + '#doe-gate-err{color:#f87a86;font-size:13px;font-weight:600;margin-top:6px;min-height:18px}'
      + '#doe-gate-foot{margin-top:22px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);'
      + 'font-size:11.5px;color:#64748b;line-height:1.6;font-weight:500}'
      + '#doe-gate-foot strong{color:#94a3b8;font-weight:700}';

    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var root = document.createElement('div');
    root.id = 'doe-gate-root';
    root.innerHTML =
      '<div id="doe-gate-card">' +
        '<div id="doe-gate-eyebrow">Maine Department of Education</div>' +
        '<div id="doe-gate-title">Communications Portal</div>' +
        '<div id="doe-gate-sub">This tool is for internal DOE staff. Enter the shared portal passphrase to continue. It’s in the Employee Handbook.</div>' +
        '<form id="doe-gate-form" autocomplete="off">' +
          '<input id="doe-gate-input" type="password" name="portal-passphrase" ' +
            'placeholder="Portal passphrase" autocomplete="off" autofocus spellcheck="false"/>' +
          '<div id="doe-gate-row">' +
            '<label id="doe-gate-remember"><input type="checkbox" id="doe-gate-remember-cb" checked/>Remember on this device</label>' +
            '<button id="doe-gate-btn" type="submit">Enter portal</button>' +
          '</div>' +
          '<div id="doe-gate-err" aria-live="polite"></div>' +
        '</form>' +
        '<div id="doe-gate-foot">Forgot the passphrase? Check the Employee Handbook or ask <strong>Matt Leavitt</strong> or <strong>Rachel Paling</strong>. Please don’t share the passphrase with anyone outside the department.</div>' +
      '</div>';

    (document.body || document.documentElement).appendChild(root);

    var input = root.querySelector('#doe-gate-input');
    var btn = root.querySelector('#doe-gate-btn');
    var err = root.querySelector('#doe-gate-err');
    var remember = root.querySelector('#doe-gate-remember-cb');
    var form = root.querySelector('#doe-gate-form');

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      err.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Checking…';
      try {
        var h = await hashPass(input.value || '');
        if (h === EXPECTED_HASH) {
          if (remember.checked) {
            try { localStorage.setItem(STORAGE_KEY, EXPECTED_HASH); } catch (ex) {}
          } else {
            try { sessionStorage.setItem(STORAGE_KEY, EXPECTED_HASH); } catch (ex) {}
          }
          root.style.transition = 'opacity .25s ease';
          root.style.opacity = '0';
          setTimeout(function () { if (root.parentNode) root.parentNode.removeChild(root); }, 260);
        } else {
          err.textContent = 'Incorrect passphrase. Try again.';
          btn.disabled = false;
          btn.textContent = 'Enter portal';
          input.select();
        }
      } catch (ex) {
        err.textContent = 'Something went wrong checking that. Try again.';
        btn.disabled = false;
        btn.textContent = 'Enter portal';
      }
    });
  }

  // Also honor a session-scoped unlock (opt-out of Remember).
  try {
    if (sessionStorage.getItem(STORAGE_KEY) === EXPECTED_HASH) return;
  } catch (e) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', drawGate);
  } else {
    drawGate();
  }
})();
