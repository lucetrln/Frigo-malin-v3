import { useState, useEffect, useMemo } from "react";
import { MASSIVE_RECIPES } from "./recipesData";
import { supabase, loadUserData, saveUserData } from "./supabase";
import AccountBar from "./AccountBar";

// ---------- Moteur de normalisation ----------
const cleanStr = (s = "") =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();

const fmtPrice = (n) => `${n.toFixed(2).replace(".", ",")} €`;

const MASTER_STOCK_KEY = "frigo_malin_stock_v1";
const MASTER_PREFS_KEY = "frigo_malin_prefs_v1";
const MASTER_SELECTED_KEY = "frigo_malin_selected_v1";

const LEGACY_STOCK_KEYS = [
  "frigo_malin_stock_v1",
  "fridge-v8-clean",
  "fridge-v7-100recipes",
  "fridge-v6-large",
  "fridge-stock-aliases-v5",
  "fridge-stock-free-v4",
  "fridge-stock-free-v3",
  "fridge-quantities-v2",
  "fridge-items"
];

const persist = {
  async get(key) {
    if (typeof window !== "undefined" && window.storage) {
      try {
        return await window.storage.get(key);
      } catch (e) {
        return null;
      }
    }
    try {
      const v = localStorage.getItem(key);
      return v !== null ? { key, value: v } : null;
    } catch (e) {
      return null;
    }
  },
  async set(key, value) {
    if (typeof window !== "undefined" && window.storage) {
      try {
        return await window.storage.set(key, value);
      } catch (e) {
        return null;
      }
    }
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
    return null;
  },
};

// ---------- Équipements ----------
const AVAILABLE_EQUIPMENTS = [
  { id: "plaques", label: "Plaques", icon: "🔥" },
  { id: "four", label: "Four", icon: "🥧" },
  { id: "airfryer", label: "Airfryer", icon: "💨" },
  { id: "microondes", label: "Micro-ondes", icon: "⚡" },
  { id: "mixeur", label: "Mixeur / Blender", icon: "🌪️" },
];

const DEFAULT_EQUIPMENTS = {
  plaques: true,
  four: true,
  airfryer: false,
  microondes: true,
  mixeur: false,
};

// Catégorie de chaque plat : viande (prioritaire), poisson ou végétarien
const MEAT_KEYS = new Set(["poulet", "viande-hachee", "saucisses", "jambon", "lardons"]);
const FISH_KEYS = new Set(["thon"]);
const DIET_LABELS = { meat: "🥩 Viande", fish: "🐟 Poisson", veggie: "🥦 Végétarien" };

// ---------- Enseignes ----------
const STORES = [
  { id: "lidl", name: "Lidl / Aldi (Discount)", multiplier: 0.82 },
  { id: "leclerc", name: "E.Leclerc", multiplier: 0.90 },
  { id: "carrefour", name: "Carrefour", multiplier: 1.0 },
  { id: "intermarche", name: "Intermarché", multiplier: 0.98 },
  { id: "monoprix", name: "Monoprix", multiplier: 1.25 },
];

// ---------- Dictionnaire d'alias tolérant ----------
const ALIASES = {
  pdt: ["pommedeterre", "pommesdeterre", "patate", "patates", "pdt"],
  pates: ["pate", "pates", "coquillette", "coquillettes", "penne", "spaghetti", "spaghettis", "macaroni", "tagliatelle", "nouille", "nouilles", "lasagne", "lasagnes"],
  riz: ["riz", "rizblanc", "rizbasmati", "rizrond"],
  lentilles: ["lentille", "lentilles", "lentillesvertes", "lentillesbrunes"],
  "lentilles-corail": ["lentillecorail", "lentillescorail", "corail"],
  "pois-chiches": ["poischiche", "poischiches"],
  "haricots-rouges": ["haricotrouge", "haricotsrouges"],
  "haricots-blancs": ["haricotblanc", "haricotsblancs"],
  carotte: ["carotte", "carottes"],
  oignon: ["oignon", "oignons", "echalote", "echalotes"],
  ail: ["ail", "goussedail", "goussesdail"],
  oeufs: ["oeuf", "oeufs"],
  beurre: ["beurre", "beurredoux", "beurredemisel"],
  huile: ["huile", "huiledolive", "huilecolza", "huiletournesol"],
  "creme-fraiche": ["creme", "cremefraiche", "cremeepaisse", "cremeliquide", "ricotta"],
  lait: ["lait", "laitdemiecreme", "laitentier"],
  fromage: ["fromage", "fromagerape", "emmental", "gruyere", "cheddar", "mozzarella", "parmesan"],
  lardons: ["lardon", "lardons", "bacon"],
  jambon: ["jambon", "jambonblanc", "jamboncuit"],
  thon: ["thon", "thonenboite", "thonnaturel"],
  "sauce-tomate": ["saucetomate", "coulisdetomate", "pureedetomate", "tomatepelee"],
  "tomates-concassees": ["tomateconcassee", "tomatesconcassees", "pulpedetomate"],
  farine: ["farine", "farinedeble"],
  chou: ["chou", "choux", "chouvert", "choublanc"],
  poireau: ["poireau", "poireaux"],
  curry: ["curry", "epice", "epices", "curcuma", "cumin", "paprika", "herbes", "gingembre"],
  semoule: ["semoule", "couscous", "graine"],
  bouillon: ["bouillon", "cube", "kubor", "bouilloncube", "bouillonvolaille", "bouillonboeuf"],
  "pain-de-mie": ["paindemie", "pain", "toast", "baguette", "painrassis"],
  poulet: ["poulet", "escalopedepoulet", "filetdepoulet", "cuissedepoulet", "dinde"],
  "viande-hachee": ["viandehachee", "steakhache", "boeufhache", "hache", "paleron", "boeufbourguignon"],
  saucisses: ["saucisse", "saucisses", "knacki", "chipolata", "saucissedetoulouse", "merguez"],
  tortillas: ["tortilla", "tortillas", "wrap", "wraps", "fajitas"],
  tomate: ["tomate", "tomates", "tomatefraiche"],
  champignons: ["champignon", "champignons", "champignonsdeparis"],
  courgette: ["courgette", "courgettes"],
  poivron: ["poivron", "poivrons"],
  aubergine: ["aubergine", "aubergines"],
  "lait-coco": ["laitdecoco", "cremedecoco", "coco"],
  "sauce-soja": ["saucesoja", "soja"],
  vinaigre: ["vinaigre", "vinaigredevin", "moutarde"],
};

function resolveKey(input = "") {
  const cleanInput = cleanStr(input);
  if (!cleanInput) return null;
  for (const [key, aliases] of Object.entries(ALIASES)) {
    if (aliases.some((a) => cleanInput === a || cleanInput.includes(a) || a.includes(cleanInput))) {
      return key;
    }
  }
  return cleanInput;
}

