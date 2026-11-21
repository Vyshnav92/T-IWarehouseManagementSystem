# T&I Control Room

A frontend demo of the warehouse, vehicle and driver management system for T&I Construction (Saudi Arabia).
It runs entirely in the browser: no backend, and all data is saved in the browser's local storage.
Sample data is generated on first load, and **Settings → Reset demo** brings it back.

Built with React 18 and Vite 5. The build produces a single self-contained `index.html`.

## Run it locally

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm run dev       # opens a dev server with live reload
```

## Build

```bash
npm run build     # creates dist/index.html (one file, everything inlined)
npm run preview   # serves the built file to check it
```

## Deploy on Netlify

**Option A: connect the repo (redeploys on every push)**

1. In Netlify, go to **Add new site → Import an existing project → GitHub** and pick this repo.
2. The settings are read from `netlify.toml`: build command `npm run build`, publish directory `dist`.
3. Click **Deploy**. Every push to `main` redeploys automatically.

**Option B: drag and drop**

1. Run `npm run build`.
2. Drag the `dist` folder onto [app.netlify.com/drop](https://app.netlify.com/drop),
   or onto **Deploys** of an existing site to update it.

## Project layout

```
src/
  main.jsx, App.jsx   app shell, sidebar, top bar, routing (hash-based)
  store.jsx           app state, saved to localStorage
  data.js             sample data, dates, expiry and stock rules
  ai.js               the local "assistant": answers, sentence-to-form, insights
  Overlays.jsx        all forms and side drawers
  Assistant.jsx       chat panel
  Tour.jsx            welcome tour
  ui.jsx              shared UI components
  pages/              Home, Warehouse, Vehicles & Drivers, Reminders, Reports, Smart, Settings
  styles.css          design system
```

Note: the "AI" features are simulated for the demo. They are pattern matching that runs in the browser, and bill or document reading returns sample values.
