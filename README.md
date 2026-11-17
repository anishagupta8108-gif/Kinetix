# Kinetix

Kinetix is a gaming discovery website for browsing a curated game collection. It includes game search, category filters, sorting, game details, a persistent wishlist, and a Player Hub profile.

## Technologies

- HTML, CSS, and vanilla JavaScript
- Node.js and Express
- Local JSON storage for games, wishlists, and player profiles

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
        ├── store.example.json # Clean starter game collection
        └── store.json         # Local games and user data (not committed)
```

## Requirements

- Node.js 18.11 or later
- A modern web browser

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

The API listens at `http://localhost:5000`. The first run creates `backend/data/store.json` from `store.example.json` only if no local store already exists. Existing local store data is not replaced.

## Launch the frontend

With the backend running, open `index.html` in a browser. You can also use a local static-file server such as the VS Code Live Server extension. The frontend connects to `http://localhost:5000/api`.

## API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Check that the backend is running |
| `GET` | `/api/games` | Get games; optional `search`, `category`, and `sort=asc` or `sort=desc` query parameters |
| `GET` | `/api/wishlist/:gamerTag` | Get a player's saved game IDs |
| `POST` | `/api/wishlist/:gamerTag` | Add a game with JSON body `{ "gameId": "game-id" }` |
| `DELETE` | `/api/wishlist/:gamerTag/:gameId` | Remove a game from a player's wishlist |
| `GET` | `/api/profile/:gamerTag` | Get a player's profile |
| `PUT` | `/api/profile/:gamerTag` | Save a display name with JSON body `{ "displayName": "Player Name" }` |

Game search and categories can also be used from the website's interface. Profile display names must be between 1 and 24 characters.

## Data and limitations

The backend stores the game catalog, wishlists, and profiles in `backend/data/store.json`. That file is local user data and is excluded by `.gitignore`; the clean `store.example.json` keeps the 60-game catalog available to fresh installations.

Gamer tags are identifiers only. Kinetix does not currently have secure authentication, passwords, or account ownership checks. JSON storage is intended for one local development server, not concurrent production instances. The API should not be exposed publicly as an authenticated service.
