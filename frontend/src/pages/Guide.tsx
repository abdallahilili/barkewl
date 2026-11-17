import {
  BarChart3, Boxes, ChevronDown, HandCoins, LifeBuoy, LogIn, LucideIcon, Package, Pill, Search, Settings, ShoppingCart, Undo2, UserCog, Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconeWhatsapp } from '../composants/BoutonAssistance'
import { EnTetePage } from '../composants/EnTetePage'
import { ASSISTANCE_AFFICHAGE, lienAssistanceWhatsapp } from '../services/licence'

import { langueCourante, t } from '../i18n'

// Le guide est rédigé directement dans les deux langues (textes longs, plus lisibles ici que dans le dictionnaire).
type Texte = { fr: string; ar: string }
interface Theme { cle: string; icone: LucideIcon; couleur: string; titre: Texte; resume: Texte; etapes: Texte[]; lien?: { chemin: string; libelle: Texte } }

const THEMES: Theme[] = [
  {
    cle: 'debut', icone: LogIn, couleur: 'bg-sky-50 text-sky-700',
    titre: { fr: 'Premiers pas', ar: 'البداية' },
    resume: { fr: 'Se connecter, choisir la langue, se repérer dans le menu.', ar: 'تسجيل الدخول، اختيار اللغة، والتنقل في القائمة.' },
    etapes: [
      { fr: 'Connectez-vous avec l\'identifiant et le mot de passe donnés par le propriétaire de la pharmacie.', ar: 'سجّل الدخول باسم المستخدم وكلمة المرور اللذين أعطاك إياهما مالك الصيدلية.' },
      { fr: 'Changez de langue (العربية / Français) avec le bouton en haut de l\'écran.', ar: 'غيّر اللغة (العربية / Français) من الزر الموجود في أعلى الشاشة.' },
      { fr: 'Le menu latéral regroupe les écrans par thème : cliquez sur un groupe pour l\'ouvrir ou le refermer. Le grand bouton vert « Nouvelle vente » est toujours en haut.', ar: 'القائمة الجانبية تجمع الشاشات حسب الموضوع: اضغط على مجموعة لفتحها أو إغلاقها. الزر الأخضر الكبير «بيع جديد» موجود دائمًا في الأعلى.' },
      { fr: 'En haut de l\'écran, cliquez sur l\'icône de l\'utilisateur pour changer votre mot de passe ou vous déconnecter.', ar: 'في أعلى الشاشة، اضغط على أيقونة المستخدم لتغيير كلمة المرور أو لتسجيل الخروج.' },
    ],
  },
  {
    cle: 'caisse', icone: Wallet, couleur: 'bg-teal-50 text-teal-700',
    titre: { fr: 'Ouvrir et fermer la caisse', ar: 'فتح الصندوق وإغلاقه' },
    resume: { fr: 'Aucune vente n\'est possible sans session de caisse ouverte.', ar: 'لا يمكن البيع دون جلسة صندوق مفتوحة.' },
    etapes: [
      { fr: 'Caisse → Session actuelle : choisissez la caisse et saisissez le fond de caisse (les espèces présentes au départ).', ar: 'الصندوق ← الجلسة الحالية: اختر الصندوق وأدخل رصيد البداية (النقد الموجود في البداية).' },
      { fr: 'Pendant la journée, l\'écran affiche les ventes, les remboursements, les entrées ou sorties d\'espèces et les espèces attendues.', ar: 'خلال اليوم تعرض الشاشة المبيعات والمبالغ المستردة وإدخال النقد وإخراجه والنقد المتوقع.' },
      { fr: 'Le soir, « Clôturer la session » : comptez les espèces et saisissez le montant. L\'écart est calculé automatiquement. Une session clôturée ne peut plus être modifiée.', ar: 'في المساء «إغلاق الجلسة»: عدّ النقد وأدخل المبلغ، ويُحسب الفرق تلقائيًا. لا يمكن تعديل جلسة مغلقة.' },
    ],
    lien: { chemin: '/caisse', libelle: { fr: 'Aller à la caisse', ar: 'الذهاب إلى الصندوق' } },
  },
  {
    cle: 'vente', icone: ShoppingCart, couleur: 'bg-marque-50 text-marque-700',
    titre: { fr: 'Faire une vente', ar: 'إجراء عملية بيع' },
    resume: { fr: 'Le bouton vert « Nouvelle vente » en haut du menu.', ar: 'الزر الأخضر «بيع جديد» في أعلى القائمة.' },
    etapes: [
      { fr: 'Cherchez le médicament par son nom ou son code, ou scannez son code-barres.', ar: 'ابحث عن الدواء باسمه أو برمزه أو امسح الباركود.' },
      { fr: 'Choisissez la boîte, la plaquette ou l\'unité, puis la quantité. Le lot le plus proche de la péremption part en premier ; un lot périmé n\'est jamais vendu.', ar: 'اختر العلبة أو الشريط أو الحبة ثم الكمية. تُصرف أولًا الدفعة الأقرب إلى انتهاء الصلاحية، ولا تُباع دفعة منتهية أبدًا.' },
      { fr: 'Choisissez le mode de paiement (espèces, paiement mobile…). Le total des paiements doit être égal au total de la vente.', ar: 'اختر طريقة الدفع (نقدًا، دفع عبر الهاتف…). يجب أن يساوي مجموع الدفعات إجمالي البيع.' },
      { fr: 'Encaissez, puis imprimez le reçu : son format (ticket 80 mm, 58 mm ou demi-A4) et sa langue se règlent dans Paramètres.', ar: 'حصّل المبلغ ثم اطبع الوصل: يُضبط حجمه (تذكرة 80 مم أو 58 مم أو نصف A4) ولغته من الإعدادات.' },
    ],
    lien: { chemin: '/ventes/nouvelle', libelle: { fr: 'Nouvelle vente', ar: 'بيع جديد' } },
  },
  {
    cle: 'retours', icone: Undo2, couleur: 'bg-amber-50 text-amber-700',
    titre: { fr: 'Retours et annulations', ar: 'المرتجعات والإلغاء' },
    resume: { fr: 'Rendre un ou plusieurs articles d\'une vente, ou annuler une vente entière.', ar: 'إرجاع صنف أو أكثر من بيع، أو إلغاء بيع كامل.' },
    etapes: [
      { fr: 'Ventes → Retours clients → « Nouveau retour » (ou Historique des ventes → ouvrez la vente → « Retour partiel »).', ar: 'المبيعات ← مرتجعات العملاء ← «مرتجع جديد» (أو سجل المبيعات ← افتح البيع ← «إرجاع جزئي»).' },
      { fr: 'Indiquez la quantité rendue et l\'état du produit : revendable (il revient en stock) ou non revendable (il ne revient pas en stock).', ar: 'حدّد الكمية المرتجعة وحالة المنتج: قابل للبيع (يعود إلى المخزون) أو غير قابل للبيع (لا يعود إلى المخزون).' },
      { fr: 'Saisissez le motif. Le remboursement est enregistré dans votre session de caisse : il faut donc en avoir une ouverte.', ar: 'اكتب السبب. يُسجَّل المبلغ المسترد في جلسة الصندوق الخاصة بك، لذا يجب أن تكون لديك جلسة مفتوحة.' },
      { fr: 'Un vendeur doit faire approuver le retour ou l\'annulation par le propriétaire ou le pharmacien, qui saisit son identifiant et son code PIN. Une vente qui a déjà un retour ne peut plus être annulée en entier.', ar: 'يحتاج البائع إلى موافقة المالك أو الصيدلي على الإرجاع أو الإلغاء، فيكتب اسم المستخدم ورمز PIN بنفسه. البيع الذي سبق إرجاع جزء منه لا يمكن إلغاؤه كاملًا.' },
    ],
    lien: { chemin: '/retours', libelle: { fr: 'Retours clients', ar: 'مرتجعات العملاء' } },
  },
  {
    cle: 'medicaments', icone: Pill, couleur: 'bg-violet-50 text-violet-700',
    titre: { fr: 'Médicaments et lots', ar: 'الأدوية والدفعات' },
    resume: { fr: 'La fiche produit : prix, conditionnement, code-barres, seuil d\'alerte.', ar: 'بطاقة المنتج: السعر والتعبئة والباركود وحد التنبيه.' },
    etapes: [
      { fr: 'Médicaments : recherchez par nom, code, code-barres ou laboratoire, et filtrez par catégorie.', ar: 'الأدوية: ابحث بالاسم أو الرمز أو الباركود أو المختبر، وصفِّ حسب الفئة.' },
      { fr: 'Pour un médicament absent, « Nouveau médicament » : nom, dosage, forme, prix d\'achat et de vente à la boîte.', ar: 'لدواء غير موجود: «دواء جديد»، ثم الاسم والجرعة والشكل وسعر الشراء والبيع للعلبة.' },
      { fr: 'Les unités par boîte et par plaquette permettent la vente au détail ; le stock est compté en unités.', ar: 'عدد الوحدات في العلبة وفي الشريط يسمح بالبيع بالتجزئة، ويُحسب المخزون بالوحدات.' },
      { fr: 'Le stock minimum (en boîtes) déclenche l\'alerte de stock faible.', ar: 'الحد الأدنى للمخزون (بالعلب) يُطلق تنبيه المخزون الضعيف.' },
    ],
    lien: { chemin: '/medicaments', libelle: { fr: 'Médicaments', ar: 'الأدوية' } },
  },
  {
    cle: 'achats', icone: Package, couleur: 'bg-orange-50 text-orange-700',
    titre: { fr: 'Achats et réception', ar: 'المشتريات والاستلام' },
    resume: { fr: 'Valider une facture fournisseur fait entrer les médicaments en stock.', ar: 'المصادقة على فاتورة المورد تُدخل الأدوية إلى المخزون.' },
    etapes: [
      { fr: 'Achats → « Nouvel achat » : choisissez le fournisseur et le dépôt.', ar: 'المشتريات ← «شراء جديد»: اختر المورد والمستودع.' },
      { fr: 'Ajoutez chaque médicament avec son numéro de lot, sa date de péremption, la quantité et le prix d\'achat.', ar: 'أضف كل دواء برقم دفعته وتاريخ صلاحيته والكمية وسعر الشراء.' },
      { fr: 'Validez : le stock augmente. Enregistrez ensuite les paiements au fournisseur ; le reste dû est suivi dans Fournisseurs et dans le rapport « Compte fournisseur ».', ar: 'صادق على الشراء فيزيد المخزون، ثم سجّل تسديدات المورد ويُتابَع المبلغ المتبقي في صفحة الموردين وفي تقرير «حساب المورّد».' },
    ],
    lien: { chemin: '/achats', libelle: { fr: 'Achats', ar: 'المشتريات' } },
  },
  {
    cle: 'stock', icone: Boxes, couleur: 'bg-emerald-50 text-emerald-700',
    titre: { fr: 'Stock, péremptions et inventaire', ar: 'المخزون والصلاحية والجرد' },
    resume: { fr: 'Suivre les quantités par lot et agir avant la péremption.', ar: 'متابعة الكميات لكل دفعة والتصرف قبل انتهاء الصلاحية.' },
    etapes: [
      { fr: 'État du stock : les onglets, avec leur compteur, montrent le stock faible, les ruptures, les produits bientôt périmés et les périmés.', ar: 'حالة المخزون: التبويبات، مع عدّاداتها، تعرض المخزون الضعيف والنفاد والمنتجات قريبة الانتهاء والمنتهية.' },
      { fr: 'Sorties : retirez du stock les produits périmés ou abîmés, avec le motif.', ar: 'الإخراجات: أخرِج من المخزون المنتجات المنتهية أو التالفة مع ذكر السبب.' },
      { fr: 'Inventaires : comptez le stock réel ; les écarts sont corrigés à la validation.', ar: 'الجرد: عُدّ المخزون الفعلي، وتُصحَّح الفوارق عند المصادقة.' },
      { fr: 'Transferts : déplacez du stock entre le magasin et la pharmacie.', ar: 'التحويلات: انقل المخزون بين المخزن والصيدلية.' },
    ],
    lien: { chemin: '/stock', libelle: { fr: 'État du stock', ar: 'حالة المخزون' } },
  },
  {
    cle: 'depenses', icone: HandCoins, couleur: 'bg-red-50 text-red-700',
    titre: { fr: 'Dépenses', ar: 'المصروفات' },
    resume: { fr: 'Loyer, électricité, salaires… pour connaître le vrai bénéfice (propriétaire).', ar: 'الإيجار والكهرباء والرواتب… لمعرفة الربح الحقيقي (للمالك).' },
    etapes: [
      { fr: 'Gestion → Dépenses → « Nouvelle dépense » : choisissez la catégorie, le libellé et le montant.', ar: 'التسيير ← المصروفات ← «مصروف جديد»: اختر الفئة والبيان والمبلغ.' },
      { fr: 'Payée depuis la caisse : les espèces sont déduites de votre session de caisse. Sinon, la caisse n\'est pas touchée.', ar: 'إذا دُفع من الصندوق خُصم النقد من جلسة الصندوق الخاصة بك، وإلا فلا يتأثر الصندوق.' },
      { fr: 'Une dépense n\'est jamais supprimée : on l\'annule avec un motif ; si elle était payée en caisse, l\'espèce y revient.', ar: 'لا يُحذف أي مصروف: يُلغى مع ذكر السبب، وإن كان مدفوعًا من الصندوق عاد النقد إليه.' },
    ],
    lien: { chemin: '/depenses', libelle: { fr: 'Dépenses', ar: 'المصروفات' } },
  },
  {
    cle: 'rapports', icone: BarChart3, couleur: 'bg-blue-50 text-blue-700',
    titre: { fr: 'Rapports', ar: 'التقارير' },
    resume: { fr: 'Ventes, produits plus et moins vendus, dormants, bénéfice estimé, compte fournisseur, caisse, stock.', ar: 'المبيعات والمنتجات الأكثر والأقل مبيعًا والراكدة والربح التقديري وحساب المورّد والصندوق والمخزون.' },
    etapes: [
      { fr: 'La page Rapports présente les rapports en cartes : cliquez sur celui qui vous intéresse, puis choisissez la période.', ar: 'تعرض صفحة التقارير التقارير على شكل بطاقات: اضغط على التقرير الذي يهمك ثم اختر الفترة.' },
      { fr: 'Les retours clients sont déduits du chiffre d\'affaires. Le bénéfice estimé = ventes − coût d\'achat − dépenses.', ar: 'تُخصم مرتجعات العملاء من رقم الأعمال. الربح التقديري = المبيعات − تكلفة الشراء − المصروفات.' },
      { fr: 'Chaque rapport s\'exporte en Excel, PDF, Word ou CSV, ou s\'imprime. Ils sont réservés au propriétaire.', ar: 'كل تقرير يُصدَّر إلى Excel أو PDF أو Word أو CSV، أو يُطبع. وهي مخصصة للمالك.' },
    ],
    lien: { chemin: '/rapports', libelle: { fr: 'Rapports', ar: 'التقارير' } },
  },
  {
    cle: 'parametres', icone: Settings, couleur: 'bg-slate-100 text-slate-700',
    titre: { fr: 'Paramètres et données', ar: 'الإعدادات والبيانات' },
    resume: { fr: 'Informations de la pharmacie, reçu, sauvegardes, journal d\'audit.', ar: 'معلومات الصيدلية والوصل والنسخ الاحتياطية وسجل التدقيق.' },
    etapes: [
      { fr: 'Paramètres → Pharmacie : nom, logo, téléphones, adresse et NIF imprimés sur les reçus et documents.', ar: 'الإعدادات ← الصيدلية: الاسم والشعار والهواتف والعنوان والرقم الضريبي المطبوعة على الوصولات والوثائق.' },
      { fr: 'Paramètres → Reçus et documents : ticket 80 mm, 58 mm ou demi-A4, en français, en arabe ou dans les deux langues.', ar: 'الإعدادات ← الوصولات والوثائق: تذكرة 80 مم أو 58 مم أو نصف A4، بالفرنسية أو العربية أو بهما.' },
      { fr: 'Administration → Données → Sauvegardes : une sauvegarde est faite automatiquement ; vous pouvez aussi en faire une à tout moment et la copier sur une clé USB.', ar: 'الإدارة ← البيانات ← النسخ الاحتياطية: تُؤخذ نسخة تلقائيًا، ويمكنك أخذ نسخة في أي وقت ونسخها على مفتاح USB.' },
      { fr: 'Données → Journal d\'audit : qui a fait quoi, et quand.', ar: 'البيانات ← سجل التدقيق: من فعل ماذا ومتى.' },
    ],
    lien: { chemin: '/administration/donnees', libelle: { fr: 'Données', ar: 'البيانات' } },
  },
  {
    cle: 'utilisateurs', icone: UserCog, couleur: 'bg-rose-50 text-rose-700',
    titre: { fr: 'Utilisateurs et droits', ar: 'المستخدمون والصلاحيات' },
    resume: { fr: 'Chaque employé a son compte et ne voit que ce qui le concerne.', ar: 'لكل موظف حسابه ولا يرى إلا ما يخصه.' },
    etapes: [
      { fr: 'Propriétaire : tout. Pharmacien : vente, stock et approbations. Vendeur : vente et caisse. Magasinier : réceptions et stock.', ar: 'المالك: كل شيء. الصيدلي: البيع والمخزون والموافقات. البائع: البيع والصندوق. أمين المخزن: الاستلام والمخزون.' },
      { fr: 'Le propriétaire définit le code PIN du pharmacien ; c\'est ce code qui approuve les annulations et les retours demandés par un vendeur.', ar: 'يحدد المالك رمز PIN الخاص بالصيدلي؛ وبهذا الرمز تُعتمد عمليات الإلغاء والإرجاع التي يطلبها البائع.' },
      { fr: 'Les prix d\'achat, les marges et les rapports ne sont visibles que par le propriétaire.', ar: 'أسعار الشراء والهوامش والتقارير لا يراها إلا المالك.' },
    ],
    lien: { chemin: '/administration/utilisateurs', libelle: { fr: 'Utilisateurs', ar: 'المستخدمون' } },
  },
]

