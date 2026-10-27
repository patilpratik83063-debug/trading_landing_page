/* ==========================================================================
   DEMONFX — shared interactions
   Nav, mobile menu, scroll reveals, accordions, lesson previews,
   enquiry forms and cookie-consent-gated analytics.
   ========================================================================== */
(function () {
  "use strict";

  var doc = document;
  var config = window.DEMONFX || {};
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------ Nav ----------------------------------- */
  var nav = doc.querySelector(".nav");
  var burger = doc.querySelector(".nav__burger");
  var menu = doc.querySelector(".menu");

  function setMenu(open) {
    if (!nav || !burger || !menu) return;
    nav.classList.toggle("is-open", open);
    menu.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    doc.documentElement.style.overflow = open ? "hidden" : "";
    if (open) {
      var first = menu.querySelector("a");
      if (first) first.focus({ preventScroll: true });
    } else {
      burger.focus({ preventScroll: true });
    }
  }

  if (burger && menu) {
    burger.addEventListener("click", function () {
      setMenu(!menu.classList.contains("is-open"));
    });
    menu.addEventListener("click", function (event) {
      if (event.target.closest("a")) setMenu(false);
    });
    doc.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && menu.classList.contains("is-open")) {
        setMenu(false);
      }
    });
    window.matchMedia("(min-width: 1081px)").addEventListener("change", function (event) {
      if (event.matches && menu.classList.contains("is-open")) setMenu(false);
    });
  }

  var navTicking = false;
  function syncNav() {
    if (nav) nav.classList.toggle("is-scrolled", window.scrollY > 24);
    navTicking = false;
  }
  window.addEventListener(
    "scroll",
    function () {
      if (!navTicking) {
        navTicking = true;
        window.requestAnimationFrame(syncNav);
      }
    },
    { passive: true }
  );
  syncNav();

  /* --------------------------- Scroll reveal ----------------------------- */
  var revealItems = doc.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window && !reduceMotion && revealItems.length) {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    revealItems.forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    revealItems.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  /* --------------------------- Accordions -------------------------------- */
  // Generic open/close pair used by curriculum modules and FAQ rows.
  function initAccordion(itemSelector, triggerSelector, panelSelector, singleOpen) {
    var items = Array.prototype.slice.call(doc.querySelectorAll(itemSelector));
    if (!items.length) return;

    items.forEach(function (item) {
      var trigger = item.querySelector(triggerSelector);
      var panel = item.querySelector(panelSelector);
      if (!trigger || !panel) return;

      panel.inert = !item.classList.contains("is-open");
      trigger.setAttribute("aria-expanded", item.classList.contains("is-open") ? "true" : "false");

      trigger.addEventListener("click", function () {
        var willOpen = !item.classList.contains("is-open");

        if (singleOpen && willOpen) {
          items.forEach(function (other) {
            if (other !== item) closeItem(other);
          });
        }

        if (willOpen) openItem(item);
        else closeItem(item);
      });
    });

    function openItem(item) {
      var p = item.querySelector(panelSelector);
      var t = item.querySelector(triggerSelector);
      item.classList.add("is-open");
      if (p) p.inert = false;
      if (t) t.setAttribute("aria-expanded", "true");
    }

    function closeItem(item) {
      var p = item.querySelector(panelSelector);
      var t = item.querySelector(triggerSelector);
      item.classList.remove("is-open");
      if (p) p.inert = true;
      if (t) t.setAttribute("aria-expanded", "false");
    }
  }

  initAccordion(".module", ".module__trigger", ".module__panel", false);
  initAccordion(".faq-item", ".faq-item__trigger", ".faq-item__panel", true);

  /* ------------------------- Lesson previews ----------------------------- */
  var previewData = {
    "what-moves-forex": {
      title: "What actually moves a currency pair",
      meta: ["Module 01", "Foundations", "12 min"],
      summary:
        "Most beginners watch price without asking why it moved. This lesson builds the mental model: a currency pair is a relative price, so you are always trading one economy against another.",
      points: [
        "Who participates in the FX market — banks, funds, corporates, retail.",
        "Interest rate expectations and central-bank language, translated plainly.",
        "Why news releases create volatility, and why that is not a signal by itself.",
        "The difference between liquidity, volatility and direction."
      ],
      takeaway:
        "After this lesson you can explain why a pair moved using macro context instead of a single indicator."
    },
    "candle-anatomy": {
      title: "Anatomy of a candlestick",
      meta: ["Module 02", "Price reading", "14 min"],
      summary:
        "A candlestick records four prices and one story: who was in control during that period, and where the fight ended. We break the candle down without mysticism.",
      points: [
        "Open, high, low, close — and what each one represents.",
        "Body versus wick: participation, rejection and indecision.",
        "Timeframe context: the same candle means different things on H1 and D1.",
        "The three candle patterns worth learning first, and the ones to ignore."
      ],
      takeaway:
        "You will stop memorising pattern names and start reading intent behind a candle."
    },
    "trade-plan": {
      title: "Building a written trade plan",
      meta: ["Module 05", "Strategy", "18 min"],
      summary:
        "A trade plan is the difference between a decision and an impulse. This lesson shows the one-page template used throughout the course.",
      points: [
        "The four questions every entry must answer before risk is committed.",
        "Defining invalidation first, then target — never the other way round.",
        "Position sizing examples with a 1% risk model on a sample account.",
        "How to log the plan so it can be reviewed objectively later."
      ],
      takeaway:
        "You leave with a fill-in-the-blank plan you can apply to any setup you study."
    },
    "risk-math": {
      title: "Risk maths: why 1% is not a suggestion",
      meta: ["Module 06", "Risk", "16 min"],
      summary:
        "Risk management is arithmetic, not attitude. We work through drawdown recovery, position sizing and the cost of one oversized trade.",
      points: [
        "How a 20% drawdown requires a 25% gain just to return to even.",
        "Converting stop distance into lot size with a worked example.",
        "Correlation: why three 'different' trades can be one big risk.",
        "A simple daily and weekly loss limit that protects decision quality."
      ],
      takeaway:
        "You can size any trade from your stop distance and account risk in under a minute."
    }
  };

  var dialog = doc.getElementById("lesson-dialog");
  var dialogTitle = doc.getElementById("lesson-dialog-title");
  var dialogMeta = doc.getElementById("lesson-dialog-meta");
  var dialogBody = doc.getElementById("lesson-dialog-body");
  var dialogClose = doc.getElementById("lesson-dialog-close");
  var lastTrigger = null;

  function openPreview(key, trigger) {
    var data = previewData[key];
    if (!dialog || !data) return;
    lastTrigger = trigger || null;

    if (dialogTitle) dialogTitle.textContent = data.title;
    if (dialogMeta) {
      dialogMeta.innerHTML = "";
      data.meta.forEach(function (label) {
        var tag = doc.createElement("span");
        tag.className = "tag";
        tag.textContent = label;
        dialogMeta.appendChild(tag);
      });
    }
    if (dialogBody) {
      dialogBody.innerHTML = "";
      var p = doc.createElement("p");
      p.textContent = data.summary;
      dialogBody.appendChild(p);
      var list = doc.createElement("ul");
      data.points.forEach(function (point) {
        var li = doc.createElement("li");
        li.textContent = point;
        list.appendChild(li);
      });
      dialogBody.appendChild(list);
      var takeaway = doc.createElement("p");
      takeaway.innerHTML =
        "<strong style=\"color:var(--gold-soft)\">Takeaway.</strong> " + data.takeaway;
      dialogBody.appendChild(takeaway);
    }

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      doc.documentElement.style.overflow = "hidden";
    }
  }

  function closePreview() {
    if (!dialog || !dialog.open) return;
    dialog.close();
    doc.documentElement.style.overflow = "";
    if (lastTrigger) lastTrigger.focus({ preventScroll: true });
  }

  doc.querySelectorAll("[data-preview]").forEach(function (button) {
    button.addEventListener("click", function () {
      openPreview(button.getAttribute("data-preview"), button);
    });
  });

  if (dialog) {
    if (dialogClose) dialogClose.addEventListener("click", closePreview);
    dialog.addEventListener("click", function (event) {
      var rect = dialog.getBoundingClientRect();
      var outside =
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom;
      if (outside) closePreview();
    });
    dialog.addEventListener("close", function () {
      doc.documentElement.style.overflow = "";
      if (lastTrigger) lastTrigger.focus({ preventScroll: true });
    });
  }

  /* --------------------------- Enquiry forms ----------------------------- */
  function showStatus(el, message, state) {
    if (!el) return;
    el.textContent = message;
    el.classList.remove("is-error", "is-success", "is-pending");
    el.classList.add("is-visible", state);
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  doc.querySelectorAll("[data-enquiry-form]").forEach(function (form) {
    var status = form.querySelector(".form__status");
    var submit = form.querySelector('[type="submit"]');

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var name = form.querySelector('[name="name"]');
      var email = form.querySelector('[name="email"]');
      var topic = form.querySelector('[name="topic"]');
      var message = form.querySelector('[name="message"]');
      var consent = form.querySelector('[name="consent"]');

      if (!name || !name.value.trim()) {
        showStatus(status, "Please add your name so we can reply properly.", "is-error");
        if (name) name.focus();
        return;
      }
      if (!email || !validEmail(email.value.trim())) {
        showStatus(status, "Please enter a valid email address.", "is-error");
        if (email) email.focus();
        return;
      }
      if (!message || message.value.trim().length < 10) {
        showStatus(status, "Please add a little more detail to your question.", "is-error");
        if (message) message.focus();
        return;
      }
      if (consent && !consent.checked) {
        showStatus(status, "Please confirm we may reply to you by email.", "is-error");
        consent.focus();
        return;
      }

      var payload = {
        name: name.value.trim(),
        email: email.value.trim(),
        topic: topic ? topic.value : "Course enquiry",
        message: message.value.trim(),
        source: window.location.pathname
      };

      if (submit) {
        submit.disabled = true;
        submit.setAttribute("aria-busy", "true");
      }
      showStatus(status, "Sending your question…", "is-pending");

      fetch(config.enquiryEndpoint || "/api/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          return response.json().then(function (body) {
            return { ok: response.ok, body: body };
          });
        })
        .then(function (result) {
          if (!result.ok || !result.body || !result.body.ok) {
            throw new Error((result.body && result.body.message) || "Enquiry could not be sent.");
          }
          form.reset();
          showStatus(
            status,
            "Thank you — your question is in. We reply to course enquiries within two business days.",
            "is-success"
          );
          track("enquiry_submitted", { topic: payload.topic });
        })
        .catch(function () {
          var email = config.supportEmail || "hello@demonfx.com";
          showStatus(
            status,
            "We could not send that automatically. Please email " +
              email +
              " and we will reply within two business days.",
            "is-error"
          );
        })
        .finally(function () {
          if (submit) {
            submit.disabled = false;
            submit.removeAttribute("aria-busy");
          }
        });
    });
  });

  /* ------------------------- Consent & analytics -------------------------- */
  var STORAGE_KEY = "demonfx.consent.v1";
  var banner = doc.getElementById("consent");
  var analyticsLoaded = false;

  function readConsent() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      return null;
    }
  }

  function writeConsent(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (err) {
      /* Storage can be blocked; consent still applies for this page view. */
    }
  }

  function loadAnalytics() {
    if (analyticsLoaded) return;
    analyticsLoaded = true;
    var cfg = config.analytics || {};
    if (!cfg.measurementId || cfg.measurementId.indexOf("XXXX") !== -1) {
      // Placeholder ID: nothing is loaded and no third-party request is made.
      return;
    }
    if (cfg.provider === "ga4") {
      var script = doc.createElement("script");
      script.async = true;
      script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(cfg.measurementId);
      doc.head.appendChild(script);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };
      window.gtag("js", new Date());
      window.gtag("config", cfg.measurementId, { anonymize_ip: true });
    }
  }

  function track(event, params) {
    if (readConsent() !== "granted") return;
    if (typeof window.gtag === "function") {
      window.gtag("event", event, params || {});
    }
  }
  window.demonfxTrack = track;

  if (banner) {
    var stored = readConsent();
    if (stored === "granted") loadAnalytics();
    if (!stored) {
      window.setTimeout(function () {
        banner.classList.add("is-visible");
      }, 1200);
    }

    var accept = banner.querySelector("[data-consent=accept]");
    var essential = banner.querySelector("[data-consent=essential]");
    var dismiss = function (value) {
      writeConsent(value);
      banner.classList.remove("is-visible");
      if (value === "granted") loadAnalytics();
    };
    if (accept) accept.addEventListener("click", function () { dismiss("granted"); });
    if (essential) essential.addEventListener("click", function () { dismiss("essential"); });
  }

  /* ------------------------- Small niceties ------------------------------ */
  doc.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });
})();
