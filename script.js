"use strict";

const elements = {
    gameContainer: document.getElementById("gameContainer"),
    wishlistContainer: document.getElementById("wishlistContainer"),
    wishlistCount: document.getElementById("wishlistCount"),
    navWishlistCount: document.getElementById("navWishlistCount"),
    categoryContainer: document.getElementById("categoryButtons"),
    searchForm: document.getElementById("searchForm"),
    searchInput: document.getElementById("gameSearch"),
    sortSelect: document.getElementById("sortGames"),
    resultsStatus: document.getElementById("resultsStatus"),
    catalogTotal: document.getElementById("catalogTotal"),
    categorySummary: document.getElementById("categorySummary"),
    loadMoreButton: document.getElementById("loadMoreButton"),
    modal: document.getElementById("gameModal"),
    modalImage: document.getElementById("modalImage"),
    modalCategory: document.getElementById("modalCategory"),
    modalTitle: document.getElementById("modalTitle"),
    modalGenre: document.getElementById("modalGenre"),
    modalDescription: document.getElementById("modalDescription"),
    modalTags: document.getElementById("modalTags"),
    modalLink: document.getElementById("modalLink"),
    closeModalButton: document.getElementById("closeModal"),
    profileInput: document.getElementById("gamerTagInput"),
    saveProfileButton: document.getElementById("saveGamerTag"),
    profileName: document.getElementById("gamerNameDisplay"),
    profileMessage: document.getElementById("profileMessage"),
    storageMessage: document.getElementById("storageMessage"),
    menuToggle: document.getElementById("menuToggle"),
    navigation: document.getElementById("primaryNavigation")
};

let selectedCategory = "All";
let visibleGameCount = 12;
const pageSize = 12;
const legacyWishlistKey = "kinetixWishlist";
const wishlistMigrationKey = "kinetixWishlistBackendMigrationV1";
const pendingWishlistIds = new Set();
let wishlist = [];
const legacyWishlist = loadLegacyWishlist();
let wishlistLoadVersion = 0;
let modalTrigger = null;
const gamerTag = loadGamerTag();
let savedDisplayName = gamerTag;
let profileLoadVersion = 0;
let profileSavePending = false;

function findGameById(id) {
    return games.find(game => game.id === id);
}

function findGameByTitle(title) {
    if (typeof title !== "string") {
        return undefined;
    }

    return games.find(game => game.title.toLowerCase() === title.trim().toLowerCase());
}

function setStorageMessage(message) {
    elements.storageMessage.textContent = message;
}

function clearWishlistError() {
    const message = elements.storageMessage.textContent;
    if (message === "Could not sync your wishlist with the backend. Please try again." ||
        message === "Could not update your wishlist. Please try again.") {
        setStorageMessage("");
    }
}

function readStorage(key) {
    try {
        return window.localStorage.getItem(key);
    } catch (error) {
        setStorageMessage("Browser storage is unavailable. Changes will only last for this visit.");
        return null;
    }
}

function writeStorage(key, value) {
    try {
        window.localStorage.setItem(key, value);
        setStorageMessage("");
        return true;
    } catch (error) {
        setStorageMessage("Could not save to browser storage. Changes will only last for this visit.");
        return false;
    }
}

function normalizeWishlistEntry(entry) {
    if (typeof entry === "string") {
        const game = findGameById(entry) || findGameByTitle(entry);
        return game ? game.id : entry;
    }

    if (entry && typeof entry === "object") {
        const game = findGameById(entry.id) ||
            findGameById(entry.gameId) ||
            findGameByTitle(entry.title);
        const legacyId = typeof entry.id === "string"
            ? entry.id
            : (typeof entry.gameId === "string" ? entry.gameId : entry.title);
        return game ? game.id : (typeof legacyId === "string" ? legacyId : null);
    }

    return null;
}

function loadLegacyWishlist() {
    const storedValue = readStorage(legacyWishlistKey);

    if (!storedValue) {
        return [];
    }

    try {
        const parsed = JSON.parse(storedValue);
        if (!Array.isArray(parsed)) {
            setStorageMessage("Saved games could not be read because the stored wishlist format is invalid.");
            return [];
        }

        return [...new Set(parsed.map(normalizeWishlistEntry).filter(Boolean))];
    } catch (error) {
        setStorageMessage("Saved games could not be read because the stored wishlist data is invalid.");
        return [];
    }
}

