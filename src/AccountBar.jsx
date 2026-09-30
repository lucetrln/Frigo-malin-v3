import { useState } from "react";
import { supabase } from "./supabase";

const ERROR_MESSAGES = {
  "Invalid login credentials": "E-mail ou mot de passe incorrect.",
  "User already registered": "Un compte existe déjà avec cet e-mail.",
  "Email not confirmed": "Confirme d'abord ton e-mail grâce au lien reçu.",
};

const translateError = (msg = "") =>
  ERROR_MESSAGES[msg] ||
  (msg.includes("Password should be") ? "Le mot de passe doit faire au moins 6 caractères." : msg);

export default function AccountBar({ session, syncStatus }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  if (!supabase) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { data, error } =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);

    if (error) {
      setMessage({ type: "error", text: translateError(error.message) });
      return;
    }
    if (mode === "signup" && !data.session) {
      setMessage({ type: "info", text: "Compte créé ! Clique sur le lien reçu par e-mail pour l'activer, puis connecte-toi." });
      setMode("login");
      return;
    }
    setPassword("");
    setOpen(false);
  };

  if (session) {
    const statusLabel = {
      loading: "Chargement…",
      saving: "Enregistrement…",
      saved: "✓ Enregistré",
      error: "⚠ Erreur d'enregistrement",
    }[syncStatus];

    return (
      <div className="fm-account-bar">
        {statusLabel && <span className={`fm-account-status ${syncStatus}`}>{statusLabel}</span>}
        <span className="fm-account-avatar" title={`Connecté : ${session.user.email}`}>
          {session.user.email?.[0]?.toUpperCase() || "?"}
        </span>
        <button type="button" className="fm-account-link" onClick={() => supabase.auth.signOut()}>
          Se déconnecter
        </button>
      </div>
    );
  }

  return (
    <div className="fm-account-bar">
      {!open ? (
        <>
          <span className="fm-account-hint" title="Sans compte, ton frigo n'est enregistré que sur cet appareil.">
            Mode invité
          </span>
          <button type="button" className="fm-account-btn" onClick={() => { setOpen(true); setMode("signup"); }}>
            Créer un compte
          </button>
          <button type="button" className="fm-account-link" onClick={() => { setOpen(true); setMode("login"); }}>
            Se connecter
          </button>
        </>
      ) : (
        <form className="fm-account-form" onSubmit={handleSubmit}>
          <strong>{mode === "signup" ? "Créer mon compte" : "Me connecter"}</strong>
          <input
            type="email"
            placeholder="E-mail"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Mot de passe (6 caractères min.)"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          <button type="submit" className="fm-account-btn" disabled={busy}>
            {busy ? "Patiente…" : mode === "signup" ? "Créer le compte" : "Se connecter"}
          </button>
          <button
            type="button"
            className="fm-account-link"
            onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setMessage(null); }}
          >
            {mode === "signup" ? "J'ai déjà un compte" : "Pas encore de compte ?"}
          </button>
          <button type="button" className="fm-account-link" onClick={() => { setOpen(false); setMessage(null); }}>
            Annuler
          </button>
        </form>
      )}
      {message && <p className={`fm-account-message ${message.type}`}>{message.text}</p>}
    </div>
  );
}
