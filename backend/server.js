require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured.");
}

const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});

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

function requestSupabaseClient(accessToken) {
    return createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        },
        global: {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        }
    });
}

async function requireAuthenticatedUser(req, res, next) {
    const authorization = req.get("authorization") || "";
    const tokenMatch = authorization.match(/^Bearer\s+(\S+)$/i);
    if (!tokenMatch) {
        return res.status(401).json({
            success: false,
            message: "Authentication is required."
        });
    }

    const { data, error } = await supabase.auth.getUser(tokenMatch[1]);
    if (error || !data.user) {
        return res.status(401).json({
            success: false,
            message: "Your session is invalid or expired. Please try again."
        });
    }

    req.user = data.user;
    req.supabase = requestSupabaseClient(tokenMatch[1]);
    next();
}

function isValidGameId(gameId) {
    return typeof gameId === "string" && Boolean(gameId.trim()) && gameId.length <= 128;
}

function readWishlist(supabaseClient, userId) {
    return supabaseClient
        .from("wishlist_items")
        .select("game_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
}

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "Kinetix backend is running!"
    });
});

app.get("/api/config", (req, res) => {
    res.json({
        supabaseUrl,
        supabasePublishableKey
    });
});

app.get("/api/games", async (req, res) => {
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

    const { data, error } = await supabase
        .from("games")
        .select("id, title, genre, category, categories, description, image, link, tags")
        .order("title", { ascending: sort !== "desc" });

    if (error) {
        console.error("Could not load games from Supabase:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not load games."
        });
    }

    const term = (search || "").trim().toLowerCase();
    const categoryTerm = (category || "").trim().toLowerCase();
    let games = data || [];

    if (term) {
        games = games.filter(game => [
            game.title,
            game.genre,
            game.description,
            ...(game.categories || []),
            ...(game.tags || [])
        ].some(value => typeof value === "string" && value.toLowerCase().includes(term)));
    }

    if (categoryTerm && categoryTerm !== "all") {
        games = games.filter(game =>
            [game.category, ...(game.categories || [])]
                .some(value => value.toLowerCase() === categoryTerm)
        );
    }

    res.json({
        success: true,
        count: games.length,
        games
    });
});

app.get("/api/profile", requireAuthenticatedUser, async (req, res) => {
    const { data, error } = await req.supabase
        .from("profiles")
        .select("user_id, display_name, created_at, updated_at")
        .eq("user_id", req.user.id)
        .maybeSingle();

    if (error) {
        console.error("Could not load profile from Supabase:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not load your profile."
        });
    }

    res.json({
        success: true,
        profile: data ? {
            userId: data.user_id,
            displayName: data.display_name,
            createdAt: data.created_at,
            updatedAt: data.updated_at
        } : null
    });
});

app.put("/api/profile", requireAuthenticatedUser, async (req, res) => {
    const displayName = req.body && req.body.displayName;
    const normalizedName = typeof displayName === "string" ? displayName.trim() : "";
    if (!normalizedName || normalizedName.length > 24) {
        return res.status(400).json({
            success: false,
            message: "Display name must be between 1 and 24 characters."
        });
    }

    const { data, error } = await req.supabase
        .from("profiles")
        .upsert({
            user_id: req.user.id,
            display_name: normalizedName,
            updated_at: new Date().toISOString()
        }, { onConflict: "user_id" })
        .select("user_id, display_name, created_at, updated_at")
        .single();

    if (error) {
        console.error("Could not save profile to Supabase:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not save your profile."
        });
    }

    res.json({
        success: true,
        profile: {
            userId: data.user_id,
            displayName: data.display_name,
            createdAt: data.created_at,
            updatedAt: data.updated_at
        }
    });
});

app.get("/api/wishlist", requireAuthenticatedUser, async (req, res) => {
    const { data, error } = await readWishlist(req.supabase, req.user.id);
    if (error) {
        console.error("Could not load wishlist from Supabase:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not load your wishlist."
        });
    }

    res.json({
        success: true,
        gameIds: data.map(item => item.game_id)
    });
});

app.post("/api/wishlist", requireAuthenticatedUser, async (req, res) => {
    const gameId = req.body && req.body.gameId;
    if (!isValidGameId(gameId)) {
        return res.status(400).json({
            success: false,
            message: "A valid gameId of at most 128 characters is required."
        });
    }

    const { error } = await req.supabase
        .from("wishlist_items")
        .upsert({
            user_id: req.user.id,
            game_id: gameId
        }, {
            onConflict: "user_id,game_id",
            ignoreDuplicates: true
        });

    if (error) {
        const isUnknownGame = error.code === "23503";
        if (!isUnknownGame) {
            console.error("Could not update wishlist in Supabase:", error.message);
        }
        return res.status(isUnknownGame ? 404 : 500).json({
            success: false,
            message: isUnknownGame ? "Game not found." : "Could not update your wishlist."
        });
    }

    const { data, error: readError } = await readWishlist(req.supabase, req.user.id);
    if (readError) {
        console.error("Could not read updated wishlist from Supabase:", readError.message);
        return res.status(500).json({
            success: false,
            message: "The game was saved, but the wishlist could not be refreshed."
        });
    }

    res.json({
        success: true,
        gameIds: data.map(item => item.game_id)
    });
});

app.delete("/api/wishlist/:gameId", requireAuthenticatedUser, async (req, res) => {
    const { gameId } = req.params;
    if (!isValidGameId(gameId)) {
        return res.status(400).json({
            success: false,
            message: "A valid gameId is required."
        });
    }

    const { error } = await req.supabase
        .from("wishlist_items")
        .delete()
        .eq("user_id", req.user.id)
        .eq("game_id", gameId);

    if (error) {
        console.error("Could not remove wishlist item from Supabase:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not update your wishlist."
        });
    }

    const { data, error: readError } = await readWishlist(req.supabase, req.user.id);
    if (readError) {
        console.error("Could not read updated wishlist from Supabase:", readError.message);
        return res.status(500).json({
            success: false,
            message: "The game was removed, but the wishlist could not be refreshed."
        });
    }

    res.json({
        success: true,
        gameIds: data.map(item => item.game_id)
    });
});

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API route not found."
    });
});

app.use((error, req, res, next) => {
    console.error("API request failed:", error.message);
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

app.listen(PORT, () => {
    console.log(`Kinetix backend running at http://localhost:${PORT}`);
});
