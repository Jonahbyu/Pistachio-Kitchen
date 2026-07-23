# 🌿 The Pistachio Kitchen

A personal, pistachio-green online cookbook. Add, find, share, and print recipes — all through the browser. No accounts, no server, no code required to use it.

## Run it locally

From this folder:

```bash
npx serve .
```

Then open the URL it prints (usually http://localhost:3000).

> Any static server works. You can also just double-click `index.html`, but running a
> server behaves exactly like the real hosted version will.

## How your wife uses it

- **+ Add Recipe** — a friendly form: name, photo, prep/cook time, servings, tags, ingredients, steps, notes.
- **Search** (top right) — finds by name, tag, or ingredient.
- **Tag chips** (under the header) — filter by category, e.g. *Dessert*, *Dinner*.
- **Open a recipe** → **🖨️ Print** for a clean printable card, **🔗 Share** to copy it, **✏️ Edit** / **🗑️ Delete**.
- **⋯ menu** → **Backup / Export** saves all recipes to a file; **Import** loads them back. Great for backups or moving to a new computer.

## Where the recipes live

Recipes are stored in the browser (localStorage) on the machine that added them.
That's why the **Export** backup matters — it's the portable copy of everything.

## Deploy it free (later)

Because it's just static files, you can drag this whole folder onto:

- **Netlify** (netlify.com/drop — literally drag & drop the folder), or
- **Vercel**, **Cloudflare Pages**, or **GitHub Pages**.

No build step. Give her the link and she's live.

> Note: since recipes live in each browser, the site starts empty on a new device.
> She adds recipes on the device she uses, and can Export/Import to move them.
> If you later want recipes to sync across all devices automatically, that's the
> "real hosted app with login" upgrade — ask and we can build it.
