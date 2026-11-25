import { useRef, useState } from "react";
import { CATEGORIES, categoryOf, fmtStock, parseQty, toBaseQty, unitName, unitOptions } from "./units";

const CUSTOM_UNITS = ["g", "ml", "pce", "tranche", "boite"];

const cleanStr = (s) =>
  s
    .toLowerCase()
    .replace(/œ/g, "oe")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

// Plus le score est petit, meilleure est la correspondance ; null = aucune
function matchScore(query, name, aliases) {
  if (aliases.some((a) => a === query)) return 0;
  if (aliases.some((a) => a.startsWith(query))) return 1;
  if (name.split(/[\s/,()]+/).some((w) => cleanStr(w).startsWith(query))) return 2;
  if (cleanStr(name).includes(query) || aliases.some((a) => a.includes(query))) return 3;
  if (aliases.some((a) => a.length >= 3 && query.includes(a))) return 4;
  return null;
}

// Nombre modifiable au clavier : on peut le vider, il n'est validé qu'à la sortie du champ
function QtyInput({ value, label, onCommit }) {
  const [draft, setDraft] = useState(null);

  const commit = () => {
    const qty = draft === null ? null : parseQty(draft);
    if (qty !== null && Math.round(qty) >= 1) onCommit(Math.round(qty));
    setDraft(null);
  };

  return (
    <input
      className="fm-stock-input"
      inputMode="decimal"
      aria-label={label}
      value={draft ?? value}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.target.blur();
        if (e.key === "Escape") setDraft(null);
      }}
    />
  );
}

function AddFood({ catalog, aliases, fridge, onAdd }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [food, setFood] = useState(null); // aliment choisi : { key, name, baseUnit, custom }
  const [qty, setQty] = useState("");
  const [unitId, setUnitId] = useState("g");
  const [done, setDone] = useState(null);
  const searchRef = useRef(null);

  const cleanQuery = cleanStr(query);
  const entries = Object.entries(catalog);
  const matches = cleanQuery
    ? entries
        .map(([key, item]) => ({ key, item, score: matchScore(cleanQuery, item.name, aliases[key] || []) }))
        .filter((m) => m.score !== null)
        .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name, "fr"))
        .slice(0, 8)
    : CATEGORIES.flatMap((c) =>
        entries
          .filter(([key]) => categoryOf(key, true) === c.id)
          .sort(([, a], [, b]) => a.name.localeCompare(b.name, "fr"))
          .map(([key, item]) => ({ key, item }))
      );
  const options = [
    ...matches.map(({ key, item }) => ({ key, name: item.name, baseUnit: item.unit, custom: false })),
    ...(cleanQuery && matches[0]?.score !== 0
      ? [{ key: cleanQuery, name: query.trim(), baseUnit: fridge[cleanQuery]?.unit || "g", custom: true }]
      : []),
  ];

  const choose = (option) => {
    setFood(option);
    setUnitId(option.baseUnit);
    setQty(String(catalog[option.key]?.packQty || ""));
    setOpen(false);
    setDone(null);
  };

  const reset = () => {
    setFood(null);
    setQuery("");
    setQty("");
    setActive(0);
  };

  // Un aliment hors catalogue prend l'unité choisie, sauf s'il est déjà au frigo
  const freeUnit = food?.custom && !fridge[food.key];
  const baseUnit = food && (freeUnit ? unitId : food.baseUnit);
  let units = [];
  if (food) {
    units = freeUnit
      ? CUSTOM_UNITS.map((u) => ({ id: u, label: unitName(u) }))
      : unitOptions(food.key, food.baseUnit);
  }
  const number = parseQty(qty);
  const baseQty = food && number !== null ? toBaseQty(food.key, baseUnit, number, unitId) : null;
  const pack = food && catalog[food.key];
  const presets = baseUnit === "g" || baseUnit === "ml" ? [100, 250, 500, 1000] : [1, 2, 3, 4, 6];
  const quickQtys = presets.filter((q) => q !== pack?.packQty);

  const pickQty = (q) => {
    setUnitId(baseUnit);
    setQty(String(q));
  };

  const submit = (e) => {
    e.preventDefault();
    if (!food || !baseQty) return;
    onAdd({ key: food.key, name: food.name, unit: baseUnit, qty: baseQty });
    setDone(`✓ ${food.name} : +${fmtStock(baseQty, baseUnit)}`);
    reset();
    setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 0);
  };

  return (
    <form className="fm-bright-form" onSubmit={submit}>
      {!food ? (
        <div
          className="fm-combo"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
          }}
        >
          <input
            ref={searchRef}
            type="text"
            className="fm-form-input"
            placeholder="🔍 Cherche un aliment…"
            role="combobox"
            aria-expanded={open}
            aria-controls="fm-food-list"
            aria-label="Chercher un aliment"
            autoComplete="off"
            value={query}
            onClick={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setOpen(true);
              setDone(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setOpen(true);
                const step = e.key === "ArrowDown" ? 1 : -1;
                setActive((i) => Math.max(0, Math.min(options.length - 1, i + step)));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                if (open && options[active]) choose(options[active]);
              }
              if (e.key === "Escape") setOpen(false);
            }}
          />
          {open && options.length > 0 && (
            <ul className="fm-combo-list" id="fm-food-list" role="listbox">
              {options.map((option, index) => (
                <li
                  key={option.custom ? "custom" : option.key}
                  role="option"
                  aria-selected={index === active}
                  className={index === active ? "active" : ""}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(option)}
                >
                  <span>{option.custom ? `Ajouter « ${option.name} »` : option.name}</span>
                  {fridge[option.key] && <small>déjà {fmtStock(fridge[option.key].qty, fridge[option.key].unit)}</small>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div className="fm-food-chosen">
            <strong>{food.name}</strong>
            <button type="button" className="fm-account-link" onClick={reset}>
              Changer
            </button>
          </div>

          <div className="fm-form-row">
            <input
              className="fm-form-input"
              inputMode="decimal"
              autoFocus
              aria-label="Quantité"
              placeholder="Quantité"
              value={qty}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setQty(e.target.value)}
            />
            <select className="fm-form-input" aria-label="Unité" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          <div className="fm-chips">
            {pack && (
              <button type="button" className="fm-chip" onClick={() => pickQty(pack.packQty)}>
                {pack.packLabel}
              </button>
            )}
            {quickQtys.map((q) => (
              <button key={q} type="button" className="fm-chip" onClick={() => pickQty(q)}>
                {fmtStock(q, baseUnit)}
              </button>
            ))}
          </div>

          {baseQty && unitId !== baseUnit && (
            <p className="fm-subhint" style={{ margin: 0 }}>
              Sera compté comme <strong>{fmtStock(baseQty, baseUnit)}</strong>
            </p>
          )}
          {qty !== "" && number === null && (
            <p className="fm-account-message error">Écris un nombre, par exemple 250.</p>
          )}
          {fridge[food.key] && (
            <p className="fm-subhint" style={{ margin: 0 }}>
              Tu en as déjà {fmtStock(fridge[food.key].qty, fridge[food.key].unit)}.
            </p>
          )}

          <button type="submit" className="fm-submit-btn" disabled={!baseQty}>
            + Ranger au frigo
          </button>
        </>
      )}
      {done && (
        <p className="fm-account-message info" role="status">
          {done}
        </p>
      )}
    </form>
  );
}

