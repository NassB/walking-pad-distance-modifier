(function () {
  const BANNER_ID = "wpdm-garmin-hint";
  const DISMISSED_KEY = "wpdm-hint-dismissed";

  if (document.getElementById(BANNER_ID)) {
    return;
  }

  if (sessionStorage.getItem(DISMISSED_KEY)) {
    return;
  }

  const banner = document.createElement("div");
  banner.id = BANNER_ID;
  banner.setAttribute("role", "status");
  banner.innerHTML = `
    <div class="wpdm-hint-body">
      <span class="wpdm-hint-icon">🏃</span>
      <div class="wpdm-hint-text">
        <strong>Walking Pad Distance Modifier</strong>
        <p>
          To adjust this activity's distance and upload it to Strava:
          open the activity menu <strong>⋮ → Export Original</strong> to download the
          <code>.fit</code> file, convert it to JSON at
          <a href="https://fitfiletools.com/convert" target="_blank" rel="noopener noreferrer">fitfiletools.com/convert</a>,
          then drag the JSON file into the extension.
        </p>
      </div>
      <button class="wpdm-hint-close" aria-label="Dismiss">&times;</button>
    </div>
  `;

  banner.querySelector(".wpdm-hint-close").addEventListener("click", () => {
    banner.remove();
    sessionStorage.setItem(DISMISSED_KEY, "1");
  });

  document.body.prepend(banner);
})();
