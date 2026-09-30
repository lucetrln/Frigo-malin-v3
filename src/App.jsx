import { useState, useEffect, useMemo } from "react";
import { MASSIVE_RECIPES } from "./recipesData";
import { supabase, loadUserData, saveUserData } from "./supabase";
import AccountBar from "./AccountBar";
import RecipeEditor from "./RecipeEditor";

const ALL_RECIPES_BY_ID = new Map(MASSIVE_RECIPES.map((r) => [r.id, r]));

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
const FISH_KEYS = new Set(["thon", "saumon", "cabillaud"]);
// Base principale d'un plat, utilisée pour varier les menus
const STARCH_BASES = ["pates", "riz", "semoule", "boulgour", "quinoa", "pdt", "patate-douce"];
// Légumes et légumineuses : la sélection automatique veut au moins l'un d'eux dans chaque plat
const VEG_KEYS = new Set([
  "carotte", "chou", "poireau", "tomate", "tomates-concassees", "champignons", "courgette", "poivron",
  "aubergine", "brocoli", "chou-fleur", "epinards", "haricots-verts", "petits-pois", "patate-douce",
  "courge", "concombre", "salade", "lentilles", "lentilles-corail", "pois-chiches", "haricots-rouges",
  "haricots-blancs",
]);
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
  brocoli: ["brocoli", "brocolis"],
  "chou-fleur": ["choufleur", "chouxfleurs"],
  epinards: ["epinard", "epinards", "pousseepinard", "poussesdepinards"],
  "haricots-verts": ["haricotvert", "haricotsverts"],
  "petits-pois": ["petitpois", "petitspois"],
  "patate-douce": ["patatedouce", "patatesdouces"],
  courge: ["courge", "courges", "butternut", "potimarron", "potiron", "citrouille"],
  concombre: ["concombre", "concombres"],
  salade: ["salade", "laitue", "batavia", "roquette", "mache", "saladeverte"],
  citron: ["citron", "citrons", "jusdecitron"],
  saumon: ["saumon", "pavedesaumon", "pavesdesaumon"],
  cabillaud: ["cabillaud", "colin", "merlu", "lieu", "poissonblanc", "filetdepoisson"],
  quinoa: ["quinoa"],
  boulgour: ["boulgour", "boulghour"],
  feta: ["feta"],
  chevre: ["chevre", "buchedechevre", "fromagedechevre"],
  "pate-feuilletee": ["patefeuilletee", "patebrisee", "pateatarte", "rouleaudepate"],
  tofu: ["tofu"],
  yaourt: ["yaourt", "yaourts", "yogourt", "fromageblanc", "yaourtgrec"],
};