// ---------- Catalogue magasin ----------
const GROCERY_CATALOG = {
  pdt: { name: "Pommes de terre", unit: "g", packQty: 2500, packLabel: "Filet 2,5 kg", basePrice: 2.30, step: 250 },
  pates: { name: "Pâtes / Lasagnes", unit: "g", packQty: 500, packLabel: "Paquet 500 g", basePrice: 0.99, step: 50 },
  riz: { name: "Riz basmati / rond", unit: "g", packQty: 1000, packLabel: "Paquet 1 kg", basePrice: 1.45, step: 100 },
  lentilles: { name: "Lentilles vertes", unit: "g", packQty: 500, packLabel: "Paquet 500 g", basePrice: 1.35, step: 50 },
  "lentilles-corail": { name: "Lentilles corail", unit: "g", packQty: 500, packLabel: "Paquet 500 g", basePrice: 1.65, step: 50 },
  "pois-chiches": { name: "Pois chiches en conserve", unit: "g", packQty: 500, packLabel: "Boîte 500 g", basePrice: 1.05, step: 100 },
  "haricots-rouges": { name: "Haricots rouges", unit: "g", packQty: 500, packLabel: "Boîte 500 g", basePrice: 1.10, step: 100 },
  "haricots-blancs": { name: "Haricots blancs", unit: "g", packQty: 500, packLabel: "Boîte 500 g", basePrice: 1.05, step: 100 },
  carotte: { name: "Carottes fraîches", unit: "g", packQty: 1000, packLabel: "Sachet 1 kg", basePrice: 1.35, step: 100 },
  oignon: { name: "Oignons jaunes", unit: "pce", packQty: 8, packLabel: "Filet 1 kg (~8 pces)", basePrice: 1.39, step: 1 },
  ail: { name: "Ail", unit: "gousse", packQty: 12, packLabel: "Filet 3 têtes (~12 gousses)", basePrice: 1.20, step: 1 },
  oeufs: { name: "Œufs plein air", unit: "pce", packQty: 10, packLabel: "Boîte de 10", basePrice: 2.19, step: 1 },
  beurre: { name: "Beurre doux", unit: "g", packQty: 250, packLabel: "Plaquette 250 g", basePrice: 2.10, step: 25 },
  huile: { name: "Huile de cuisson", unit: "ml", packQty: 1000, packLabel: "Bouteille 1 L", basePrice: 1.85, step: 50 },
  "creme-fraiche": { name: "Crème fraîche épaisse", unit: "ml", packQty: 500, packLabel: "Pot 50 cl", basePrice: 1.45, step: 50 },
  lait: { name: "Lait demi-écrémé", unit: "ml", packQty: 1000, packLabel: "Bouteille 1 L", basePrice: 1.02, step: 100 },
  fromage: { name: "Emmental / Mozzarella", unit: "g", packQty: 200, packLabel: "Sachet 200 g", basePrice: 1.65, step: 25 },
  lardons: { name: "Lardons fumés", unit: "g", packQty: 200, packLabel: "Duo 2x100 g", basePrice: 1.69, step: 50 },
  jambon: { name: "Jambon blanc", unit: "tranche", packQty: 4, packLabel: "Barquette 4 tranches", basePrice: 1.99, step: 1 },
  thon: { name: "Thon au naturel", unit: "boite", packQty: 2, packLabel: "Lot 2 boîtes", basePrice: 2.30, step: 1 },
  "sauce-tomate": { name: "Coulis de tomate", unit: "g", packQty: 500, packLabel: "Brique 500 g", basePrice: 0.85, step: 100 },
  "tomates-concassees": { name: "Tomates concassées", unit: "g", packQty: 400, packLabel: "Boîte 400 g", basePrice: 0.79, step: 100 },
  farine: { name: "Farine de blé", unit: "g", packQty: 1000, packLabel: "Paquet 1 kg", basePrice: 0.89, step: 100 },
  chou: { name: "Chou entier", unit: "pce", packQty: 1, packLabel: "1 pièce", basePrice: 1.49, step: 1 },
  poireau: { name: "Poireaux", unit: "pce", packQty: 3, packLabel: "Botte de 3", basePrice: 1.89, step: 1 },
  curry: { name: "Épices (curry, cumin, paprika)", unit: "g", packQty: 50, packLabel: "Flacon 50 g", basePrice: 1.15, step: 5 },
  semoule: { name: "Semoule moyenne", unit: "g", packQty: 500, packLabel: "Paquet 500 g", basePrice: 1.09, step: 50 },
  bouillon: { name: "Bouillon cube", unit: "cube", packQty: 8, packLabel: "Boîte 8 cubes", basePrice: 0.99, step: 1 },
  "pain-de-mie": { name: "Pain de mie / baguette", unit: "tranche", packQty: 14, packLabel: "Paquet 14 tranches", basePrice: 1.19, step: 2 },
  poulet: { name: "Poulet (cuisses, filets)", unit: "g", packQty: 500, packLabel: "Barquette 500 g", basePrice: 4.80, step: 100 },
  "viande-hachee": { name: "Bœuf haché / mijoté", unit: "g", packQty: 400, packLabel: "Barquette 400 g", basePrice: 4.20, step: 100 },
  saucisses: { name: "Saucisses fraîches / fumées", unit: "pce", packQty: 6, packLabel: "Paquet de 6", basePrice: 2.80, step: 1 },
  tortillas: { name: "Tortillas (Wraps)", unit: "pce", packQty: 6, packLabel: "Paquet de 6", basePrice: 1.55, step: 1 },
  tomate: { name: "Tomates fraîches", unit: "g", packQty: 1000, packLabel: "Sachet 1 kg", basePrice: 1.95, step: 100 },
  champignons: { name: "Champignons de Paris", unit: "g", packQty: 250, packLabel: "Barquette 250 g", basePrice: 1.45, step: 50 },
  courgette: { name: "Courgettes fraîches", unit: "g", packQty: 1000, packLabel: "Filet 1 kg", basePrice: 1.75, step: 100 },
  poivron: { name: "Poivrons tricolores", unit: "pce", packQty: 3, packLabel: "Sachet de 3", basePrice: 2.10, step: 1 },
  aubergine: { name: "Aubergines", unit: "pce", packQty: 2, packLabel: "Lot de 2", basePrice: 1.99, step: 1 },
  "lait-coco": { name: "Lait de coco", unit: "ml", packQty: 400, packLabel: "Boîte 400 ml", basePrice: 1.35, step: 50 },
  "sauce-soja": { name: "Sauce soja", unit: "ml", packQty: 150, packLabel: "Bouteille 150 ml", basePrice: 1.65, step: 20 },
  vinaigre: { name: "Vinaigre / Moutarde", unit: "ml", packQty: 500, packLabel: "1 unité", basePrice: 1.10, step: 25 },
};

