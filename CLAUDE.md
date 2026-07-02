# DineKit — WordPress plugin (restaurant menus, QR, hours)
- WP plugin, PHP 7.4+, namespace DineKit\, text domain `dinekit`
- HARD RULES: no WooCommerce/no external services/no jQuery; guarded activation
  (never fatal); scoped CSS `.dinekit-`; all data in CPT/meta (no custom tables);
  i18n everything; UK allergens are first-class citizens
- Dev: wp-env (`npm run env:start`), wp-scripts (`npm run start`), PHPCS
  WordPress-Extra + PHPStan lvl5 must pass before claiming done
- Definition of done: verified in browser on the wp-env site (screenshot),
  not just build-pass. Test on block theme + classic + Divi.
- Never edit readme.txt stable tag or version without being asked
- Out of scope unless instructed: ordering, bookings, payments, licensing