export default function Guide() {
  const ar = langueCourante() === 'ar'
  const tx = (texte: Texte) => (ar ? texte.ar : texte.fr)
  const [recherche, setRecherche] = useState('')
  const [ouvert, setOuvert] = useState<string | null>('debut')

  const themes = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    if (!q) return THEMES
    return THEMES.filter((th) => [th.titre, th.resume, ...th.etapes].some((x) => tx(x).toLowerCase().includes(q)))
  }, [recherche]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-4xl">
      <EnTetePage titre={t('Guide')} description={t('Comment utiliser RAQEEM PHARMA, étape par étape.')} />
      <div className="relative mb-5">
        <Search size={18} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="champ rounded-xl py-3 ps-11" placeholder={t('Rechercher dans le guide…')} aria-label={t('Rechercher dans le guide…')}
          value={recherche} onChange={(e) => setRecherche(e.target.value)} />
      </div>

      <div className="space-y-3">
        {themes.map((th) => {
          // Pendant une recherche, tous les thèmes trouvés sont dépliés.
          const estOuvert = ouvert === th.cle || !!recherche.trim()
          return (
            <section key={th.cle} className={`carte overflow-hidden transition ${estOuvert ? 'border-marque-200 shadow-sm' : ''}`}>
              <button type="button" onClick={() => setOuvert(estOuvert && !recherche.trim() ? null : th.cle)} aria-expanded={estOuvert}
                className="flex w-full items-center gap-4 p-4 text-start hover:bg-slate-50/60">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${th.couleur}`}><th.icone size={21} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-nuit-800">{tx(th.titre)}</span>
                  <span className="block text-sm text-slate-500">{tx(th.resume)}</span>
                </span>
                <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${estOuvert ? 'rotate-180' : ''}`} />
              </button>
              {estOuvert && (
                <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                  <ol className="space-y-2.5">
                    {th.etapes.map((e, i) => (
                      <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-marque-600 text-xs font-bold text-white">{i + 1}</span>
                        <span>{tx(e)}</span>
                      </li>
                    ))}
                  </ol>
                  {th.lien && <Link to={th.lien.chemin} className="btn-secondaire btn-petit mt-4">{tx(th.lien.libelle)}</Link>}
                </div>
              )}
            </section>
          )
        })}
        {themes.length === 0 && <p className="carte p-8 text-center text-sm text-slate-500">{t('Aucun résultat dans le guide.')}</p>}
      </div>

      {/* Toujours une aide humaine en dernier recours. */}
      <div className="carte mt-6 flex flex-wrap items-center justify-between gap-4 border-s-4 border-s-[#25D366] p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#25D366]/10 text-[#128C7E]"><LifeBuoy size={22} /></span>
          <div>
            <p className="font-bold text-nuit-800">{t('Besoin d\'aide ?')}</p>
            <p className="text-sm text-slate-500">{t('Notre équipe vous répond sur WhatsApp.')} <span dir="ltr" className="font-medium text-nuit-800">{ASSISTANCE_AFFICHAGE}</span></p>
          </div>
        </div>
        <a href={lienAssistanceWhatsapp()} target="_blank" rel="noreferrer" className="btn rounded-xl bg-[#25D366] px-4 py-2.5 font-semibold text-white hover:bg-[#1ebe5b]">
          <IconeWhatsapp taille={18} /> {t('Écrire sur WhatsApp')}
        </a>
      </div>
    </div>
  )
}