export default function FridgeApp() {
  const [fridge, setFridge] = useState({});
  const [isReady, setIsReady] = useState(false);
  const [recipes, setRecipes] = useState(MASSIVE_RECIPES);
  const [customName, setCustomName] = useState("");
  const [customQty, setCustomQty] = useState(500);
  const [customUnit, setCustomUnit] = useState("g");

  const [selected, setSelected] = useState(new Set());
  const [servings, setServings] = useState(4);
  const [storeId, setStoreId] = useState("lidl");
  const [weeklyBudget, setWeeklyBudget] = useState(25);
  const [mealsWanted, setMealsWanted] = useState(7);
  const [meatMeals, setMeatMeals] = useState(null); // null = peu importe
  const [fishMeals, setFishMeals] = useState(null);
  const [equipments, setEquipments] = useState(DEFAULT_EQUIPMENTS);
  const [activeTab, setActiveTab] = useState("frigo");
  const [expandedId, setExpandedId] = useState(null);
  const [expandedPlanningId, setExpandedPlanningId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [session, setSession] = useState(null);
  const [cloudUserId, setCloudUserId] = useState(null); // compte dont les données sont chargées
  const [syncStatus, setSyncStatus] = useState(null);
  const userId = session?.user?.id ?? null;

  const store = STORES.find((s) => s.id === storeId) || STORES[0];

  const applyPrefs = (p) => {
    if (p.servings) setServings(p.servings);
    if (p.storeId) setStoreId(p.storeId);
    if (p.weeklyBudget) setWeeklyBudget(p.weeklyBudget);
    if (p.mealsWanted) setMealsWanted(p.mealsWanted);
    if (p.meatMeals !== undefined) setMeatMeals(p.meatMeals);
    if (p.fishMeals !== undefined) setFishMeals(p.fishMeals);
    if (p.equipments) setEquipments(p.equipments);
  };

  // Chargement ultra-sécurisé avec migration des anciens stockages
  useEffect(() => {
    (async () => {
      let loadedStock = null;

      for (const key of LEGACY_STOCK_KEYS) {
        try {
          const res = await persist.get(key);
          if (res && res.value) {
            const parsed = JSON.parse(res.value);
            if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
              loadedStock = parsed;
              break;
            }
          }
        } catch (e) {}
      }

      if (loadedStock) {
        setFridge(loadedStock);
        await persist.set(MASTER_STOCK_KEY, JSON.stringify(loadedStock));
      }

      try {
        const resPrefs = await persist.get(MASTER_PREFS_KEY);
        if (resPrefs && resPrefs.value) applyPrefs(JSON.parse(resPrefs.value));
        const resSelected = await persist.get(MASTER_SELECTED_KEY);
        if (resSelected && resSelected.value) setSelected(new Set(JSON.parse(resSelected.value)));
      } catch (e) {
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  // Sauvegarde garantie
  useEffect(() => {
    if (!isReady) return;
    persist.set(MASTER_STOCK_KEY, JSON.stringify(fridge)).catch(() => {});
  }, [fridge, isReady]);

  useEffect(() => {
    if (!isReady) return;
    persist
      .set(
        MASTER_PREFS_KEY,
        JSON.stringify({ servings, storeId, weeklyBudget, mealsWanted, meatMeals, fishMeals, equipments })
      )
      .catch(() => {});
  }, [servings, storeId, weeklyBudget, mealsWanted, meatMeals, fishMeals, equipments, isReady]);

  useEffect(() => {
    if (!isReady) return;
    persist.set(MASTER_SELECTED_KEY, JSON.stringify([...selected])).catch(() => {});
  }, [selected, isReady]);

  // ---------- Compte utilisateur (Supabase) ----------
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // À la connexion : on récupère le frigo du compte. S'il est vide (nouveau compte),
  // c'est le frigo actuel de l'appareil qui sera envoyé au premier enregistrement.
  useEffect(() => {
    if (!isReady) return;
    setCloudUserId(null);
    if (!userId) {
      setSyncStatus(null);
      return;
    }
    let cancelled = false;
    setSyncStatus("loading");
    loadUserData(userId)
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setFridge(data.fridge || {});
          applyPrefs(data.prefs || {});
          setSelected(new Set(data.selected || []));
        }
        setCloudUserId(userId);
      })
      .catch(() => !cancelled && setSyncStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [userId, isReady]);

  useEffect(() => {
    if (!userId || cloudUserId !== userId) return;
    setSyncStatus("saving");
    const timer = setTimeout(() => {
      saveUserData(userId, {
        fridge,
        prefs: { servings, storeId, weeklyBudget, mealsWanted, meatMeals, fishMeals, equipments },
        selected: [...selected],
      })
        .then(() => setSyncStatus("saved"))
        .catch(() => setSyncStatus("error"));
    }, 800);
    return () => clearTimeout(timer);
  }, [userId, cloudUserId, fridge, selected, servings, storeId, weeklyBudget, mealsWanted, meatMeals, fishMeals, equipments]);

  const handleAddCustom = (e) => {
    e?.preventDefault();
    const raw = customName.trim();
    if (!raw) return;

    const matchedKey = resolveKey(raw);
    const catalogItem = GROCERY_CATALOG[matchedKey];

    const resolvedName = catalogItem?.name || raw;
    const resolvedUnit = catalogItem?.unit || customUnit;
    const qtyNum = Math.max(1, Number(customQty) || 1);

    setFridge((prev) => ({
      ...prev,
      [matchedKey]: {
        name: resolvedName,
        qty: (prev[matchedKey]?.qty || 0) + qtyNum,
        unit: resolvedUnit,
      },
    }));

    setCustomName("");
    setCustomQty(500);
  };

  const updateQty = (key, delta) => {
    setFridge((prev) => {
      const cur = prev[key];
      if (!cur) return prev;
      const step = GROCERY_CATALOG[key]?.step || (cur.unit === "g" ? 100 : 1);
      const nextQty = cur.qty + delta * step;
      if (nextQty <= 0) {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      }
      return { ...prev, [key]: { ...cur, qty: nextQty } };
    });
  };

  const removeStock = (key) => {
    setFridge((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  // Filtrage selon matériel et mise à l'échelle des portions
  const { recipesWithStatus, excludedCount } = useMemo(() => {
    let excluded = 0;
    const ratio = servings / 4;

    const eligible = MASSIVE_RECIPES.filter((r) => {
      if (!r.equipments || r.equipments.length === 0) return true;
      if (r.equipments.includes("mixeur") && !equipments.mixeur) {
        excluded++;
        return false;
      }
      const cookingOptions = r.equipments.filter((eq) => eq !== "mixeur");
      if (cookingOptions.length > 0) {
        const canCook = cookingOptions.some((eq) => equipments[eq]);
        if (!canCook) {
          excluded++;
          return false;
        }
      }
      return true;
    });

    const statusList = eligible
      .map((r) => {
        let missingCount = 0;
        let standAloneCost = 0;

        const scaledIngredients = r.ingredients.map((ing) => {
          const itemDef = GROCERY_CATALOG[ing.key] || {
            name: ing.key,
            unit: "unité",
            packQty: 1,
            packLabel: "1 paquet",
            basePrice: 1.5,
          };

          const required =
            itemDef.unit === "pce" || itemDef.unit === "tranche" || itemDef.unit === "boite" || itemDef.unit === "cube"
              ? Math.max(1, Math.round(ing.amount * ratio))
              : Math.round(ing.amount * ratio);

          const owned = fridge[ing.key]?.qty || 0;
          const deficit = Math.max(0, required - owned);
          const isFull = deficit === 0;

          if (!isFull) {
            missingCount++;
            const packs = Math.ceil(deficit / itemDef.packQty);
            standAloneCost += packs * (itemDef.basePrice * store.multiplier);
          }

          return {
            key: ing.key,
            name: itemDef.name,
            unit: itemDef.unit,
            required,
            owned,
            deficit,
            isFull,
            packLabel: itemDef.packLabel,
          };
        });

        const completedCount = scaledIngredients.filter((i) => i.isFull).length;

        return {
          ...r,
          diet: r.ingredients.some((ing) => MEAT_KEYS.has(ing.key))
            ? "meat"
            : r.ingredients.some((ing) => FISH_KEYS.has(ing.key))
              ? "fish"
              : "veggie",
          scaledIngredients,
          completedCount,
          missingCount,
          totalCount: scaledIngredients.length,
          matchPct: completedCount / scaledIngredients.length,
          standAloneCost,
        };
      })
      .sort((a, b) => b.matchPct - a.matchPct || a.standAloneCost - b.standAloneCost);

    return { recipesWithStatus: statusList, excludedCount: excluded };
  }, [fridge, store.multiplier, equipments, servings]);

  const filteredRecipes = useMemo(() => {
    if (!searchQuery.trim()) return recipesWithStatus;
    const cleanQ = cleanStr(searchQuery);
    return recipesWithStatus.filter(
      (r) =>
        cleanStr(r.name).includes(cleanQ) ||
        r.scaledIngredients.some((ing) => cleanStr(ing.name).includes(cleanQ))
    );
  }, [recipesWithStatus, searchQuery]);

  const selectedRecipes = recipesWithStatus.filter((r) => selected.has(r.id));

  // Panier mutualisé
  const shoppingList = useMemo(() => {
    const totalDemands = {};
    selectedRecipes.forEach((r) => {
      r.scaledIngredients.forEach((ing) => {
        totalDemands[ing.key] = (totalDemands[ing.key] || 0) + ing.required;
      });
    });

    const items = [];
    Object.keys(totalDemands).forEach((key) => {
      const demanded = totalDemands[key];
      const inStock = fridge[key]?.qty || 0;
      const deficit = demanded - inStock;

      if (deficit > 0) {
        const itemDef = GROCERY_CATALOG[key] || {
          name: key,
          unit: "unité",
          packQty: 1,
          packLabel: "1 paquet",
          basePrice: 1.5,
        };

        const packsToBuy = Math.ceil(deficit / itemDef.packQty);
        const totalBoughtQty = packsToBuy * itemDef.packQty;
        const leftover = totalBoughtQty - deficit;
        const cost = packsToBuy * (itemDef.basePrice * store.multiplier);

        items.push({
          key,
          name: itemDef.name,
          unit: itemDef.unit,
          demanded,
          inStock,
          deficit,
          packsToBuy,
          packLabel: itemDef.packLabel,
          leftover,
          cost,
        });
      }
    });

    return items.sort((a, b) => b.cost - a.cost);
  }, [selectedRecipes, fridge, store.multiplier]);

  const totalStoreBill = shoppingList.reduce((sum, item) => sum + item.cost, 0);

  const meatTarget = meatMeals === null ? null : Math.min(meatMeals, mealsWanted);
  const fishTarget = fishMeals === null ? null : Math.min(fishMeals, mealsWanted - (meatTarget ?? 0));
  const selectedMeatCount = selectedRecipes.filter((r) => r.diet === "meat").length;
  const selectedFishCount = selectedRecipes.filter((r) => r.diet === "fish").length;

  // OPTIMISATION CORRIGÉE : SÉLECTIONNE TOUJOURS LE NOMBRE EXACT DE REPAS DEMANDÉS (SANS STOP ARTIFICIEL)
  const optimizeMenu = () => {
    const pool = [...recipesWithStatus];
    const picked = [];
    const simulatedStock = {};
    Object.keys(fridge).forEach((k) => {
      simulatedStock[k] = fridge[k].qty;
    });

    // Quotas viande / poisson : un nombre fixé est respecté exactement,
    // les repas restants sont partagés entre les catégories laissées sur « peu importe » et le végétarien.
    const quota = { meat: meatTarget, fish: fishTarget, free: mealsWanted - (meatTarget ?? 0) - (fishTarget ?? 0) };
    const bucket = (r) => (quota[r.diet] === null || quota[r.diet] === undefined ? "free" : r.diet);
    const fitsQuota = (r) => quota[bucket(r)] > 0;
    const consumeQuota = (r) => quota[bucket(r)]--;

    // 1. D'abord les recettes réalisables gratuitement avec ce qui est déjà au frigo
    const freeRecipes = pool.filter((r) => r.standAloneCost === 0);
    for (const r of freeRecipes) {
      if (picked.length >= mealsWanted) break;
      if (!fitsQuota(r)) continue;
      consumeQuota(r);
      picked.push(r.id);
      r.scaledIngredients.forEach((ing) => {
        simulatedStock[ing.key] = Math.max(0, (simulatedStock[ing.key] || 0) - ing.required);
      });
    }

    let remaining = pool.filter((r) => !picked.includes(r.id));

    // 2. Sélectionne les plats suivants en complétant toujours jusqu'au nombre voulu (ex. 7)
    // en choisissant à chaque étape l'option la plus économique
    while (picked.length < mealsWanted && remaining.length > 0) {
      let best = null;
      let lowestAddedCost = Infinity;

      for (const r of remaining) {
        if (!fitsQuota(r)) continue;
        let addedForThis = 0;
        r.scaledIngredients.forEach((ing) => {
          const cur = simulatedStock[ing.key] || 0;
          const def = ing.required - cur;
          if (def > 0) {
            const defItem = GROCERY_CATALOG[ing.key];
            if (defItem) {
              const packs = Math.ceil(def / defItem.packQty);
              addedForThis += packs * (defItem.basePrice * store.multiplier);
            }
          }
        });

        if (addedForThis < lowestAddedCost) {
          lowestAddedCost = addedForThis;
          best = r;
        }
      }

      if (!best) break;

      consumeQuota(best);
      picked.push(best.id);
      best.scaledIngredients.forEach((ing) => {
        const cur = simulatedStock[ing.key] || 0;
        const def = ing.required - cur;
        if (def > 0) {
          const defItem = GROCERY_CATALOG[ing.key];
          const packs = Math.ceil(def / defItem.packQty);
          simulatedStock[ing.key] = cur + packs * defItem.packQty - ing.required;
        } else {
          simulatedStock[ing.key] = cur - ing.required;
        }
      });

      remaining = remaining.filter((r) => r.id !== best.id);
    }

    setSelected(new Set(picked));
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAccordion = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const togglePlanningAccordion = (id) => {
    setExpandedPlanningId((prev) => (prev === id ? null : id));
  };

  const fridgeList = Object.entries(fridge);

  const shelves = [[], [], []];
  fridgeList.forEach((entry, idx) => {
    shelves[idx % 3].push(entry);
  });

  return (
    <div className="fm-app-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Space+Mono:wght@700&family=Syne:wght@800&display=swap');

        :root, html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          min-height: 100vh;
          background: #faf8f5;
          overflow-x: hidden;
        }

        .fm-app-root {
          /* PALETTE COLORÉE DOUCE ET ÉLÉGANTE */
          --cream-bg: #faf8f5;
          --pure-white: #ffffff;
          --ink-dark: #18221b;
          --ink-soft: #4a594f;
          
          --citrus-orange: #ff6b35;
          --citrus-orange-hover: #ff8554;
          --warm-yellow: #ffb703;
          --sunny-yellow: #fff3cc;
          
          --fresh-green: #2a7a44;
          --fresh-green-light: #e8f5ec;
          
          --fridge-mint: #e2f1f4;
          --fridge-border: #b8dbe0;
          --fridge-accent: #007791;
          
          --coral-red: #e63946;
          --line-color: rgba(24, 34, 27, 0.08);
          
          font-family: 'Plus Jakarta Sans', sans-serif;
          background: var(--cream-bg);
          color: var(--ink-dark);
          min-height: 100vh;
          width: 100%;
          box-sizing: border-box;
          padding: 2rem 3rem 6rem;
        }

        .fm-app-root * { box-sizing: border-box; }

        .fm-fullwidth-wrapper {
          width: 100%;
          max-width: 100%;
          margin: 0 auto;
        }

        /* HEADER CENTRÉ AVEC LE TITRE EN SYNE */
        .fm-hero-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          margin-bottom: 2.2rem;
          padding-bottom: 1.8rem;
          border-bottom: 2px dashed rgba(255, 107, 53, 0.25);
          gap: 0.6rem;
        }

        .fm-hero-title {
          font-family: 'Syne', sans-serif;
          font-size: 3.8rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          margin: 0;
          color: var(--citrus-orange);
          display: flex;
          align-items: center;
          gap: 0.8rem;
        }

        .fm-hero-tagline {
          font-size: 1.15rem;
          color: var(--ink-soft);
          margin: 0;
          max-width: 700px;
          line-height: 1.5;
        }

        .fm-hero-badges {
          display: flex;
          align-items: center;
          gap: 1.2rem;
          margin-top: 0.5rem;
          background: var(--sunny-yellow);
          padding: 0.6rem 1.6rem;
          border-radius: 999px;
          border: 1px solid rgba(255, 183, 3, 0.4);
        }

        .fm-hero-pill {
          font-size: 0.98rem;
          font-weight: 700;
          color: #7a5000;
        }

        .fm-hero-pill strong {
          color: var(--citrus-orange);
          font-family: 'Space Mono', monospace;
          font-size: 1.1rem;
        }

        /* COMPTE UTILISATEUR */
        .fm-account-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.8rem;
          margin-top: 0.6rem;
          font-size: 0.92rem;
          color: var(--ink-soft);
        }

        .fm-account-user { font-weight: 800; color: var(--ink-dark); }
        .fm-account-status { font-weight: 700; }
        .fm-account-status.saved { color: var(--fresh-green); }
        .fm-account-status.error { color: var(--coral-red); }

        .fm-account-form {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          background: var(--pure-white);
          border: 1px solid var(--line-color);
          border-radius: 16px;
          padding: 0.9rem 1.2rem;
        }

        .fm-account-form input {
          font: inherit;
          padding: 0.55rem 0.9rem;
          border: 1px solid var(--line-color);
          border-radius: 10px;
          min-width: 220px;
        }

        .fm-account-btn {
          font: inherit;
          font-weight: 800;
          background: var(--citrus-orange);
          color: var(--pure-white);
          border: none;
          border-radius: 999px;
          padding: 0.55rem 1.3rem;
          cursor: pointer;
        }
        .fm-account-btn:hover { background: var(--citrus-orange-hover); }
        .fm-account-btn:disabled { opacity: 0.6; cursor: wait; }

        .fm-account-link {
          font: inherit;
          font-weight: 700;
          background: none;
          border: none;
          color: var(--fridge-accent);
          text-decoration: underline;
          cursor: pointer;
          padding: 0.3rem;
        }

        .fm-account-message { width: 100%; margin: 0; font-weight: 700; }
        .fm-account-message.error { color: var(--coral-red); }
        .fm-account-message.info { color: var(--fresh-green); }

        /* ONGLETS */
        .fm-tabs-bar {
          display: flex;
          justify-content: center;
          gap: 1rem;
          margin-bottom: 2.5rem;
        }

        .fm-tab-button {
          background: var(--pure-white);
          border: 1px solid var(--line-color);
          color: var(--ink-soft);
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.05rem;
          font-weight: 700;
          padding: 0.85rem 1.8rem;
          border-radius: 999px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(0,0,0,0.03);
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .fm-tab-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 18px rgba(0,0,0,0.06);
          color: var(--citrus-orange);
        }

        .fm-tab-button.active {
          background: var(--citrus-orange);
          color: var(--pure-white);
          border-color: var(--citrus-orange);
          box-shadow: 0 8px 20px rgba(255, 107, 53, 0.35);
        }

        .fm-badge-counter {
          background: var(--warm-yellow);
          color: var(--ink-dark);
          font-size: 0.8rem;
          font-weight: 800;
          padding: 0.2rem 0.55rem;
          border-radius: 999px;
          font-family: 'Space Mono', monospace;
        }

        /* PANNEAUX AVEC TYPO MODERNE ADOUCIE */
        .fm-card-panel {
          background: var(--pure-white);
          border: 1px solid var(--line-color);
          border-radius: 20px;
          padding: 2.4rem;
          margin-bottom: 2.5rem;
          box-shadow: 0 10px 35px rgba(0, 0, 0, 0.03);
          width: 100%;
        }

        .fm-card-panel h2 {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.7rem;
          font-weight: 800;
          color: var(--ink-dark);
          margin: 0 0 0.5rem;
          letter-spacing: -0.01em;
        }

        .fm-subhint {
          font-size: 1rem;
          color: var(--ink-soft);
          margin: 0 0 1.8rem;
        }

        /* FRIGO DESIGN PASTEL */
        .fm-fridge-container {
          width: 100%;
          max-width: 820px;
          margin: 2rem auto;
          background: var(--fridge-mint);
          border: 6px solid var(--fridge-border);
          border-radius: 40px 40px 24px 24px;
          padding: 2rem;
          position: relative;
          box-shadow: 0 25px 60px rgba(0, 119, 145, 0.12), inset 0 2px 6px rgba(255,255,255,0.8);
        }

        .fm-fridge-tophead {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 1.2rem;
          border-bottom: 3px solid rgba(0, 119, 145, 0.1);
          margin-bottom: 1.5rem;
        }

        .fm-fridge-logo {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.1rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: var(--fridge-accent);
          text-transform: uppercase;
        }

        .fm-fridge-led-panel {
          background: var(--pure-white);
          border: 1px solid var(--fridge-border);
          border-radius: 8px;
          padding: 0.4rem 0.9rem;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          box-shadow: 0 2px 6px rgba(0,0,0,0.04);
        }

        .fm-led-status {
          font-family: 'Space Mono', monospace;
          color: var(--fresh-green);
          font-weight: 700;
          font-size: 0.92rem;
        }

        .fm-led-light {
          width: 9px;
          height: 9px;
          background: #38b000;
          border-radius: 50%;
          box-shadow: 0 0 8px #38b000;
        }

        .fm-fridge-shelves-zone {
          background: var(--pure-white);
          border-radius: 20px;
          padding: 1.8rem;
          border: 2px solid rgba(0, 119, 145, 0.12);
          box-shadow: inset 0 3px 12px rgba(0,0,0,0.02);
          position: relative;
        }

        .fm-vintage-handle {
          position: absolute;
          right: -24px;
          top: 140px;
          width: 14px;
          height: 160px;
          background: linear-gradient(90deg, #d3d9d5, #ffffff 45%, #adb5b0);
          border-radius: 8px;
          box-shadow: 3px 6px 15px rgba(0,0,0,0.15);
        }

        .fm-shelf-block {
          margin-bottom: 2rem;
        }

        .fm-shelf-block:last-child {
          margin-bottom: 0.5rem;
        }

        .fm-shelf-items-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.8rem;
          min-height: 52px;
          padding-bottom: 0.8rem;
          align-items: flex-end;
        }

        .fm-glass-rack {
          height: 9px;
          background: linear-gradient(180deg, #e3f2fd, #bbdefb);
          border-radius: 5px;
          border: 1px solid #90caf9;
          box-shadow: 0 3px 6px rgba(0,0,0,0.05);
        }

        .fm-item-pill {
          background: var(--sunny-yellow);
          border: 1px solid rgba(255, 183, 3, 0.5);
          color: var(--ink-dark);
          border-radius: 12px;
          padding: 0.5rem 0.85rem;
          display: inline-flex;
          align-items: center;
          gap: 0.6rem;
          box-shadow: 0 3px 8px rgba(0,0,0,0.04);
          transition: all 0.15s ease;
        }

        .fm-item-pill:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 14px rgba(255, 183, 3, 0.25);
        }

        .fm-item-name {
          font-weight: 700;
          font-size: 0.95rem;
          text-transform: capitalize;
        }

        .fm-item-qty {
          font-family: 'Space Mono', monospace;
          font-size: 0.84rem;
          background: var(--pure-white);
          color: #7a5000;
          padding: 0.18rem 0.5rem;
          border-radius: 6px;
          font-weight: 700;
        }

        .fm-qty-btn {
          background: var(--pure-white);
          border: 1px solid rgba(0,0,0,0.1);
          color: var(--ink-dark);
          width: 24px;
          height: 24px;
          border-radius: 6px;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }

        .fm-qty-btn:hover {
          background: var(--citrus-orange);
          color: var(--pure-white);
          border-color: var(--citrus-orange);
        }

        .fm-item-delete {
          background: transparent;
          border: none;
          color: var(--coral-red);
          font-size: 1.2rem;
          font-weight: 800;
          cursor: pointer;
          margin-left: 0.2rem;
          line-height: 1;
        }

        /* FORMULAIRE CLAIR ET VIF */
        .fm-bright-form {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          margin-bottom: 2rem;
          background: #f4ede2;
          padding: 1.4rem;
          border-radius: 16px;
          border: 1px solid rgba(0,0,0,0.05);
        }

        .fm-form-input {
          background: var(--pure-white);
          color: var(--ink-dark);
          border: 2px solid transparent;
          border-radius: 10px;
          padding: 0.85rem 1.1rem;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1rem;
          font-weight: 600;
          box-shadow: 0 2px 6px rgba(0,0,0,0.02);
        }

        .fm-form-input:focus {
          outline: none;
          border-color: var(--citrus-orange);
        }

        .fm-submit-btn {
          background: var(--citrus-orange);
          color: var(--pure-white);
          border: none;
          border-radius: 10px;
          padding: 0.85rem 1.8rem;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 800;
          font-size: 1.05rem;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
        }

        .fm-submit-btn:hover {
          background: var(--citrus-orange-hover);
          transform: translateY(-1px);
        }

        /* GRILLE DE RECETTES */
        .fm-recipes-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
          gap: 1.4rem;
          width: 100%;
        }

        .fm-recipe-box {
          background: var(--pure-white);
          border: 1px solid var(--line-color);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 6px 18px rgba(0,0,0,0.03);
          transition: all 0.2s ease;
        }

        .fm-recipe-box:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 28px rgba(0,0,0,0.07);
          border-color: rgba(255, 107, 53, 0.4);
        }

        .fm-box-header {
          padding: 1.4rem;
          cursor: pointer;
        }

        .fm-box-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.25rem;
          font-weight: 800;
          color: var(--ink-dark);
          margin-bottom: 0.4rem;
          line-height: 1.35;
        }

        .fm-box-meta {
          font-size: 0.9rem;
          color: var(--ink-soft);
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-wrap: wrap;
        }

        .fm-pill-device {
          background: #edf2ee;
          color: var(--fresh-green);
          font-weight: 700;
          padding: 0.2rem 0.55rem;
          border-radius: 6px;
          font-size: 0.8rem;
        }

        .fm-box-drawer {
          background: #fcfbfa;
          border-top: 1px dashed var(--line-color);
          padding: 1.4rem;
        }

        .fm-label-sub {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1rem;
          font-weight: 800;
          color: var(--citrus-orange);
          margin: 1.2rem 0 0.5rem;
        }

        .fm-label-sub:first-child { margin-top: 0; }

        .fm-ings-container {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          margin-bottom: 1.2rem;
        }

        .fm-ing-line {
          display: flex;
          justify-content: space-between;
          padding: 0.4rem 0.6rem;
          border-radius: 6px;
          background: var(--pure-white);
          font-size: 0.92rem;
          border: 1px solid rgba(0,0,0,0.04);
        }

        .fm-recipe-ol {
          margin: 0 0 1.2rem;
          padding-left: 1.3rem;
          line-height: 1.6;
          color: var(--ink-dark);
          font-size: 0.95rem;
        }

        .fm-recipe-ol li { margin-bottom: 0.5rem; }

        /* TICKET DE CAISSE */
        .fm-grocery-ticket {
          background: var(--pure-white);
          border: 2px dashed rgba(46, 125, 71, 0.3);
          border-radius: 16px;
          padding: 2.2rem;
          box-shadow: 0 10px 30px rgba(0,0,0,0.03);
          max-width: 900px;
          margin: 0 auto;
        }

        .fm-ticket-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 0.85rem 0;
          border-bottom: 1px dashed rgba(0,0,0,0.08);
        }

        .fm-ticket-total {
          display: flex;
          justify-content: space-between;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.5rem;
          font-weight: 800;
          margin-top: 1.5rem;
          padding-top: 1.2rem;
          border-top: 3px solid var(--ink-dark);
        }
      `}</style>

      <div className="fm-fullwidth-wrapper">
        {/* HEADER CENTRÉ AVEC LE TITRE EN SYNE */}
        <header className="fm-hero-header">
          <h1 className="fm-hero-title">
            <span>🥕</span> Frigo malin <span>🍳</span>
          </h1>
          <p className="fm-hero-tagline">
            Moins de gaspillage, de vrais bons repas cuisinés et un budget courses respecté à l'euro près.
          </p>

          <div className="fm-hero-badges">
            <span className="fm-hero-pill">
              Budget max : <strong>{weeklyBudget} €</strong>
            </span>
            <span style={{ color: "rgba(255, 183, 3, 0.6)" }}>•</span>
            <span className="fm-hero-pill">
              Plats sélectionnés : <strong>{selected.size} sur {mealsWanted}</strong>
            </span>
            <span style={{ color: "rgba(255, 183, 3, 0.6)" }}>•</span>
            <span className="fm-hero-pill">
              Convives : <strong>{servings} personnes</strong>
            </span>
          </div>

          <AccountBar session={session} syncStatus={syncStatus} />
        </header>

        {/* ONGLETS CENTRÉS */}
        <nav className="fm-tabs-bar">
          <button
            className={`fm-tab-button ${activeTab === "frigo" ? "active" : ""}`}
            onClick={() => setActiveTab("frigo")}
          >
            ❄️ Mon réfrigérateur
          </button>
          <button
            className={`fm-tab-button ${activeTab === "recettes" ? "active" : ""}`}
            onClick={() => setActiveTab("recettes")}
          >
            🍲 Les plats cuisinés ({recipesWithStatus.length})
          </button>
          <button
            className={`fm-tab-button ${activeTab === "planning" ? "active" : ""}`}
            onClick={() => setActiveTab("planning")}
          >
            📋 Mon planning & Courses
            {selected.size > 0 && <span className="fm-badge-counter">{selected.size}</span>}
          </button>
        </nav>

        {/* ================= ONGLET 1 : MON RÉFRIGÉRATEUR ================= */}
        {activeTab === "frigo" && (
          <section className="fm-card-panel">
            <h2>Mon réfrigérateur rétro</h2>
            <p className="fm-subhint">
              Ajoute tes ingrédients : ils sont rangés sur les étagères et sauvegardés définitivement sur ton ordinateur.
            </p>

            <form className="fm-bright-form" onSubmit={handleAddCustom}>
              <input
                type="text"
                className="fm-form-input"
                style={{ flex: "2", minWidth: "220px" }}
                placeholder="Nom (ex : poulet, patates, oeufs, riz, courgettes...)"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
              <input
                type="number"
                className="fm-form-input"
                style={{ width: "110px" }}
                min="1"
                value={customQty}
                onChange={(e) => setCustomQty(Math.max(1, Number(e.target.value)))}
              />
              <select
                className="fm-form-input"
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
              >
                <option value="g">grammes (g)</option>
                <option value="pce">pièces (pce)</option>
                <option value="ml">millilitres (ml)</option>
                <option value="tranche">tranches</option>
                <option value="boite">boîtes</option>
              </select>
              <button type="submit" className="fm-submit-btn">
                + Ranger au frigo
              </button>
            </form>

            <div className="fm-fridge-container">
              <div className="fm-vintage-handle" />

              <div className="fm-fridge-tophead">
                <span className="fm-fridge-logo">FRIGO MALIN · FRESH AIR</span>
                <div className="fm-fridge-led-panel">
                  <span className="fm-led-light" />
                  <span className="fm-led-status">
                    +4°C · {fridgeList.length} ALIMENT{fridgeList.length > 1 ? "S" : ""}
                  </span>
                </div>
              </div>

              <div className="fm-fridge-shelves-zone">
                {fridgeList.length === 0 ? (
                  <div style={{ padding: "4rem 1rem", textAlign: "center", color: "var(--ink-soft)" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>🥬</div>
                    <div style={{ fontWeight: 800, fontSize: "1.3rem", color: "var(--ink-dark)" }}>
                      Ton réfrigérateur est tout propre et vide !
                    </div>
                    <div style={{ fontSize: "1rem", marginTop: "0.4rem" }}>
                      Ajoute les aliments de tes placards ci-dessus pour composer tes menus.
                    </div>
                  </div>
                ) : (
                  shelves.map((shelfItems, sIdx) => (
                    <div className="fm-shelf-block" key={sIdx}>
                      <div className="fm-shelf-items-row">
                        {shelfItems.map(([key, item]) => (
                          <div className="fm-item-pill" key={key}>
                            <span className="fm-item-name">{item.name}</span>
                            <span className="fm-item-qty">{item.qty} {item.unit}</span>
                            <button
                              type="button"
                              className="fm-qty-btn"
                              onClick={() => updateQty(key, -1)}
                              title="Diminuer"
                            >
                              −
                            </button>
                            <button
                              type="button"
                              className="fm-qty-btn"
                              onClick={() => updateQty(key, 1)}
                              title="Augmenter"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              className="fm-item-delete"
                              onClick={() => removeStock(key)}
                              title="Supprimer"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="fm-glass-rack" />
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        {/* ================= ONGLET 2 : LES RECETTES ================= */}
        {activeTab === "recettes" && (
          <>
            <section className="fm-card-panel">
              <h2>Mes appareils & Préférences de la semaine</h2>
              <p className="fm-subhint">
                Ajuste tes équipements et ton budget : l'optimisation s'adapte immédiatement.
              </p>

              {/* Équipements */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem", marginBottom: "2rem" }}>
                {AVAILABLE_EQUIPMENTS.map((eq) => {
                  const active = !!equipments[eq.id];
                  return (
                    <button
                      key={eq.id}
                      type="button"
                      style={{
                        background: active ? "var(--fresh-green-light)" : "var(--pure-white)",
                        color: active ? "var(--fresh-green)" : "var(--ink-soft)",
                        border: active ? "2px solid var(--fresh-green)" : "1px solid var(--line-color)",
                        borderRadius: "999px",
                        padding: "0.6rem 1.4rem",
                        fontFamily: "inherit",
                        fontWeight: 700,
                        fontSize: "0.95rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        transition: "all 0.15s ease"
                      }}
                      onClick={() => setEquipments((prev) => ({ ...prev, [eq.id]: !prev[eq.id] }))}
                    >
                      <span>{eq.icon}</span>
                      <span>{eq.label}</span>
                      <span>{active ? "✓" : "+"}</span>
                    </button>
                  );
                })}
              </div>

              {/* Paramètres de budget */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "2.5rem", marginBottom: "2rem", alignItems: "flex-end" }}>
                <div>
                  <span style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.4rem", color: "var(--ink-soft)" }}>
                    Convives par repas
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <button
                      className="fm-submit-btn"
                      style={{ padding: "0.4rem 0.9rem", background: "var(--fresh-green)" }}
                      onClick={() => setServings((s) => Math.max(1, s - 1))}
                    >
                      −
                    </button>
                    <span style={{ fontSize: "1.3rem", fontWeight: 800, minWidth: "4.5rem", textAlign: "center", fontFamily: 'Space Mono', monospace: true }}>
                      {servings} pers.
                    </span>
                    <button
                      className="fm-submit-btn"
                      style={{ padding: "0.4rem 0.9rem", background: "var(--fresh-green)" }}
                      onClick={() => setServings((s) => Math.min(10, s + 1))}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <span style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.4rem", color: "var(--ink-soft)" }}>
                    Enseigne habituelle
                  </span>
                  <select
                    className="fm-form-input"
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                  >
                    {STORES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.4rem", color: "var(--ink-soft)" }}>
                    Budget max souhaité
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <button
                      className="fm-submit-btn"
                      style={{ padding: "0.4rem 0.9rem", background: "var(--citrus-orange)" }}
                      onClick={() => setWeeklyBudget((b) => Math.max(10, b - 5))}
                    >
                      −
                    </button>
                    <span style={{ fontSize: "1.3rem", fontWeight: 800, minWidth: "4.5rem", textAlign: "center", fontFamily: 'Space Mono', monospace: true }}>
                      {weeklyBudget} €
                    </span>
                    <button
                      className="fm-submit-btn"
                      style={{ padding: "0.4rem 0.9rem", background: "var(--citrus-orange)" }}
                      onClick={() => setWeeklyBudget((b) => b + 5)}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <span style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.4rem", color: "var(--ink-soft)" }}>
                    Repas voulus
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <button
                      className="fm-submit-btn"
                      style={{ padding: "0.4rem 0.9rem", background: "var(--citrus-orange)" }}
                      onClick={() => setMealsWanted((m) => Math.max(1, m - 1))}
                    >
                      −
                    </button>
                    <span style={{ fontSize: "1.3rem", fontWeight: 800, minWidth: "3.5rem", textAlign: "center", fontFamily: 'Space Mono', monospace: true }}>
                      {mealsWanted}
                    </span>
                    <button
                      className="fm-submit-btn"
                      style={{ padding: "0.4rem 0.9rem", background: "var(--citrus-orange)" }}
                      onClick={() => setMealsWanted((m) => Math.min(14, m + 1))}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <span style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.4rem", color: "var(--ink-soft)" }}>
                    Dont avec viande 🥩
                  </span>
                  <select
                    className="fm-form-input"
                    value={meatTarget === null ? "" : meatTarget}
                    onChange={(e) => setMeatMeals(e.target.value === "" ? null : Number(e.target.value))}
                  >
                    <option value="">Peu importe</option>
                    {Array.from({ length: mealsWanted + 1 }, (_, n) => (
                      <option key={n} value={n}>
                        {n === 0 ? "Aucun" : `${n} repas sur ${mealsWanted}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.4rem", color: "var(--ink-soft)" }}>
                    Dont avec poisson 🐟
                  </span>
                  <select
                    className="fm-form-input"
                    value={fishTarget === null ? "" : fishTarget}
                    onChange={(e) => setFishMeals(e.target.value === "" ? null : Number(e.target.value))}
                  >
                    <option value="">Peu importe</option>
                    {Array.from({ length: mealsWanted - (meatTarget ?? 0) + 1 }, (_, n) => (
                      <option key={n} value={n}>
                        {n === 0 ? "Aucun" : `${n} repas sur ${mealsWanted}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Bouton d'optimisation */}
              <button
                className="fm-submit-btn"
                style={{ width: "100%", padding: "1.1rem", fontSize: "1.15rem", borderRadius: "14px" }}
                onClick={optimizeMenu}
              >
                ⚡ Sélectionner automatiquement mes {mealsWanted} repas les plus économiques
              </button>

              <div style={{ marginTop: "1.2rem", fontSize: "1.1rem", fontWeight: 700, textAlign: "center" }}>
                {selected.size} repas choisis sur {mealsWanted} voulus (🥩 {selectedMeatCount}
                {meatTarget !== null && `/${meatTarget}`} viande · 🐟 {selectedFishCount}
                {fishTarget !== null && `/${fishTarget}`} poisson) · Vrai ticket de caisse :{" "}
                <span style={{ color: totalStoreBill <= weeklyBudget ? "var(--fresh-green)" : "var(--coral-red)", fontFamily: 'Space Mono', monospace: true }}>
                  {fmtPrice(totalStoreBill)}
                </span>{" "}
                / {fmtPrice(weeklyBudget)} de budget
              </div>
            </section>

            <section className="fm-card-panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
                <h2 style={{ margin: 0 }}>Les plats cuisinés disponibles ({filteredRecipes.length})</h2>
                <input
                  type="text"
                  placeholder="🔍 Filtrer (ex: poulet, lasagnes, curry...)"
                  className="fm-form-input"
                  style={{ minWidth: "280px" }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* GRILLE SUR TOUTE LA LARGEUR DE L'ÉCRAN */}
              <div className="fm-recipes-grid">
                {filteredRecipes.map((r, idx) => {
                  const isExpanded = expandedId === r.id;
                  const isSelected = selected.has(r.id);

                  return (
                    <div className="fm-recipe-box" key={r.id}>
                      <div className="fm-box-header" onClick={() => toggleAccordion(r.id)}>
                        <div className="fm-box-title">{idx + 1}. {r.name}</div>
                        <div className="fm-box-meta">
                          <span>⏱ {r.time}</span>
                          <span>{DIET_LABELS[r.diet]}</span>
                          {r.equipments.map((eq) => (
                            <span key={eq} className="fm-pill-device">
                              {AVAILABLE_EQUIPMENTS.find((e) => e.id === eq)?.icon} {eq}
                            </span>
                          ))}
                          <span>• {r.completedCount}/{r.totalCount} en stock</span>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
                          <div
                            style={{
                              fontWeight: 800,
                              fontSize: "1.15rem",
                              color: r.standAloneCost === 0 ? "var(--fresh-green)" : "var(--citrus-orange)",
                              fontFamily: 'Space Mono',
                              monospace: true
                            }}
                          >
                            {r.standAloneCost === 0 ? "0 € à acheter" : `+${fmtPrice(r.standAloneCost)}`}
                          </div>
                          <span style={{ fontSize: "0.85rem", color: "var(--ink-soft)", fontWeight: 700 }}>
                            {isExpanded ? "▲ Masquer" : "▼ Voir recette"}
                          </span>
                        </div>
                      </div>

                      {/* TIROIR DÉROULANT */}
                      {isExpanded && (
                        <div className="fm-box-drawer">
                          <div className="fm-label-sub">
                            Ingrédients requis ({servings} pers.) :
                          </div>
                          <div className="fm-ings-container">
                            {r.scaledIngredients.map((ing) => (
                              <div className="fm-ing-line" key={ing.key}>
                                <span>
                                  <strong>{ing.name}</strong> : {ing.required} {ing.unit}
                                </span>
                                {ing.isFull ? (
                                  <span style={{ color: "var(--fresh-green)", fontWeight: 800 }}>✓ Déjà au frigo</span>
                                ) : (
                                  <span style={{ color: "var(--coral-red)", fontWeight: 700 }}>
                                    Manque {ing.deficit} {ing.unit} ({ing.packLabel})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="fm-label-sub">Préparation pas-à-pas :</div>
                          <ol className="fm-recipe-ol">
                            {r.steps.map((st, sIdx) => (
                              <li key={sIdx}>{st}</li>
                            ))}
                          </ol>

                          <div style={{ textAlign: "right", marginTop: "1rem" }}>
                            <button
                              type="button"
                              className="fm-submit-btn"
                              style={{
                                background: isSelected ? "var(--coral-red)" : "var(--fresh-green)",
                                padding: "0.6rem 1.4rem"
                              }}
                              onClick={() => toggleSelect(r.id)}
                            >
                              {isSelected ? "Retirer du menu" : "+ Ajouter à mon menu"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {/* ================= ONGLET 3 : PLANNING & TICKET DE CAISSE ================= */}
        {activeTab === "planning" && (
          <>
            <section className="fm-card-panel">
              <h2>Menu sélectionné ({selected.size} repas pour {servings} pers.)</h2>
              <p className="fm-subhint">
                Retrouve toutes tes fiches recettes ci-dessous pour cuisiner directement depuis ton planning.
              </p>

              {selectedRecipes.length === 0 ? (
                <div style={{ padding: "3rem", textAlign: "center", color: "var(--ink-soft)", fontStyle: "italic" }}>
                  Aucun plat sélectionné. Rends-toi dans l'onglet des recettes ou clique sur « Sélectionner automatiquement ».
                </div>
              ) : (
                <div className="fm-recipes-grid">
                  {selectedRecipes.map((r) => {
                    const isExpandedInPlan = expandedPlanningId === r.id;

                    return (
                      <div className="fm-recipe-box" key={r.id}>
                        <div className="fm-box-header" onClick={() => togglePlanningAccordion(r.id)}>
                          <div className="fm-box-title">{r.name}</div>
                          <div className="fm-box-meta">
                            <span>⏱ {r.time}</span>
                          <span>{DIET_LABELS[r.diet]}</span>
                            {r.equipments.map((eq) => (
                              <span key={eq} className="fm-pill-device">
                                {AVAILABLE_EQUIPMENTS.find((e) => e.id === eq)?.icon} {eq}
                              </span>
                            ))}
                            <span>• {r.missingCount === 0 ? "Stock complet" : `${r.missingCount} achat(s) requis`}</span>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
                            <span style={{ fontSize: "0.88rem", color: "var(--citrus-orange)", fontWeight: 800 }}>
                              {isExpandedInPlan ? "▲ Masquer la recette" : "▼ Cuisiner ce plat"}
                            </span>
                            <button
                              type="button"
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--coral-red)",
                                cursor: "pointer",
                                textDecoration: "underline",
                                fontSize: "0.95rem",
                                fontWeight: 800
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelect(r.id);
                              }}
                            >
                              Retirer
                            </button>
                          </div>
                        </div>

                        {isExpandedInPlan && (
                          <div className="fm-box-drawer">
                            <div className="fm-label-sub">
                              Proportions pour {servings} personne{servings > 1 ? "s" : ""} :
                            </div>
                            <div className="fm-ings-container">
                              {r.scaledIngredients.map((ing) => (
                                <div className="fm-ing-line" key={ing.key}>
                                  <span>
                                    <strong>{ing.name}</strong> : {ing.required} {ing.unit}
                                  </span>
                                  {ing.isFull ? (
                                    <span style={{ color: "var(--fresh-green)", fontWeight: 800 }}>✓ En stock</span>
                                  ) : (
                                    <span style={{ color: "var(--coral-red)", fontWeight: 700 }}>
                                      À acheter ({ing.packLabel})
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>

                            <div className="fm-label-sub">Préparation pas-à-pas :</div>
                            <ol className="fm-recipe-ol">
                              {r.steps.map((st, sIdx) => (
                                <li key={sIdx}>{st}</li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="fm-card-panel">
              <h2>Ticket de caisse réel ({store.name})</h2>
              <p className="fm-subhint">
                Liste précise des formats réels vendus en magasin nécessaires pour tes repas, sans compter ce qui est déjà chez toi.
              </p>

              <div className="fm-grocery-ticket">
                {shoppingList.length === 0 ? (
                  <div style={{ textAlign: "center", fontStyle: "italic", color: "var(--fresh-green)", padding: "1.5rem", fontWeight: 800 }}>
                    {selectedRecipes.length === 0
                      ? "Choisis des plats pour générer ta liste de courses."
                      : "🎉 Tu as déjà tous les ingrédients nécessaires dans ton réfrigérateur !"}
                  </div>
                ) : (
                  <>
                    {shoppingList.map((item) => (
                      <div className="fm-ticket-row" key={item.key}>
                        <div>
                          <strong style={{ fontSize: "1.1rem", color: "var(--ink-dark)" }}>
                            {item.packsToBuy > 1 ? `${item.packsToBuy}x ` : ""}
                            {item.name}
                          </strong>
                          <div style={{ fontSize: "0.85rem", color: "var(--ink-soft)", marginTop: "0.2rem" }}>
                            Format : {item.packLabel} · Requis : {item.demanded} {item.unit} (dont {item.inStock} {item.unit} au frigo)
                            {item.leftover > 0 && ` · Reste après repas : ${item.leftover} ${item.unit}`}
                          </div>
                        </div>
                        <span style={{ fontWeight: 800, fontSize: "1.2rem", fontFamily: 'Space Mono', monospace: true, color: "var(--ink-dark)" }}>
                          {fmtPrice(item.cost)}
                        </span>
                      </div>
                    ))}
                    <div className="fm-ticket-total">
                      <span>Total réel à régler</span>
                      <span style={{ color: totalStoreBill <= weeklyBudget ? "var(--fresh-green)" : "var(--coral-red)" }}>
                        {fmtPrice(totalStoreBill)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}