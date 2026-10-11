// The website chat widget. Put this on a page:
//
//   <script src="https://<your app>/widget.js" data-id="<widget id>" async></script>
//
// It adds a floating chat button. A click opens the chat, which is the
// app's hosted chat page (/chat/<id>) in a frame, so the website's own
// styles and scripts cannot reach into the conversation and the chat's
// cannot reach into the website.
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var id = script.getAttribute("data-id");
  if (!id) return;

  var origin;
  try {
    origin = new URL(script.src).origin;
  } catch (error) {
    return;
  }

  // Once per widget, also when the snippet was pasted twice
  var marker = "rxj-chat-widget-" + id;
  if (document.getElementById(marker)) return;

  var chatUrl = origin + "/chat/" + encodeURIComponent(id);

  function start(config) {
    var rtl = config.direction === "rtl";
    var color = /^#[0-9a-f]{6}$/i.test(config.color || "") ? config.color : "#2563eb";
    // Right to left pages have their chat button on the left
    var side = rtl ? "left" : "right";

    var container = document.createElement("div");
    container.id = marker;
    container.style.cssText = "position:fixed;bottom:20px;" + side + ":20px;z-index:2147483000;";

    var frame = document.createElement("iframe");
    frame.title = config.title || "Chat";
    frame.setAttribute("loading", "lazy");
    frame.style.cssText =
      "display:none;position:fixed;bottom:88px;" +
      side +
      ":20px;width:380px;max-width:calc(100vw - 24px);height:560px;max-height:calc(100vh - 110px);" +
      "border:0;border-radius:14px;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.22);z-index:2147483000;";

    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", config.title || "Chat");
    button.setAttribute("aria-expanded", "false");
    button.style.cssText =
      "width:56px;height:56px;border:0;border-radius:50%;cursor:pointer;color:#fff;" +
      "box-shadow:0 6px 20px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;" +
      "background:" +
      color +
      ";";
    button.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

    var open = false;

    function fit() {
      // A phone gets the chat over the whole screen
      if (window.innerWidth < 480) {
        frame.style.width = "100vw";
        frame.style.maxWidth = "100vw";
        frame.style.height = "100%";
        frame.style.maxHeight = "100%";
        frame.style.bottom = "0";
        frame.style[side] = "0";
        frame.style.borderRadius = "0";
      } else {
        frame.style.width = "380px";
        frame.style.maxWidth = "calc(100vw - 24px)";
        frame.style.height = "560px";
        frame.style.maxHeight = "calc(100vh - 110px)";
        frame.style.bottom = "88px";
        frame.style[side] = "20px";
        frame.style.borderRadius = "14px";
      }
    }

    function setOpen(value) {
      open = value;

      // The page is only loaded when the chat is first opened
      if (open && !frame.src) frame.src = chatUrl;

      fit();
      frame.style.display = open ? "block" : "none";
      button.setAttribute("aria-expanded", open ? "true" : "false");
    }

    button.addEventListener("click", function () {
      setOpen(!open);
    });

    window.addEventListener("resize", function () {
      if (open) fit();
    });

    // The chat's own close button
    window.addEventListener("message", function (event) {
      if (event.origin !== origin || event.source !== frame.contentWindow) return;
      if (event.data && event.data.type === "rxj-chat:close" && event.data.id === id) {
        setOpen(false);
      }
    });

    container.appendChild(button);
    document.body.appendChild(frame);
    document.body.appendChild(container);
  }

  function load() {
    // Not there, switched off, or this site is not on its allowed list:
    // no button is shown
    fetch(origin + "/api/chat/" + encodeURIComponent(id) + "/config")
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (config) {
        if (config && config.id) start(config);
      })
      .catch(function () {});
  }

  if (document.body) load();
  else document.addEventListener("DOMContentLoaded", load);
})();
