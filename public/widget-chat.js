// The chat on the hosted chat page (/chat/<id>), which is also what the
// website widget shows in its frame. Plain JavaScript, no dependencies.
// Everything a visitor or the bot wrote is put on the page as text
// (textContent), never as HTML.
(function () {
  "use strict";

  var root = document.getElementById("rxj-chat");
  var configElement = document.getElementById("rxj-chat-config");
  if (!root || !configElement) return;

  var config;
  try {
    config = JSON.parse(configElement.textContent || "{}");
  } catch (error) {
    return;
  }

  var api = "/api/chat/" + encodeURIComponent(config.id);
  var embedded = window.parent !== window;

  var POLL_INTERVAL_MS = 1000;
  // After this the visitor is told the answer is taking too long
  var POLL_LIMIT_MS = 120000;

  // ------------------------------------------------------------- session
  // Each visitor has an id of their own, kept in their browser, so the
  // workflow's Buffer Memory remembers one conversation per visitor.
  // Storage can be switched off or blocked (private windows, a frame on
  // another site): the chat then works for as long as the page is open.
  var storageKey = "rxj-chat-session:" + config.id;
  var memorySession = null;

  function readStored() {
    try {
      return window.localStorage.getItem(storageKey);
    } catch (error) {
      return null;
    }
  }

  function writeStored(value) {
    try {
      window.localStorage.setItem(storageKey, value);
    } catch (error) {
      // Kept in memory only
    }
  }

  function newSessionId() {
    var bytes = new Uint8Array(16);

    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var index = 0; index < bytes.length; index++) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }

    var id = "";
    for (var position = 0; position < bytes.length; position++) {
      id += ("0" + bytes[position].toString(16)).slice(-2);
    }

    return id;
  }

  function getSessionId() {
    if (memorySession) return memorySession;

    var stored = readStored();

    if (!stored || !/^[A-Za-z0-9_-]{16,64}$/.test(stored)) {
      stored = newSessionId();
      writeStored(stored);
    }

    memorySession = stored;
    return stored;
  }

  function resetSession() {
    memorySession = newSessionId();
    writeStored(memorySession);
  }

  // ------------------------------------------------------------------ page
  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  if (/^#[0-9a-f]{6}$/i.test(config.color || "")) {
    root.style.setProperty("--rxj-color", config.color);
  }

  var header = element("div", "rxj-header");

  if (config.avatarUrl) {
    var avatar = element("img", "rxj-avatar");
    avatar.alt = "";
    avatar.referrerPolicy = "no-referrer";
    avatar.src = config.avatarUrl;
    avatar.onerror = function () {
      avatar.hidden = true;
    };
    header.appendChild(avatar);
  }

  header.appendChild(element("div", "rxj-title", config.title || "Chat"));

  var newChatButton = element("button", "", "New chat");
  newChatButton.type = "button";
  header.appendChild(newChatButton);

  if (embedded) {
    var closeButton = element("button", "", "✕");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close chat");
    closeButton.onclick = function () {
      // widget.js on the website closes the frame
      window.parent.postMessage({ type: "rxj-chat:close", id: config.id }, "*");
    };
    header.appendChild(closeButton);
  }

  var list = element("div", "rxj-messages");
  list.setAttribute("role", "log");
  list.setAttribute("aria-live", "polite");

  var typing = element("div", "rxj-typing");
  typing.setAttribute("aria-label", "The assistant is typing");
  typing.appendChild(element("span"));
  typing.appendChild(element("span"));
  typing.appendChild(element("span"));
  typing.hidden = true;

  var footer = element("div", "rxj-footer");
  var form = element("form", "rxj-form");
  var input = element("textarea");
  input.rows = 1;
  input.maxLength = 4000;
  input.dir = "auto";
  input.placeholder = config.direction === "rtl" ? "پیغام لکھیں..." : "Type a message...";
  input.setAttribute("aria-label", "Message");
  var sendButton = element("button", "", config.direction === "rtl" ? "بھیجیں" : "Send");
  sendButton.type = "submit";
  form.appendChild(input);
  form.appendChild(sendButton);
  footer.appendChild(form);

  var handoffButton = null;
  var handoffForm = null;
  var handoffInput = null;

  if (config.handoffLabel) {
    handoffButton = element("button", "rxj-handoff", config.handoffLabel);
    handoffButton.type = "button";

    handoffForm = element("form", "rxj-handoff-form");
    handoffForm.hidden = true;
    handoffInput = element("input");
    handoffInput.type = "text";
    handoffInput.maxLength = 200;
    handoffInput.dir = "auto";
    handoffInput.placeholder = "Your email or phone (optional)";
    handoffInput.setAttribute("aria-label", "How can we reach you?");
    var handoffSubmit = element("button", "", config.handoffLabel);
    handoffSubmit.type = "submit";
    handoffForm.appendChild(handoffInput);
    handoffForm.appendChild(handoffSubmit);

    footer.appendChild(handoffButton);
    footer.appendChild(handoffForm);
  }

  root.appendChild(header);
  root.appendChild(list);
  root.appendChild(footer);

  // -------------------------------------------------------------- messages
  var busy = false;
  var paused = false;

  function scrollDown() {
    list.scrollTop = list.scrollHeight;
  }

  function addMessage(kind, text) {
    var bubble = element("div", "rxj-message rxj-" + kind, text);
    // The direction of its own text, whatever the chat's direction is
    bubble.dir = "auto";
    list.insertBefore(bubble, typing.parentNode === list ? typing : null);
    scrollDown();
    return bubble;
  }

  function setBusy(value) {
    busy = value;
    sendButton.disabled = value;
    typing.hidden = !value;
    if (value) {
      list.appendChild(typing);
      scrollDown();
    }
  }

  function setPaused() {
    paused = true;
    if (handoffButton) handoffButton.hidden = true;
    if (handoffForm) handoffForm.hidden = true;
  }

  function showWelcome() {
    if (config.welcomeMessage) addMessage("bot", config.welcomeMessage);
  }

  function request(path, options) {
    return fetch(api + path, options).then(function (response) {
      return response
        .json()
        .catch(function () {
          return {};
        })
        .then(function (body) {
          return { ok: response.ok, status: response.status, body: body };
        });
    });
  }

  // Asks for the answer until the run has finished. The server does not
  // stream the answer, so the typing indicator is shown meanwhile.
  function waitForReply(executionId, token) {
    var startedAt = Date.now();
    var path =
      "/messages/" +
      encodeURIComponent(executionId) +
      "?session=" +
      encodeURIComponent(getSessionId()) +
      "&token=" +
      encodeURIComponent(token);

    function ask() {
      request(path, { cache: "no-store" })
        .then(function (result) {
          if (result.body.status === "done") {
            setBusy(false);
            addMessage("bot", result.body.reply);
            return;
          }

          if (result.body.status === "failed" || (!result.ok && result.status !== 500)) {
            setBusy(false);
            addMessage("error", "Sorry, something went wrong. Please try again.");
            return;
          }

          again();
        })
        .catch(again);
    }

    function again() {
      if (Date.now() - startedAt > POLL_LIMIT_MS) {
        setBusy(false);
        addMessage("error", "The answer is taking too long. Please try again in a moment.");
        return;
      }

      window.setTimeout(ask, POLL_INTERVAL_MS);
    }

    ask();
  }

  function send(text) {
    if (busy || !text) return;

    addMessage("user", text);
    setBusy(true);

    request("/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: getSessionId(), message: text }),
    })
      .then(function (result) {
        if (!result.ok || !result.body.success) {
          setBusy(false);
          addMessage(
            "error",
            result.status === 429
              ? "You are sending messages too quickly. Please wait a moment."
              : result.body.error || "The message could not be sent. Try again."
          );
          return;
        }

        if (result.body.paused) {
          setBusy(false);
          setPaused();
          addMessage("note", result.body.reply);
          return;
        }

        waitForReply(result.body.executionId, result.body.token);
      })
      .catch(function () {
        setBusy(false);
        addMessage("error", "The message could not be sent. Check your connection.");
      });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text || busy) return;
    input.value = "";
    send(text);
  });

  // Enter sends; Shift+Enter makes a new line
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit ? form.requestSubmit() : sendButton.click();
    }
  });

  if (handoffButton && handoffForm) {
    handoffButton.addEventListener("click", function () {
      handoffForm.hidden = !handoffForm.hidden;
      if (!handoffForm.hidden) handoffInput.focus();
    });

    handoffForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (busy || paused) return;

      setBusy(true);

      request("/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: getSessionId(), contact: handoffInput.value }),
      })
        .then(function (result) {
          setBusy(false);

          if (!result.ok || !result.body.success) {
            addMessage("error", result.body.error || "The request could not be sent. Try again.");
            return;
          }

          setPaused();
          addMessage("note", "Your conversation was passed to a person. They will get back to you.");
        })
        .catch(function () {
          setBusy(false);
          addMessage("error", "The request could not be sent. Check your connection.");
        });
    });
  }

  newChatButton.addEventListener("click", function () {
    if (busy) return;

    // A new id: the bot starts without the earlier conversation, and a
    // conversation that was passed to a person stays with them
    resetSession();
    paused = false;
    list.textContent = "";
    if (handoffButton) handoffButton.hidden = false;
    showWelcome();
  });

  // ------------------------------------------------------------- start-up
  // A returning visitor sees their conversation again
  request("/messages?session=" + encodeURIComponent(getSessionId()), { cache: "no-store" })
    .then(function (result) {
      var messages = (result.ok && result.body.messages) || [];

      showWelcome();

      for (var index = 0; index < messages.length; index++) {
        addMessage(messages[index].role === "user" ? "user" : "bot", messages[index].content);
      }

      if (result.ok && result.body.paused) {
        setPaused();
        addMessage("note", "This conversation was passed to a person. They will get back to you.");
      }
    })
    .catch(showWelcome);
})();