function loadGamerTag() {
    return readStorage("kinetixGamerTag") || "Player One";
}

function isValidDisplayName(name) {
    return typeof name === "string" && name.trim().length > 0 && name.trim().length <= 24;
}

function getProfileUrl() {
    return `${API_BASE_URL}/profile/${encodeURIComponent(gamerTag)}`;
}

async function parseProfileResponse(response, errorMessage) {
    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error(result.message || errorMessage);
    }

    return result.profile;
}

async function loadProfileFromBackend() {
    const requestVersion = ++profileLoadVersion;
    const initialInputValue = elements.profileInput.value;

    try {
        const response = await fetch(getProfileUrl());
        const profile = await parseProfileResponse(response, "Could not load your profile.");
        if (requestVersion !== profileLoadVersion) {
            return;
        }

        if (profile === null) {
            savedDisplayName = gamerTag;
            elements.profileName.textContent = savedDisplayName;
            if (elements.profileInput.value === initialInputValue) {
                elements.profileInput.value = gamerTag === "Player One" ? "" : gamerTag;
            }
        } else {
            if (!profile || !isValidDisplayName(profile.displayName)) {
                throw new Error("The saved profile has an invalid display name.");
            }

            savedDisplayName = profile.displayName.trim();
            elements.profileName.textContent = savedDisplayName;
            if (elements.profileInput.value === initialInputValue) {
                elements.profileInput.value = savedDisplayName;
            }
        }

        elements.profileMessage.textContent = "";
    } catch (error) {
        if (requestVersion !== profileLoadVersion) {
            return;
        }

        elements.profileMessage.textContent = "Could not load your saved profile. Please try again.";
        console.error("Profile load failed:", error.message);
    }
}

function normalizeBackendWishlist(gameIds) {
    return [...new Set(gameIds
        .filter(gameId => typeof gameId === "string" && gameId.trim())
        .map(gameId => {
            const game = findGameById(gameId) || findGameByTitle(gameId);
            return game ? game.id : gameId;
        }))];
}

function getLegacyWishlistGameIds() {
    return [...new Set(legacyWishlist.map(entry => {
        if (typeof entry !== "string") {
            return null;
        }

        const game = findGameById(entry) || findGameByTitle(entry);
        return game ? game.id : null;
    }).filter(Boolean))];
}

async function parseWishlistResponse(response, errorMessage) {
    const result = await response.json();
    if (!response.ok || !result.success || !Array.isArray(result.gameIds)) {
        throw new Error(result.message || errorMessage);
    }

    return normalizeBackendWishlist(result.gameIds);
}

function getWishlistUrl(gamerTag) {
    return `${API_BASE_URL}/wishlist/${encodeURIComponent(gamerTag)}`;
}

async function loadWishlistFromBackend() {
    const requestVersion = ++wishlistLoadVersion;

    try {
        const response = await fetch(getWishlistUrl(gamerTag));
        const backendWishlist = await parseWishlistResponse(response, "Could not load the wishlist.");
        if (requestVersion !== wishlistLoadVersion) {
            return;
        }
        wishlist = backendWishlist;
        clearWishlistError();
        renderAll();

        if (readStorage(wishlistMigrationKey) === "true") {
            return;
        }

        for (const gameId of getLegacyWishlistGameIds()) {
            if (wishlist.includes(gameId)) {
                continue;
            }

            const migrationResponse = await fetch(getWishlistUrl(gamerTag), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ gameId })
            });
            const migratedIds = await parseWishlistResponse(
                migrationResponse,
                "Could not migrate the saved wishlist."
            );
            if (requestVersion !== wishlistLoadVersion) {
                return;
            }

            wishlist = migratedIds;
            renderAll();
        }

        writeStorage(wishlistMigrationKey, "true");
    } catch (error) {
        if (requestVersion !== wishlistLoadVersion) {
            return;
        }

        setStorageMessage("Could not sync your wishlist with the backend. Please try again.");
        console.error("Wishlist sync failed:", error.message);
    }
}

