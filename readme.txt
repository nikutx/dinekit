=== DineKit ===
Contributors: weblevelup
Tags: restaurant menu, qr menu, food menu, allergen, restaurant
Requires at least: 6.0
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 1.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Beautiful restaurant menus with UK allergen support (Natasha's Law), printable QR table cards and opening hours. No dependencies, any theme.

== Description ==

DineKit gives restaurants, cafés and pubs everything they need to publish a proper menu on WordPress — free:

* **Menu builder** — menus (Lunch, Dinner, Drinks…), sections (Starters, Mains…), items with images, badges and multiple prices (pint/half, small/large).
* **UK allergen support built in** — the 14 regulated allergens pre-loaded with icons, tooltips and a printable allergen matrix. Natasha's Law friendly.
* **Dietary labels** — vegan, vegetarian, gluten free, halal and your own.
* **QR table cards** — print-ready QR codes that send guests straight to your live menu: download the vector SVG or print A6 table cards and A4 posters. Generated on your own site — no external service, no subscription.
* **Opening hours** — with holiday overrides and a live "open now" indicator.
* **SEO structured data** — Menu, MenuItem and LocalBusiness schema output automatically. Search engines read your menu.

No WooCommerce required. No external accounts. No page builder needed. Works with any theme, on any host.

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

== Development ==

DineKit is open source (GPLv2+). The complete human-readable source — including the React admin application and the build tooling used to generate the bundled `dist/main.js` — is publicly available and maintained at:

https://github.com/nikutx/dinekit

To build the admin app from source: `npm install` then `npm run build` (Vite). See the repository README for the full development setup.

== Screenshots ==

1. Your menu on any website — sections, prices, dietary labels and UK allergen icons, with a printable allergen matrix.
2. The drag-and-drop Menu Builder — add sections and dishes, reorder, and edit inline. Everything saves automatically.
3. Design & Preview — choose a layout and column count and see your menu live before you publish it.
4. The full dish editor — multiple prices, a photo, the UK-14 allergens, dietary labels and a badge.
5. Print-ready QR table cards and A4 posters that open your menu on a diner's phone.
6. Opening hours with holiday overrides and a live "open now" status.

== Changelog ==

= 1.1.0 =
* Commission-free table bookings: drag-and-drop floor plan with joinable tables, a public booking form (block + [dinekit_booking] shortcode) with live availability, waitlist, and covers-per-hour pacing.
* Booking diary with statuses, email notifications, and printable reservation slips.
* Set-menu events with per-guest pre-orders via a share link — guests choose their courses and flag allergens; the kitchen gets a consolidated prep sheet you can print.
* Guest CRM: repeat diners with the allergies they've told you about, carried across every visit.
* Dynamic dish customizations (removable ingredients + choose-your-options with prices).
* Integrations area for your own Stripe keys (you keep 100%).

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
