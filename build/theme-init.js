(function () {
  var storedTheme = null;
  try {
    storedTheme = localStorage.getItem("fixtxt-theme");
  } catch (error) {}
  document.documentElement.dataset.theme =
    storedTheme === "light" ? "light" : "dark";
})();
