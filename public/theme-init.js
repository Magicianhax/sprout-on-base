(function () {
  try {
    var raw = localStorage.getItem("sprout_preferences");
    var prefs = raw ? JSON.parse(raw) : null;
    if (prefs && prefs.darkMode === true) {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {
    // localStorage unavailable — fall back to light mode.
  }
})();
