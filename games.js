"use strict";

function createSteamGame(id, title, genre, category, description, appId, tags, extraCategories, image, link) {
    const categories = [...new Set([category].concat(extraCategories || []))];
    return {
        id,
        title,
        genre,
        category,
        categories,
        description,
        image: image || "https://cdn.akamai.steamstatic.com/steam/apps/" + appId + "/header.jpg",
        link: link || "https://store.steampowered.com/app/" + appId + "/",
        tags
    };
}

let games = [];

const categories = [
    "All",
    "Adventure",
    "RPG",
    "Simulation",
    "Action",
    "Horror",
    "Survival",
    "Strategy",
    "Puzzle",
    "Racing",
    "Open World"
];