function gameIsSaved(game) {
    return wishlist.includes(game.id) || wishlist.includes(game.title);
}

function createTextElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) {
        element.className = className;
    }
    element.textContent = text;
    return element;
}

function useImageFallback(image) {
    if (image.dataset.fallbackListenerAttached === "true") {
        return;
    }

    image.dataset.fallbackListenerAttached = "true";
    image.addEventListener("error", function() {
        if (image.dataset.fallbackApplied === "true") {
            return;
        }

        image.dataset.fallbackApplied = "true";
        image.src = "data:image/svg+xml," + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#17132b"/><path d="M0 300h640v60H0z" fill="#201a35"/><text x="50%" y="48%" fill="#22d3ee" font-family="monospace" font-size="24" text-anchor="middle">KINETIX // GAME ART</text></svg>'
        );
    });
}

function createGameCard(game, isWishlistCard) {
    const card = document.createElement("article");
    card.className = "game-card";

    const imageWrap = document.createElement("div");
    imageWrap.className = "game-card-image";

    const image = document.createElement("img");
    image.src = game.image;
    image.alt = game.title + " cover artwork";
    image.loading = "lazy";
    useImageFallback(image);

    const categoryBadge = createTextElement("span", "game-category", game.category);
    imageWrap.append(image, categoryBadge);

    const info = document.createElement("div");
    info.className = "game-info";
    info.append(
        createTextElement("h3", "", game.title),
        createTextElement("p", "game-genre", game.genre),
        createTextElement("p", "game-description", game.description)
    );

    const actions = document.createElement("div");
    actions.className = "game-actions";

    const detailsButton = createTextElement("button", "button button-primary", "View details");
    detailsButton.type = "button";
    detailsButton.dataset.action = "details";
    detailsButton.dataset.gameId = game.id;

    const wishlistButton = createTextElement(
        "button",
        "button wishlist-button",
        isWishlistCard ? "Remove from wishlist" : (gameIsSaved(game) ? "♥ Saved" : "♡ Add to wishlist")
    );
    wishlistButton.type = "button";
    wishlistButton.dataset.action = isWishlistCard ? "remove" : "wishlist";
    wishlistButton.dataset.gameId = game.id;
    wishlistButton.setAttribute("aria-pressed", String(gameIsSaved(game)));
    if (isWishlistCard) {
        wishlistButton.setAttribute("aria-label", "Remove " + game.title + " from wishlist");
    }

    actions.append(detailsButton, wishlistButton);
    info.append(actions);
    card.append(imageWrap, info);
    return card;
}

function getFilteredGames() {
    const searchText = elements.searchInput.value.trim().toLowerCase();
    const sortDirection = elements.sortSelect.value;
    const filteredGames = games.filter(game => {
        const matchesSearch = !searchText ||
            game.title.toLowerCase().includes(searchText) ||
            game.genre.toLowerCase().includes(searchText) ||
            game.categories.some(category => category.toLowerCase().includes(searchText)) ||
            game.tags.some(tag => tag.toLowerCase().includes(searchText));
        const matchesCategory = selectedCategory === "All" || game.categories.includes(selectedCategory);
        return matchesSearch && matchesCategory;
    });

    filteredGames.sort((first, second) => {
        const nameOrder = first.title.localeCompare(second.title, undefined, { sensitivity: "base" });
        return sortDirection === "za" ? -nameOrder : nameOrder;
    });

    return filteredGames;
}

