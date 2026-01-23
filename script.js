
/* ===== TEMP SAFARI ERROR LOGGER (REMOVE AFTER FIX) ===== */
(function () {
  const box = document.createElement("div");
  box.style.position = "fixed";
  box.style.bottom = "0";
  box.style.left = "0";
  box.style.right = "0";
  box.style.maxHeight = "40%";
  box.style.overflow = "auto";
  box.style.background = "#111";
  box.style.color = "#f55";
  box.style.fontSize = "12px";
  box.style.fontFamily = "monospace";
  box.style.padding = "8px";
  box.style.zIndex = "999999";
  box.style.whiteSpace = "pre-wrap";
  box.textContent = "JS Errors:\n";
 function attachBox() {
  if (document.body) {
    document.body.appendChild(box);
  } else {
    setTimeout(attachBox, 50);
  }
}
attachBox();

  window.onerror = function (msg, src, line, col, err) {
    box.textContent += `\n${msg}\nline ${line}:${col}\n`;
  };

  window.onunhandledrejection = function (e) {
    box.textContent += `\nPROMISE ERROR:\n${e.reason}\n`;
  };
})();

console.log("SCRIPT LOADED");
/* =========================================================
   INDEXEDDB — ATTACHMENTS ONLY (ISOLATED)
========================================================= */

const ATTACHMENT_DB_NAME = "mealPlannerAttachments";
const ATTACHMENT_STORE = "files";
const ATTACHMENT_DB_VERSION = 1;

let attachmentDB = null;

function openAttachmentDB() {
  if (attachmentDB) return Promise.resolve(attachmentDB);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(
      ATTACHMENT_DB_NAME,
      ATTACHMENT_DB_VERSION
    );

    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(ATTACHMENT_STORE)) {
        db.createObjectStore(ATTACHMENT_STORE);
      }
    };

    req.onsuccess = e => {
      attachmentDB = e.target.result;
      resolve(attachmentDB);
    };

    req.onerror = () => reject(req.error);
  });
}

