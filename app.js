/* ===== The Pistachio Kitchen ===== */
(() => {
  "use strict";

  const STORE_KEY = "pistachio-kitchen-recipes-v1";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ---------- State ----------
  let recipes = load();
  let activeTag = "All";
  let searchTerm = "";
  let editingId = null;
  let viewingId = null;
  let viewMode = "card"; // "card" | "index"

  // ---------- Storage ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(recipes));
    cloudPush();
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------- Cloud sync (Firebase) ----------
  // Recipes are mirrored to a single shared Firestore document, so both signed-in
  // devices converge on the same list instead of staying stuck in localStorage.
  const HOUSEHOLD_DOC = "households/shared";
  let cloudDb = null;
  let cloudUser = null;
  let cloudUnsub = null;
  let applyingRemoteUpdate = false;

  function setSyncStatus(state, label) {
    const el = $("#syncStatus");
    if (!el) return;
    if (!state) { el.hidden = true; return; }
    el.hidden = false;
    el.dataset.state = state;
    const icons = { syncing: "🔄", synced: "☁️", error: "⚠️", "signed-out": "🔒" };
    el.textContent = `${icons[state] || ""} ${label}`;
  }

  function cloudReady() {
    return !!(window.firebase && window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey);
  }

  function cloudInit() {
    if (!cloudReady()) return; // no firebase-config.js provided — app just runs local-only
    firebase.initializeApp(window.FIREBASE_CONFIG);
    cloudDb = firebase.firestore();

    firebase.auth().onAuthStateChanged((user) => {
      cloudUser = user;
      updateAuthUI();
      if (cloudUnsub) { cloudUnsub(); cloudUnsub = null; }
      if (user) {
        setSyncStatus("syncing", "Syncing…");
        cloudUnsub = cloudDb.doc(HOUSEHOLD_DOC).onSnapshot(
          (snap) => {
            const data = snap.exists ? snap.data().recipes : [];
            applyingRemoteUpdate = true;
            recipes = Array.isArray(data) ? data : [];
            localStorage.setItem(STORE_KEY, JSON.stringify(recipes));
            renderFilters();
            renderGrid();
            applyingRemoteUpdate = false;
            setSyncStatus("synced", "Synced");
          },
          (err) => {
            console.error(err);
            setSyncStatus("error", "Sync error");
          }
        );
      } else {
        setSyncStatus("signed-out", "Signed out");
      }
    });
  }

  function cloudPush() {
    if (!cloudDb || !cloudUser || applyingRemoteUpdate) return;
    setSyncStatus("syncing", "Syncing…");
    cloudDb.doc(HOUSEHOLD_DOC).set({ recipes, updatedAt: Date.now() })
      .then(() => setSyncStatus("synced", "Synced"))
      .catch((err) => {
        console.error(err);
        setSyncStatus("error", "Sync failed");
      });
  }

  function updateAuthUI() {
    const signedIn = !!cloudUser;
    $("#authSignedOut").hidden = signedIn;
    $("#authSignedIn").hidden = !signedIn;
    if (signedIn) $("#authEmail").textContent = cloudUser.email;
  }

  function openAccountSettings() {
    $("#authError").hidden = true;
    $("#authForm").reset();
    $("#auth-password").type = "password";
    $("#toggleAuthPassword").checked = false;
    updateAuthUI();
    $("#accountModal").hidden = false;
  }
  function closeAccountSettings() {
    $("#accountModal").hidden = true;
  }
  function submitAuthForm(e) {
    e.preventDefault();
    if (!cloudReady()) {
      showAuthError("Cloud sync isn't configured yet.");
      return;
    }
    const form = e.target;
    const email = form.email.value.trim();
    const password = form.password.value;
    firebase.auth().signInWithEmailAndPassword(email, password)
      .then(() => { closeAccountSettings(); toast("Signed in ✅"); })
      .catch((err) => showAuthError(err.message));
  }
  function showAuthError(msg) {
    const el = $("#authError");
    el.textContent = msg;
    el.hidden = false;
  }
  function signOutCloud() {
    firebase.auth().signOut().then(() => toast("Signed out"));
  }

  // ---------- Helpers ----------
  const esc = (s = "") => s.replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lines = (s = "") => s.split("\n").map(l => l.trim()).filter(Boolean);

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.hidden = true), 2600);
  }

  // ---------- Rendering: grid ----------
  function allTags() {
    const set = new Set();
    recipes.forEach(r => (r.tags || []).forEach(t => set.add(t)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function renderFilters() {
    const bar = $("#tagFilters");
    const tags = ["All", ...allTags()];
    bar.innerHTML = tags.map(t =>
      `<button class="chip ${t === activeTag ? "active" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`
    ).join("");
    // hide filter bar entirely if there are no custom tags
    $("#filterbar").style.display = allTags().length ? "" : "none";
  }

  function filtered() {
    const term = searchTerm.toLowerCase();
    return recipes.filter(r => {
      const tagOk = activeTag === "All" || (r.tags || []).includes(activeTag);
      if (!tagOk) return false;
      if (!term) return true;
      const hay = [r.title, r.description, (r.tags || []).join(" "),
        (r.ingredients || []).join(" ")].join(" ").toLowerCase();
      return hay.includes(term);
    });
  }

  function renderGrid() {
    const grid = $("#recipeGrid");
    const empty = $("#emptyState");
    const list = filtered();

    $("#gridTitle").textContent =
      searchTerm ? `Results for “${searchTerm}”` :
      activeTag === "All" ? "All Recipes" : activeTag;
    $("#gridCount").textContent =
      recipes.length ? `${list.length} recipe${list.length === 1 ? "" : "s"}` : "";

    if (!recipes.length) {
      grid.innerHTML = "";
      empty.hidden = false;
      empty.innerHTML = `
        <div class="emoji">🌱</div>
        <h2>Your cookbook is empty</h2>
        <p>Add your first recipe, or start with a few samples to see how it looks.</p>
        <div class="actions">
          <button class="btn btn-primary" onclick="document.getElementById('addRecipeBtn').click()">+ Add your first recipe</button>
          <button class="btn btn-ghost" id="emptyLoadSamples">🌱 Load sample recipes</button>
        </div>`;
      $("#emptyLoadSamples").onclick = loadSamples;
      return;
    }

    if (!list.length) {
      grid.innerHTML = "";
      empty.hidden = false;
      empty.innerHTML = `
        <div class="emoji">🔍</div>
        <h2>No matches</h2>
        <p>Try a different search or clear the filter.</p>
        <div class="actions"><button class="btn btn-ghost" id="clearFilters">Clear filters</button></div>`;
      $("#clearFilters").onclick = () => { searchTerm = ""; activeTag = "All"; $("#searchInput").value = ""; renderFilters(); renderGrid(); };
      return;
    }

    empty.hidden = true;
    grid.innerHTML = list.map(r => `
      <article class="card" data-id="${r.id}">
        <div class="card-photo">
          ${r.image ? `<img src="${r.image}" alt="${esc(r.title)}" />` : `<span class="placeholder">🍽️</span>`}
        </div>
        <div class="card-body">
          <h3 class="card-title">${esc(r.title)}</h3>
          ${r.description ? `<p class="card-desc">${esc(r.description)}</p>` : ""}
          ${(r.tags || []).length ? `<div class="card-tags">${r.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
          <div class="card-meta">
            ${r.prepTime ? `<span>⏱️ ${esc(r.prepTime)}</span>` : ""}
            ${r.servings ? `<span>🍽️ ${esc(r.servings)}</span>` : ""}
          </div>
        </div>
      </article>`).join("");

    $$(".card", grid).forEach(c =>
      c.addEventListener("click", () => showRecipe(c.dataset.id)));
  }

  // ---------- Rendering: single recipe ----------
  function showRecipe(id) {
    viewingId = id;
    viewMode = "card";
    renderRecipeView();
  }

  function renderRecipeView() {
    const r = recipes.find(x => x.id === viewingId);
    if (!r) return;
    const view = $("#recipeView");

    view.innerHTML = `
      <button class="back-link" id="backBtn">← Back to all recipes</button>
      <div class="view-switch" id="viewSwitch" style="margin-bottom:20px">
        <button data-mode="card" class="${viewMode === "card" ? "active" : ""}">Card view</button>
        <button data-mode="index" class="${viewMode === "index" ? "active" : ""}">Index card view</button>
      </div>
      <div id="recipeBody"></div>
    `;

    $("#recipeBody").innerHTML = viewMode === "index" ? recipeIndexCardHtml(r) : recipeCardHtml(r);

    $("#gridView").hidden = true;
    $("#filterbar").style.display = "none";
    view.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });

    $("#backBtn").onclick = goHome;
    $$("#viewSwitch button").forEach(b => b.onclick = () => {
      viewMode = b.dataset.mode;
      renderRecipeView();
    });

    const printBtn = $("#printBtn");
    if (printBtn) printBtn.onclick = () => window.print();
    const editBtn = $("#editBtn");
    if (editBtn) editBtn.onclick = () => openEditor(r.id);
    const deleteBtn = $("#deleteBtn");
    if (deleteBtn) deleteBtn.onclick = () => deleteRecipe(r.id);
    const shareBtn = $("#shareBtn");
    if (shareBtn) shareBtn.onclick = () => shareRecipe(r);
  }

  function recipeCardHtml(r) {
    return `
      <div class="recipe-top">
        <div class="recipe-hero">
          ${r.image ? `<img src="${r.image}" alt="${esc(r.title)}" />` : `<span class="placeholder">🍽️</span>`}
        </div>
        <div class="recipe-headline">
          ${(r.tags || []).length ? `<div class="card-tags" style="margin-bottom:12px">${r.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
          <h1>${esc(r.title)}${r.source ? ` <span style="font-size:16px;font-weight:400;color:var(--ink-soft)">(${esc(r.source)})</span>` : ""}</h1>
          ${r.description ? `<p class="desc">${esc(r.description)}</p>` : ""}
          <div class="recipe-stats">
            ${r.prepTime ? `<div class="stat"><div class="label">Prep</div><div class="value">${esc(r.prepTime)}</div></div>` : ""}
            ${r.cookTime ? `<div class="stat"><div class="label">Cook</div><div class="value">${esc(r.cookTime)}</div></div>` : ""}
            ${r.servings ? `<div class="stat"><div class="label">Serves</div><div class="value">${esc(r.servings)}</div></div>` : ""}
          </div>
          <div class="recipe-actions">
            <button class="btn btn-primary" id="printBtn">🖨️ Print</button>
            <button class="btn btn-ghost" id="shareBtn">🔗 Share</button>
            <button class="btn btn-ghost" id="editBtn">✏️ Edit</button>
            <button class="btn btn-ghost" id="deleteBtn">🗑️ Delete</button>
          </div>
        </div>
      </div>
      <div class="recipe-cols">
        <div>
          <h3>Ingredients</h3>
          <ul class="ingredients-list">
            ${(r.ingredients || []).map(i => `<li>${esc(i)}</li>`).join("") || "<li>No ingredients listed</li>"}
          </ul>
        </div>
        <div>
          <h3>Steps</h3>
          <ol class="steps-list">
            ${(r.steps || []).map(s => `<li>${esc(s)}</li>`).join("") || "<li>No steps listed</li>"}
          </ol>
        </div>
      </div>
      ${r.notes ? `<div class="recipe-notes"><h3>Notes</h3><p>${esc(r.notes)}</p></div>` : ""}
    `;
  }

  function recipeIndexCardHtml(r) {
    const procedure = (r.steps || []).join(" ");
    return `
      <div class="index-card">
        <div class="ic-head">
          <h1 class="ic-title">${esc(r.title)}</h1>
          ${r.source ? `<span class="ic-source">(${esc(r.source)})</span>` : ""}
        </div>
        ${r.image ? `<div class="ic-photo"><img src="${r.image}" alt="${esc(r.title)}" /></div>` : ""}
        <div class="ic-cols">
          <div class="ic-ingredients">
            <h3>Ingredients:</h3>
            <ul>
              ${(r.ingredients || []).map(i => `<li>${esc(i)}</li>`).join("") || "<li>No ingredients listed</li>"}
            </ul>
          </div>
          <div class="ic-procedure">
            <div class="ic-proc-box">
              <p><strong class="ic-proc-label">Procedure:</strong> ${procedure ? esc(procedure) : "No procedure listed."}</p>
            </div>
          </div>
        </div>
        ${r.notes ? `<div class="ic-notes">${esc(r.notes)}</div>` : ""}
        <div class="recipe-actions" style="margin-top:26px">
          <button class="btn btn-primary" id="printBtn">🖨️ Print</button>
          <button class="btn btn-ghost" id="shareBtn">🔗 Share</button>
          <button class="btn btn-ghost" id="editBtn">✏️ Edit</button>
          <button class="btn btn-ghost" id="deleteBtn">🗑️ Delete</button>
        </div>
      </div>
    `;
  }

  function goHome() {
    viewingId = null;
    $("#recipeView").hidden = true;
    $("#gridView").hidden = false;
    renderFilters();
    renderGrid();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- Share ----------
  async function shareRecipe(r) {
    const text = recipeToText(r);
    if (navigator.share) {
      try { await navigator.share({ title: r.title, text }); return; } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("Recipe copied to clipboard 📋");
    } catch {
      // fallback: download as .txt
      downloadFile(`${r.title}.txt`, text, "text/plain");
    }
  }

  function recipeToText(r) {
    const parts = [r.title.toUpperCase() + (r.source ? ` (${r.source})` : ""), ""];
    if (r.description) parts.push(r.description, "");
    const meta = [r.prepTime && `Prep: ${r.prepTime}`, r.cookTime && `Cook: ${r.cookTime}`, r.servings && `Serves: ${r.servings}`].filter(Boolean);
    if (meta.length) parts.push(meta.join("  |  "), "");
    if ((r.ingredients || []).length) parts.push("INGREDIENTS", ...r.ingredients.map(i => "• " + i), "");
    if ((r.steps || []).length) parts.push("STEPS", ...r.steps.map((s, i) => `${i + 1}. ${s}`), "");
    if (r.notes) parts.push("NOTES", r.notes);
    return parts.join("\n");
  }

  // ---------- Editor modal ----------
  function openEditor(id = null) {
    editingId = id;
    const form = $("#recipeForm");
    form.reset();
    $("#imagePreview").hidden = true;
    delete form.dataset.image;

    if (id) {
      const r = recipes.find(x => x.id === id);
      $("#editorTitle").textContent = "Edit Recipe";
      form.title.value = r.title || "";
      form.source.value = r.source || "";
      form.description.value = r.description || "";
      form.prepTime.value = r.prepTime || "";
      form.cookTime.value = r.cookTime || "";
      form.servings.value = r.servings || "";
      form.tags.value = (r.tags || []).join(", ");
      form.ingredients.value = (r.ingredients || []).join("\n");
      form.steps.value = (r.steps || []).join("\n");
      form.notes.value = r.notes || "";
      if (r.image) {
        form.dataset.image = r.image;
        $("#imagePreviewImg").src = r.image;
        $("#imagePreview").hidden = false;
      }
    } else {
      $("#editorTitle").textContent = "Add a Recipe";
    }
    $("#editorModal").hidden = false;
    setTimeout(() => form.title.focus(), 50);
  }

  function closeEditor() {
    $("#editorModal").hidden = true;
    editingId = null;
  }

  function handleImage(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // downscale big photos to keep localStorage happy
      const img = new Image();
      img.onload = () => {
        const max = 1000;
        let { width, height } = img;
        if (width > max || height > max) {
          const s = Math.min(max / width, max / height);
          width = Math.round(width * s); height = Math.round(height * s);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const data = canvas.toDataURL("image/jpeg", 0.82);
        $("#recipeForm").dataset.image = data;
        $("#imagePreviewImg").src = data;
        $("#imagePreview").hidden = false;
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function submitForm(e) {
    e.preventDefault();
    const form = e.target;
    const data = {
      title: form.title.value.trim(),
      source: form.source.value.trim(),
      description: form.description.value.trim(),
      prepTime: form.prepTime.value.trim(),
      cookTime: form.cookTime.value.trim(),
      servings: form.servings.value.trim(),
      tags: form.tags.value.split(",").map(t => t.trim()).filter(Boolean),
      ingredients: lines(form.ingredients.value),
      steps: lines(form.steps.value),
      notes: form.notes.value.trim(),
      image: form.dataset.image || "",
    };
    if (!data.title) { toast("Please add a recipe name"); return; }

    try {
      if (editingId) {
        const idx = recipes.findIndex(x => x.id === editingId);
        recipes[idx] = { ...recipes[idx], ...data };
        save();
        closeEditor();
        renderFilters();
        showRecipe(editingId);
        toast("Recipe updated ✅");
      } else {
        const id = uid();
        recipes.unshift({ id, ...data, created: Date.now() });
        save();
        closeEditor();
        goHome();
        toast("Recipe saved 🌿");
      }
    } catch (err) {
      // localStorage quota — usually from too many large photos
      toast("Couldn't save — storage is full. Try a smaller photo.");
      console.error(err);
    }
  }

  function deleteRecipe(id) {
    const r = recipes.find(x => x.id === id);
    if (!confirm(`Delete “${r.title}”? This can't be undone.`)) return;
    recipes = recipes.filter(x => x.id !== id);
    save();
    goHome();
    toast("Recipe deleted");
  }

  // ---------- Export / Import ----------
  function downloadFile(name, content, type = "application/json") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportAll() {
    if (!recipes.length) { toast("No recipes to back up yet"); return; }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`pistachio-cookbook-${stamp}.json`, JSON.stringify(recipes, null, 2));
    toast("Backup downloaded 💾");
  }

  function importAll(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error("bad format");
        const merge = recipes.length &&
          confirm("Merge with your current recipes?\n\nOK = merge / add\nCancel = replace everything");
        if (merge) {
          const ids = new Set(recipes.map(r => r.id));
          data.forEach(r => { if (!r.id || ids.has(r.id)) r.id = uid(); recipes.push(r); });
        } else {
          recipes = data.map(r => ({ id: r.id || uid(), ...r }));
        }
        save();
        goHome();
        toast(`Imported ${data.length} recipe${data.length === 1 ? "" : "s"} ✅`);
      } catch {
        toast("That file didn't look like a cookbook backup");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function clearAll() {
    if (!recipes.length) return;
    if (!confirm("Remove ALL recipes? Make sure you've exported a backup first.")) return;
    recipes = [];
    save();
    goHome();
    toast("All recipes removed");
  }

  // ---------- Sample recipes ----------
  function loadSamples() {
    const samples = [
      {
        title: "Magic Green Cookies",
        source: "Madeleine Matthews",
        description: "A stiff, nutty dough that bakes up fast and turns green on the inside as it cools.",
        prepTime: "15 min", cookTime: "9 min", servings: "24",
        tags: ["Dessert", "Baking"],
        ingredients: ["1 cup sunflower seed butter", "2 eggs", "½ cup brown sugar or maple syrup", "2-3 tsp. vanilla", "2 cups flour", "½ tsp. baking soda", "2 tsp. corn starch", "½ tsp. salt", "Milk (omit if using maple syrup)", "Chocolate chips or any other kind of chocolate candies (optional)"],
        steps: ["Preheat oven to 375°.", "Combine sunflower seed butter, eggs, brown sugar, and vanilla in a bowl until smooth.", "Mix in flour, baking soda, corn starch, and salt. Dough will be stiff.", "Add in a little bit of milk and mix in until dough is softer and more pliable.", "Roll into balls and top with chocolate chips or other chocolate candies, if desired.", "Bake on a cookie sheet for 9 minutes.", "Cool for about an hour and a half, and cookies will be green on the inside. They will continue to develop color over time.", "You can also make a glaze to go on top after cooling."],
        notes: "Cookies continue to turn green as they cool — this is a normal reaction between the baking soda and sunflower seed butter, not a sign anything went wrong."
      },
      {
        title: "Pistachio & Lemon Olive Oil Cake",
        description: "A tender, fragrant cake with ground pistachios and bright lemon — lovely with tea.",
        prepTime: "20 min", cookTime: "40 min", servings: "10",
        tags: ["Dessert", "Baking", "Family Favorite"],
        ingredients: ["1 cup shelled pistachios, finely ground", "1½ cups flour", "1 cup sugar", "3 eggs", "¾ cup olive oil", "Zest & juice of 1 lemon", "1½ tsp baking powder", "Pinch of salt"],
        steps: ["Preheat oven to 350°F and grease a round cake pan.", "Whisk eggs and sugar until pale and fluffy.", "Slowly stream in olive oil, then lemon zest and juice.", "Fold in ground pistachios, flour, baking powder and salt.", "Pour into pan and bake 38–42 min until golden.", "Cool, then dust with powdered sugar and extra pistachios."],
        notes: "Keeps moist for 3–4 days covered. Freezes beautifully."
      },
      {
        title: "Herbed Spring Pea Soup",
        description: "Bright green, silky, and ready in 25 minutes — tastes like spring.",
        prepTime: "10 min", cookTime: "15 min", servings: "4",
        tags: ["Soup", "Vegetarian", "Quick"],
        ingredients: ["1 tbsp butter", "1 leek, sliced", "4 cups fresh or frozen peas", "3 cups vegetable stock", "Handful fresh mint & parsley", "Salt & pepper", "Splash of cream (optional)"],
        steps: ["Melt butter and soften the leek for 5 minutes.", "Add peas and stock, simmer 8 minutes.", "Add herbs, then blend until smooth.", "Season to taste and finish with a swirl of cream."],
        notes: "Serve with crusty bread and a squeeze of lemon."
      },
      {
        title: "Garlic Butter Roast Chicken",
        description: "A classic Sunday roast — crispy skin, juicy inside.",
        prepTime: "15 min", cookTime: "1 hr 20 min", servings: "6",
        tags: ["Dinner", "Family Favorite"],
        ingredients: ["1 whole chicken (about 4 lb)", "4 tbsp softened butter", "4 cloves garlic, minced", "1 lemon, halved", "Fresh thyme & rosemary", "Salt & pepper"],
        steps: ["Preheat oven to 425°F.", "Mix butter with garlic and chopped herbs.", "Rub butter under and over the skin; season well.", "Stuff cavity with lemon and herb sprigs.", "Roast 1 hr 20 min, basting once, until juices run clear.", "Rest 15 minutes before carving."],
        notes: "Save the bones for stock!"
      }
    ];
    const existing = new Set(recipes.map(r => r.title));
    let added = 0;
    samples.forEach(s => {
      if (!existing.has(s.title)) { recipes.unshift({ id: uid(), created: Date.now(), ...s }); added++; }
    });
    save();
    goHome();
    toast(added ? `Added ${added} sample recipe${added === 1 ? "" : "s"} 🌱` : "Samples already loaded");
  }

  // ---------- Wire up ----------
  function init() {
    $("#addRecipeBtn").onclick = () => openEditor();
    $("#homeLink").onclick = (e) => { e.preventDefault(); searchTerm = ""; $("#searchInput").value = ""; activeTag = "All"; goHome(); };
    $("#closeEditor").onclick = closeEditor;
    $("#cancelEditor").onclick = closeEditor;
    $("#recipeForm").addEventListener("submit", submitForm);
    $("#f-image").addEventListener("change", handleImage);

    $("#searchInput").addEventListener("input", (e) => {
      searchTerm = e.target.value.trim();
      if (!$("#recipeView").hidden) goHome();
      renderGrid();
    });

    $("#tagFilters").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      activeTag = chip.dataset.tag;
      renderFilters();
      renderGrid();
    });

    // menu
    const menuBtn = $("#menuBtn"), menuList = $("#menuList");
    menuBtn.onclick = (e) => { e.stopPropagation(); const open = menuList.hidden; menuList.hidden = !open; menuBtn.setAttribute("aria-expanded", String(open)); };
    document.addEventListener("click", () => { menuList.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); });
    menuList.addEventListener("click", (e) => {
      const action = e.target.dataset.action;
      if (!action) return;
      ({ export: exportAll, import: () => $("#importFile").click(), loadSamples, clearAll, account: openAccountSettings }[action] || (() => {}))();
    });
    $("#importFile").addEventListener("change", importAll);

    // close modal on backdrop / Esc
    $("#editorModal").addEventListener("click", (e) => { if (e.target.id === "editorModal") closeEditor(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("#editorModal").hidden) closeEditor();
      if (e.key === "Escape" && !$("#accountModal").hidden) closeAccountSettings();
    });

    // Account / cloud sync modal
    $("#closeAccountModal").onclick = closeAccountSettings;
    $("#authForm").addEventListener("submit", submitAuthForm);
    $("#authSignOut").onclick = signOutCloud;
    $("#accountModal").addEventListener("click", (e) => { if (e.target.id === "accountModal") closeAccountSettings(); });
    $("#toggleAuthPassword").addEventListener("change", (e) => {
      $("#auth-password").type = e.target.checked ? "text" : "password";
    });

    renderFilters();
    renderGrid();
    cloudInit();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
