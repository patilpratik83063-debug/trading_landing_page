/* ==========================================================================
   DEMONFX — checkout page behaviour
   The browser never sees payment credentials. Clicking "Pay" asks the server
   to create a Stripe Checkout Session and redirects to Stripe's hosted page.
   ========================================================================== */
(function () {
  "use strict";

  var form = document.getElementById("checkout-form");
  if (!form) return;

  var config = window.DEMONFX || {};
  var status = document.getElementById("checkout-status");
  var button = document.getElementById("pay-button");
  var notice = document.getElementById("checkout-notice");

  function setStatus(message, state) {
    if (!status) return;
    status.textContent = message;
    status.classList.remove("is-error", "is-success", "is-pending");
    status.classList.add("is-visible", state);
  }

  function showNotice() {
    if (notice) notice.classList.add("is-visible");
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var email = form.querySelector('[name="email"]');
    var name = form.querySelector('[name="name"]');
    var terms = form.querySelector('[name="terms"]');

    if (!name || !name.value.trim()) {
      setStatus("Please enter the name for the enrolment.", "is-error");
      if (name) name.focus();
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) {
      setStatus("Please enter a valid email address for your receipt.", "is-error");
      if (email) email.focus();
      return;
    }
    if (terms && !terms.checked) {
      setStatus("Please confirm you have read the terms and risk disclosure.", "is-error");
      terms.focus();
      return;
    }

    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }
    setStatus("Opening Stripe's secure checkout…", "is-pending");

    fetch(config.checkoutEndpoint || "/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.value.trim(),
        email: email.value.trim()
      })
    })
      .then(function (response) {
        return response.json().then(function (body) {
          return { ok: response.ok, status: response.status, body: body };
        });
      })
      .then(function (result) {
        if (result.ok && result.body && result.body.url) {
          window.location.assign(result.body.url);
          return;
        }
        if (result.status === 501 || result.status === 503 || result.status === 404) {
          showNotice();
          setStatus(
            "Checkout is not connected yet. Add the payment credentials described in the README, then retry.",
            "is-error"
          );
          return;
        }
        throw new Error((result.body && result.body.message) || "Checkout could not start.");
      })
      .catch(function (error) {
        setStatus(
          (error && error.message ? error.message : "Checkout could not start.") +
            " Nothing has been charged. Please try again or contact support.",
          "is-error"
        );
      })
      .finally(function () {
        if (button) {
          button.disabled = false;
          button.removeAttribute("aria-busy");
        }
      });
  });
})();