function renderGames() {
    const filteredGames = getFilteredGames();
    const visibleGames = filteredGames.slice(0, visibleGameCount);
    elements.gameContainer.replaceChildren();

    if (filteredGames.length === 0) {
        const emptyState = document.createElement("div");
        emptyState.className = "empty-state";
        emptyState.append(
            createTextElement("strong", "", "No games found"),
            createTextElement("p", "", "Try another search or clear the current filters.")
        );

        const clearButton = createTextElement("button", "button button-outline", "Clear filters");
        clearButton.type = "button";
        clearButton.dataset.action = "clear-filters";
        emptyState.append(clearButton);
        elements.gameContainer.append(emptyState);
    } else {
        visibleGames.forEach(game => {
            elements.gameContainer.append(createGameCard(game, false));
        });
    }

    elements.resultsStatus.textContent = filteredGames.length + (filteredGames.length === 1 ? " game" : " games") +
        (visibleGames.length < filteredGames.length ? " • showing " + visibleGames.length : "");
    elements.loadMoreButton.hidden = visibleGames.length >= filteredGames.length;
    if (!elements.loadMoreButton.hidden) {
        elements.loadMoreButton.textContent = "Load more games (" + (filteredGames.length - visibleGames.length) + " remaining)";
    }
}

function renderWishlist() {
    const knownSavedGames = games.filter(game => gameIsSaved(game));
    const unknownSavedCount = wishlist.filter(entry => !findGameById(entry) && !findGameByTitle(entry)).length;
    elements.wishlistContainer.replaceChildren();
    elements.wishlistCount.textContent = String(wishlist.length);
    elements.navWishlistCount.textContent = String(wishlist.length);

    if (knownSavedGames.length === 0 && unknownSavedCount === 0) {
        const emptyState = document.createElement("div");
        emptyState.className = "empty-state";
        emptyState.append(
            createTextElement("strong", "", "Your wishlist is waiting for its first adventure."),
            createTextElement("p", "", "Save a game from the collection and it will be here next time, too.")
        );
        elements.wishlistContainer.append(emptyState);
    } else {
        knownSavedGames.forEach(game => {
            elements.wishlistContainer.append(createGameCard(game, true));
        });
    }

    if (unknownSavedCount > 0) {
        const legacyNote = createTextElement(
            "p",
            "empty-state legacy-note",
            unknownSavedCount + " older saved " + (unknownSavedCount === 1 ? "title remains" : "titles remain") +
                " in your browser storage but are not part of this demo catalog."
        );
        elements.wishlistContainer.append(legacyNote);
    }
}

function updateHubStats() {
    document.getElementById("hubTotalGames").textContent = String(games.length);
    document.getElementById("hubWishlistGames").textContent = String(wishlist.length);
    document.getElementById("hubCategories").textContent = String(categories.length - 1);
}

function renderCatalogSummary() {
    elements.catalogTotal.textContent = games.length + " games • " + (categories.length - 1) + " categories";
    elements.categorySummary.replaceChildren();

    categories.slice(1).forEach(category => {
        const count = games.filter(game => game.categories.includes(category)).length;
        elements.categorySummary.append(createTextElement("span", "category-summary-item", category + " " + count));
    });
}

function renderAll() {
    renderGames();
    renderWishlist();
    updateHubStats();
    renderCatalogSummary();
}

function renderCategories() {
    elements.categoryContainer.replaceChildren();
    categories.forEach(category => {
        const categoryCount = category === "All"
            ? games.length
            : games.filter(game => game.categories.includes(category)).length;
        const button = createTextElement("button", "category-button", category);
        button.type = "button";
        button.dataset.category = category;
        button.setAttribute("aria-pressed", String(category === selectedCategory));
        button.setAttribute("aria-label", category + ": " + categoryCount + " games");
        button.append(createTextElement("span", "category-count", String(categoryCount)));
        elements.categoryContainer.append(button);
    });
}

async function toggleWishlist(gameId, button) {
    const game = findGameById(gameId);
    if (!game || pendingWishlistIds.has(gameId)) {
        return;
    }

    const shouldRemove = gameIsSaved(game);
    pendingWishlistIds.add(gameId);
    button.disabled = true;
    button.setAttribute("aria-busy", "true");

    try {
        const response = shouldRemove
            ? await fetch(getWishlistUrl(gamerTag) + "/" + encodeURIComponent(gameId), {
                method: "DELETE"
            })
            : await fetch(getWishlistUrl(gamerTag), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ gameId })
            });
        const updatedWishlist = await parseWishlistResponse(
            response,
            "Could not update the wishlist."
        );

        wishlist = updatedWishlist;
        clearWishlistError();
    } catch (error) {
        setStorageMessage("Could not update your wishlist. Please try again.");
        console.error("Wishlist update failed:", error.message);
    } finally {
        pendingWishlistIds.delete(gameId);
        if (button.isConnected) {
            button.disabled = false;
            button.removeAttribute("aria-busy");
        }
        renderAll();
    }
}

