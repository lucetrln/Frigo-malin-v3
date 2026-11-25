// Unités, conversions et rayons des aliments du frigo.

// Poids moyen (en g) d'une pièce, tranche, gousse… : sert à convertir grammes <-> pièces
const PIECE_WEIGHT = {
  oignon: 125, ail: 5, oeufs: 60, jambon: 45, thon: 140, chou: 1000, poireau: 200, bouillon: 10,
  "pain-de-mie": 25, saucisses: 100, tortillas: 60, poivron: 170, aubergine: 300, brocoli: 400,
  "chou-fleur": 900, concombre: 400, salade: 300, citron: 120, "pate-feuilletee": 230, yaourt: 125,
  pdt: 150, carotte: 100, tomate: 120, courgette: 250, "patate-douce": 250, courge: 1500,
  champignons: 20, saumon: 125,
};

const UNIT_NAMES = {
  pce: ["pièce", "pièces"],
  gousse: ["gousse", "gousses"],
  tranche: ["tranche", "tranches"],
  boite: ["boîte", "boîtes"],
  cube: ["cube", "cubes"],
};

export const unitName = (unit, qty = 2) => UNIT_NAMES[unit]?.[qty > 1 ? 1 : 0] || unit;

// « 150 g », « 2 gousses », « 3 pièces »
export const fmtStock = (qty, unit) => `${String(qty).replace(".", ",")} ${unitName(unit, qty)}`;

// Unités proposées pour un aliment stocké en `baseUnit`. `factor` : combien d'unités de base pour 1.
export function unitOptions(key, baseUnit) {
  const weight = PIECE_WEIGHT[key];
  if (baseUnit === "g") {
    return [
      { id: "g", label: "g", factor: 1 },
      { id: "kg", label: "kg", factor: 1000 },
      ...(weight ? [{ id: "pce", label: "pièces", factor: weight }] : []),
    ];
  }
  if (baseUnit === "ml") {
    return [
      { id: "ml", label: "ml", factor: 1 },
      { id: "cl", label: "cl", factor: 10 },
      { id: "l", label: "L", factor: 1000 },
    ];
  }
  return [
    { id: baseUnit, label: unitName(baseUnit), factor: 1 },
    ...(weight
      ? [
          { id: "g", label: "g", factor: 1 / weight },
          { id: "kg", label: "kg", factor: 1000 / weight },
        ]
      : []),
  ];
}

// Quantité convertie dans l'unité de base (entière, au moins 1), ou null si impossible
export function toBaseQty(key, baseUnit, qty, unitId) {
  const option = unitOptions(key, baseUnit).find((o) => o.id === unitId);
  if (!option || !(qty > 0)) return null;
  return Math.max(1, Math.round(qty * option.factor));
}

// « 1,5 » ou « 1.5 » -> 1.5 ; null si ce n'est pas un nombre positif
export function parseQty(text) {
  const clean = String(text).trim().replace(",", ".");
  if (!/^\d*\.?\d+$/.test(clean)) return null;
  const n = Number(clean);
  return n > 0 ? n : null;
}

export const CATEGORIES = [
  {
    id: "legumes",
    label: "🥕 Légumes & fruits",
    keys: [
      "pdt", "carotte", "oignon", "ail", "chou", "poireau", "tomate", "champignons", "courgette", "poivron",
      "aubergine", "brocoli", "chou-fleur", "epinards", "haricots-verts", "petits-pois", "patate-douce", "courge",
      "concombre", "salade", "citron",
    ],
  },
  {
    id: "viandes",
    label: "🥩 Viandes & poissons",
    keys: ["poulet", "viande-hachee", "saucisses", "lardons", "jambon", "saumon", "cabillaud", "thon"],
  },
  {
    id: "frais",
    label: "🧀 Œufs & produits frais",
    keys: ["oeufs", "beurre", "creme-fraiche", "lait", "fromage", "feta", "chevre", "yaourt", "tofu", "pate-feuilletee"],
  },
  { id: "epicerie", label: "🥫 Épicerie", keys: [] }, // tout le reste du catalogue
  { id: "autres", label: "📦 Autres", keys: [] }, // aliments hors catalogue
];

export function categoryOf(key, inCatalog) {
  const found = CATEGORIES.find((c) => c.keys.includes(key));
  if (found) return found.id;
  return inCatalog ? "epicerie" : "autres";
}
