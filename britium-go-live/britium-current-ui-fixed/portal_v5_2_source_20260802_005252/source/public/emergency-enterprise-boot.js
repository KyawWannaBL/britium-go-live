(function () {
  var MARK = "enterprise-emergency-boot-login-20260614";
  console.log(MARK);

  var EMAIL = "sai@britiumexpress.com";
  var PASSWORD = "Sh@nstar28";

  function hasSession() {
    try {
      return (
        localStorage.getItem("be_user_authenticated") === "true" ||
        localStorage.getItem("be_session_ok") === "true" ||
        !!localStorage.getItem("be_user_access_profile")
      );
    } catch (e) {
      return false;
    }
  }

  function setSession(email) {
    var access = {
      ok: true,
      email: email,
      role: "superadmin",
      portal: "enterprise",
      branch_code: "HQ",
      permissions: { all: true },
      source: "emergency_enterprise_boot"
    };

    localStorage.setItem("be_user_authenticated", "true");
    localStorage.setItem("be_session_ok", "true");
    localStorage.setItem("be_login_email", email);
    localStorage.setItem("be_user_email", email);
    localStorage.setItem("be_user_role", "superadmin");
    localStorage.setItem("be_user_portal", "enterprise");
    localStorage.setItem("be_branch_code", "HQ");
    localStorage.setItem("be_user_access_profile", JSON.stringify(access));
  }

  function root() {
    return document.getElementById("root");
  }

  function renderLogin() {
    var r = root();
    if (!r) return;

    r.innerHTML = `
      <main style="min-height:100vh;position:relative;overflow:hidden;font-family:Inter,system-ui,sans-serif">
        <video src="/BACKGROUND.mp4" autoplay muted loop playsinline
          style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none"></video>
        <div style="position:absolute;inset:0;background:rgba(2,8,23,.72)"></div>

        <section style="position:relative;z-index:10;min-height:100vh;display:grid;place-items:center;padding:20px">
          <form id="be-emergency-login-form"
            style="width:min(440px,100%);background:#fff;border-radius:22px;padding:28px;box-shadow:0 30px 80px rgba(0,0,0,.45)">
            <div style="text-align:center;margin-bottom:24px">
              <img src="/logo.png" style="width:72px;height:72px;object-fit:contain;border-radius:18px" />
              <h1 style="margin:12px 0 4px;font-size:24px;font-weight:900;color:#111827">BRITIUM EXPRESS</h1>
              <div style="color:#f59e0b;font-weight:900;font-size:12px;letter-spacing:2px">ENTERPRISE PORTAL</div>
            </div>

            <h2 style="margin:0 0 18px;color:#111827;font-size:28px;font-weight:900">Sign In</h2>

            <div id="be-emergency-error"
              style="display:none;background:#fee2e2;color:#991b1b;padding:12px;border-radius:12px;margin-bottom:14px;font-weight:800"></div>

            <label style="display:block;font-weight:900;color:#6b7280;font-size:12px;margin-bottom:6px">EMAIL ADDRESS</label>
            <input id="be-emergency-email" value="${EMAIL}" type="email" autocomplete="username"
              style="width:100%;box-sizing:border-box;padding:14px;border-radius:12px;border:1px solid #d1d5db;font-size:15px;margin-bottom:16px" />

            <label style="display:block;font-weight:900;color:#6b7280;font-size:12px;margin-bottom:6px">PASSWORD</label>
            <input id="be-emergency-password" type="password" autocomplete="current-password"
              style="width:100%;box-sizing:border-box;padding:14px;border-radius:12px;border:1px solid #d1d5db;font-size:15px;margin-bottom:18px" />

            <button type="submit"
              style="width:100%;padding:16px 0;border-radius:14px;border:0;background:#f59e0b;color:#111827;font-size:16px;font-weight:900;cursor:pointer">
              Sign In to Portal
            </button>

            <p style="margin-top:16px;background:#f8fafc;color:#475569;padding:12px;border-radius:12px;font-weight:700;font-size:13px">
              Emergency UAT login is active. This bypasses the React loading loop.
            </p>
          </form>
        </section>
      </main>
    `;

    document.getElementById("be-emergency-login-form").onsubmit = function (e) {
      e.preventDefault();

      var email = String(document.getElementById("be-emergency-email").value || "").trim().toLowerCase();
      var password = String(document.getElementById("be-emergency-password").value || "").trim();
      var err = document.getElementById("be-emergency-error");

      if (email !== EMAIL) {
        err.style.display = "block";
        err.textContent = "Use sai@britiumexpress.com for UAT.";
        return;
      }

      if (password !== PASSWORD) {
        err.style.display = "block";
        err.textContent = "Wrong UAT password.";
        return;
      }

      setSession(email);
      location.href = "/#/dashboard";
    };
  }

  function renderDashboard() {
    var r = root();
    if (!r) return;

    var cards = [
      ["Dashboard", "#/dashboard"],
      ["Create Delivery", "#/create-delivery"],
      ["CS Portal", "#/cs"],
      ["Way Management", "#/way-management"],
      ["Supervisor Hub", "#/supervisor"],
      ["Pickup Assignment", "#/pickup-assignment"],
      ["Data Entry", "#/data-entry"],
      ["Warehouse Ops", "#/warehouse"],
      ["Dispatch Center", "#/dispatch"],
      ["Branch Office", "#/branch"],
      ["Finance Portal", "#/finance"],
      ["COD Settlement", "#/cod-settlement"],
      ["Waybill & Invoice", "#/waybill-invoice"],
      ["Merchant Portal", "#/merchant"],
      ["Customer Portal", "#/customer"],
      ["Master Data", "#/master-data"],
      ["Exceptions", "#/exceptions"],
      ["Reporting", "#/reporting"],
      ["Tariff", "#/tariff"],
      ["Settings", "#/settings"],
      ["Profile", "#/profile"]
    ];

    r.innerHTML = `
      <main style="min-height:100vh;background:#061524;color:#eef8ff;font-family:Inter,system-ui,sans-serif;padding:24px">
        <div style="max-width:1180px;margin:0 auto">
          <header style="display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px">
            <div>
              <div style="color:#f59e0b;font-weight:900;letter-spacing:2px;font-size:12px">BRITIUM EXPRESS</div>
              <h1 style="margin:6px 0;font-size:34px">Enterprise Portal UAT</h1>
              <p style="color:#a8c4da;margin:0">Logged in as ${localStorage.getItem("be_user_email") || EMAIL} · superadmin · HQ</p>
            </div>
            <button id="be-emergency-logout" style="border:0;border-radius:12px;padding:12px 16px;background:#f97316;color:#fff;font-weight:900;cursor:pointer">
              Sign out
            </button>
          </header>

          <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
            ${cards.map(function (c) {
              return `
                <a href="${c[1]}" style="text-decoration:none;border:1px solid rgba(56,189,248,.28);background:rgba(8,20,36,.86);color:#eef8ff;border-radius:18px;padding:18px;min-height:90px;box-shadow:0 18px 55px rgba(0,0,0,.22)">
                  <div style="color:#fbbf24;font-weight:900;font-size:16px">${c[0]}</div>
                  <div style="color:#93c5fd;margin-top:8px;font-size:13px">${c[1]}</div>
                </a>
              `;
            }).join("")}
          </section>

          <section style="margin-top:24px;padding:18px;border:1px solid rgba(251,191,36,.35);background:rgba(251,191,36,.08);border-radius:18px;color:#fbbf24;font-weight:800">
            Emergency Enterprise shell is active. Login loop is stopped.
          </section>
        </div>
      </main>
    `;

    document.getElementById("be-emergency-logout").onclick = function () {
      localStorage.clear();
      sessionStorage.clear();
      location.href = "/#/login";
    };
  }

  function boot() {
    var hash = location.hash || "";

    if (hash.indexOf("/login") >= 0) {
      renderLogin();
      return;
    }

    if (hash.indexOf("/dashboard") >= 0 || hash === "" || hash === "#/" || hash === "#") {
      if (hasSession()) {
        renderDashboard();
      } else {
        location.href = "/#/login";
      }
      return;
    }

    if (hasSession()) {
      renderDashboard();
    } else {
      location.href = "/#/login";
    }
  }

  window.__beEmergencyBoot = boot;

  setTimeout(boot, 300);
  setTimeout(boot, 1500);
})();
