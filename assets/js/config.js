/* ==========================================================================
   DEMONFX — site configuration
   Everything in this file is safe to expose in the browser. Never add API
   keys, Stripe secrets or email credentials here — those live server-side in
   environment variables (see README.md).

   Replace the placeholder values marked TODO before launch.
   ========================================================================== */
window.DEMONFX = {
  brand: "Demonfx",
  // TODO: replace with the monitored support inbox.
  supportEmail: "hello@demonfx.com",
  enquiryEndpoint: "/api/enquiry",
  checkoutEndpoint: "/api/checkout",

  // Analytics stays dormant until a real ID is provided AND the visitor
  // accepts analytics in the consent banner. The "XXXX" placeholder blocks
  // any third-party request from being made.
  analytics: {
    provider: "ga4", // TODO: "ga4" or remove to disable
    measurementId: "G-XXXXXXXXXX" // TODO: replace with the real measurement ID
  }
};
