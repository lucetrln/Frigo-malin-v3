// Base de recettes Frigo Malin.
// Format compact : [id, nom, temps, appareils, ingrédients, étapes]
// - appareils : P = plaques, F = four, A = airfryer, M = micro-ondes, X = mixeur (obligatoire)
//   Un seul appareil de cuisson parmi ceux listés suffit.
// - ingrédients : "clé:quantité" séparés par des espaces, quantités pour 4 personnes,
//   clés et unités issues de GROCERY_CATALOG (App.jsx).
import { PATES_RIZ } from "./recettes/pates-riz.js";
import { VIANDES } from "./recettes/viandes.js";
import { LEGUMES_SOUPES } from "./recettes/legumes-soupes.js";
import { OEUFS_TARTES_RAPIDES } from "./recettes/oeufs-tartes-rapides.js";

const EQUIPMENT_CODES = { P: "plaques", F: "four", A: "airfryer", M: "microondes", X: "mixeur" };

const build = ([id, name, time, equip, ings, steps]) => ({
  id,
  name,
  time,
  baseServings: 4,
  equipments: [...equip].map((c) => EQUIPMENT_CODES[c]),
  ingredients: ings.split(" ").map((pair) => {
    const [key, amount] = pair.split(":");
    return { key, amount: Number(amount) };
  }),
  steps,
});

export const MASSIVE_RECIPES = [...PATES_RIZ, ...VIANDES, ...LEGUMES_SOUPES, ...OEUFS_TARTES_RAPIDES].map(build);
