=== DineKit – Restaurant Menu, Online Ordering, Table Reservations & POS ===
Contributors: weblevelup
Tags: restaurant menu, online ordering, restaurant reservations, qr menu, allergen
Requires at least: 6.0
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 1.2.14
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Run your restaurant on WordPress — menus & allergens, online ordering, table bookings and card payments. Commission-free, no monthly fees.

== Description ==

DineKit turns WordPress into a complete, commission-free restaurant platform — menus, online ordering, table bookings and card payments — with nothing to pay per cover, per order or per month. You bring your own Stripe account and keep 100% of every sale.

**Menus & allergens**

* **Menu builder** — menus (Lunch, Dinner, Drinks…), sections and dishes with photos, badges and multiple prices; six templates; drag-and-drop ordering with autosave.
* **UK-14 allergens built in** — the 14 regulated allergens pre-loaded with icons, tooltips, sub-sources (e.g. "cereals containing gluten → wheat, barley") and a printable matrix (Natasha's Law friendly), plus your own custom allergens and dietary labels.
* **Costs, margins & calories** — record a dish's cost to make and see its gross-profit margin (kept private), and show calories on the public menu for UK calorie-labelling.
* **QR table cards** and A4 posters that open your live menu on a phone, and **Menu / MenuItem / LocalBusiness schema.org** output for SEO.
* **Opening hours** with holiday overrides and a live "open now" status.

**Online ordering**

* **Takeaway, collection and delivery** ordering with a diner-facing menu, dish customizations (removable ingredients, choose-your-options with prices) and an accept / hold / refund workflow that only captures payment when you accept.
* **Contactless QR "order at the table"** so diners order from their phone — straight onto that table's tab, or pay-upfront.
* **Kitchen Display (KDS)** — a live New → Preparing → Ready board for the kitchen, with per-ticket timers, item lists and notes, one-tap advance and a full-screen mode for any tablet or kitchen TV.
* **Kitchen & bar ticket routing** — printable tickets per station, or emailed directly to a kitchen printer on accept.
* **86 a dish in one tap** — sold-out dishes stay on the menu (SEO-safe) marked unavailable and can't be ordered anywhere.
* **Branded, editable email templates** for order and booking notifications, with a live preview.

**Point of sale — Take Order**

* A real **POS for dine-in service**, in any browser on any tablet — no proprietary hardware, nothing to lease.
* **Live floor plan** — Take Order opens on your real room layout, with every table colour-coded by how long it's been seated (turning green → amber → red against your table-turn time), free tables ready to seat and settled tables flagged for clearing; tap a table to open its tab.
* **Tabs with coursing** — build each table's order, fire courses to the kitchen in rounds.
* **Bill splitting** — evenly, by item, or partial payments; service charge and tips.
* **Every tender** — cash with change calculation, card via a Stripe smart reader, pay-by-QR from the guest's phone, vouchers and comps; manager-gated voids.
* **Keeps working when the internet drops** — carry on opening tables, adding rounds, firing to the kitchen and taking cash through an outage. Everything is held on the tablet and syncs itself the moment you're back, with nothing lost and nothing charged twice.
* **Cash-up** with opening float and X/Z reports at close.
* **Loyalty built in** — members earn points on spend and redeem them as a bill discount.

**Bookings & events**

* **Commission-free table reservations** — take bookings on a drag-and-drop floor plan with joinable tables, via a public reservation form (block + `[dinekit_booking]` shortcode) with live availability, waitlist and covers-per-hour pacing, deposits, and a booking diary with email notifications and printable slips.
* **Full-width service timeline** — the whole service at a glance; drag to move a booking, click to seat or edit.
* **Set-menu events with per-guest pre-orders** via a share link — guests choose their courses and flag allergens; the kitchen gets a consolidated prep sheet.

**Payments, guests & staff**

* **Card payments with your own Stripe keys** (encrypted at rest) — booking deposits, order payments and at-the-table card-present payments via Stripe smart readers, with Apple Pay and Google Pay. You keep 100%.
* **Guest CRM** — repeat-visit history with the allergies diners have told you about, carried across every visit.
* **Staff logins** with a role-to-permission matrix and an activity/audit log, plus review-request emails to win diners back.
* **Reports** — covers, revenue, best-selling dishes and no-show rate, with CSV export.
* **Direct support from your dashboard** — message the DineKit team without leaving WordPress (optional; see External Services).

**Install it as an app** on any phone or tablet — the staff app runs from its own home-screen icon, **keeps taking orders and cash even when the internet drops** (syncing itself once you're back), and **many tablets stay in sync automatically** (an order or booking made on one appears on the others within seconds).

No WooCommerce required and no page builder needed. The menu, allergens and QR codes work with no external accounts; card payments use your own Stripe account (see External Services below). Works with any theme, on any host.

Built by [Web Level Up](https://weblevelup.co.uk/), a UK web agency that builds commercial WordPress software.

== Frequently Asked Questions ==

= Does DineKit need WooCommerce? =
No. DineKit has zero dependencies.

= Is it really free? What's the catch? =
Everything listed above is free — the menus, ordering, bookings, the POS, loyalty, all of it. There is no feature-gating and DineKit never takes a cut of your sales. The only cost that exists anywhere is Stripe's own standard card-processing fee if you enable card payments, and that goes to Stripe, not us.

= Do I need special hardware for the POS? =
No. Take Order runs in any browser on any tablet, laptop or phone. For card-present payments you can add any standard Stripe smart reader (bought outright from Stripe — no leases), and kitchen tickets can print via your browser or be emailed straight to a kitchen printer.

= Does DineKit take table reservations? =
Yes — commission-free table reservations with live availability, deposits, a waitlist and a booking diary. Diners book from a form on your own site (block or shortcode); no third-party reservation platform, no per-cover fees, and the guest list stays yours.

= Does it work with my theme? =
Yes. Menu output is self-contained with its own scoped styles, and works on both block and classic themes.

= How do diners see the menu? =
Add the DineKit Menu block (or the [dinekit_menu] shortcode) to any page. You can also print a QR code for your tables that opens the menu on a phone.

= Can diners order and pay at the table? =
Yes. Print DineKit's QR table cards — diners scan, order from their phone, and their order fires straight to the kitchen on that table's tab (or they pay up front, your choice).

= Who owns my data? =
You do. Everything — menus, bookings, orders, guests — lives in your own WordPress database on your own hosting. There's no external account holding your customer list, and no vendor that can freeze your funds or your data.

= How do I get support? =
Right from your dashboard: DineKit → Support messages our team directly and replies land back in the same screen (and your inbox). Prefer not to? The wordpress.org support forum works too — we watch both.

== External services ==

DineKit's optional payments feature (booking deposits and online order payments) uses **Stripe** to take card payments. Stripe is contacted only after you enable it and enter your own Stripe API keys under DineKit → Integrations, and only on requests that involve a payment:

* When a diner pays, DineKit asks Stripe to create a payment by sending the amount, currency, your site URL and the related booking/order reference to Stripe's API (https://api.stripe.com).
* When you connect Stripe or set up its webhook, DineKit calls Stripe to validate your keys and register payment notifications.
* On pages where a payment can be made, Stripe's official Stripe.js library is loaded from https://js.stripe.com so card details are entered directly with Stripe and never reach your server (PCI SAQ-A).

If you do not enable payments, DineKit makes no external requests. Stripe is a third-party service; by using it you agree to Stripe's terms and privacy policy:

* Terms: https://stripe.com/legal
* Privacy: https://stripe.com/privacy

DineKit's optional **text message (SMS)** feature uses **Twilio**, with your own Twilio account and credentials (DineKit → Integrations → Text messages). Twilio is contacted only when SMS is enabled and a notification you turned on actually fires (a booking confirmation or reminder, a "table ready" tap, or a collection order marked ready): DineKit sends the recipient's phone number and the message text to Twilio's API (https://api.twilio.com) so Twilio can deliver the text. Your Twilio auth token is stored encrypted on your own site. If you do not set up SMS, Twilio is never contacted. Twilio is a third-party service; by using it you agree to Twilio's terms and privacy policy:

* Terms: https://www.twilio.com/en-us/legal/tos
* Privacy: https://www.twilio.com/en-us/legal/privacy

DineKit's optional **direct support** feature (DineKit → Support) sends your support request to Web Level Up, the makers of DineKit, at https://weblevelup.co.uk. If you have never used Support, this service is never contacted:

* When you send a request or reply, DineKit transmits the name, email address, subject and message you typed, plus your site address (used to link replies back to your dashboard and keep your ticket history together).
* If — and only if — you tick the "include my site details" box, your WordPress, PHP and DineKit version numbers are attached to help with debugging.
* Opening the Support screen fetches your own site's ticket history from the same service.
* Once you HAVE made a support request, DineKit periodically checks that same service for replies to your own requests (roughly every 10 minutes, sending only your site's support token) so the notification bell can tell you when the team has answered. No other data is sent, and the check stops entirely if you uninstall or never had a request.

If you prefer not to use direct support, the Support screen also links to the plugin's free forum at https://wordpress.org/support/plugin/dinekit/ — using the forum sends nothing to Web Level Up. Web Level Up privacy policy: https://weblevelup.co.uk/privacy-policy/

== Development ==

DineKit is open source (GPLv2+). The complete human-readable source — including the React admin application and the build tooling used to generate the bundled `dist/main.js` — is publicly available and maintained at:

https://github.com/nikutx/dinekit

To build the admin app from source: `npm install` then `npm run build` (Vite). See the repository README for the full development setup.

== Screenshots ==

1. Your menu on any website — sections, prices, dietary filters and UK-14 allergen icons.
2. The Menu Builder — sections and dishes with allergens and multiple prices, all autosaved. Bulk-edit the whole menu in a spreadsheet with CSV export and import.
3. Design & Preview — six templates plus layout and colour controls, with a live preview and a copy-paste shortcode.
4. Commission-free online ordering for diners — takeaway, collection and delivery, straight from your own site.
5. The live orders board — takeaway, collection and delivery in one place, with kitchen tickets. You keep 100%.
6. The public table-booking form — live availability, party size and deposits, as a block or shortcode.
7. Reports — covers, revenue, no-show rate and your best-selling dishes.
8. Set-menu events with per-guest pre-orders via a share link, and a consolidated kitchen prep sheet.
9. Take Order opens on your live floor plan — every table colour-coded by how long it's been seated (with a timer on each), free tables ready to seat and settled tables flagged for clearing. Tap a table to open its tab, course and fire to the kitchen, split the bill and take any payment.
10. The drag-and-drop floor plan — zones, joinable tables and covers, driving live booking availability.
11. Kitchen Display — a live New → Preparing → Ready board; every fired round is its own ticket with a wait timer, and a full-screen mode for a kitchen TV.
12. Staff rota — group the week by role in colour-coded bands, see each person's scheduled hours (with over-contract warnings), and approve holiday requests right on the rota.
13. Service carries on when the internet drops — keep opening tables, adding rounds and firing to the kitchen. Anything not yet sent is clearly marked "on this device" and syncs itself the moment you're back online.

== Changelog ==

= 1.2.14 =
* New: keep serving when the internet drops — the till carries on working through an outage. Open a table, add rounds, fire to the kitchen and settle up in cash exactly as normal; everything is held safely on the tablet, marked "on this device", and posts itself to your books the moment you reconnect. Nothing is lost and nothing is charged twice, even if the connection died halfway through sending. A banner shows how many changes are still waiting, so nobody closes the tablet too early. Card, voucher and comp payments are switched off while you're offline, because those need a live authorisation.
* New: bulk-edit your menu in a spreadsheet — export your whole menu to CSV, tweak prices, descriptions and dishes in Excel or Google Sheets, and re-import to update everything at once. Dishes are matched by name within each section, so re-importing updates your menu rather than duplicating it.
* New: cap orders per time slot — set how many online orders the kitchen can take in each time slot so a rush doesn't swamp the pass. Slots that are already full are greyed out in the diner's time picker, so they choose a time you can actually cook instead of being turned away at the last step.
* New: spot repeat no-shows — a guest who has failed to turn up before now gets a red flag on their booking in the diary and on their card in Guests, so you can decide whether to ask for a deposit.
* Fixed: settling a bill now flags the table as needing bussing on the floor plan. It previously never did, so a table you'd just taken payment for didn't show as needing clearing. Any payment type — cash, card, reader, voucher or comp — now marks it, and tapping the table clears it as designed.
* Fixed: buttons and toggles no longer overflow the screen edge on a phone.

= 1.2.13 =
* New: the staff rota now groups by role — chefs, servers, bar and so on each get their own colour-coded band, so a busy week reads at a glance (switch back to a flat list any time).
* New: build the rota faster — open a shift and copy its times onto any other days for that person in one go.
* New: approve holiday right on the rota — pending time-off requests show above the grid with one-tap Approve / Decline, and an approved day immediately flags any shift that clashes with it.
* New: contracted-hours guard — give a team member their contracted weekly hours and the rota shows each person's scheduled total, turning red when you've rota'd them over contract.
* New: menu text size — a Compact / Normal / Large / X-large control scales your whole public menu's text for wall screens or phones.
* New: choose how the menu filter and allergens display — filter as compact dropdowns instead of chips, and show each dish's allergens as icons, full text, or short codes.
* Fixed: menu colours now apply consistently on every layout. The Chalkboard layout used to force its own dark palette and ignore your colour pickers (a background change did nothing); now every layout takes its colours from the chosen template plus your overrides, so the swatches always match what diners see.

= 1.2.12 =
* New: Take Order now opens on your live floor plan — the exact room layout you built in Floor Plan, colour-coded live (green just seated, amber nearing your table-turn time, red over it) with a timer on every occupied table, so you can see who's in, how long they've been sat and which tables are free to seat next. It scales to fit a phone, a tablet or a big screen.
* New: Know which tables need clearing — once a bill is settled the table shows "needs bussing" on the floor; tap it when it's wiped down to mark it ready to seat again.
* New: Tapping a table opens the order pad as a pop-up over the floor and closes straight back to it — a fast, till-like flow instead of jumping to a separate screen and back.
* New: Live table timers on the open tab — how long it's been open, when it opened, how many rounds have gone to the kitchen and how long the current one's been cooking (or how long service took).
* New: A table's order history — a history button shows that table's previous settled bills (date, items, how they paid, total; tap one to see the items), so you can answer "what did they have last time?" on the spot.
* New: Live on-table timers in the booking diary too — a seated party's timer turns amber as it nears your turn time and red once it's over, so tables that need turning stand out at a glance.
* Improved: The order pad's course tabs now filter the menu to that section (Starters, Mains, Desserts…), and a tab's timeline (opened / fired / served / time-to-serve) shows right on the order screen.

= 1.2.11 =
* New: Install DineKit as an app on any phone or tablet — it runs from a home-screen icon, separate from wp-admin, keeps loading through a dropped connection, and many tablets stay in sync automatically (an order or booking made on one appears on the others within seconds).
* New: Kitchen Display now handles coursing properly — each round you fire is its own ticket that moves through New → Preparing → Ready on its own, so firing mains later never disturbs the starters that are already cooking, and only the new items show.
* New: Dish costs, margins & calories — record a dish's cost to see its gross-profit margin (kept private), and show calories on the public menu for UK calorie labelling.
* New: Allergen sub-sources (Natasha's Law) — pick "cereals containing gluten" then choose wheat/barley/rye…, or "tree nuts" → almond/hazelnut/walnut…; the menu then reads "cereals containing gluten (wheat, barley)". Add your own custom allergens too; the 14 legal allergens stay protected.
* New: Partial refunds — refund a whole order or tick just the items that were sent back; card via Stripe, cash recorded.
* New: Set your own service charge % right on the bill (saved as your default), and when you split, each person tips their own share.
* New: Set-menu events — edit a guest's pre-order (name, course, company) after they've submitted.
* Improved: One booking panel — click a reservation to mark arrived/seated, no-show or completed, move the table/time, add notes or cancel, all in one place; manage several bookings at once; walk-ins auto-seat at the best free table.
* Improved: Mark a dish unavailable (86) from the dish editor, prices show your currency symbol as you type, the dish editor is grouped into tidy collapsible sections, and editors open as large centered pop-ups.
* Fixed: taking a Card, Voucher or Comp payment no longer opens a stray print tab or crashes the till.
* Fixed: orders fired from Take Order now appear on the Kitchen Display, and a table's bill stays open and payable at the till until you actually settle it (the kitchen marking it done no longer closes it).
* Fixed: the event pre-order link no longer auto-picks a dish — each guest actively chooses per course.
* Fixed: walk-ins respect your covers-per-hour cap, staff are archived (restorable) instead of hard-deleted, and various confirmations are now proper on-screen dialogs.

= 1.2.10 =
* New: Kitchen Display. A live kitchen board that shows incoming orders as they move through New → Preparing → Ready, with a timer on every ticket, clear item lists and kitchen notes, and one tap to move an order along. It auto-refreshes and has a full-screen mode, so you can run it on any tablet or a kitchen TV.

= 1.2.9 =
* New: attach screenshots to your support messages. Paste an image straight into the Support screen (or pick a file) and it's added to your request — so you can show us the problem, not just describe it. Images are saved to your own site's media library; we only receive the link.

= 1.2.8 =
* New: set your country and restaurant address in Settings. DineKit now speaks your local language for addresses — "ZIP code" and "State" in the US, "Postcode" and "County" in the UK, "Postal code" elsewhere — across the dashboard and your delivery form.
* Better local SEO worldwide: your address now feeds Google-friendly LocalBusiness structured data (street, town/city, postal code, region and country).
* Fix: menu prices now report your real currency to search engines. Previously the menu's structured data always said GBP, even for non-UK restaurants.

= 1.2.7 =
* New: a notification bell in the top bar, on every screen, shows what needs your attention right now — orders to accept, bookings to confirm, your waitlist and pending holiday requests — and each one is a single click straight to where you deal with it. It only shows things you have permission to action.

= 1.2.6 =
* Support conversations now open at the newest message, so you don't have to scroll to see the latest reply.
* Long support threads stay light — only the most recent messages load, with a "Show earlier messages" button for the rest.
* Emoji in support messages now display correctly.

= 1.2.5 =
* Fix: replies from the support team now appear in your Support screen straight away. On some hosts a cache could hold an older copy of the conversation, so a reply looked like it hadn't arrived — support replies are now always fetched fresh.

= 1.2.4 =
* New: Support — message the DineKit team straight from your dashboard. No account or key needed: type your name, email and question; replies land back in the same screen (and your inbox). Track all your requests, reply, and mark them solved without leaving WordPress. Optional — the wordpress.org forum works too, and nothing is ever sent in the background.
* New: a "Common fixes" panel on the Support screen answers the most frequent questions (QR 404s, missing emails, Stripe test mode…) in under a minute, before you even need to ask.
* New: after your first accepted order or confirmed booking, DineKit asks (once, politely) whether you'd leave a review — fully dismissible, and "no thanks" means never again.
* Housekeeping: the review-request schedule is now cleaned up when the plugin is deactivated or uninstalled.

= 1.2.3 =
* Floor plan: deleting a zone now asks first and lets you move its tables to another zone (or remove them) — and if any of those tables have upcoming bookings, you can reassign each one to a free table before it goes.
* Nothing is lost: deleted zones and tables now live in a new "History" tab on the floor plan, restorable with one click.
* Joined tables are colour-matched on the plan so you can see your table groupings at a glance; a table shared by two joins blends both colours.
* Tables show a small orientation marker, so you can tell which way one faces after rotating it.
* Fixes: the "Out of service" toggle now responds wherever you click it; moving a table to another zone updates the plan straight away; the rotate button lines up with the zone selector; and the min/max party boxes are tidier.

= 1.2.2 =
* Smoother onboarding: the setup wizard now walks you through your opening hours, and you can skip ahead and pick up the rest from your dashboard whenever you like.
* Menu, ordering and booking pages are created as drafts for you to review and publish — with a clear "review & publish" prompt, and a checklist that only ticks a page off once it's actually live.
* Dishes are never lost: removing a dish now archives it (kept for your past orders and reports) and you can restore it any time — with a heads-up if it's on an order the kitchen is cooking right now.
* Online ordering follows your opening hours: orders are only taken while you're open, with an optional "last orders" cut-off before closing time.
* Table bookings read your opening hours directly, so your service times live in one place.
* Polish: tidier fields inside pop-out panels, your cursor stays put while typing, and assorted small performance improvements.

= 1.2.1 =
* Release-pipeline fix only — no plugin changes. Superseded by 1.2.2, which carries this line's content.

= 1.2.0 =
* Release-pipeline fix only — no plugin changes. Superseded by 1.2.2, which carries this line's content.

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