function showGameDetails(gameId, trigger) {
    const game = findGameById(gameId);
    if (!game) {
        return;
    }

    modalTrigger = trigger || document.activeElement;
    elements.modalImage.src = game.image;
    elements.modalImage.alt = game.title + " cover artwork";
    elements.modalImage.dataset.fallbackApplied = "false";
    useImageFallback(elements.modalImage);
    elements.modalCategory.textContent = game.categories.join(" • ");
    elements.modalTitle.textContent = game.title;
    elements.modalGenre.textContent = game.genre;
    elements.modalDescription.textContent = game.description;
    elements.modalLink.href = game.link;
    elements.modalTags.replaceChildren();
    game.tags.forEach(tag => {
        elements.modalTags.append(createTextElement("span", "", tag));
    });

    elements.modal.classList.add("open");
    elements.modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    elements.closeModalButton.focus();
}

function closeGameDetails() {
    if (!elements.modal.classList.contains("open")) {
        return;
    }

    elements.modal.classList.remove("open");
    elements.modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";

    if (modalTrigger && typeof modalTrigger.focus === "function") {
        modalTrigger.focus();
    }
    modalTrigger = null;
}

function handleCardAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
        return;
    }

    if (button.dataset.action === "clear-filters") {
        elements.searchInput.value = "";
        selectedCategory = "All";
        visibleGameCount = pageSize;
        renderCategories();
        renderGames();
        return;
    }

    if (button.dataset.action === "details") {
        showGameDetails(button.dataset.gameId, button);
    } else if (button.dataset.action === "wishlist" || button.dataset.action === "remove") {
        toggleWishlist(button.dataset.gameId, button);
    }
}

async function saveProfileName() {
    if (profileSavePending) {
        return;
    }

    const displayName = elements.profileInput.value.trim();
    if (!displayName) {
        elements.profileMessage.textContent = "Enter a display name before saving.";
        return;
    }
    if (displayName.length > 24) {
        elements.profileMessage.textContent = "Display names must be 24 characters or fewer.";
        return;
    }

    profileSavePending = true;
    profileLoadVersion += 1;
    elements.saveProfileButton.disabled = true;
    elements.profileInput.disabled = true;
    elements.saveProfileButton.setAttribute("aria-busy", "true");
    elements.profileMessage.textContent = "Saving your display name...";

    try {
        const response = await fetch(getProfileUrl(), {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ displayName })
        });
        const profile = await parseProfileResponse(response, "Could not save your profile.");
        if (!profile || !isValidDisplayName(profile.displayName)) {
            throw new Error("The backend returned an invalid profile.");
        }

        savedDisplayName = profile.displayName.trim();
        elements.profileName.textContent = savedDisplayName;
        elements.profileInput.value = savedDisplayName;
        elements.profileMessage.textContent = "Display name saved.";
    } catch (error) {
        elements.profileMessage.textContent = "Could not save your display name. Please try again.";
        console.error("Profile save failed:", error.message);
    } finally {
        profileSavePending = false;
        elements.saveProfileButton.disabled = false;
        elements.profileInput.disabled = false;
        elements.saveProfileButton.removeAttribute("aria-busy");
    }
}

function setMenuOpen(isOpen) {
    elements.navigation.classList.toggle("is-open", isOpen);
    elements.menuToggle.setAttribute("aria-expanded", String(isOpen));
    elements.menuToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
}

function handleMenuKeydown(event) {
    if (event.key === "Escape" && elements.navigation.classList.contains("is-open")) {
        setMenuOpen(false);
        elements.menuToggle.focus();
    }

    if (event.key === "Escape" && elements.modal.classList.contains("open")) {
        closeGameDetails();
    }

    if (event.key === "Tab" && elements.modal.classList.contains("open")) {
        const focusable = elements.modal.querySelectorAll("button, a[href]");
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }
}