export default function FridgeTab({ fridge, catalog, aliases, onAdd, onSetQty, onTogglePriority, onRemove }) {
  const items = Object.entries(fridge);
  const shelves = CATEGORIES.map((c) => ({
    ...c,
    items: items
      .filter(([key]) => categoryOf(key, !!catalog[key]) === c.id)
      .sort(([, a], [, b]) => a.name.localeCompare(b.name, "fr")),
  })).filter((c) => c.items.length > 0);

  return (
    <div className="fm-layout-fridge">
      <aside className="fm-card-panel">
        <h2>Ajouter un aliment</h2>
        <p className="fm-subhint">Choisis l'aliment, puis la quantité dans l'unité que tu veux.</p>
        <AddFood catalog={catalog} aliases={aliases} fridge={fridge} onAdd={onAdd} />
      </aside>

      <section className="fm-card-panel">
        <h2>Mon réfrigérateur</h2>
        <p className="fm-subhint">
          Clique sur une quantité pour la modifier. L'étoile ☆ rend un aliment prioritaire dans les suggestions.
        </p>
        <div className="fm-fridge-container">
          <div className="fm-vintage-handle" />
          <div className="fm-fridge-tophead">
            <span className="fm-fridge-logo">FRIGO MALIN · FRESH AIR</span>
            <div className="fm-fridge-led-panel">
              <span className="fm-led-light" />
              <span className="fm-led-status">
                +4°C · {items.length} ALIMENT{items.length > 1 ? "S" : ""}
              </span>
            </div>
          </div>

          <div className="fm-fridge-shelves-zone">
            {items.length === 0 ? (
              <div className="fm-empty">
                <div style={{ fontSize: "2rem", marginBottom: "0.3rem" }}>🥬</div>
                <strong style={{ color: "var(--ink-dark)" }}>Ton réfrigérateur est vide.</strong>
                <div style={{ marginTop: "0.2rem" }}>Cherche un aliment pour commencer.</div>
              </div>
            ) : (
              shelves.map((shelf) => (
                <div className="fm-shelf-block" key={shelf.id}>
                  <div className="fm-shelf-title">{shelf.label}</div>
                  <div className="fm-stock-grid">
                    {shelf.items.map(([key, item]) => {
                      const step = catalog[key]?.step || (item.unit === "g" || item.unit === "ml" ? 100 : 1);
                      return (
                        <div className={`fm-stock-item ${item.priority ? "priority" : ""}`} key={key}>
                          <div className="fm-stock-top">
                            <button
                              type="button"
                              className="fm-priority-btn"
                              onClick={() => onTogglePriority(key)}
                              title={item.priority ? "Ne plus utiliser en priorité" : "À utiliser en priorité dans les recettes"}
                              aria-pressed={!!item.priority}
                            >
                              {item.priority ? "★" : "☆"}
                            </button>
                            <span className="fm-item-name">{item.name}</span>
                            <button
                              type="button"
                              className="fm-item-delete"
                              onClick={() => onRemove(key)}
                              title={`Retirer ${item.name} du frigo`}
                            >
                              ×
                            </button>
                          </div>
                          <div className="fm-stock-qty">
                            <button
                              type="button"
                              className="fm-qty-btn"
                              disabled={item.qty <= step}
                              onClick={() => onSetQty(key, item.qty - step)}
                              title={`Enlever ${fmtStock(step, item.unit)}`}
                            >
                              −
                            </button>
                            <QtyInput
                              value={item.qty}
                              label={`Quantité de ${item.name}`}
                              onCommit={(q) => onSetQty(key, q)}
                            />
                            <span className="fm-stock-unit">{unitName(item.unit, item.qty)}</span>
                            <button
                              type="button"
                              className="fm-qty-btn"
                              onClick={() => onSetQty(key, item.qty + step)}
                              title={`Ajouter ${fmtStock(step, item.unit)}`}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="fm-glass-rack" />
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
