/**
 * Prestige AI Live Chat Widget Embed Script
 * Usage: <script src="https://yourdomain.com/widget.js" data-tenant-id="YOUR_TENANT_ID" async defer></script>
 */
(function () {
  if (window.PrestigeWidgetLoaded) return;
  window.PrestigeWidgetLoaded = true;

  var script =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();

  var tenantId =
    (script && script.getAttribute("data-tenant-id")) ||
    (window.prestigeSettings && window.prestigeSettings.tenantId) ||
    "t1";
  var position =
    (script && script.getAttribute("data-position")) ||
    (window.prestigeSettings && window.prestigeSettings.position) ||
    "bottom-right";
  var color =
    (script && script.getAttribute("data-color")) ||
    (window.prestigeSettings && window.prestigeSettings.color) ||
    "";
  var rawBase = (script && script.src) ? new URL(script.src).origin : window.location.origin;
  var apiBase =
    (script && script.getAttribute("data-api-base")) ||
    (window.prestigeSettings && window.prestigeSettings.apiBase) ||
    (!rawBase || rawBase === "null" || rawBase.indexOf("file:") === 0 ? "http://localhost:3000" : rawBase);

  var iframe = document.createElement("iframe");
  var src =
    apiBase +
    "/widget-embed?tenantId=" +
    encodeURIComponent(tenantId) +
    "&position=" +
    encodeURIComponent(position) +
    (color ? "&color=" + encodeURIComponent(color) : "");
  iframe.src = src;
  iframe.id = "prestige-widget-iframe";
  iframe.title = "Prestige Support Chat";
  iframe.allow = "camera; microphone; clipboard-write; autoplay;";
  iframe.style.position = "fixed";
  iframe.style.zIndex = "999999";
  iframe.style.border = "none";
  iframe.style.background = "transparent";
  iframe.style.colorScheme = "none";
  iframe.style.transition =
    "width 0.25s cubic-bezier(0.16, 1, 0.3, 1), height 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s ease";

  if (position === "bottom-left") {
    iframe.style.left = "16px";
    iframe.style.bottom = "16px";
  } else {
    iframe.style.right = "16px";
    iframe.style.bottom = "16px";
  }

  var closedWidth = "80px";
  var closedHeight = "80px";
  var openWidth = "420px";
  var openHeight = "670px";

  iframe.style.width = closedWidth;
  iframe.style.height = closedHeight;

  window.addEventListener("message", function (event) {
    if (!event.data || typeof event.data !== "object") return;
    if (event.data.type === "PRESTIGE_WIDGET_STATE") {
      if (event.data.open) {
        var isMobile = window.innerWidth < 480;
        iframe.style.width = isMobile ? "100%" : openWidth;
        iframe.style.height = isMobile ? "100%" : openHeight;
        iframe.style.maxWidth = isMobile ? "100%" : "calc(100vw - 32px)";
        iframe.style.maxHeight = isMobile ? "100%" : "calc(100vh - 32px)";
        iframe.style.borderRadius = isMobile ? "0px" : "24px";
        iframe.style.overflow = "hidden";
        if (isMobile) {
          iframe.style.bottom = "0";
          iframe.style.right = "0";
          iframe.style.left = "0";
        }
      } else {
        iframe.style.width = closedWidth;
        iframe.style.height = closedHeight;
        iframe.style.borderRadius = "50%";
        if (position === "bottom-left") {
          iframe.style.left = "16px";
          iframe.style.bottom = "16px";
          iframe.style.right = "auto";
        } else {
          iframe.style.right = "16px";
          iframe.style.bottom = "16px";
          iframe.style.left = "auto";
        }
      }
    }
  });

  if (document.body) {
    document.body.appendChild(iframe);
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      document.body.appendChild(iframe);
    });
  }
})();
