=== DineKit ===
Contributors: weblevelup
Tags: restaurant menu, qr menu, food menu, allergen, restaurant
Requires at least: 6.0
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 1.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Run your restaurant on WordPress — menus & allergens, online ordering, table bookings and card payments. Commission-free, no monthly fees.

== Description ==

DineKit turns WordPress into a complete, commission-free restaurant platform — menus, online ordering, table bookings and card payments — with nothing to pay per cover, per order or per month. You bring your own Stripe account and keep 100% of every sale.

**Menus & allergens**

* **Menu builder** — menus (Lunch, Dinner, Drinks…), sections and dishes with photos, badges and multiple prices; six templates; drag-and-drop ordering with autosave.
* **UK-14 allergens built in** — the 14 regulated allergens pre-loaded with icons, tooltips and a printable matrix (Natasha's Law friendly), plus your own dietary labels.
* **QR table cards** and A4 posters that open your live menu on a phone, and **Menu / MenuItem / LocalBusiness schema.org** output for SEO.
* **Opening hours** with holiday overrides and a live "open now" status.

**Online ordering**

* **Takeaway, collection and delivery** ordering with a diner-facing menu, dish customizations (removable ingredients, choose-your-options with prices) and printable **kitchen/bar tickets**.
* **Contactless QR "order at the table"** so diners order from their phone.

**Bookings & events**

* **Commission-free table bookings** — a drag-and-drop floor plan with joinable tables, a public booking form (block + `[dinekit_booking]` shortcode) with live availability, waitlist and covers-per-hour pacing, deposits, and a booking diary with email notifications and printable slips.
* **Set-menu events with per-guest pre-orders** via a share link — guests choose their courses and flag allergens; the kitchen gets a consolidated prep sheet.

**Payments, guests & staff**

* **Card payments with your own Stripe keys** (encrypted at rest) — booking deposits and order payments, Apple Pay and Google Pay. You keep 100%.
* **Guest CRM** — repeat-visit history with the allergies diners have told you about, carried across every visit.
* **Staff logins** with a role-to-permission matrix and an activity/audit log, plus review-request emails to win diners back.

No WooCommerce required and no page builder needed. The menu, allergens and QR codes work with no external accounts; card payments use your own Stripe account (see External Services below). Works with any theme, on any host.

Built by [Web Level Up](https://weblevelup.co.uk/), a UK web agency that builds commercial WordPress software.

== Frequently Asked Questions ==

= Does DineKit need WooCommerce? =
No. DineKit has zero dependencies.

= Is it really free? =
Yes — everything listed above is free. No feature-gating of allergen icons, schema or QR codes.

= Does it work with my theme? =
Yes. Menu output is self-contained with its own scoped styles, and works on both block and classic themes.

= How do diners see the menu? =
Add the DineKit Menu block (or the [dinekit_menu] shortcode) to any page. You can also print a QR code for your tables that opens the menu on a phone.

== External services ==

DineKit's optional payments feature (booking deposits and online order payments) uses **Stripe** to take card payments. Stripe is contacted only after you enable it and enter your own Stripe API keys under DineKit → Integrations, and only on requests that involve a payment:

* When a diner pays, DineKit asks Stripe to create a payment by sending the amount, currency, your site URL and the related booking/order reference to Stripe's API (https://api.stripe.com).
* When you connect Stripe or set up its webhook, DineKit calls Stripe to validate your keys and register payment notifications.
* On pages where a payment can be made, Stripe's official Stripe.js library is loaded from https://js.stripe.com so card details are entered directly with Stripe and never reach your server (PCI SAQ-A).

If you do not enable payments, DineKit makes no external requests. Stripe is a third-party service; by using it you agree to Stripe's terms and privacy policy:

* Terms: https://stripe.com/legal
* Privacy: https://stripe.com/privacy

== Development ==

DineKit is open source (GPLv2+). The complete human-readable source — including the React admin application and the build tooling used to generate the bundled `dist/main.js` — is publicly available and maintained at:

https://github.com/nikutx/dinekit

To build the admin app from source: `npm install` then `npm run build` (Vite). See the repository README for the full development setup.

== Screenshots ==

1. Your menu on any website — sections, prices, dietary filters and UK-14 allergen icons.
2. The Menu Builder — sections and dishes with photos, allergens and multiple prices. Everything autosaves.
3. Design & Preview — six templates plus layout and colour controls, with a live preview and a copy-paste shortcode.
4. Commission-free online ordering for diners — takeaway, collection and delivery, straight from your own site.
5. The live orders board — takeaway, collection and delivery in one place, with kitchen tickets. You keep 100%.
6. The public table-booking form — live availability, party size and deposits, as a block or shortcode.
7. Reports — covers, revenue, no-show rate and your best-selling dishes.
8. Set-menu events with per-guest pre-orders via a share link, and a consolidated kitchen prep sheet.

== Changelog ==

= 1.1.0 =
* Commission-free online ordering — takeaway, collection and delivery, with a diner-facing menu, dish customizations, and printable kitchen/bar tickets.
* Contactless QR "order at the table".
* Commission-free table bookings: drag-and-drop floor plan with joinable tables, a public booking form (block + [dinekit_booking] shortcode) with live availability, waitlist, covers-per-hour pacing and deposits.
* Booking diary with statuses, email notifications, and printable reservation slips.
* Set-menu events with per-guest pre-orders via a share link — guests choose their courses and flag allergens; the kitchen gets a consolidated prep sheet you can print.
* Card payments with your own Stripe keys (encrypted at rest) — booking deposits and order payments, Apple Pay and Google Pay. You keep 100%.
* Guest CRM: repeat diners with the allergies they've told you about, carried across every visit.
* Staff logins with a role-to-permission matrix and an activity/audit log; review-request emails to win diners back.
* Dynamic dish customizations (removable ingredients + choose-your-options with prices), six menu templates and colour theming.

= 1.0.0 =
* First public release.
* Menu builder with menus, sections and items — photos, badges and multiple prices per item, drag-and-drop ordering, inline editing with autosave.
* UK-14 regulated allergens pre-loaded with icons, tooltips and a printable allergen matrix (Natasha's Law friendly).
* Dietary labels (vegan, vegetarian, gluten free, halal, spicy — and your own).
* DineKit Menu block and [dinekit_menu] shortcode with three layouts (list, card grid, chalkboard) and 1–4 column options.
* Design & Preview screen to choose a style and copy the shortcode.
* Print-ready QR table cards and A4 posters that open your menu on a phone.
* Opening hours with holiday overrides and a live open/closed status.
* Menu, MenuItem and LocalBusiness schema.org output for SEO.
* Works with block and classic themes. No dependencies.
