import { ChevronDown, KeyRound, LogOut, Menu, Plus, ShoppingCart, User, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BandeauLicence } from "../composants/BandeauLicence";
import { ChoixLangue } from "../composants/ChoixLangue";
import { LogoRaqeem } from "../composants/LogoRaqeem";
import { Champ } from "../composants/Champ";
import { MessageErreur } from "../composants/EnTetePage";
import { Modale } from "../composants/Modale";
import { useNotifier } from "../composants/Notifications";
import { useAuth } from "../hooks/useAuth";
import { changerMotDePasse } from "../services/auth";
import { extraireErreur } from "../utilitaires/erreurs";
import { libelleRole, lireLogoPharmacie, lireNomPharmacie } from "../utilitaires/formatage";
import { menu } from "./menu";

import { t } from '../i18n'
function ModaleMotDePasse({
  ouverte,
  onFermer,
}: {
  ouverte: boolean;
  onFermer: () => void;
}) {
  const notifier = useNotifier();
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    if (nouveau !== confirmation) {
      setErreur(t('Les deux mots de passe ne correspondent pas.'));
      return;
    }
    try {
      await changerMotDePasse(ancien, nouveau);
      notifier.succes(t('Mot de passe modifié.'));
      setAncien("");
      setNouveau("");
      setConfirmation("");
      setErreur(null);
      onFermer();
    } catch (err) {
      setErreur(extraireErreur(err));
    }
  };

  return (
    <Modale
      ouverte={ouverte}
      titre={t('Changer mon mot de passe')}
      onFermer={onFermer}
      largeur="petite"
      pied={
        <>
          <button className="btn-secondaire" onClick={onFermer}>
            
            {t('Annuler')}
          </button>
          <button className="btn-primaire" form="formulaire-mdp" type="submit">
            
            {t('Enregistrer')}
          </button>
        </>
      }
    >
      <form id="formulaire-mdp" onSubmit={soumettre} className="space-y-3">
        <MessageErreur message={erreur} />
        <Champ libelle={t('Mot de passe actuel')}>
          <input
            className="champ"
            type="password"
            value={ancien}
            onChange={(e) => setAncien(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Champ>
        <Champ libelle={t('Nouveau mot de passe')} aide={t('8 caractères minimum.')}>
          <input
            className="champ"
            type="password"
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
            minLength={8}
            autoComplete="new-password"
            required
          />
        </Champ>
        <Champ libelle={t('Confirmer le nouveau mot de passe')}>
          <input
            className="champ"
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Champ>
      </form>
    </Modale>
  );
}

export function MiseEnPagePrincipale() {
  const { utilisateur, peut, deconnecter } = useAuth();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [modaleMdp, setModaleMdp] = useState(false);
  const [menuCompte, setMenuCompte] = useState(false);
  const zoneUtilisateur = useRef<HTMLDivElement>(null);
  const lieu = useLocation();

  useEffect(() => {
    setMenuOuvert(false);
    setMenuCompte(false);
  }, [lieu.pathname]);

  // Le menu du compte se ferme au clic ailleurs ou avec Échap.
  useEffect(() => {
    if (!menuCompte) return;
    const clic = (e: MouseEvent) => { if (!zoneUtilisateur.current?.contains(e.target as Node)) setMenuCompte(false); };
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuCompte(false); };
    document.addEventListener("mousedown", clic);
    document.addEventListener("keydown", touche);
    return () => { document.removeEventListener("mousedown", clic); document.removeEventListener("keydown", touche); };
  }, [menuCompte]);

  // Groupes repliables : seul le groupe de la page ouverte est déplié par défaut, les autres restent fermés
  // pour que le menu tienne sur un écran sans défiler. L'utilisateur en ouvre ou en ferme à volonté.
  const groupeActif = menu.findIndex((g) => g.elements.some((e) => e.chemin === lieu.pathname || (e.chemin !== "/" && lieu.pathname.startsWith(e.chemin + "/"))));
  const [groupesOuverts, setGroupesOuverts] = useState<Set<number>>(() => new Set([groupeActif]));
  useEffect(() => {
    if (groupeActif >= 0) setGroupesOuverts((avant) => (avant.has(groupeActif) ? avant : new Set(avant).add(groupeActif)));
  }, [groupeActif]);
  const basculerGroupe = (i: number) => setGroupesOuverts((avant) => {
    const suivant = new Set(avant);
    if (suivant.has(i)) suivant.delete(i); else suivant.add(i);
    return suivant;
  });

  const lien = (e: (typeof menu)[number]["elements"][number], retrait = false) => (
    <NavLink
      to={e.chemin}
      end
      className={({ isActive }) =>
        `relative flex items-center gap-3 rounded-lg py-2 text-[13.5px] transition-colors ${retrait ? "pe-3 ps-9" : "px-3"} ${isActive
          ? "bg-marque-50 font-semibold text-marque-800 before:absolute before:inset-y-1.5 before:start-0 before:w-1 before:rounded-full before:bg-marque-500"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`
      }
    >
      <e.icone size={retrait ? 16 : 18} className="shrink-0" /> <span className="truncate">{e.libelle}</span>
    </NavLink>
  );

  // « Nouvelle vente » a son grand bouton en haut du menu : on ne la répète pas dans la liste.
  const navigation = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label={t('Navigation principale')}>
      {menu.map((groupe, i) => {
        const elements = groupe.elements.filter((e) => peut(e.module) && e.chemin !== "/ventes/nouvelle");
        if (elements.length === 0) return null;
        if (!groupe.titre) return <div key={i} className="mb-2">{elements.map((e) => <div key={e.chemin}>{lien(e)}</div>)}</div>;
        const ouvert = groupesOuverts.has(i);
        const Icone = groupe.icone ?? elements[0].icone;
        return (
          <div key={i}>
            <button
              type="button"
              onClick={() => basculerGroupe(i)}
              aria-expanded={ouvert}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors ${i === groupeActif ? "font-semibold text-nuit-800" : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"}`}
            >
              <Icone size={18} className="shrink-0" />
              <span className="flex-1 truncate text-start font-medium">{groupe.titre}</span>
              <ChevronDown size={15} className={`shrink-0 opacity-60 transition-transform ${ouvert ? "rotate-180" : ""}`} />
            </button>
            {ouvert && <ul className="mt-0.5 space-y-0.5">{elements.map((e) => <li key={e.chemin}>{lien(e, true)}</li>)}</ul>}
          </div>
        );
      })}
    </nav>
  );

  // En haut du menu : la marque du logiciel, RAQEEM PHARMA, sur fond clair.
  const marque = (
    <div className="flex h-16 shrink-0 items-center border-b border-slate-100 px-4">
      <LogoRaqeem taille={42} compact />
    </div>
  );

  // La vente est l'opération la plus fréquente : grand bouton tout en haut du menu, sous la marque.
  const boutonVente = peut("ventes") && (
    <div className="shrink-0 px-3 pt-4">
      <NavLink to="/ventes/nouvelle"
        className={({ isActive }) => `group flex items-center gap-3 rounded-xl bg-marque-600 px-4 py-3 text-white shadow-sm transition hover:bg-marque-700 hover:shadow-md ${isActive ? "ring-2 ring-marque-300 ring-offset-2" : ""}`}>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20"><ShoppingCart size={19} /></span>
        <span className="flex-1 leading-tight">
          <span className="block text-[15px] font-bold">{t('Nouvelle vente')}</span>
          <span className="block text-[11px] text-white/80">{t('Encaisser un client')}</span>
        </span>
        <Plus size={18} className="opacity-80 transition-transform group-hover:rotate-90" />
      </NavLink>
    </div>
  );

  // En haut de page : la pharmacie du client (son logo et son nom).
  const logo = lireLogoPharmacie();
  const pharmacie = (
    <div className="flex min-w-0 items-center gap-2.5">
      {logo && <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-md object-contain" />}
      <div className="min-w-0 leading-tight">
        <p className="hidden text-[11px] font-medium uppercase tracking-wider text-slate-500 sm:block">{t('Pharmacie')}</p>
        <p className="truncate text-base font-semibold text-nuit-800">{lireNomPharmacie()}</p>
      </div>
    </div>
  );

  // Avatar : simplement l'icône de l'utilisateur, sur un rond vert uni.
  const avatar = (taille: string, icone: number) => (
    <span className={`flex ${taille} shrink-0 items-center justify-center rounded-full bg-marque-600 text-white`}><User size={icone} /></span>
  );

  // À l'extrémité de l'en-tête : en français elle est à droite, en arabe (de droite à gauche) elle passe en haut à gauche.
  // Seule l'icône de l'utilisateur est visible ; le menu contient son nom, son rôle, le mot de passe et la déconnexion.
  const menuUtilisateur = (
    <div className="relative" ref={zoneUtilisateur}>
      <button type="button" onClick={() => setMenuCompte((v) => !v)} aria-expanded={menuCompte} aria-haspopup="menu"
        title={`${utilisateur?.nom_complet ?? ""} — ${utilisateur ? libelleRole(utilisateur.role) : ""}`}
        aria-label={utilisateur?.nom_complet ?? t('Mon compte')}
        className={`rounded-full p-0.5 ring-2 transition ${menuCompte ? "ring-marque-300" : "ring-transparent hover:ring-slate-200"}`}>
        {avatar("h-10 w-10", 20)}
      </button>
      {menuCompte && (
        <div role="menu" className="absolute end-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white text-start shadow-xl">
          <div className="flex items-center gap-3 bg-marque-50 px-4 py-3">
            {avatar("h-10 w-10", 20)}
            <div className="min-w-0 leading-tight">
              <p className="truncate font-semibold text-nuit-800">{utilisateur?.nom_complet}</p>
              <p className="truncate text-xs text-marque-700">{utilisateur ? libelleRole(utilisateur.role) : ""}</p>
            </div>
          </div>
          <div className="p-1.5">
            <button type="button" role="menuitem" onClick={() => { setMenuCompte(false); setModaleMdp(true); }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm text-slate-700 hover:bg-slate-50">
              <KeyRound size={16} className="text-slate-400" /> {t('Changer mon mot de passe')}
            </button>
            <div className="my-1 border-t border-slate-100" />
            <button type="button" role="menuitem" onClick={deconnecter}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm font-medium text-red-600 hover:bg-red-50">
              <LogOut size={16} className="rtl:-scale-x-100" /> {t('Déconnexion')}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen lg:ps-64">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col border-e border-slate-200 bg-white lg:flex sans-impression">
        {marque}
        {boutonVente}
        {navigation}
      </aside>

      {menuOuvert && (
        <div className="fixed inset-0 z-40 lg:hidden sans-impression">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMenuOuvert(false)}
          />
          <aside className="absolute inset-y-0 start-0 flex w-64 flex-col bg-white shadow-xl">
            {marque}
            {boutonVente}
            {navigation}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sans-impression">
        <div className="flex min-w-0 items-center gap-2">
          <button
            className="btn-discret lg:hidden"
            onClick={() => setMenuOuvert(!menuOuvert)}
            aria-label={t('Ouvrir le menu')}
          >
            {menuOuvert ? <X size={20} /> : <Menu size={20} />}
          </button>
          {pharmacie}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <ChoixLangue />
          {menuUtilisateur}
        </div>
      </header>

      <BandeauLicence />
      <main className="mx-auto max-w-[1400px] p-4 pb-14 sm:p-6 sm:pb-14">
        <Outlet />
      </main>
      {/* Copyright de l'éditeur : fixé en bas de l'écran, toujours visible (le menu latéral le recouvre à son côté). */}
      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white px-4 py-2 text-center text-xs text-slate-500 sans-impression lg:ps-64">
        {t('Tous droits réservés à Rawafid Digital Services © {annee}', { annee: new Date().getFullYear() })}
      </footer>
      <ModaleMotDePasse
        ouverte={modaleMdp}
        onFermer={() => setModaleMdp(false)}
      />
    </div>
  );
}
