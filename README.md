# DineKit — Restaurant Menu, QR Menus & Allergen Labels

A free WordPress plugin for restaurants, cafés and pubs: build a proper menu with
UK allergen support (Natasha's Law), print QR table cards, and show opening hours —
no dependencies, works with any theme. Built by [Web Level Up](https://weblevelup.co.uk/).

> This repository holds the **full source**, including the un-minified React admin app.
> It's published so the WordPress.org review team (and anyone) can read and build the
> code that produces the compiled bundle shipped in the plugin.

## Architecture

- **PHP** is a thin REST API (`dinekit/v1`) plus the public-facing rendering. All data
  lives in custom post types, taxonomies and post meta — no custom tables, no external
  services. QR codes are generated in pure PHP (`includes/qr.php`).
- **The admin UI** (`src/`) is a React 19 + MUI single-page app built with **Vite**. The
  build output is `dist/main.js` / `dist/main.css`, which is what ships in the plugin.
- The public menu/hours output is pure PHP with scoped CSS (`assets/css/menu.css`) —
  no front-end JavaScript, no jQuery.

## Build from source

```bash
npm install
npm run build      # → dist/main.js + dist/main.css (what the plugin loads)
```

Development with hot-reload (Vite dev server):

```bash
npm run dev        # then set define('DINEKIT_DEV', true) in wp-config.php
```

Package a distributable plugin zip (excludes dev files):

```bash
npm run zip        # → dinekit-vX.Y.Z.zip
```

## Layout

```
dinekit.php            Plugin bootstrap (guarded, never fatal)
includes/              PHP: REST API, post types, meta, QR encoder, hours, render
  admin/               Admin page mount + dev/prod asset loader
  frontend/            Menu block + shortcode rendering
blocks/                Block metadata (dinekit/menu, dinekit/hours)
assets/                Allergen SVG icons, scoped frontend CSS, block editor scripts
src/                   React admin app (Vite source)
dist/                  Build output (generated; git-ignored)
```

## License

GPLv2 or later.