function resolveKey(input = "") {
  const cleanInput = cleanStr(input);
  if (!cleanInput) return null;
  // Correspondance exacte d'abord, sinon l'alias le plus long (« patate douce » ne doit pas devenir « patate »)
  let bestKey = null;
  let bestLen = 0;
  for (const [key, aliases] of Object.entries(ALIASES)) {
    for (const a of aliases) {
      if (cleanInput === a) return key;
      if ((cleanInput.includes(a) || a.includes(cleanInput)) && a.length > bestLen) {
        bestKey = key;
        bestLen = a.length;
      }
    }
  }
  return bestKey ?? cleanInput;
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
  brocoli: { name: "Brocoli", unit: "pce", packQty: 1, packLabel: "1 tête", basePrice: 1.49, step: 1 },
  "chou-fleur": { name: "Chou-fleur", unit: "pce", packQty: 1, packLabel: "1 pièce", basePrice: 1.99, step: 1 },
  epinards: { name: "Épinards (surgelés)", unit: "g", packQty: 1000, packLabel: "Sachet 1 kg", basePrice: 1.89, step: 100 },
  "haricots-verts": { name: "Haricots verts (surgelés)", unit: "g", packQty: 1000, packLabel: "Sachet 1 kg", basePrice: 1.99, step: 100 },
  "petits-pois": { name: "Petits pois (surgelés)", unit: "g", packQty: 1000, packLabel: "Sachet 1 kg", basePrice: 1.79, step: 100 },
  "patate-douce": { name: "Patates douces", unit: "g", packQty: 1000, packLabel: "Sachet 1 kg", basePrice: 2.49, step: 100 },
  courge: { name: "Courge butternut", unit: "g", packQty: 1500, packLabel: "1 courge (~1,5 kg)", basePrice: 2.29, step: 250 },
  concombre: { name: "Concombre", unit: "pce", packQty: 1, packLabel: "1 pièce", basePrice: 0.89, step: 1 },
  salade: { name: "Salade verte", unit: "pce", packQty: 1, packLabel: "1 laitue", basePrice: 0.99, step: 1 },
  citron: { name: "Citrons", unit: "pce", packQty: 3, packLabel: "Filet de 3", basePrice: 1.29, step: 1 },
  saumon: { name: "Pavés de saumon", unit: "g", packQty: 250, packLabel: "2 pavés (250 g)", basePrice: 4.99, step: 125 },
  cabillaud: { name: "Filets de poisson blanc (surgelés)", unit: "g", packQty: 400, packLabel: "Sachet 400 g", basePrice: 4.49, step: 100 },
  quinoa: { name: "Quinoa", unit: "g", packQty: 500, packLabel: "Paquet 500 g", basePrice: 2.49, step: 50 },
  boulgour: { name: "Boulgour", unit: "g", packQty: 500, packLabel: "Paquet 500 g", basePrice: 1.39, step: 50 },
  feta: { name: "Feta", unit: "g", packQty: 200, packLabel: "Bloc 200 g", basePrice: 1.79, step: 50 },
  chevre: { name: "Bûche de chèvre", unit: "g", packQty: 180, packLabel: "Bûche 180 g", basePrice: 1.99, step: 30 },
  "pate-feuilletee": { name: "Pâte feuilletée", unit: "pce", packQty: 1, packLabel: "1 rouleau", basePrice: 0.99, step: 1 },
  tofu: { name: "Tofu nature", unit: "g", packQty: 400, packLabel: "2 blocs de 200 g", basePrice: 2.49, step: 100 },
  yaourt: { name: "Yaourts nature", unit: "pce", packQty: 4, packLabel: "Pack de 4", basePrice: 1.20, step: 1 },
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
  const [favorites, setFavorites] = useState(new Set()); // recettes gardées
  const [history, setHistory] = useState([]); // semaines passées : [{ date, ids }]
  const [customRecipes, setCustomRecipes] = useState([]); // recettes créées par l'utilisateur
  const [editingRecipe, setEditingRecipe] = useState(null); // null, "new" ou la recette modifiée
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
    if (p.favorites) setFavorites(new Set(p.favorites));
    if (p.history) setHistory(p.history);
    if (p.customRecipes) setCustomRecipes(p.customRecipes);
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
        JSON.stringify({ servings, storeId, weeklyBudget, mealsWanted, meatMeals, fishMeals, equipments, favorites: [...favorites], history, customRecipes })
      )
      .catch(() => {});
  }, [servings, storeId, weeklyBudget, mealsWanted, meatMeals, fishMeals, equipments, favorites, history, customRecipes, isReady]);

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
        prefs: { servings, storeId, weeklyBudget, mealsWanted, meatMeals, fishMeals, equipments, favorites: [...favorites], history, customRecipes },
        selected: [...selected],
      })
        .then(() => setSyncStatus("saved"))
        .catch(() => setSyncStatus("error"));
    }, 800);
    return () => clearTimeout(timer);
  }, [userId, cloudUserId, fridge, selected, servings, storeId, weeklyBudget, mealsWanted, meatMeals, fishMeals, equipments, favorites, history, customRecipes]);

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
        ...prev[matchedKey],
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

  // Aliment « à utiliser en priorité » : les recettes qui l'utilisent passent devant
  const togglePriority = (key) => {
    setFridge((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], priority: !prev[key].priority } } : prev));
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

    const eligible = [...customRecipes, ...MASSIVE_RECIPES].filter((r) => {
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
          base: STARCH_BASES.find((k) => r.ingredients.some((ing) => ing.key === k)) ?? null,
          hasVeg: r.ingredients.some((ing) => VEG_KEYS.has(ing.key)),
          priorityKeys: r.ingredients.filter((ing) => fridge[ing.key]?.priority).map((ing) => ing.key),
          scaledIngredients,
          completedCount,
          missingCount,
          totalCount: scaledIngredients.length,
          matchPct: completedCount / scaledIngredients.length,
          standAloneCost,
        };
      })
      .sort(
        (a, b) =>
          b.priorityKeys.length - a.priorityKeys.length ||
          b.matchPct - a.matchPct ||
          a.standAloneCost - b.standAloneCost
      );

    return { recipesWithStatus: statusList, excludedCount: excluded };
  }, [fridge, store.multiplier, equipments, servings, customRecipes]);

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

  // SUGGESTIONS : calcule les meilleurs plats pour la semaine (sans les ajouter au menu, c'est l'utilisateur qui choisit)
  const suggestedIds = useMemo(() => {
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

    // Aliments du frigo marqués ★ : tant qu'il en reste, les recettes qui les utilisent passent devant
    const priorityLeft = {};
    Object.entries(fridge).forEach(([k, item]) => {
      if (item.priority) priorityLeft[k] = item.qty;
    });
    const usesPriority = (r) => r.scaledIngredients.filter((ing) => priorityLeft[ing.key] > 0).length;

    // Variété : pas plus de ~1 repas sur 4 avec la même base (pâtes, riz, pommes de terre…),
    // sauf pour une recette qui écoule un aliment prioritaire. La limite est levée seulement
    // s'il est impossible de compléter le menu autrement.
    const baseCount = {};
    let baseLimit = Math.max(1, Math.ceil(mealsWanted / 4));
    const fitsVariety = (r) => !r.base || (baseCount[r.base] || 0) < baseLimit || usesPriority(r) > 0;
    const canPick = (r) => fitsQuota(r) && fitsVariety(r);
    const markPicked = (r) => {
      consumeQuota(r);
      if (r.base) baseCount[r.base] = (baseCount[r.base] || 0) + 1;
      r.scaledIngredients.forEach((ing) => {
        if (priorityLeft[ing.key] !== undefined) priorityLeft[ing.key] -= ing.required;
      });
      picked.push(r.id);
    };

    // Score de chaque recette = ce qu'elle ajoute au ticket de caisse,
    // avec une forte priorité aux aliments ★ et une légère préférence pour les plats avec légumes.
    const PRIORITY_BONUS = 10;
    const NO_VEG_PENALTY = 1.5;

    let remaining = [...pool];

    // Complète toujours jusqu'au nombre voulu (ex. 7) en prenant à chaque étape la meilleure recette
    while (picked.length < mealsWanted && remaining.length > 0) {
      let best = null;
      let lowestAddedCost = Infinity;

      for (const r of remaining) {
        if (!canPick(r)) continue;
        let addedForThis = (r.hasVeg ? 0 : NO_VEG_PENALTY) - PRIORITY_BONUS * usesPriority(r);
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

      if (!best) {
        if (baseLimit === Infinity) break;
        baseLimit = Infinity;
        continue;
      }

      markPicked(best);
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

    return picked;
  }, [recipesWithStatus, fridge, mealsWanted, meatTarget, fishTarget, store.multiplier]);

  const statusById = useMemo(() => new Map(recipesWithStatus.map((r) => [r.id, r])), [recipesWithStatus]);
  const recipeName = (id) => statusById.get(id)?.name ||
    customRecipes.find((r) => r.id === id)?.name ||
    ALL_RECIPES_BY_ID.get(id)?.name ||
    id;
  const suggestedRecipes = suggestedIds.map((id) => statusById.get(id));

  // ---------- Favoris et historique des semaines ----------
  const toggleFavorite = (id) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const archiveWeek = () => {
    if (selected.size === 0) return;
    setHistory((prev) => [{ date: new Date().toISOString(), ids: [...selected] }, ...prev].slice(0, 30));
    setSelected(new Set());
  };

  const addToMenu = (ids) => {
    setSelected((prev) => new Set([...prev, ...ids]));
  };

  // ---------- Recettes personnelles ----------
  const saveCustomRecipe = (recipe) => {
    setCustomRecipes((prev) =>
      prev.some((r) => r.id === recipe.id) ? prev.map((r) => (r.id === recipe.id ? recipe : r)) : [recipe, ...prev]
    );
    setEditingRecipe(null);
  };

  const deleteCustomRecipe = (id) => {
    if (!window.confirm("Supprimer définitivement cette recette ?")) return;
    setCustomRecipes((prev) => prev.filter((r) => r.id !== id));
    setSelected((prev) => new Set([...prev].filter((x) => x !== id)));
    setFavorites((prev) => new Set([...prev].filter((x) => x !== id)));
  };

  const removeWeek = (index) => {
    setHistory((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Carte de recette (onglet des plats et favoris). `section` distingue les cartes ouvertes
  // quand une même recette apparaît dans plusieurs listes.
  const renderRecipeCard = (r, section, number) => {
    const cardKey = `${section}:${r.id}`;
    const isExpanded = expandedId === cardKey;
    const isSelected = selected.has(r.id);
    const isFavorite = favorites.has(r.id);

    return (
      <div className={`fm-recipe-box ${isSelected ? "selected" : ""}`} key={cardKey}>
        <div className="fm-box-header" onClick={() => toggleAccordion(cardKey)}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <div className="fm-box-title">
              {number ? `${number}. ` : ""}
              {r.name}
            </div>
            <button
              type="button"
              className={`fm-fav-btn ${isFavorite ? "active" : ""}`}
              title={isFavorite ? "Retirer de mes recettes gardées" : "Garder cette recette"}
              aria-pressed={isFavorite}
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(r.id);
              }}
            >
              {isFavorite ? "♥" : "♡"}
            </button>
          </div>
          <div className="fm-box-meta">
            {r.custom && <span className="fm-custom-tag">✍️ Ma recette</span>}
            <span>⏱ {r.time}</span>
            <span>{DIET_LABELS[r.diet]}</span>
            {r.priorityKeys.length > 0 && (
              <span className="fm-priority-tag">★ {r.priorityKeys.map((k) => fridge[k]?.name || k).join(", ")}</span>
            )}
            {r.equipments.map((eq) => (
              <span key={eq} className="fm-pill-device">
                {AVAILABLE_EQUIPMENTS.find((e) => e.id === eq)?.icon} {eq}
              </span>
            ))}
            <span>• {r.completedCount}/{r.totalCount} en stock</span>
          </div>

          <div className="fm-card-foot">
            <span
              className="fm-card-price"
              style={{ color: r.standAloneCost === 0 ? "var(--fresh-green)" : "var(--citrus-orange)" }}
            >
              {r.standAloneCost === 0 ? "0 € à acheter" : `+${fmtPrice(r.standAloneCost)}`}
            </span>
            <button
              type="button"
              className={`fm-submit-btn small ${isSelected ? "outline" : "green"}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleSelect(r.id);
              }}
            >
              {isSelected ? "Retirer" : "+ Ajouter"}
            </button>
          </div>
          <span className="fm-card-toggle">{isExpanded ? "▲ Masquer la recette" : "▼ Voir la recette"}</span>
        </div>

        {isExpanded && (
          <div className="fm-box-drawer">
            <div className="fm-label-sub">Ingrédients requis ({servings} pers.) :</div>
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
          </div>
        )}
      </div>
    );
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

        html, body {
          margin: 0;
          padding: 0;
          background: #f7f5f1;
        }

        .fm-app-root {
          --cream-bg: #f7f5f1;
          --pure-white: #ffffff;
          --ink-dark: #1c2520;
          --ink-soft: #5b6860;
          --ink-faint: #8a958e;

          --citrus-orange: #f26430;
          --citrus-orange-hover: #e0541f;
          --citrus-orange-light: #fff0e9;
          --warm-yellow: #ffb703;
          --sunny-yellow: #fff6dc;

          --fresh-green: #2a7a44;
          --fresh-green-light: #e8f5ec;

          --fridge-mint: #eaf5f7;
          --fridge-border: #c7e2e7;
          --fridge-accent: #007791;

          --coral-red: #d9363e;
          --line-color: #e7e3dc;
          --radius: 12px;
          --shadow: 0 1px 2px rgba(28, 37, 32, 0.05);

          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 15px;
          line-height: 1.45;
          background: var(--cream-bg);
          color: var(--ink-dark);
          min-height: 100vh;
          width: 100%;
          overflow-x: hidden;
        }

        .fm-app-root * { box-sizing: border-box; }

        /* ---------- BARRE DE NAVIGATION ---------- */
        .fm-topbar {
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(8px);
          border-bottom: 1px solid var(--line-color);
        }

        .fm-topbar-inner {
          max-width: 1240px;
          margin: 0 auto;
          padding: 0 1.5rem;
          height: 60px;
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }

        .fm-logo {
          font-family: 'Syne', sans-serif;
          font-size: 1.3rem;
          font-weight: 800;
          color: var(--citrus-orange);
          letter-spacing: -0.02em;
          white-space: nowrap;
          margin: 0;
        }

        .fm-nav {
          display: flex;
          gap: 0.25rem;
          flex: 1;
          height: 100%;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .fm-nav::-webkit-scrollbar { display: none; }

        .fm-nav-link {
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          font: inherit;
          font-weight: 700;
          font-size: 0.92rem;
          color: var(--ink-soft);
          padding: 0 0.85rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          white-space: nowrap;
          transition: color 0.15s ease, border-color 0.15s ease;
        }
        .fm-nav-link:hover { color: var(--ink-dark); }
        .fm-nav-link.active { color: var(--citrus-orange); border-bottom-color: var(--citrus-orange); }

        .fm-badge-counter {
          background: var(--citrus-orange-light);
          color: var(--citrus-orange);
          font-size: 0.72rem;
          font-weight: 800;
          min-width: 1.3rem;
          padding: 0.05rem 0.4rem;
          border-radius: 999px;
          text-align: center;
        }

        /* ---------- COMPTE ---------- */
        .fm-topbar-account { position: relative; min-height: 34px; display: flex; align-items: center; }

        .fm-account-bar {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-size: 0.85rem;
          color: var(--ink-soft);
          white-space: nowrap;
        }

        .fm-account-avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: var(--citrus-orange-light);
          color: var(--citrus-orange);
          font-weight: 800;
          font-size: 0.85rem;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: default;
          flex-shrink: 0;
        }
        .fm-account-status { font-weight: 700; font-size: 0.8rem; }
        .fm-account-status.saved { color: var(--fresh-green); }
        .fm-account-status.error { color: var(--coral-red); }
        .fm-account-hint {
          font-size: 0.78rem;
          font-weight: 700;
          background: #f1efea;
          padding: 0.2rem 0.55rem;
          border-radius: 999px;
          cursor: help;
        }

        .fm-account-form {
          position: absolute;
          right: 0;
          top: calc(100% + 16px);
          width: 300px;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          background: var(--pure-white);
          border: 1px solid var(--line-color);
          border-radius: var(--radius);
          padding: 1.1rem;
          box-shadow: 0 12px 32px rgba(28, 37, 32, 0.12);
          white-space: normal;
        }
        .fm-account-form strong { font-size: 1rem; color: var(--ink-dark); }

        .fm-account-form input {
          font: inherit;
          padding: 0.55rem 0.75rem;
          border: 1px solid var(--line-color);
          border-radius: 8px;
          width: 100%;
        }
        .fm-account-form input:focus { outline: none; border-color: var(--citrus-orange); }

        .fm-account-btn {
          font: inherit;
          font-weight: 700;
          font-size: 0.85rem;
          background: var(--citrus-orange);
          color: var(--pure-white);
          border: none;
          border-radius: 8px;
          padding: 0.45rem 0.9rem;
          cursor: pointer;
        }
        .fm-account-btn:hover { background: var(--citrus-orange-hover); }
        .fm-account-btn:disabled { opacity: 0.6; cursor: wait; }

        .fm-account-link {
          font: inherit;
          font-weight: 700;
          font-size: 0.85rem;
          background: none;
          border: none;
          color: var(--fridge-accent);
          cursor: pointer;
          padding: 0.25rem;
        }
        .fm-account-link:hover { text-decoration: underline; }

        .fm-account-message { margin: 0; font-weight: 700; font-size: 0.82rem; white-space: normal; }
        .fm-account-bar > .fm-account-message {
          position: absolute;
          right: 0;
          top: calc(100% + 16px);
          width: 300px;
          background: var(--pure-white);
          border: 1px solid var(--line-color);
          border-radius: var(--radius);
          padding: 0.8rem 1rem;
          box-shadow: 0 12px 32px rgba(28, 37, 32, 0.12);
        }
        .fm-account-form ~ .fm-account-message { top: auto; }
        .fm-account-message.error { color: var(--coral-red); }
        .fm-account-message.info { color: var(--fresh-green); }

        /* ---------- CONTENU ---------- */
        .fm-container {
          max-width: 1240px;
          margin: 0 auto;
          padding: 1.5rem 1.5rem 4rem;
        }

        .fm-page-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 1.2rem;
        }
        .fm-page-head h1 { font-size: 1.45rem; font-weight: 800; margin: 0; letter-spacing: -0.01em; }
        .fm-page-head p { margin: 0.2rem 0 0; color: var(--ink-soft); font-size: 0.9rem; }

        .fm-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .fm-stat {
          background: var(--pure-white);
          border: 1px solid var(--line-color);
          border-radius: var(--radius);
          padding: 0.7rem 1rem;
          box-shadow: var(--shadow);
        }
        .fm-stat-label { font-size: 0.75rem; font-weight: 700; color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.04em; }
        .fm-stat-value { font-size: 1.15rem; font-weight: 800; margin-top: 0.1rem; }
        .fm-stat-value.ok { color: var(--fresh-green); }
        .fm-stat-value.over { color: var(--coral-red); }

        .fm-card-panel {
          background: var(--pure-white);
          border: 1px solid var(--line-color);
          border-radius: var(--radius);
          padding: 1.25rem 1.4rem;
          margin-bottom: 1.25rem;
          box-shadow: var(--shadow);
          min-width: 0;
        }

        .fm-card-panel h2 {
          font-size: 1.08rem;
          font-weight: 800;
          color: var(--ink-dark);
          margin: 0 0 0.3rem;
        }

        .fm-subhint {
          font-size: 0.86rem;
          color: var(--ink-soft);
          margin: 0 0 1rem;
        }

        .fm-panel-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.8rem;
          margin-bottom: 0.4rem;
        }
        .fm-panel-head h2 { margin: 0; }

        .fm-empty {
          padding: 2rem 1rem;
          text-align: center;
          color: var(--ink-soft);
          font-size: 0.9rem;
        }

        /* ---------- MISES EN PAGE ---------- */
        .fm-layout-sidebar {
          display: grid;
          grid-template-columns: 280px minmax(0, 1fr);
          gap: 1.25rem;
          align-items: start;
        }

        .fm-sidebar { position: sticky; top: 76px; }

        .fm-layout-split {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 380px;
          gap: 1.25rem;
          align-items: start;
        }
        .fm-layout-split > .fm-card-panel:last-child { position: sticky; top: 76px; }

        .fm-layout-fridge {
          display: grid;
          grid-template-columns: 300px minmax(0, 1fr);
          gap: 1.25rem;
          align-items: start;
        }

        /* ---------- PRÉFÉRENCES ---------- */
        .fm-field { margin-bottom: 1rem; }
        .fm-field:last-child { margin-bottom: 0; }
        .fm-field-label {
          display: block;
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--ink-soft);
          margin-bottom: 0.35rem;
        }

        .fm-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem; }
        .fm-field-row .fm-field { margin-bottom: 0; }

        .fm-stepper {
          display: flex;
          align-items: center;
          border: 1px solid var(--line-color);
          border-radius: 8px;
          overflow: hidden;
          background: var(--pure-white);
        }
        .fm-stepper button {
          background: #f6f4f0;
          border: none;
          width: 30px;
          height: 32px;
          font: inherit;
          font-weight: 800;
          color: var(--ink-dark);
          cursor: pointer;
        }
        .fm-stepper button:hover { background: var(--citrus-orange-light); color: var(--citrus-orange); }
        .fm-stepper-value { flex: 1; text-align: center; font-weight: 800; font-size: 0.9rem; }

        .fm-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
        .fm-chip {
          font: inherit;
          font-size: 0.8rem;
          font-weight: 700;
          padding: 0.3rem 0.65rem;
          border-radius: 999px;
          border: 1px solid var(--line-color);
          background: var(--pure-white);
          color: var(--ink-soft);
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .fm-chip:hover { border-color: var(--fresh-green); }
        .fm-chip.active { background: var(--fresh-green-light); border-color: var(--fresh-green); color: var(--fresh-green); }

        .fm-divider { border: none; border-top: 1px solid var(--line-color); margin: 1rem 0; }

        /* ---------- FORMULAIRES ET BOUTONS ---------- */
        .fm-bright-form { display: flex; flex-direction: column; gap: 0.6rem; }
        .fm-form-row { display: flex; gap: 0.5rem; }

        .fm-form-input {
          background: var(--pure-white);
          color: var(--ink-dark);
          border: 1px solid var(--line-color);
          border-radius: 8px;
          padding: 0.5rem 0.7rem;
          font-family: inherit;
          font-size: 0.88rem;
          font-weight: 600;
          width: 100%;
          min-width: 0;
        }
        .fm-form-input:focus { outline: none; border-color: var(--citrus-orange); box-shadow: 0 0 0 3px var(--citrus-orange-light); }

        .fm-submit-btn {
          background: var(--citrus-orange);
          color: var(--pure-white);
          border: none;
          border-radius: 8px;
          padding: 0.55rem 1rem;
          font-family: inherit;
          font-weight: 700;
          font-size: 0.88rem;
          cursor: pointer;
          transition: background 0.15s ease;
          white-space: nowrap;
        }
        .fm-submit-btn:hover { background: var(--citrus-orange-hover); }
        .fm-submit-btn.small { padding: 0.35rem 0.7rem; font-size: 0.8rem; }
        .fm-submit-btn.green { background: var(--fresh-green); }
        .fm-submit-btn.green:hover { background: #22653a; }
        .fm-submit-btn.outline { background: var(--pure-white); color: var(--coral-red); border: 1px solid #f1c9cb; }
        .fm-submit-btn.outline:hover { background: #fdf0f0; }

        .fm-search { max-width: 280px; }

        /* ---------- FRIGO ---------- */
        .fm-fridge-container {
          background: var(--fridge-mint);
          border: 3px solid var(--fridge-border);
          border-radius: 22px 22px 14px 14px;
          padding: 1rem;
          position: relative;
        }

        .fm-fridge-tophead {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.8rem;
        }

        .fm-fridge-logo {
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: var(--fridge-accent);
          text-transform: uppercase;
        }

        .fm-fridge-led-panel {
          background: var(--pure-white);
          border: 1px solid var(--fridge-border);
          border-radius: 6px;
          padding: 0.2rem 0.6rem;
          display: flex;
          align-items: center;
          gap: 0.45rem;
        }
        .fm-led-status { font-family: 'Space Mono', monospace; color: var(--fresh-green); font-weight: 700; font-size: 0.75rem; }
        .fm-led-light { width: 7px; height: 7px; background: #38b000; border-radius: 50%; box-shadow: 0 0 6px #38b000; }

        .fm-fridge-shelves-zone {
          background: var(--pure-white);
          border-radius: 12px;
          padding: 1rem;
          border: 1px solid rgba(0, 119, 145, 0.12);
          min-height: 200px;
        }

        .fm-vintage-handle {
          position: absolute;
          right: -10px;
          top: 80px;
          width: 8px;
          height: 90px;
          background: linear-gradient(90deg, #d3d9d5, #ffffff 45%, #adb5b0);
          border-radius: 6px;
        }

        .fm-shelf-block { margin-bottom: 1rem; }
        .fm-shelf-block:last-child { margin-bottom: 0; }

        .fm-shelf-items-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          min-height: 40px;
          padding-bottom: 0.5rem;
          align-items: flex-end;
        }

        .fm-glass-rack {
          height: 5px;
          background: linear-gradient(180deg, #e3f2fd, #bbdefb);
          border-radius: 3px;
          border: 1px solid #b3d7f5;
        }

        .fm-item-pill {
          background: var(--sunny-yellow);
          border: 1px solid #f5dc9a;
          color: var(--ink-dark);
          border-radius: 8px;
          padding: 0.3rem 0.5rem;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.85rem;
        }

        .fm-item-name { font-weight: 700; text-transform: capitalize; }

        .fm-item-qty {
          font-family: 'Space Mono', monospace;
          font-size: 0.72rem;
          background: var(--pure-white);
          color: #7a5000;
          padding: 0.1rem 0.35rem;
          border-radius: 4px;
          font-weight: 700;
        }

        .fm-item-pill.priority { background: var(--citrus-orange); border-color: var(--citrus-orange); color: var(--pure-white); }

        .fm-priority-btn {
          background: none;
          border: none;
          padding: 0;
          font-size: 1rem;
          line-height: 1;
          cursor: pointer;
          color: inherit;
        }

        .fm-priority-tag { color: var(--citrus-orange); font-weight: 800; }

        .fm-custom-tag {
          background: #eef0fb;
          color: #4a53b5;
          font-weight: 700;
          padding: 0.05rem 0.4rem;
          border-radius: 4px;
          font-size: 0.72rem;
        }

        /* ÉDITEUR DE RECETTE */
        .fm-editor {
          border: 1px solid var(--line-color);
          border-radius: 10px;
          padding: 1rem;
          background: #fbfaf8;
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }
        .fm-editor .fm-field { display: block; margin: 0; }
        .fm-editor-grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 0.75rem; }
        .fm-editor-ings { display: flex; flex-direction: column; gap: 0.4rem; }
        .fm-editor-ings .fm-form-row { align-items: center; }
        .fm-editor-unit { font-size: 0.8rem; color: var(--ink-soft); width: 3.5rem; flex-shrink: 0; }
        .fm-editor textarea { resize: vertical; font-family: inherit; }
        @media (max-width: 640px) { .fm-editor-grid { grid-template-columns: 1fr; } }

        .fm-qty-btn {
          background: var(--pure-white);
          border: 1px solid rgba(0,0,0,0.1);
          color: var(--ink-dark);
          width: 20px;
          height: 20px;
          border-radius: 4px;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
          padding: 0;
        }
        .fm-qty-btn:hover { background: var(--citrus-orange); color: var(--pure-white); border-color: var(--citrus-orange); }

        .fm-item-delete {
          background: transparent;
          border: none;
          color: var(--coral-red);
          font-size: 1rem;
          font-weight: 800;
          cursor: pointer;
          line-height: 1;
          padding: 0 0.1rem;
        }
        .fm-item-pill.priority .fm-item-delete { color: var(--pure-white); }

        /* ---------- SUGGESTIONS, FAVORIS, HISTORIQUE ---------- */
        .fm-suggestions-panel { border-color: #f6d88a; background: #fffcf3; }

        .fm-fav-btn {
          background: none;
          border: none;
          padding: 0;
          font-size: 1.1rem;
          line-height: 1;
          cursor: pointer;
          color: var(--ink-faint);
          flex-shrink: 0;
        }
        .fm-fav-btn:hover { color: var(--coral-red); }
        .fm-fav-btn.active { color: var(--coral-red); }

        .fm-history-list { display: flex; flex-direction: column; gap: 0.75rem; }

        .fm-history-week { border: 1px solid var(--line-color); border-radius: 10px; padding: 0.8rem 1rem; }

        .fm-history-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.6rem;
          margin-bottom: 0.4rem;
          font-size: 0.92rem;
        }

        .fm-history-recipes { list-style: none; margin: 0; padding: 0; }
        .fm-history-recipes li {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.4rem 0;
          border-top: 1px solid #f1eee9;
          font-weight: 600;
          font-size: 0.88rem;
        }

        /* ---------- CARTES RECETTES ---------- */
        .fm-recipes-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 0.75rem;
          width: 100%;
        }

        .fm-recipe-box {
          background: var(--pure-white);
          border: 1px solid var(--line-color);
          border-radius: 10px;
          overflow: hidden;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .fm-recipe-box:hover { border-color: #f3b79d; box-shadow: 0 4px 14px rgba(28, 37, 32, 0.06); }
        .fm-recipe-box.selected { border-color: var(--fresh-green); box-shadow: 0 0 0 1px var(--fresh-green); }

        .fm-box-header { padding: 0.85rem 0.95rem; cursor: pointer; }

        .fm-box-title { font-size: 0.95rem; font-weight: 800; color: var(--ink-dark); margin-bottom: 0.35rem; line-height: 1.3; }

        .fm-box-meta {
          font-size: 0.76rem;
          color: var(--ink-soft);
          display: flex;
          align-items: center;
          gap: 0.3rem 0.5rem;
          flex-wrap: wrap;
        }

        .fm-pill-device {
          background: #eef3ef;
          color: var(--fresh-green);
          font-weight: 700;
          padding: 0.05rem 0.4rem;
          border-radius: 4px;
          font-size: 0.72rem;
        }

        .fm-card-foot {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.7rem;
        }

        .fm-card-price { font-weight: 800; font-size: 0.95rem; }
        .fm-card-toggle { display: block; margin-top: 0.45rem; font-size: 0.75rem; color: var(--ink-faint); font-weight: 700; }

        .fm-box-drawer { background: #fbfaf8; border-top: 1px solid var(--line-color); padding: 0.9rem 0.95rem; }

        .fm-label-sub { font-size: 0.8rem; font-weight: 800; color: var(--citrus-orange); margin: 0.9rem 0 0.4rem; text-transform: uppercase; letter-spacing: 0.03em; }
        .fm-label-sub:first-child { margin-top: 0; }

        .fm-ings-container { display: flex; flex-direction: column; gap: 0.25rem; }

        .fm-ing-line {
          display: flex;
          justify-content: space-between;
          gap: 0.5rem;
          padding: 0.3rem 0.5rem;
          border-radius: 6px;
          background: var(--pure-white);
          font-size: 0.8rem;
          border: 1px solid #f1eee9;
        }

        .fm-recipe-ol { margin: 0; padding-left: 1.1rem; line-height: 1.5; font-size: 0.84rem; }
        .fm-recipe-ol li { margin-bottom: 0.3rem; }

        /* ---------- TICKET DE CAISSE ---------- */
        .fm-grocery-ticket {
          background: var(--pure-white);
          border: 1px dashed #b9d6c2;
          border-radius: 10px;
          padding: 1rem 1.1rem;
          font-size: 0.86rem;
        }

        .fm-ticket-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 0.8rem;
          padding: 0.5rem 0;
          border-bottom: 1px dashed #ebe7e0;
        }

        .fm-ticket-total {
          display: flex;
          justify-content: space-between;
          font-size: 1.1rem;
          font-weight: 800;
          margin-top: 0.8rem;
          padding-top: 0.7rem;
          border-top: 2px solid var(--ink-dark);
        }

        /* ---------- RESPONSIVE ---------- */
        @media (max-width: 980px) {
          .fm-layout-sidebar, .fm-layout-split, .fm-layout-fridge { grid-template-columns: minmax(0, 1fr); }
          .fm-sidebar, .fm-layout-split > .fm-card-panel:last-child { position: static; }
          .fm-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }

        @media (max-width: 640px) {
          .fm-topbar { position: static; }
          .fm-account-hint { display: none; }
          .fm-logo { font-size: 1.1rem; }
          .fm-topbar-inner { height: auto; flex-wrap: wrap; padding: 0.6rem 1rem 0; gap: 0.5rem 1rem; }
          .fm-topbar-account { margin-left: auto; }
          .fm-nav { order: 3; flex-basis: 100%; height: 44px; }
          .fm-account-user { max-width: 140px; }
          .fm-container { padding: 1rem 1rem 3rem; }
          .fm-card-panel { padding: 1rem; }
          .fm-search { max-width: none; }
          .fm-account-form, .fm-account-bar > .fm-account-message { width: min(300px, calc(100vw - 2rem)); }
        }
`}</style>

      {/* BARRE DE NAVIGATION */}
      <header className="fm-topbar">
        <div className="fm-topbar-inner">
          <p className="fm-logo">🥕 Frigo malin</p>
          <nav className="fm-nav">
            {[
              { id: "frigo", label: "Mon frigo", count: fridgeList.length },
              { id: "recettes", label: "Recettes", count: recipesWithStatus.length },
              { id: "planning", label: "Planning & courses", count: selected.size },
              { id: "bibliotheque", label: "Mes recettes", count: favorites.size },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`fm-nav-link ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
                {tab.count > 0 && <span className="fm-badge-counter">{tab.count}</span>}
              </button>
            ))}
          </nav>
          <div className="fm-topbar-account">
            <AccountBar session={session} syncStatus={syncStatus} />
          </div>
        </div>
      </header>

      <main className="fm-container">
        {/* CHIFFRES CLÉS DE LA SEMAINE */}
        <div className="fm-stats">
          <div className="fm-stat">
            <div className="fm-stat-label">Plats choisis</div>
            <div className="fm-stat-value">
              {selected.size} / {mealsWanted}
            </div>
          </div>
          <div className="fm-stat">
            <div className="fm-stat-label">Courses estimées</div>
            <div className={`fm-stat-value ${totalStoreBill <= weeklyBudget ? "ok" : "over"}`}>
              {fmtPrice(totalStoreBill)}
            </div>
          </div>
          <div className="fm-stat">
            <div className="fm-stat-label">Budget max</div>
            <div className="fm-stat-value">{fmtPrice(weeklyBudget)}</div>
          </div>
          <div className="fm-stat">
            <div className="fm-stat-label">Convives</div>
            <div className="fm-stat-value">
              {servings} pers. · {store.name.split(" ")[0]}
            </div>
          </div>
        </div>

        {/* ================= ONGLET 1 : MON RÉFRIGÉRATEUR ================= */}
        {activeTab === "frigo" && (
          <div className="fm-layout-fridge">
          <aside className="fm-card-panel">
            <h2>Ajouter un aliment</h2>
            <p className="fm-subhint">
              Il est rangé sur les étagères et enregistré automatiquement. L'étoile ☆ d'un aliment le rend
              prioritaire : les recettes qui l'utilisent passent devant.
            </p>

            <form className="fm-bright-form" onSubmit={handleAddCustom}>
              <input
                type="text"
                className="fm-form-input"
                placeholder="Ex : poulet, patates, courgettes…"
                aria-label="Nom de l'aliment"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
              <div className="fm-form-row">
                <input
                  type="number"
                  className="fm-form-input"
                  style={{ width: "90px", flexShrink: 0 }}
                  min="1"
                  aria-label="Quantité"
                  value={customQty}
                  onChange={(e) => setCustomQty(Math.max(1, Number(e.target.value)))}
                />
                <select
                  className="fm-form-input"
                  aria-label="Unité"
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                >
                  <option value="g">grammes (g)</option>
                  <option value="pce">pièces (pce)</option>
                  <option value="ml">millilitres (ml)</option>
                  <option value="tranche">tranches</option>
                  <option value="boite">boîtes</option>
                </select>
              </div>
              <button type="submit" className="fm-submit-btn">
                + Ranger au frigo
              </button>
            </form>
          </aside>

          <section className="fm-card-panel">
            <h2>Mon réfrigérateur</h2>
            <p className="fm-subhint">Ajuste les quantités avec − et +, ou retire un aliment avec ×.</p>
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
                  <div className="fm-empty">
                    <div style={{ fontSize: "2rem", marginBottom: "0.3rem" }}>🥬</div>
                    <strong style={{ color: "var(--ink-dark)" }}>Ton réfrigérateur est vide.</strong>
                    <div style={{ marginTop: "0.2rem" }}>Ajoute tes aliments avec le formulaire pour composer tes menus.</div>
                  </div>
                ) : (
                  shelves.map((shelfItems, sIdx) => (
                    <div className="fm-shelf-block" key={sIdx}>
                      <div className="fm-shelf-items-row">
                        {shelfItems.map(([key, item]) => (
                          <div className={`fm-item-pill ${item.priority ? "priority" : ""}`} key={key}>
                            <button
                              type="button"
                              className="fm-priority-btn"
                              onClick={() => togglePriority(key)}
                              title={item.priority ? "Ne plus utiliser en priorité" : "À utiliser en priorité dans les recettes"}
                              aria-pressed={!!item.priority}
                            >
                              {item.priority ? "★" : "☆"}
                            </button>
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
          </div>
        )}

        {/* ================= ONGLET 2 : LES RECETTES ================= */}
        {activeTab === "recettes" && (
          <div className="fm-layout-sidebar">
            <aside className="fm-card-panel fm-sidebar">
              <h2>Ma semaine</h2>
              <p className="fm-subhint">Les suggestions s'adaptent tout de suite.</p>

              <div className="fm-field-row">
                <div className="fm-field">
                  <span className="fm-field-label">Repas voulus</span>
                  <div className="fm-stepper">
                    <button type="button" aria-label="Moins de repas" onClick={() => setMealsWanted((m) => Math.max(1, m - 1))}>−</button>
                    <span className="fm-stepper-value">{mealsWanted}</span>
                    <button type="button" aria-label="Plus de repas" onClick={() => setMealsWanted((m) => Math.min(14, m + 1))}>+</button>
                  </div>
                </div>
                <div className="fm-field">
                  <span className="fm-field-label">Convives</span>
                  <div className="fm-stepper">
                    <button type="button" aria-label="Moins de convives" onClick={() => setServings((s) => Math.max(1, s - 1))}>−</button>
                    <span className="fm-stepper-value">{servings}</span>
                    <button type="button" aria-label="Plus de convives" onClick={() => setServings((s) => Math.min(10, s + 1))}>+</button>
                  </div>
                </div>
              </div>

              <div className="fm-field-row">
                <div className="fm-field">
                  <span className="fm-field-label">Dont viande 🥩</span>
                  <select
                    className="fm-form-input"
                    value={meatTarget === null ? "" : meatTarget}
                    onChange={(e) => setMeatMeals(e.target.value === "" ? null : Number(e.target.value))}
                  >
                    <option value="">Peu importe</option>
                    {Array.from({ length: mealsWanted + 1 }, (_, n) => (
                      <option key={n} value={n}>
                        {n === 0 ? "Aucun" : `${n} repas`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="fm-field">
                  <span className="fm-field-label">Dont poisson 🐟</span>
                  <select
                    className="fm-form-input"
                    value={fishTarget === null ? "" : fishTarget}
                    onChange={(e) => setFishMeals(e.target.value === "" ? null : Number(e.target.value))}
                  >
                    <option value="">Peu importe</option>
                    {Array.from({ length: mealsWanted - (meatTarget ?? 0) + 1 }, (_, n) => (
                      <option key={n} value={n}>
                        {n === 0 ? "Aucun" : `${n} repas`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <hr className="fm-divider" />

              <div className="fm-field-row">
                <div className="fm-field">
                  <span className="fm-field-label">Budget max</span>
                  <div className="fm-stepper">
                    <button type="button" aria-label="Baisser le budget" onClick={() => setWeeklyBudget((b) => Math.max(10, b - 5))}>−</button>
                    <span className="fm-stepper-value">{weeklyBudget} €</span>
                    <button type="button" aria-label="Augmenter le budget" onClick={() => setWeeklyBudget((b) => b + 5)}>+</button>
                  </div>
                </div>
                <div className="fm-field">
                  <span className="fm-field-label">Magasin</span>
                  <select className="fm-form-input" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                    {STORES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="fm-field">
                <span className="fm-field-label">Mes appareils</span>
                <div className="fm-chips">
                  {AVAILABLE_EQUIPMENTS.map((eq) => (
                    <button
                      key={eq.id}
                      type="button"
                      className={`fm-chip ${equipments[eq.id] ? "active" : ""}`}
                      aria-pressed={!!equipments[eq.id]}
                      onClick={() => setEquipments((prev) => ({ ...prev, [eq.id]: !prev[eq.id] }))}
                    >
                      {eq.icon} {eq.label}
                    </button>
                  ))}
                </div>
              </div>

              <hr className="fm-divider" />

              <p className="fm-subhint" style={{ margin: 0 }}>
                <strong>{selected.size}</strong> plat{selected.size > 1 ? "s" : ""} choisi{selected.size > 1 ? "s" : ""} sur {mealsWanted} · 🥩 {selectedMeatCount}
                {meatTarget !== null && `/${meatTarget}`} · 🐟 {selectedFishCount}
                {fishTarget !== null && `/${fishTarget}`}
              </p>
            </aside>

            <div style={{ minWidth: 0 }}>
            {suggestedRecipes.length > 0 && (
              <section className="fm-card-panel fm-suggestions-panel">
                <h2>✨ Suggestions pour ta semaine</h2>
                <p className="fm-subhint">
                  Les plats les plus adaptés à ton frigo (aliments ★ d'abord), à tes choix et à ton budget. Ajoute ceux qui te plaisent.
                </p>
                <div className="fm-recipes-grid">
                  {suggestedRecipes.map((r) => renderRecipeCard(r, "suggestion"))}
                </div>
              </section>
            )}

            <section className="fm-card-panel">
              <div className="fm-panel-head" style={{ marginBottom: "1rem" }}>
                <h2>Tous les plats ({filteredRecipes.length})</h2>
                <input
                  type="search"
                  placeholder="🔍 Rechercher un plat ou un ingrédient"
                  aria-label="Rechercher"
                  className="fm-form-input fm-search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="fm-recipes-grid">
                {filteredRecipes.map((r, idx) => renderRecipeCard(r, "all", idx + 1))}
              </div>
            </section>
            </div>
          </div>
        )}

        {/* ================= ONGLET 4 : MES RECETTES (FAVORIS + HISTORIQUE) ================= */}
        {activeTab === "bibliotheque" && (
          <>
            <section className="fm-card-panel">
              <div className="fm-panel-head">
                <h2>✍️ Mes créations ({customRecipes.length})</h2>
                {!editingRecipe && (
                  <button type="button" className="fm-submit-btn small" onClick={() => setEditingRecipe("new")}>
                    + Nouvelle recette
                  </button>
                )}
              </div>
              <p className="fm-subhint">
                Ajoute tes propres recettes : elles apparaissent dans « Recettes », dans les suggestions et dans ta liste de courses.
              </p>

              {editingRecipe && (
                <RecipeEditor
                  key={editingRecipe === "new" ? "new" : editingRecipe.id}
                  catalog={GROCERY_CATALOG}
                  equipmentsList={AVAILABLE_EQUIPMENTS}
                  initial={editingRecipe === "new" ? null : editingRecipe}
                  onSave={saveCustomRecipe}
                  onCancel={() => setEditingRecipe(null)}
                />
              )}

              {customRecipes.length === 0 && !editingRecipe ? (
                <div className="fm-empty">Tu n'as pas encore créé de recette.</div>
              ) : (
                <ul className="fm-history-recipes" style={{ marginTop: editingRecipe ? "1rem" : 0 }}>
                  {customRecipes.map((r) => {
                    const available = statusById.has(r.id);
                    const inMenu = selected.has(r.id);
                    return (
                      <li key={r.id}>
                        <span style={{ flex: 1 }}>
                          {r.name} <span className="fm-subhint" style={{ margin: 0 }}>· {r.time}</span>
                        </span>
                        {!available ? (
                          <span className="fm-subhint" style={{ margin: 0 }}>indisponible avec tes appareils</span>
                        ) : inMenu ? (
                          <span style={{ color: "var(--fresh-green)", fontWeight: 800 }}>✓ Dans le menu</span>
                        ) : (
                          <button type="button" className="fm-account-link" onClick={() => addToMenu([r.id])}>
                            + Ajouter au menu
                          </button>
                        )}
                        <button type="button" className="fm-account-link" onClick={() => setEditingRecipe(r)}>
                          Modifier
                        </button>
                        <button
                          type="button"
                          className="fm-account-link"
                          style={{ color: "var(--coral-red)" }}
                          onClick={() => deleteCustomRecipe(r.id)}
                        >
                          Supprimer
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="fm-card-panel">
              <h2>♥ Mes recettes gardées ({favorites.size})</h2>
              <p className="fm-subhint">
                Clique sur le cœur ♡ d'une recette pour la garder ici et la remettre facilement dans ta semaine.
              </p>
              {favorites.size === 0 ? (
                <div className="fm-empty">
                  Aucune recette gardée pour l'instant.
                </div>
              ) : (
                <>
                  <div className="fm-recipes-grid">
                    {[...favorites]
                      .map((id) => statusById.get(id))
                      .filter(Boolean)
                      .map((r) => renderRecipeCard(r, "favori"))}
                  </div>
                  {[...favorites].some((id) => !statusById.has(id)) && (
                    <p className="fm-subhint" style={{ marginTop: "1rem" }}>
                      Pas faisables avec tes appareils actuels :{" "}
                      {[...favorites].filter((id) => !statusById.has(id)).map(recipeName).join(", ")}
                    </p>
                  )}
                </>
              )}
            </section>

            <section className="fm-card-panel">
              <h2>🗓️ Historique de mes semaines ({history.length})</h2>
              <p className="fm-subhint">
                Chaque semaine terminée depuis « Mon planning » est enregistrée ici. Tu peux remettre un plat ou toute la semaine.
              </p>
              {history.length === 0 ? (
                <div className="fm-empty">
                  Pas encore de semaine enregistrée. Dans « Mon planning », clique sur « Terminer la semaine et l'enregistrer ».
                </div>
              ) : (
                <div className="fm-history-list">
                  {history.map((week, wIdx) => (
                    <div className="fm-history-week" key={week.date}>
                      <div className="fm-history-head">
                        <strong>
                          Semaine du{" "}
                          {new Date(week.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                        </strong>
                        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="fm-submit-btn small"
                            onClick={() => addToMenu(week.ids.filter((id) => statusById.has(id)))}
                          >
                            ↺ Remettre toute la semaine
                          </button>
                          <button type="button" className="fm-account-link" onClick={() => removeWeek(wIdx)}>
                            Supprimer
                          </button>
                        </div>
                      </div>
                      <ul className="fm-history-recipes">
                        {week.ids.map((id) => {
                          const available = statusById.has(id);
                          const inMenu = selected.has(id);
                          return (
                            <li key={id}>
                              <button
                                type="button"
                                className={`fm-fav-btn ${favorites.has(id) ? "active" : ""}`}
                                title={favorites.has(id) ? "Retirer de mes recettes gardées" : "Garder cette recette"}
                                onClick={() => toggleFavorite(id)}
                              >
                                {favorites.has(id) ? "♥" : "♡"}
                              </button>
                              <span style={{ flex: 1 }}>{recipeName(id)}</span>
                              {!available ? (
                                <span className="fm-subhint" style={{ margin: 0 }}>indisponible avec tes appareils</span>
                              ) : inMenu ? (
                                <span style={{ color: "var(--fresh-green)", fontWeight: 800 }}>✓ Dans le menu</span>
                              ) : (
                                <button type="button" className="fm-account-link" onClick={() => addToMenu([id])}>
                                  + Remettre
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* ================= ONGLET 3 : PLANNING & TICKET DE CAISSE ================= */}
        {activeTab === "planning" && (
          <div className="fm-layout-split">
            <section className="fm-card-panel">
              <div className="fm-panel-head">
                <h2>
                  Mon menu · {selected.size} repas pour {servings} pers.
                </h2>
                {selected.size > 0 && (
                  <button
                    type="button"
                    className="fm-submit-btn small"
                    onClick={archiveWeek}
                    title="Enregistre ces plats dans « Mes recettes » et vide le menu pour préparer la semaine suivante"
                  >
                    📦 Terminer la semaine
                  </button>
                )}
              </div>
              <p className="fm-subhint">
                Clique sur un plat pour voir la recette. Une fois la semaine finie, enregistre-la pour la retrouver dans « Mes recettes ».
              </p>

              {selectedRecipes.length === 0 ? (
                <div className="fm-empty">
                  Aucun plat choisi. Va dans « Recettes » (les suggestions sont en haut) ou reprends-en depuis « Mes recettes ».
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
                            {r.priorityKeys.length > 0 && (
                              <span className="fm-priority-tag">
                                ★ {r.priorityKeys.map((k) => fridge[k]?.name || k).join(", ")}
                              </span>
                            )}
                            <span>• {r.missingCount === 0 ? "Stock complet" : `${r.missingCount} achat(s)`}</span>
                          </div>

                          <div className="fm-card-foot">
                            <span className="fm-card-toggle" style={{ margin: 0 }}>
                              {isExpandedInPlan ? "▲ Masquer la recette" : "▼ Cuisiner ce plat"}
                            </span>
                            <button
                              type="button"
                              className="fm-submit-btn small outline"
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
                              Pour {servings} personne{servings > 1 ? "s" : ""}
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
                                    <span style={{ color: "var(--coral-red)", fontWeight: 700 }}>À acheter</span>
                                  )}
                                </div>
                              ))}
                            </div>

                            <div className="fm-label-sub">Préparation</div>
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
              <h2>🧾 Liste de courses</h2>
              <p className="fm-subhint">
                {store.name} · formats vendus en magasin, sans ce que tu as déjà au frigo.
              </p>

              <div className="fm-grocery-ticket">
                {shoppingList.length === 0 ? (
                  <div className="fm-empty" style={{ padding: "1rem", color: "var(--fresh-green)", fontWeight: 700 }}>
                    {selectedRecipes.length === 0
                      ? "Choisis des plats pour générer ta liste de courses."
                      : "🎉 Tu as déjà tout ce qu'il faut dans ton frigo !"}
                  </div>
                ) : (
                  <>
                    {shoppingList.map((item) => (
                      <div className="fm-ticket-row" key={item.key}>
                        <div>
                          <strong>
                            {item.packsToBuy > 1 ? `${item.packsToBuy} × ` : ""}
                            {item.name}
                          </strong>
                          <div style={{ fontSize: "0.76rem", color: "var(--ink-soft)", marginTop: "0.1rem" }}>
                            {item.packLabel} · besoin {item.demanded} {item.unit}
                            {item.inStock > 0 && ` (dont ${item.inStock} au frigo)`}
                            {item.leftover > 0 && ` · reste ${item.leftover} ${item.unit}`}
                          </div>
                        </div>
                        <span style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{fmtPrice(item.cost)}</span>
                      </div>
                    ))}
                    <div className="fm-ticket-total">
                      <span>Total</span>
                      <span style={{ color: totalStoreBill <= weeklyBudget ? "var(--fresh-green)" : "var(--coral-red)" }}>
                        {fmtPrice(totalStoreBill)}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--ink-soft)", marginTop: "0.3rem", textAlign: "right" }}>
                      Budget : {fmtPrice(weeklyBudget)}
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