async function storeAttachmentBlob(id, blob) {
  const db = await openAttachmentDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ATTACHMENT_STORE, "readwrite");
    const store = tx.objectStore(ATTACHMENT_STORE);
    store.put(blob, id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getAttachmentBlob(id) {
  const db = await openAttachmentDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ATTACHMENT_STORE, "readonly");
    const store = tx.objectStore(ATTACHMENT_STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteAttachmentBlob(id) {
  const db = await openAttachmentDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ATTACHMENT_STORE, "readwrite");
    const store = tx.objectStore(ATTACHMENT_STORE);
    store.delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/* =========================================================
   DATA + STORAGE
========================================================= */

let categories = JSON.parse(localStorage.getItem("mp_categories")) || [];
let meals = JSON.parse(localStorage.getItem("mp_meals")) || [];
let plan = JSON.parse(localStorage.getItem("mp_plan")) || {
  sun: null, mon: null, tue: null, wed: null,
  thu: null, fri: null, sat: null
};

/* ===== NORMALIZE MEALS (CRITICAL) ===== */
let mealsChanged = false;

meals.forEach(m => {
  if (!Array.isArray(m.categoryIds)) {
    m.categoryIds = [];
    mealsChanged = true;
  }

  if (!Array.isArray(m.ingredients)) {
    m.ingredients = [];
    mealsChanged = true;
  }

  if (!Array.isArray(m.attachments)) {
    m.attachments = [];
    mealsChanged = true;
  }

  if (typeof m.rating !== "string") {
    m.rating = "";
    mealsChanged = true;
  }
});

if (mealsChanged) {
  localStorage.setItem("mp_meals", JSON.stringify(meals));
}

/* ===== SAVE HELPERS ===== */
function saveAll() {
  localStorage.setItem("mp_categories", JSON.stringify(categories));
  localStorage.setItem("mp_meals", JSON.stringify(meals));
  localStorage.setItem("mp_plan", JSON.stringify(plan));
}


/* =========================================================
   INGREDIENT GROUPS — SAFE INITIALIZATION (NO UI)
========================================================= */

let ingredientGroups = JSON.parse(
  localStorage.getItem("mp_ingredientGroups")
);
let ingredientGroupOrder = JSON.parse(
  localStorage.getItem("mp_ingredientGroupOrder")
);
let ingredientSelections = JSON.parse(
  localStorage.getItem("mp_ingredientSelections")
) || {};

// --- HARD NORMALIZATION ---
if (!ingredientGroups || typeof ingredientGroups !== "object") {
  ingredientGroups = { Ungrouped: [] };
}

if (!Array.isArray(ingredientGroupOrder)) {
  ingredientGroupOrder = Object.keys(ingredientGroups);
}

if (!ingredientGroups.Ungrouped) {
  ingredientGroups.Ungrouped = [];
}

// Ensure order matches groups
ingredientGroupOrder = ingredientGroupOrder.filter(
  g => ingredientGroups[g]
);

Object.keys(ingredientGroups).forEach(g => {
  if (!ingredientGroupOrder.includes(g)) {
    ingredientGroupOrder.push(g);
  }
});

localStorage.setItem(
  "mp_ingredientGroups",
  JSON.stringify(ingredientGroups)
);
localStorage.setItem(
  "mp_ingredientGroupOrder",
  JSON.stringify(ingredientGroupOrder)
);

/* =========================================================
   INGREDIENT GROUP CREATION / MUTATION (DATA ONLY)
========================================================= */

function createIngredientGroup(name) {
  if (!name || ingredientGroups[name]) return;

  ingredientGroups[name] = [];
  ingredientGroupOrder.push(name);

  localStorage.setItem(
    "mp_ingredientGroups",
    JSON.stringify(ingredientGroups)
  );
  localStorage.setItem(
    "mp_ingredientGroupOrder",
    JSON.stringify(ingredientGroupOrder)
  );
}

function deleteIngredientGroup(name) {
  if (name === "Ungrouped") return;
  if (!ingredientGroups[name]) return;

  ingredientGroups[name].forEach(item => {
    if (!ingredientGroups.Ungrouped.includes(item)) {
      ingredientGroups.Ungrouped.push(item);
    }
  });

  delete ingredientGroups[name];
  ingredientGroupOrder = ingredientGroupOrder.filter(g => g !== name);

  localStorage.setItem(
    "mp_ingredientGroups",
    JSON.stringify(ingredientGroups)
  );
  localStorage.setItem(
    "mp_ingredientGroupOrder",
    JSON.stringify(ingredientGroupOrder)
  );
}

function moveIngredientGroup(name, dir) {
  const i = ingredientGroupOrder.indexOf(name);
  if (i === -1) return;

  const j = i + dir;
  if (j < 0 || j >= ingredientGroupOrder.length) return;

  const tmp = ingredientGroupOrder[i];
  ingredientGroupOrder[i] = ingredientGroupOrder[j];
  ingredientGroupOrder[j] = tmp;

  localStorage.setItem(
    "mp_ingredientGroupOrder",
    JSON.stringify(ingredientGroupOrder)
  );
}

function saveIngredientSelections() {
  localStorage.setItem(
    "mp_ingredientSelections",
    JSON.stringify(ingredientSelections)
  );
}

/* =========================================================
   INGREDIENT GROUP DISPLAY (READ-ONLY)
========================================================= */

const ingredientGroupDisplay =
  document.getElementById("ingredientGroupDisplay");

function renderIngredientGroups() {
  if (!ingredientGroupDisplay) return;

  ingredientGroupDisplay.innerHTML = "";

  const targetSelect =
    document.getElementById("ingredientTargetGroup");

  if (targetSelect) {
    targetSelect.innerHTML = "";
    ingredientGroupOrder.forEach(groupName => {
      if (groupName === "Ungrouped") return;

      const option = document.createElement("option");
      option.value = groupName;
      option.textContent = groupName;
      targetSelect.appendChild(option);
    });
  }

  ingredientGroupOrder.forEach(groupName => {
    const wrapper = document.createElement("div");
    wrapper.style.marginBottom = "12px";
    wrapper.style.paddingBottom = "8px";
    wrapper.style.borderBottom = "1px solid #ddd";

    const title = document.createElement("strong");
    title.textContent = groupName;

    if (groupName !== "Ungrouped") {
      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.style.marginLeft = "8px";
      delBtn.onclick = () => {
        deleteIngredientGroup(groupName);
        renderIngredientGroups();
        renderGroceryListPreview();
      };
      title.appendChild(delBtn);

      const upBtn = document.createElement("button");
      upBtn.textContent = "↑";
      upBtn.onclick = () => {
        moveIngredientGroup(groupName, -1);
        renderIngredientGroups();
      };

      const downBtn = document.createElement("button");
      downBtn.textContent = "↓";
      downBtn.onclick = () => {
        moveIngredientGroup(groupName, 1);
        renderIngredientGroups();
      };

      title.appendChild(upBtn);
      title.appendChild(downBtn);
    }

    wrapper.appendChild(title);

    const list = document.createElement("ul");

    (ingredientGroups[groupName] || []).forEach(item => {
      const li = document.createElement("li");

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!ingredientSelections[item];
      cb.onchange = () => {
        ingredientSelections[item] = cb.checked;
        saveIngredientSelections();
        renderGroceryListPreview();
      };

      const span = document.createElement("span");
      span.textContent = item;

      li.appendChild(cb);
      li.appendChild(span);
      list.appendChild(li);
    });

    wrapper.appendChild(list);
    ingredientGroupDisplay.appendChild(wrapper);
  });
}

/* =========================================================
   CATEGORIES
========================================================= */

const categoryList = document.getElementById("categoryList");

function renderCategories() {
  if (!categoryList) return;

  categoryList.innerHTML = "";

  categories.forEach(cat => {
    const li = document.createElement("li");

    const text = document.createElement("span");
    text.textContent = cat;
    text.style.cursor = "pointer";

    const delBtn = document.createElement("button");
    delBtn.textContent = "✕";
    delBtn.style.marginLeft = "8px";
    delBtn.onclick = () => deleteCategory(cat);

    li.appendChild(text);
    li.appendChild(delBtn);

    const list = document.createElement("ul");
    list.style.marginTop = "6px";
    list.style.display = "none";

    meals
      .filter(
        m =>
          Array.isArray(m.categoryIds) &&
          m.categoryIds.includes(cat)
      )
      .forEach(m => {
        const mi = document.createElement("li");
        mi.textContent = m.name;
        list.appendChild(mi);
      });

    let open = false;
    text.onclick = () => {
      open = !open;
      list.style.display = open ? "block" : "none";
    };

    li.appendChild(list);
    categoryList.appendChild(li);
  });
}

function deleteCategory(catName) {
  if (!confirm(`Delete category "${catName}"?`)) return;

  categories = categories.filter(c => c !== catName);

  meals.forEach(meal => {
    if (Array.isArray(meal.categoryIds)) {
      meal.categoryIds =
        meal.categoryIds.filter(c => c !== catName);
    }
  });

  saveAll();
  renderCategories();
  renderMeals();
}

function renderMealCategoryCheckboxes(selectedIds = []) {
  const container =
    document.getElementById("mealCategoryCheckboxes");
  if (!container) return;

  container.innerHTML = "";

  categories.forEach(cat => {
    if (!cat || !cat.trim()) return;

    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "8px";
    label.style.marginBottom = "6px";
    label.className = "meal-cat-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = cat;
    checkbox.checked = selectedIds.includes(cat);

    const text = document.createElement("span");
    text.textContent = cat;

    label.appendChild(checkbox);
    label.appendChild(text);
    container.appendChild(label);
  });
}

/* =========================================================
   MEALS
========================================================= */

function renderMeals() {
  if (!mealList) return;

  mealList.innerHTML = "";

  const q = (mealSearchInput?.value || "").toLowerCase();

  // Group meals by category (read-only)
  const grouped = {};
  categories.forEach(c => (grouped[c] = []));
  grouped["Uncategorized"] = [];

  meals
    .filter(m => {
      if (!q) return true;
      const nameMatch =
        m.name?.toLowerCase().includes(q);
      const ingMatch =
        Array.isArray(m.ingredients) &&
        m.ingredients.some(i =>
          i.toLowerCase().includes(q)
        );
      return nameMatch || ingMatch;
    })
    .forEach(m => {
      if (
        Array.isArray(m.categoryIds) &&
        m.categoryIds.length
      ) {
        m.categoryIds.forEach(c => {
          if (grouped[c]) grouped[c].push(m);
        });
      } else {
        grouped["Uncategorized"].push(m);
      }
    });

  Object.keys(grouped)
    .sort()
    .forEach(cat => {
      if (grouped[cat].length === 0) return;

      const header = document.createElement("div");
      header.style.fontWeight = "bold";
      header.style.cursor = "pointer";
      header.style.marginTop = "12px";
      header.textContent = cat;

      const list = document.createElement("div");
      list.style.display = "none";
      list.style.marginLeft = "12px";

      let open = false;
      header.onclick = () => {
        open = !open;
        list.style.display = open ? "block" : "none";
      };

      grouped[cat].forEach(m => {
        const row = document.createElement("div");

        const title = document.createElement("span");
        title.textContent = m.name;
        title.style.cursor = "pointer";
        title.onclick = () => openEditMeal(m.id);

        const viewBtn = document.createElement("button");
        viewBtn.textContent = "View Recipe";
        viewBtn.style.marginLeft = "8px";
        viewBtn.onclick = e => {
          e.stopPropagation();
          openRecipeView(m.id);
        };

        const dupBtn = document.createElement("button");
        dupBtn.textContent = "Duplicate";
        dupBtn.style.marginLeft = "8px";
        dupBtn.onclick = e => {
          e.stopPropagation();
          duplicateMeal(m.id);
        };

        const delBtn = document.createElement("button");
        delBtn.textContent = "Delete";
        delBtn.style.marginLeft = "6px";
        delBtn.onclick = e => {
          e.stopPropagation();
          if (!confirm("Delete this meal?")) return;

          meals = meals.filter(x => x.id !== m.id);
          removeMealFromPlan(m.id);
          saveAll();
          renderMeals();
          renderPlanner();
          renderGroceryListPreview();
        };

        row.appendChild(title);
        row.appendChild(viewBtn);
        row.appendChild(dupBtn);
        row.appendChild(delBtn);

        list.appendChild(row);
      });

      mealList.appendChild(header);
      mealList.appendChild(list);
    });
}

function duplicateMeal(mealId) {
  const original = meals.find(m => m.id === mealId);
  if (!original) return;

  const copy = {
    id: crypto.randomUUID(),
    name: original.name + " (copy)",
    ingredients: Array.isArray(original.ingredients)
      ? [...original.ingredients]
      : [],
    categoryIds: Array.isArray(original.categoryIds)
      ? [...original.categoryIds]
      : [],
    instructions: original.instructions || "",
    rating: original.rating || "",
    attachments: []
  };

  meals.push(copy);
  saveAll();
  renderMeals();
  renderGroceryListPreview();
}

addMealBtn.onclick = () => {
  editingMealId = null;
  renderMealCategoryCheckboxes([]);
  mealModal.classList.remove("hidden");
};

function openEditMeal(mealId) {
  const meal = meals.find(m => m.id === mealId);
  if (!meal) return;

  editingMealId = mealId;

  mealNameInput.value = meal.name;
  mealInstructionsInput.value =
    meal.instructions || "";
  mealIngredientsInput.value =
    (meal.ingredients || []).join("\n");

  renderMealCategoryCheckboxes(
    meal.categoryIds || []
  );

  document
    .querySelectorAll('input[name="mealRating"]')
    .forEach(r => {
      r.checked = r.value === (meal.rating || "");
    });

  mealModal.classList.remove("hidden");
}

saveMealBtn.onclick = () => {
  const name = mealNameInput.value.trim();
  if (!name) return;

  const checkedCategories = Array.from(
    document.querySelectorAll(
      "#mealCategoryCheckboxes input:checked"
    )
  ).map(cb => cb.value);

  const ingredients = mealIngredientsInput.value
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  const instructions =
    mealInstructionsInput.value.trim();

  const rating =
    document.querySelector(
      'input[name="mealRating"]:checked'
    )?.value || "";

  ingredients.forEach(ing => {
    if (!ingredientGroups.Ungrouped.includes(ing)) {
      ingredientGroups.Ungrouped.push(ing);
    }
  });

  localStorage.setItem(
    "mp_ingredientGroups",
    JSON.stringify(ingredientGroups)
  );

  if (editingMealId) {
    const meal = meals.find(
      m => m.id === editingMealId
    );
    if (!meal) return;

    meal.name = name;
    meal.instructions = instructions;
    meal.ingredients = ingredients;
    meal.categoryIds = checkedCategories;
    meal.rating = rating;
  } else {
    meals.push({
      id: crypto.randomUUID(),
      name,
      instructions,
      ingredients,
      categoryIds: checkedCategories,
      rating,
      attachments: []
    });
  }

  editingMealId = null;
  mealNameInput.value = "";
  mealInstructionsInput.value = "";
  mealIngredientsInput.value = "";
  mealModal.classList.add("hidden");

  saveAll();
  renderMeals();
  renderPlanner();
  renderGroceryListPreview();
};

closeMealModalBtn.onclick = () => {
  editingMealId = null;
  mealIngredientsInput.value = "";
  mealModal.classList.add("hidden");
};

/* =========================================================
   PLANNER DISPLAY
========================================================= */

function getPlannerMealIds() {
  const ids = new Set();
  Object.values(plan).forEach(mealId => {
    if (mealId) ids.add(mealId);
  });
  return Array.from(ids);
}

function renderPlanner() {
  const cards = document.querySelectorAll(".day-card");
  if (!cards.length) return;

  cards.forEach(card => {
    const day = card.dataset.day;
    const titleSpan = card.querySelector("span");
    const actions = card.querySelector(".planner-actions");

    if (!day || !titleSpan || !actions) return;

    const mealId = plan[day];
    const meal = meals.find(m => m.id === mealId);

    titleSpan.textContent = meal
      ? meal.rating
        ? `${meal.name} [${meal.rating}]`
        : meal.name
      : "";

    actions.innerHTML = "";

    if (meal) {
      const btn = document.createElement("button");
      btn.textContent = "View Recipe";
      btn.onclick = e => {
        e.stopPropagation();
        openRecipeView(meal.id);
      };
      actions.appendChild(btn);
    }
  });

  bindPlannerDayClicks();
}

function bindPlannerDayClicks() {
  document
    .querySelectorAll(".day-card")
    .forEach(card => {
      card.onclick = () => {
        selectedPlannerDay = card.dataset.day;
        openPlannerCategoryOverlay();
      };
    });
}

/* =========================================================
   LAYER 2 — PLANNER OVERLAY (LOCKED & GUARDED)
========================================================= */

function openPlannerCategoryOverlay() {
  if (!plannerOverlay || !plannerCategoryList || !plannerOverlayTitle) return;

  if (!selectedPlannerDay) return;

  plannerCategoryList.innerHTML = "";
  plannerOverlayTitle.textContent = "Select Category";

  categories.forEach(cat => {
    if (!cat) return;

    const div = document.createElement("div");
    div.textContent = cat;

    div.onclick = () => {
      openPlannerMealOverlay(cat);
    };

    plannerCategoryList.appendChild(div);
  });

  plannerOverlay.classList.remove("hidden");
}

function openPlannerMealOverlay(category) {
  if (!category) return;

  plannerCategoryList.innerHTML = "";
  plannerOverlayTitle.textContent = "Select Meal";

  const filteredMeals = meals.filter(
    m =>
      Array.isArray(m.categoryIds) &&
      m.categoryIds.includes(category)
  );

  if (filteredMeals.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "No meals in this category.";
    plannerCategoryList.appendChild(empty);
    return;
  }

  filteredMeals.forEach(meal => {
    const div = document.createElement("div");

    div.textContent = meal.rating
      ? `${meal.name} [${meal.rating}]`
      : meal.name;

    div.onclick = () => {
      if (!selectedPlannerDay) return;

      plan[selectedPlannerDay] = meal.id;
      saveAll();
      renderPlanner();
      renderGroceryListPreview();
      closePlannerOverlay();
    };

    plannerCategoryList.appendChild(div);
  });
}

function closePlannerOverlay() {
  if (!plannerOverlay) return;

  plannerOverlay.classList.add("hidden");
  plannerCategoryList.innerHTML = "";
  plannerOverlayTitle.textContent = "Select Category";
  selectedPlannerDay = null;
}

if (plannerOverlayCancel) {
  plannerOverlayCancel.onclick = e => {
    e.stopPropagation();
    closePlannerOverlay();
  };
}

/* =========================================================
   CLEAR WEEK (GUARDED)
========================================================= */

const clearWeekBtn = document.getElementById("clearWeekBtn");

if (clearWeekBtn) {
  clearWeekBtn.onclick = () => {
    plan = {
      sun: null,
      mon: null,
      tue: null,
      wed: null,
      thu: null,
      fri: null,
      sat: null
    };

    saveAll();
    renderPlanner();
    renderGroceryListPreview();
  };
}

// =========================================================
// GROCERY LIST PREVIEW (READ-ONLY)
// =========================================================

function renderGroceryListPreview() {
    if (!groceryListPreview) return;

    groceryListPreview.innerHTML = "";

    // Build normalized ingredient -> group lookup
    const ingredientToGroup = {};
    Object.keys(ingredientGroups).forEach(groupName => {
        ingredientGroups[groupName].forEach(raw => {
            const key = raw.trim().toLowerCase();
            ingredientToGroup[key] = groupName;
        });
    });

    // Count normalized ingredients from planner meals
    const groupedCounts = {};
    

    // Include manually selected ingredients from Ingredient Groups
Object.keys(ingredientSelections).forEach(item => {
    if (!ingredientSelections[item]) return;

    const key = item.trim().toLowerCase();
    const group = ingredientToGroup[key] || "Ungrouped";

    if (!groupedCounts[group]) groupedCounts[group] = {};
    groupedCounts[group][key] = (groupedCounts[group][key] || 0) + 1;
});

    const plannerMealIds = getPlannerMealIds();
    const plannerMeals = meals.filter(m => plannerMealIds.includes(m.id));
   

    plannerMeals.forEach(meal => {
        if (!Array.isArray(meal.ingredients)) return;

        meal.ingredients.forEach(raw => {
            const ing = raw.trim().toLowerCase();
            if (!ing) return;

            const group = ingredientToGroup[ing] || "Ungrouped";
            if (!groupedCounts[group]) groupedCounts[group] = {};
            groupedCounts[group][ing] = (groupedCounts[group][ing] || 0) + 1;
        });
    });

    // Render grocery list in ingredientGroupOrder
    ingredientGroupOrder.forEach(groupName => {
        if (!groupedCounts[groupName]) return;

        const header = document.createElement("li");
        header.className = "ingredient-group-header";
        header.textContent = groupName;
        header.style.fontWeight = "bold";
        header.style.marginTop = "8px";
        groceryListPreview.appendChild(header);

        const groupItems = document.createElement("ul");
        groupItems.style.listStyle = "none";
        groupItems.style.paddingLeft = "12px";

        Object.keys(groupedCounts[groupName]).forEach(item => {
            const count = groupedCounts[groupName][item];
            const li = document.createElement("li");
            li.textContent = `• ${item} × ${count}`;
            groupItems.appendChild(li);
        });

        groceryListPreview.appendChild(groupItems);

        let isCollapsed = false;
        header.onclick = () => {
            isCollapsed = !isCollapsed;
            groupItems.style.display = isCollapsed ? "none" : "block";
        };
    });
}

function openRecipeView(mealId) {
    const meal = meals.find(m => m.id === mealId);
    if (!meal) return;

    document.getElementById("recipeMealTitle").textContent = meal.name;

    renderRecipeIngredients(meal);
    renderRecipeNotes(meal);
    renderRecipeText(meal);
    renderRecipeAttachments(meal);

    document
        .getElementById("recipeOverlay")
        .classList.remove("hidden");
}
function renderRecipeIngredients(meal) {
    const list = document.getElementById("recipeIngredientList");
    if (!list) return;

    list.innerHTML = "";

    if (!Array.isArray(meal.ingredients) || meal.ingredients.length === 0) {
        const li = document.createElement("li");
        li.textContent = "No ingredients listed.";
        list.appendChild(li);
        return;
    }

    meal.ingredients.forEach(item => {
        const li = document.createElement("li");
        li.textContent = item;
        list.appendChild(li);
    });
}

function renderRecipeNotes(meal) {
    const box = document.getElementById("recipeNotes");
    if (!box) return;

    box.textContent =
        meal.instructions && meal.instructions.trim()
            ? meal.instructions
            : "No notes added.";
}
function renderRecipeText(meal) {
    const box = document.getElementById("recipeTextDisplay");
    if (!box) return;

    box.textContent =
        meal.recipeText && meal.recipeText.trim()
            ? meal.recipeText
            : "No recipe text added.";
}

function renderRecipeAttachments(meal) {
  const box = document.getElementById("recipeAttachments");
  if (!box) return;

  box.innerHTML = "";

  if (!Array.isArray(meal.attachments) || meal.attachments.length === 0) {
    box.textContent = "No attachments.";
    return;
  }

  meal.attachments.forEach((att, idx) => {
    const row = document.createElement("div");
    row.style.marginBottom = "8px";

    const openBtn = document.createElement("button");
    openBtn.textContent = `Open attachment — ${att.name || ""}`;

    openBtn.onclick = () => {
      const win = window.open("", "_blank");
      if (!win) {
        alert("Popup blocked. Please allow popups for this site.");
        return;
      }

      getAttachmentBlob(att.id).then(blob => {
        if (!blob) {
          win.close();
          alert("Attachment file missing.");
          return;
        }

        const url = URL.createObjectURL(blob);
        win.location.href = url;

        
      });
    };

    const delBtn = document.createElement("button");
    delBtn.textContent = "✕";
    delBtn.style.marginLeft = "6px";

    delBtn.onclick = () => {
      if (!confirm("Delete attachment?")) return;
      meal.attachments.splice(idx, 1);
      saveAll();
      renderRecipeAttachments(meal);
    };

    row.appendChild(openBtn);
    row.appendChild(delBtn);
    box.appendChild(row);
  });
}

window.addEventListener("load", () => {
  // ================= DATA EXPORT / IMPORT =================

  const exportDataBtn = document.getElementById("exportDataBtn");
  const importDataBtn = document.getElementById("importDataBtn");
  const importFileInput = document.getElementById("importFileInput");

  // ===== IMPORT MAIN DATA + ATTACHMENTS =====
  if (importDataBtn && importFileInput) {
    importDataBtn.onclick = () => {
      importFileInput.click();
    };

    importFileInput.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;

      // ATTACHMENTS FILE
      if (file.name.startsWith("meal-planner-attachments")) {
        const reader = new FileReader();
        reader.onload = async () => {
          const parsed = JSON.parse(reader.result);
          const attachments = parsed.attachments || [];

          const db = await openAttachmentDB();
          const tx = db.transaction("files", "readwrite");
          const store = tx.objectStore("files");

          attachments.forEach(a => {
            const byteString = atob(a.data.split(",")[1]);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);

            for (let i = 0; i < byteString.length; i++) {
              ia[i] = byteString.charCodeAt(i);
            }

            const blob = new Blob([ab], { type: a.type });
            store.put(blob, a.id);
          });

          tx.oncomplete = () =>
            alert("Attachment import complete.");
        };

        reader.readAsText(file);
        return;
      }

      // MAIN DATA FILE
      const reader = new FileReader();
      reader.onload = () => {
        const data = JSON.parse(reader.result);

        categories = data.categories || [];
        meals = data.meals || [];
        plan = data.plan || plan;
        ingredientGroups = data.ingredientGroups || ingredientGroups;
        ingredientGroupOrder =
          data.ingredientGroupOrder || ingredientGroupOrder;

        saveAll();
        renderCategories();
        renderMeals();
        renderPlanner();
        renderIngredientGroups();
        renderGroceryListPreview();

        alert("Import complete.");
      };

      reader.readAsText(file);
    };
  }

  // ===== EXPORT =====
  if (exportDataBtn) {
    exportDataBtn.onclick = async () => {
      const payload = {
        categories,
        meals,
        plan,
        ingredientGroups,
        ingredientGroupOrder
      };

      const dataBlob = new Blob(
        [JSON.stringify(payload, null, 2)],
        { type: "application/json" }
      );

      const dataUrl = URL.createObjectURL(dataBlob);
      const dataLink = document.createElement("a");
      dataLink.href = dataUrl;
      dataLink.download = "meal-planner-data.json";
      dataLink.click();
      URL.revokeObjectURL(dataUrl);

      // EXPORT ATTACHMENTS
      const db = await openAttachmentDB();
      const tx = db.transaction("files", "readonly");
      const store = tx.objectStore("files");

      const collected = [];

      store.openCursor().onsuccess = e => {
        const cursor = e.target.result;

        if (cursor) {
          const reader = new FileReader();
          reader.onload = () => {
            collected.push({
              id: cursor.key,
              type: cursor.value.type,
              data: reader.result
            });
          };
          reader.readAsDataURL(cursor.value);
          cursor.continue();
        } else {
          const attachBlob = new Blob(
            [JSON.stringify({ attachments: collected }, null, 2)],
            { type: "application/json" }
          );

          const attachUrl = URL.createObjectURL(attachBlob);
          const attachLink = document.createElement("a");
          attachLink.href = attachUrl;
          attachLink.download =
            "meal-planner-attachments.json";
          attachLink.click();
          URL.revokeObjectURL(attachUrl);
        }
      };
    };
  }

  // ===== INITIAL RENDER (ORDERED & GUARDED) =====
  renderCategories();
  renderMeals();
  renderIngredientGroups();
  renderPlanner();
  renderGroceryListPreview();
});


