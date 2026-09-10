(() => {
  "use strict";

  const HASH_KEY = "trade_lock_hash";
  const RECOVERY_HASH_KEY = "trade_lock_recovery_hash";
  const CRED_KEY = "trade_lock_cred";
  const SESSION_KEY = "trade_lock_session";
  const SESSION_MINUTES = 20;

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
  function genRecoveryCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // niente O/0, I/1 ambigui
    let code = "";
    const rnd = crypto.getRandomValues(new Uint8Array(8));
    for (let i = 0; i < 8; i++) {
      code += alphabet[rnd[i] % alphabet.length];
      if (i === 3) code += "-";
    }
    return code;
  }

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

  function injectStyles() {
    const s = document.createElement("style");
    s.textContent = `
      #trade-lock-overlay{position:fixed;inset:0;background:#0f1115;color:#fff;z-index:999999;
        visibility:visible!important;
        display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,sans-serif;gap:16px;padding:20px;text-align:center}
      #trade-lock-overlay *{visibility:visible!important;box-sizing:border-box}
      #trade-lock-overlay .dots{display:flex;gap:14px}
      #trade-lock-overlay .dot{width:14px;height:14px;border-radius:50%;border:2px solid #888}
      #trade-lock-overlay .dot.filled{background:#4f8cff;border-color:#4f8cff}
      #trade-lock-overlay .pad{display:grid;grid-template-columns:repeat(3,64px);gap:12px}
      #trade-lock-overlay button.key{width:64px;height:64px;border-radius:50%;border:1px solid #333;
        background:#1c1f26;color:#fff;font-size:20px}
      #trade-lock-overlay button.key:active{background:#2a2e38}
      #trade-lock-overlay .msg{min-height:20px;color:#ff6b6b;font-size:14px}
      #trade-lock-overlay .fingerprint{cursor:pointer;font-size:34px;margin-bottom:2px}
      #trade-lock-overlay h2{font-weight:500;font-size:16px;color:#ccc;margin:0}
      #trade-lock-overlay .link{color:#4f8cff;font-size:13px;cursor:pointer;text-decoration:underline;background:none;border:none}
      #trade-lock-overlay input.rec{background:#1c1f26;border:1px solid #333;color:#fff;padding:12px 14px;
        border-radius:8px;font-size:18px;letter-spacing:2px;text-align:center;width:220px;text-transform:uppercase}
      #trade-lock-overlay button.primary{background:#4f8cff;color:#fff;border:none;border-radius:8px;
        padding:10px 20px;font-size:15px;cursor:pointer}
      #trade-lock-overlay .code-box{background:#1c1f26;border:1px dashed #4f8cff;padding:14px 20px;border-radius:8px;
        font-size:20px;letter-spacing:2px}
      #trade-lock-overlay p.hint{color:#999;font-size:13px;max-width:280px;line-height:1.4;margin:0}
    `;
    document.head.appendChild(s);
  }

  function run() {
    document.documentElement.style.visibility = "hidden";
    if (isSessionValid()) {
      document.documentElement.style.visibility = "visible";
      return;
    }
    injectStyles();

    let overlay = document.createElement("div");
    overlay.id = "trade-lock-overlay";
    document.body.appendChild(overlay);

    let mode = localStorage.getItem(HASH_KEY) ? "lock" : "setup";
    let entered = "";
    let firstPin = null;

    function render() {
      entered = "";
      firstPin = mode === "reset-pin" ? firstPin : null;
      if (mode === "setup" || mode === "reset-pin") {
        overlay.innerHTML = `
          <h2 id="lock-title">Imposta un PIN a 4 cifre</h2>
          <div class="dots">${[0,1,2,3].map(() => `<div class="dot"></div>`).join("")}</div>
          <div class="pad">
            ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="key" data-k="${n}">${n}</button>`).join("")}
            <div></div><button class="key" data-k="0">0</button><button class="key" data-k="back">⌫</button>
          </div>
          <div class="msg" id="lock-msg"></div>
        `;
      } else if (mode === "lock") {
        overlay.innerHTML = `
          ${webauthnSupported && localStorage.getItem(CRED_KEY) ? `<div class="fingerprint" id="fp-btn" title="Sblocca con impronta">🔒</div>` : ""}
          <h2 id="lock-title">Inserisci il PIN</h2>
          <div class="dots">${[0,1,2,3].map(() => `<div class="dot"></div>`).join("")}</div>
          <div class="pad">
            ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="key" data-k="${n}">${n}</button>`).join("")}
            <div></div><button class="key" data-k="0">0</button><button class="key" data-k="back">⌫</button>
          </div>
          <div class="msg" id="lock-msg"></div>
          <button class="link" id="forgot-btn">PIN dimenticato?</button>
        `;
      } else if (mode === "recovery") {
        overlay.innerHTML = `
          <h2>Codice di recupero</h2>
          <p class="hint">Inserisci il codice di recupero che hai salvato quando hai impostato il PIN.</p>
          <input class="rec" id="rec-input" maxlength="9" placeholder="XXXX-XXXX" autocomplete="off">
          <button class="primary" id="rec-verify">Verifica</button>
          <div class="msg" id="lock-msg"></div>
          <button class="link" id="back-to-pin">Torna al PIN</button>
        `;
        overlay.querySelector("#rec-input").focus();
      } else if (mode === "show-code") {
        overlay.innerHTML = `
          <h2>Salva il tuo codice di recupero</h2>
          <p class="hint">Ti servirà se dimentichi il PIN. Conservalo in un posto sicuro: non verrà mostrato di nuovo.</p>
          <div class="code-box">${window._trade_new_code}</div>
          <button class="primary" id="code-ack">Ho salvato il codice</button>
        `;
      }
    }

    function updateDots() {
      overlay.querySelectorAll(".dot").forEach((d, i) => d.classList.toggle("filled", i < entered.length));
    }

    async function finishPinEntry() {
      const msgEl = overlay.querySelector("#lock-msg");
      const titleEl = overlay.querySelector("#lock-title");
      if (mode === "setup" || mode === "reset-pin") {
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

        const isFirstSetup = mode === "setup";
        const newCode = genRecoveryCode();
        localStorage.setItem(RECOVERY_HASH_KEY, await sha256(newCode.toUpperCase()));
        window._trade_new_code = newCode;

        if (isFirstSetup && webauthnSupported && confirm("Vuoi anche abilitare lo sblocco con impronta/Face ID su questo dispositivo?")) {
          try { await registerBiometric(); } catch (e) { /* facoltativo */ }
        }
        mode = "show-code";
        render();
        return;
      }
      // mode lock
      const h = await sha256(entered);
      if (h === localStorage.getItem(HASH_KEY)) {
        markUnlocked();
      } else {
        msgEl.textContent = "PIN errato.";
        entered = "";
        updateDots();
      }
    }

    overlay.addEventListener("click", async (e) => {
      const btn = e.target.closest("button.key");
      if (btn) {
        if (btn.dataset.k === "back") entered = entered.slice(0, -1);
        else if (entered.length < 4) entered += btn.dataset.k;
        updateDots();
        if (entered.length === 4) finishPinEntry();
        return;
      }
      if (e.target.id === "fp-btn") {
        const ok = await verifyBiometric();
        if (ok) markUnlocked();
        else overlay.querySelector("#lock-msg").textContent = "Sblocco con impronta non riuscito.";
        return;
      }
      if (e.target.id === "forgot-btn") {
        mode = "recovery";
        render();
        return;
      }
      if (e.target.id === "back-to-pin") {
        mode = "lock";
        render();
        return;
      }
      if (e.target.id === "rec-verify") {
        const val = overlay.querySelector("#rec-input").value.trim().toUpperCase();
        const h = await sha256(val);
        if (h === localStorage.getItem(RECOVERY_HASH_KEY)) {
          mode = "reset-pin";
          render();
        } else {
          overlay.querySelector("#lock-msg").textContent = "Codice non valido.";
        }
        return;
      }
      if (e.target.id === "code-ack") {
        markUnlocked();
        return;
      }
    });

    render();

    if (mode === "lock" && webauthnSupported && localStorage.getItem(CRED_KEY)) {
      verifyBiometric().then(ok => { if (ok) markUnlocked(); });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
