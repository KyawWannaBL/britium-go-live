(function () {
  function clearAuthStorage() {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {}
  }

  window.setTimeout(function () {
    var text = (document.body && document.body.innerText) || "";
    var hash = window.location.hash || "";
    var path = window.location.pathname || "";

    if (text.indexOf("Checking session") >= 0 && hash.indexOf("/login") < 0) {
      clearAuthStorage();
      window.location.href = "/#/login?session_rescue=1";
      return;
    }

    if ((path === "/login" || path === "/") && hash === "" && text.trim() === "") {
      window.location.href = "/#/login";
    }
  }, 3000);
})();
