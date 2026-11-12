import { KeyRound, LogOut, Menu, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BandeauLicence } from "../composants/BandeauLicence";
import { ChoixLangue } from "../composants/ChoixLangue";
import { LogoRaqeem } from "../composants/LogoRaqeem";
import { Champ } from "../composants/Champ";
import { EDITEUR_PAR_DEFAUT, NOM_LOGICIEL } from "../services/licence";
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
  const lieu = useLocation();

  useEffect(() => {
    setMenuOuvert(false);
  }, [lieu.pathname]);

  const navigation = (
    <nav
      className="flex-1 space-y-4 overflow-y-auto px-3 py-4"
      aria-label={t('Navigation principale')}
    >
      {menu.map((groupe, i) => {
        const elements = groupe.elements.filter((e) => peut(e.module));
        if (elements.length === 0) return null;
        return (
          <div key={i}>
            {groupe.titre && (
              <p className="mb-1 px-2 text-xs font-semibold text-slate-400">
                {groupe.titre}
              </p>
            )}
            <ul className="space-y-0.5">
              {elements.map((e) => (
                <li key={e.chemin}>
                  <NavLink
                    to={e.chemin}
                    end
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ${isActive ? "bg-marque-50 font-medium text-marque-800" : "text-slate-600 hover:bg-slate-100"}`
                    }
                  >
                    <e.icone size={17} /> {e.libelle}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  // En haut du menu : la marque du logiciel, RAQEEM PHARMA, sur bandeau bleu nuit.
  const marque = (
    <div className="flex h-16 shrink-0 items-center bg-nuit-800 px-4">
      <LogoRaqeem taille={42} fond="sombre" compact />
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

  // Signature de l'éditeur en bas du menu.
  const signature = (
    <div className="shrink-0 border-t border-slate-100 px-4 py-3 text-xs leading-tight text-slate-500">
      
      {t('par')}{' '}<span className="font-medium text-nuit-800">{EDITEUR_PAR_DEFAUT}</span>
    </div>
  );

  return (
    <div className="min-h-screen lg:ps-64">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col border-e border-slate-200 bg-white lg:flex sans-impression">
        {marque}
        {navigation}
        {signature}
      </aside>

      {menuOuvert && (
        <div className="fixed inset-0 z-40 lg:hidden sans-impression">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMenuOuvert(false)}
          />
          <aside className="absolute inset-y-0 start-0 flex w-64 flex-col bg-white shadow-xl">
            {marque}
            {navigation}
            {signature}
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
          <div className="hidden text-end leading-tight sm:block">
            <p className="text-sm font-medium">{utilisateur?.nom_complet}</p>
            <p className="text-xs text-slate-500">
              {utilisateur ? libelleRole(utilisateur.role) : ""}
            </p>
          </div>
          <button
            className="btn-discret btn-petit"
            onClick={() => setModaleMdp(true)}
            title={t('Changer mon mot de passe')}
          >
            <KeyRound size={16} />
          </button>
          <button className="btn-secondaire btn-petit" onClick={deconnecter}>
            <LogOut size={14} className="rtl:-scale-x-100" /> <span className="hidden md:inline">{t('Déconnexion')}</span>
          </button>
        </div>
      </header>

      <BandeauLicence />
      <main className="mx-auto max-w-[1400px] p-4 sm:p-6">
        <Outlet />
      </main>
      <ModaleMotDePasse
        ouverte={modaleMdp}
        onFermer={() => setModaleMdp(false)}
      />
    </div>
  );
}
