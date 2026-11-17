
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT) || 5000;

const localOrigins = [
    /^null$/,
    /^https?:\/\/localhost(?::\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(?::\d+)?$/
];

app.use(cors({
    origin(origin, callback) {
        callback(null, !origin || localOrigins.some(allowed => allowed.test(origin)));
    }
}));
app.use(express.json({ limit: "16kb" }));

const dataFolder = path.join(__dirname, "data");
const dataFile = path.join(dataFolder, "store.json");
const exampleFile = path.join(dataFolder, "store.example.json");

if (!fs.existsSync(dataFolder)) {
    fs.mkdirSync(dataFolder, { recursive: true });
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateStore(store) {
    if (!isRecord(store) ||
        !Array.isArray(store.games) ||
        !isRecord(store.wishlists) ||
        !isRecord(store.profiles)) {
        throw new Error("Store must contain games, wishlists, and profiles.");
    }

    const gameIds = new Set();
    for (const game of store.games) {
        if (!isRecord(game) ||
            typeof game.id !== "string" ||
            !game.id.trim() ||
            typeof game.title !== "string" ||
            !game.title.trim() ||
            typeof game.category !== "string" ||
            !Array.isArray(game.categories) ||
            game.categories.some(category => typeof category !== "string") ||
            !Array.isArray(game.tags) ||
            game.tags.some(tag => typeof tag !== "string")) {
            throw new Error("Store contains an invalid game record.");
        }

        if (gameIds.has(game.id)) {
            throw new Error(`Store contains a duplicate game ID: ${game.id}`);
        }
        gameIds.add(game.id);
    }

    for (const gameIdsForGamer of Object.values(store.wishlists)) {
        if (!Array.isArray(gameIdsForGamer) ||
            gameIdsForGamer.some(gameId => typeof gameId !== "string")) {
            throw new Error("Store contains an invalid wishlist.");
        }
    }

    if (Object.values(store.profiles).some(profile => !isRecord(profile))) {
        throw new Error("Store contains an invalid player profile.");
    }

    return store;
}

function initializeStore() {
    if (fs.existsSync(dataFile)) {
        return;
    }

    const exampleStore = validateStore(
        JSON.parse(fs.readFileSync(exampleFile, "utf8"))
    );

    try {
        fs.writeFileSync(dataFile, JSON.stringify(exampleStore, null, 2), {
            encoding: "utf8",
            flag: "wx"
        });
    } catch (error) {
        if (error.code !== "EEXIST") {
            throw error;
        }
    }
}

function readStore() {
    return validateStore(JSON.parse(fs.readFileSync(dataFile, "utf8")));
}

function saveStore(data) {
    validateStore(data);
    const temporaryFile = path.join(
        dataFolder,
        `store.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
    );
    let temporaryFileCreated = false;

    try {
        fs.writeFileSync(temporaryFile, JSON.stringify(data, null, 2), {
            encoding: "utf8",
            flag: "wx"
        });
        temporaryFileCreated = true;
        fs.renameSync(temporaryFile, dataFile);
    } catch (error) {
        if (temporaryFileCreated) {
            try {
                fs.unlinkSync(temporaryFile);
            } catch (cleanupError) {
                if (cleanupError.code !== "ENOENT") {
                    console.error("Could not remove temporary store file:", cleanupError);
                }
            }
        }
        throw error;
    }
}

initializeStore();
readStore();

function validateGamerTag(req, res, next) {
    const gamerTag = req.params.gamerTag;
    if (typeof gamerTag !== "string" ||
        !gamerTag.trim() ||
        gamerTag.trim().length > 64) {
        return res.status(400).json({
            success: false,
            message: "Gamer tag must be between 1 and 64 characters."
        });
    }

    req.gamerKey = getGamerKey(gamerTag);
    next();
}

function isValidGameId(gameId) {
    return typeof gameId === "string" && Boolean(gameId.trim()) && gameId.length <= 128;
}

function gameExists(store, gameId) {
    return store.games.some(game => game.id === gameId);
}

// Create a consistent key for each gamer
function getGamerKey(name) {
    return name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

// 1. Test whether the server is running
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "Kinetix backend is running!"
    });
});

// 2. Get games with search, category and sorting
app.get("/api/games", (req, res) => {
    const store = readStore();
    const { search, category, sort } = req.query;

    if ((search !== undefined &&
            (typeof search !== "string" || search.length > 200)) ||
        (category !== undefined &&
            (typeof category !== "string" || category.length > 64)) ||
        (sort !== undefined && sort !== "asc" && sort !== "desc")) {
        return res.status(400).json({
            success: false,
            message: "Invalid search, category, or sort query."
        });
    }

    const term = (search || "").trim().toLowerCase();
    const categoryTerm = (category || "").trim().toLowerCase();
    let games = store.games;

    if (term) {
        games = games.filter(game => [
            game.title,
            game.genre,
            game.description,
            ...game.categories,
            ...game.tags
        ].some(value => typeof value === "string" && value.toLowerCase().includes(term)));
    }

    if (categoryTerm && categoryTerm !== "all") {
        games = games.filter(game =>
            [game.category, ...game.categories]
                .some(value => value.toLowerCase() === categoryTerm)
        );
    }

    if (sort === "asc") {
        games = [...games].sort((a, b) =>
            a.title.localeCompare(b.title)
        );
    } else if (sort === "desc") {
        games = [...games].sort((a, b) =>
            b.title.localeCompare(a.title)
        );
    }

    res.json({
        success: true,
        count: games.length,
        games
    });
});

// 3. Get a gamer's wishlist
app.get("/api/wishlist/:gamerTag", validateGamerTag, (req, res) => {
    const store = readStore();
    const gameIds = [...new Set(store.wishlists[req.gamerKey] || [])];

    res.json({
        success: true,
        gameIds
    });
});

app.post("/api/wishlist/:gamerTag", validateGamerTag, (req, res) => {
    const gameId = req.body && req.body.gameId;
    if (!isValidGameId(gameId)) {
        return res.status(400).json({
            success: false,
            message: "A valid gameId of at most 128 characters is required."
        });
    }

    const store = readStore();
    if (!gameExists(store, gameId)) {
        return res.status(404).json({
            success: false,
            message: "Game not found."
        });
    }

    const currentIds = store.wishlists[req.gamerKey] || [];
    const gameIds = [...new Set(currentIds)];
    if (!gameIds.includes(gameId)) {
        gameIds.push(gameId);
    }

    const changed = !store.wishlists[req.gamerKey] ||
        gameIds.length !== currentIds.length ||
        gameIds.some((id, index) => id !== currentIds[index]);
    if (changed) {
        store.wishlists[req.gamerKey] = gameIds;
        saveStore(store);
    }

    res.json({
        success: true,
        gameIds
    });
});

app.delete("/api/wishlist/:gamerTag/:gameId", validateGamerTag, (req, res) => {
    const store = readStore();
    const { gameId } = req.params;
    if (!isValidGameId(gameId)) {
        return res.status(400).json({
            success: false,
            message: "A valid gameId is required."
        });
    }

    if (!gameExists(store, gameId)) {
        return res.status(404).json({
            success: false,
            message: "Game not found."
        });
    }

    const currentIds = store.wishlists[req.gamerKey] || [];
    const gameIds = [...new Set(currentIds.filter(id => id !== gameId))];
    const changed = store.wishlists[req.gamerKey] &&
        (gameIds.length !== currentIds.length ||
            gameIds.some((id, index) => id !== currentIds[index]));
    if (changed) {
        store.wishlists[req.gamerKey] = gameIds;
        saveStore(store);
    }

    res.json({
        success: true,
        gameIds
    });
});

app.get("/api/profile/:gamerTag", validateGamerTag, (req, res) => {
    const store = readStore();

    res.json({
        success: true,
        profile: store.profiles[req.gamerKey] || null
    });
});

app.put("/api/profile/:gamerTag", validateGamerTag, (req, res) => {
    const store = readStore();
    const displayName = req.body && req.body.displayName;

    if (typeof displayName !== "string" ||
        !displayName.trim() ||
        displayName.trim().length > 24) {
        return res.status(400).json({
            success: false,
            message: "Display name must be between 1 and 24 characters."
        });
    }

    const oldProfile = store.profiles[req.gamerKey] || {};

    store.profiles[req.gamerKey] = {
        gamerTag: req.params.gamerTag.trim(),
        displayName: displayName.trim(),
        createdAt: oldProfile.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    saveStore(store);

    res.json({
        success: true,
        profile: store.profiles[req.gamerKey]
    });
});

// Unknown routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API route not found."
    });
});

app.use((error, req, res, next) => {
    console.error("API request failed:", error);
    if (res.headersSent) {
        return next(error);
    }

    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
        ? error.status
        : 500;
    const message = status === 400
        ? "Request body contains invalid JSON."
        : status === 413
            ? "Request body is too large."
            : status < 500
                ? "Invalid request."
                : "Internal server error.";

    res.status(status).json({
        success: false,
        message
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Kinetix backend running at http://localhost:${PORT}`);
});
