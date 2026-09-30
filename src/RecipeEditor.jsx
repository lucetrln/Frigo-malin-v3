import { useState } from "react";

const emptyIngredient = () => ({ key: "", amount: "" });

// Formulaire de création / modification d'une recette personnelle.
// Les ingrédients sont choisis dans le catalogue pour que prix, frigo et liste de courses fonctionnent.
// Les quantités saisies pour `servings` personnes sont ramenées à 4 personnes (base de toutes les recettes).
export default function RecipeEditor({ catalog, equipmentsList, initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || "");
  const [time, setTime] = useState(initial?.time || "30 min");
  const [servings, setServings] = useState(4);
  const [equipments, setEquipments] = useState(initial?.equipments || ["plaques"]);
  const [ingredients, setIngredients] = useState(
    initial?.ingredients?.length ? initial.ingredients.map((i) => ({ ...i })) : [emptyIngredient(), emptyIngredient()]
  );
  const [stepsText, setStepsText] = useState(initial?.steps?.join("\n") || "");
  const [error, setError] = useState(null);

  const catalogOptions = Object.entries(catalog).sort(([, a], [, b]) => a.name.localeCompare(b.name, "fr"));

  const updateIngredient = (index, field, value) => {
    setIngredients((prev) => prev.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing)));
  };

  const toggleEquipment = (id) => {
    setEquipments((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanIngredients = ingredients
      .filter((ing) => ing.key && Number(ing.amount) > 0)
      .map((ing) => ({ key: ing.key, amount: Math.round((Number(ing.amount) * 4) / servings) || 1 }));
    const steps = stepsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!name.trim()) return setError("Donne un nom à ta recette.");
    if (cleanIngredients.length === 0) return setError("Ajoute au moins un ingrédient avec sa quantité.");
    if (steps.length === 0) return setError("Écris au moins une étape de préparation.");

    onSave({
      id: initial?.id || `perso-${Date.now()}`,
      name: name.trim(),
      time: time.trim() || "30 min",
      baseServings: 4,
      equipments,
      ingredients: cleanIngredients,
      steps,
      custom: true,
    });
  };

  return (
    <form className="fm-editor" onSubmit={handleSubmit}>
      <div className="fm-editor-grid">
        <label className="fm-field">
          <span className="fm-field-label">Nom de la recette</span>
          <input className="fm-form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Gratin de ma grand-mère" />
        </label>
        <label className="fm-field">
          <span className="fm-field-label">Temps</span>
          <input className="fm-form-input" value={time} onChange={(e) => setTime(e.target.value)} placeholder="Ex : 45 min" />
        </label>
        <label className="fm-field">
          <span className="fm-field-label">Quantités pour</span>
          <select className="fm-form-input" value={servings} onChange={(e) => setServings(Number(e.target.value))}>
            {Array.from({ length: 10 }, (_, n) => n + 1).map((n) => (
              <option key={n} value={n}>
                {n} personne{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="fm-field">
        <span className="fm-field-label">Appareils (un seul suffit pour cuisiner, sauf le mixeur qui est obligatoire)</span>
        <div className="fm-chips">
          {equipmentsList.map((eq) => (
            <button
              key={eq.id}
              type="button"
              className={`fm-chip ${equipments.includes(eq.id) ? "active" : ""}`}
              aria-pressed={equipments.includes(eq.id)}
              onClick={() => toggleEquipment(eq.id)}
            >
              {eq.icon} {eq.label}
            </button>
          ))}
        </div>
      </div>

      <div className="fm-field">
        <span className="fm-field-label">Ingrédients</span>
        <div className="fm-editor-ings">
          {ingredients.map((ing, index) => (
            <div className="fm-form-row" key={index}>
              <select
                className="fm-form-input"
                aria-label="Ingrédient"
                value={ing.key}
                onChange={(e) => updateIngredient(index, "key", e.target.value)}
              >
                <option value="">Choisir un ingrédient…</option>
                {catalogOptions.map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                className="fm-form-input"
                style={{ width: "90px", flexShrink: 0 }}
                aria-label="Quantité"
                placeholder="Qté"
                value={ing.amount}
                onChange={(e) => updateIngredient(index, "amount", e.target.value)}
              />
              <span className="fm-editor-unit">{catalog[ing.key]?.unit || ""}</span>
              <button
                type="button"
                className="fm-item-delete"
                title="Retirer cet ingrédient"
                onClick={() => setIngredients((prev) => prev.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="fm-account-link"
          style={{ marginTop: "0.3rem" }}
          onClick={() => setIngredients((prev) => [...prev, emptyIngredient()])}
        >
          + Ajouter un ingrédient
        </button>
      </div>

      <label className="fm-field">
        <span className="fm-field-label">Préparation (une étape par ligne)</span>
        <textarea
          className="fm-form-input"
          rows={5}
          value={stepsText}
          onChange={(e) => setStepsText(e.target.value)}
          placeholder={"Faire revenir l'oignon.\nAjouter la viande…"}
        />
      </label>

      {error && <p className="fm-account-message error">{error}</p>}

      <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end" }}>
        <button type="button" className="fm-account-link" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="fm-submit-btn">
          {initial ? "Enregistrer les modifications" : "Créer la recette"}
        </button>
      </div>
    </form>
  );
}
