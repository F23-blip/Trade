 
(() => {
  "use strict";

  const HASH_KEY = "trade_lock_hash";
  const CRED_KEY = "trade_lock_cred";
  const SESSION_KEY = "trade_lock_session";
  const SESSION_MINUTES = 20; // resta sbloccato per questo tempo nella stessa scheda

  // --- utilità ---
  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function b64url(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlToBuf(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    return Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer;
  }

  function isSessionValid() {
    const t = sessionStorage.getItem(SESSION_KEY);
    return t && (Date.now() - parseInt(t, 10)) < SESSION_MINUTES * 60 * 1000;
  }
  function markUnlocked() {
    sessionStorage.setItem(SESSION_KEY, Date.now().toString());
    document.documentElement.style.visibility = "visible";
    document.getElementById("trade-lock-overlay")?.remove();
  }

  // --- WebAuthn (impronta / Face ID / Windows Hello) ---
  const webauthnSupported = !!(window.PublicKeyCredential);

  async function registerBiometric() {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "Trade" },
        user: { id: userId, name: "trade-user", displayName: "Trade" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 60000,
      },
    });
    localStorage.setItem(CRED_KEY, b64url(cred.rawId));
  }

  async function verifyBiometric() {
    const credId = localStorage.getItem(CRED_KEY);
    if (!credId) return false;
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    try {
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{ id: b64urlToBuf(credId), type: "public-key" }],
          userVerification: "required",
          timeout: 60000,
        },
      });
      return !!assertion;
    } catch (e) {
      return false;
    }
  }

  // --- interfaccia ---
  function injectStyles() {
    const s = document.createElement("style");
    s.textContent = `
      #trade-lock-overlay{position:fixed;inset:0;background:#0f1115;color:#fff;z-index:999999;
        visibility:visible!important;
        display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,sans-serif;gap:18px}
      #trade-lock-overlay *{visibility:visible!important}
      #trade-lock-overlay .dots{display:flex;gap:14px}
      #trade-lock-overlay .dot{width:14px;height:14px;border-radius:50%;border:2px solid #888}
      #trade-lock-overlay .dot.filled{background:#4f8cff;border-color:#4f8cff}
      #trade-lock-overlay .pad{display:grid;grid-template-columns:repeat(3,64px);gap:12px}
      #trade-lock-overlay button.key{width:64px;height:64px;border-radius:50%;border:1px solid #333;
        background:#1c1f26;color:#fff;font-size:20px}
      #trade-lock-overlay button.key:active{background:#2a2e38}
      #trade-lock-overlay .msg{min-height:20px;color:#ff6b6b;font-size:14px}
      #trade-lock-overlay .fingerprint{cursor:pointer;font-size:34px;margin-bottom:6px}
      #trade-lock-overlay h2{font-weight:500;font-size:16px;color:#ccc;margin:0}
    `;
    document.head.appendChild(s);
  }

  function buildOverlay({ setupMode }) {
    const o = document.createElement("div");
    o.id = "trade-lock-overlay";
    o.innerHTML = `
      ${webauthnSupported ? `<div class="fingerprint" id="fp-btn" title="Sblocca con impronta">🔒</div>` : ""}
      <h2 id="lock-title">${setupMode ? "Imposta un PIN a 4 cifre" : "Inserisci il PIN"}</h2>
      <div class="dots">${[0,1,2,3].map(() => `<div class="dot"></div>`).join("")}</div>
      <div class="pad">
        ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="key" data-k="${n}">${n}</button>`).join("")}
        <div></div><button class="key" data-k="0">0</button><button class="key" data-k="back">⌫</button>
      </div>
      <div class="msg" id="lock-msg"></div>
    `;
    document.body.appendChild(o);
    return o;
  }

  function run() {
    document.documentElement.style.visibility = "hidden";

    if (isSessionValid()) {
      document.documentElement.style.visibility = "visible";
      return;
    }

    injectStyles();
    const storedHash = localStorage.getItem(HASH_KEY);
    const setupMode = !storedHash;
    const overlay = buildOverlay({ setupMode });

    let entered = "";
    let firstPin = null; // usato in setup per la conferma
    const dotsEl = () => overlay.querySelectorAll(".dot");
    const msgEl = overlay.querySelector("#lock-msg");
    const titleEl = overlay.querySelector("#lock-title");

    function updateDots() {
      dotsEl().forEach((d, i) => d.classList.toggle("filled", i < entered.length));
    }

    async function onComplete() {
      if (setupMode) {
        if (firstPin === null) {
          firstPin = entered;
          entered = "";
          updateDots();
          titleEl.textContent = "Conferma il PIN";
          return;
        }
        if (entered !== firstPin) {
          msgEl.textContent = "I PIN non coincidono, riprova.";
          entered = ""; firstPin = null; updateDots();
          titleEl.textContent = "Imposta un PIN a 4 cifre";
          return;
        }
        localStorage.setItem(HASH_KEY, await sha256(entered));
        if (webauthnSupported && confirm("Vuoi anche abilitare lo sblocco con impronta/Face ID su questo dispositivo?")) {
          try { await registerBiometric(); } catch (e) { /* facoltativo, ignora l'errore */ }
        }
        markUnlocked();
        return;
      }
      const h = await sha256(entered);
      if (h === storedHash) {
        markUnlocked();
      } else {
        msgEl.textContent = "PIN errato.";
        entered = "";
        updateDots();
      }
    }

    overlay.addEventListener("click", (e) => {
      const btn = e.target.closest("button.key");
      if (btn) {
        if (btn.dataset.k === "back") {
          entered = entered.slice(0, -1);
        } else if (entered.length < 4) {
          entered += btn.dataset.k;
        }
        updateDots();
        if (entered.length === 4) onComplete();
        return;
      }
      if (e.target.id === "fp-btn") {
        verifyBiometric().then(ok => {
          if (ok) markUnlocked();
          else msgEl.textContent = "Sblocco con impronta non riuscito.";
        });
      }
    });

    if (!setupMode && webauthnSupported && localStorage.getItem(CRED_KEY)) {
      verifyBiometric().then(ok => { if (ok) markUnlocked(); });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