function setActiveNavigation() {
    const sections = document.querySelectorAll("main section[id]");
    const links = elements.navigation.querySelectorAll("a[href^='#']");

    if (!("IntersectionObserver" in window)) {
        return;
    }

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) {
                return;
            }

            links.forEach(link => {
                const isActive = link.getAttribute("href") === "#" + entry.target.id;
                if (isActive) {
                    link.setAttribute("aria-current", "location");
                } else {
                    link.removeAttribute("aria-current");
                }
                link.classList.toggle("active", isActive);
            });
        });
    }, { rootMargin: "-30% 0px -60% 0px" });

    sections.forEach(section => observer.observe(section));
}

elements.searchInput.addEventListener("input", function() {
    visibleGameCount = pageSize;
    renderGames();
});
elements.searchForm.addEventListener("submit", function(event) {
    event.preventDefault();
    visibleGameCount = pageSize;
    renderGames();
    document.getElementById("explore").scrollIntoView({ behavior: "smooth", block: "start" });
});
elements.sortSelect.addEventListener("change", function() {
    visibleGameCount = pageSize;
    renderGames();
});
elements.categoryContainer.addEventListener("click", function(event) {
    const button = event.target.closest("button[data-category]");
    if (!button) {
        return;
    }

    selectedCategory = button.dataset.category;
    visibleGameCount = pageSize;
    renderCategories();
    renderGames();
});
elements.loadMoreButton.addEventListener("click", function() {
    visibleGameCount += pageSize;
    renderGames();
});
elements.gameContainer.addEventListener("click", handleCardAction);
elements.wishlistContainer.addEventListener("click", handleCardAction);
elements.closeModalButton.addEventListener("click", closeGameDetails);
elements.modal.addEventListener("click", function(event) {
    if (event.target.matches("[data-close-modal]")) {
        closeGameDetails();
    }
});
elements.saveProfileButton.addEventListener("click", saveProfileName);
elements.profileInput.addEventListener("keydown", function(event) {
    if (event.key === "Enter") {
        saveProfileName();
    }
});
elements.menuToggle.addEventListener("click", function() {
    setMenuOpen(elements.menuToggle.getAttribute("aria-expanded") !== "true");
});
elements.navigation.addEventListener("click", function(event) {
    if (event.target.closest("a")) {
        setMenuOpen(false);
    }
});
elements.menuToggle.ownerDocument.addEventListener("keydown", handleMenuKeydown);
window.addEventListener("resize", function() {
    if (window.innerWidth > 820) {
        setMenuOpen(false);
    }
});

document.getElementById("surpriseButton").addEventListener("click", function(event) {
    if (games.length === 0) {
        return;
    }

    const randomGame = games[Math.floor(Math.random() * games.length)];
    showGameDetails(randomGame.id, event.currentTarget);
});
document.getElementById("featuredDetailsButton").addEventListener("click", function(event) {
    showGameDetails("hollow-knight", event.currentTarget);
});

elements.profileName.textContent = savedDisplayName;
if (gamerTag !== "Player One") {
    elements.profileInput.value = gamerTag;
}
document.getElementById("currentYear").textContent = String(new Date().getFullYear());
renderCategories();
renderAll();
setActiveNavigation();



const API_BASE_URL = "http://localhost:5000/api";

loadProfileFromBackend();

async function loadGamesFromBackend() {
    try {
        const response = await fetch(`${API_BASE_URL}/games`);
        const result = await response.json();

        if (!response.ok || !result.success || !Array.isArray(result.games)) {
            throw new Error(result.message || "Could not load games from backend.");
        }

        games = result.games;
        renderCategories();
        renderAll();
        await loadWishlistFromBackend();

        console.log("🎮 Games loaded from backend:", games.length);

    } catch (error) {
        console.error("Backend connection error:", error.message);
        elements.resultsStatus.textContent = "Games could not be loaded.";
        elements.gameContainer.replaceChildren(
            createTextElement("p", "empty-state", "Unable to load games. Please check the backend server.")
        );
    }
}
// Start loading games
loadGamesFromBackend();