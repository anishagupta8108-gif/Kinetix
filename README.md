# Kinetix

Kinetix is a gaming discovery website for browsing a curated game collection. It includes game search, category filters, sorting, game details, a persistent wishlist, and a Player Hub profile.

## Technologies

- HTML, CSS, and vanilla JavaScript
- Node.js and Express
- Supabase PostgreSQL and anonymous Supabase Auth sessions

## Project structure

```text
kinetix/
├── index.html                 # Website markup
├── style.css                  # Website styles
├── script.js                  # Frontend behavior and API connection
├── games.js                   # Initializes the frontend game collection
├── assets/                     # Website imagery and other visual assets
└── backend/
    ├── server.js              # Express API
    ├── package.json           # Backend scripts and dependencies
    ├── package-lock.json      # Locked dependency versions
    └── data/
        ├── store.example.json # Local backup catalogue
        ├── store.json         # Local data backup (not used by the API)
        └── seed-games.sql     # Manual catalogue seed script
```

## Requirements

- Node.js 18.11 or later
- A modern web browser
- A Supabase project with the `games`, `profiles`, and `wishlist_items` tables and the existing owner-only RLS policies
- Anonymous sign-in enabled in Supabase Auth

Create `backend/.env` with `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and optionally `PORT` and `CORS_ALLOWED_ORIGINS`. Use only the publishable key; never put a service-role or secret key in this file or the frontend.

For production deployment, set `CORS_ALLOWED_ORIGINS` in the hosting platform's environment settings to a comma-separated list of the exact frontend origins allowed to call the API. Separate multiple origins with commas; whitespace around entries is ignored. Use origins only (scheme and host, with an optional port), not paths, and do not use `*`. Localhost and `127.0.0.1` development origins remain allowed automatically. Requests without an `Origin` header are also allowed.

## Install and start the backend

In a terminal, open the backend folder and install its dependencies:

```powershell
cd backend
npm.cmd install
```

Start the backend in development mode, with automatic restart when server files change:

```powershell
npm.cmd run dev
```

For a normal start without file watching:

```powershell
npm.cmd start
```

The API listens at `http://localhost:5000`. Games, profiles, and wishlists are read from or written to Supabase. The local JSON files are retained as backups and are not read or overwritten by the API.

## Launch the frontend

With the backend running, open `index.html` in a browser. You can also use a local static-file server such as the VS Code Live Server extension. The frontend connects to `http://localhost:5000/api`.

## API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Check that the backend is running |
| `GET` | `/api/config` | Return the public Supabase URL and publishable key for browser initialization |
| `GET` | `/api/games` | Get games; optional `search`, `category`, and `sort=asc` or `sort=desc` query parameters |
| `GET` | `/api/wishlist` | Get the authenticated player's saved game IDs |
| `POST` | `/api/wishlist` | Add a game with JSON body `{ "gameId": "game-id" }` |
| `DELETE` | `/api/wishlist/:gameId` | Remove a game from the authenticated player's wishlist |
| `GET` | `/api/profile` | Get the authenticated player's profile |
| `PUT` | `/api/profile` | Save a display name with JSON body `{ "displayName": "Player Name" }` |

Profile and wishlist endpoints require `Authorization: Bearer <access-token>`. The frontend creates an anonymous Supabase session when needed and reuses the browser-persisted session. Display names must contain 1–24 non-whitespace characters.

## Data and limitations

`backend/data/store.example.json` and `backend/data/store.json` remain available as local backups. They are not imported automatically. `backend/data/seed-games.sql` is provided for manual execution in the Supabase SQL Editor.

Anonymous sessions are browser-specific and do not provide account recovery or cross-device identity. RLS policies remain responsible for enforcing user ownership in Supabase.
