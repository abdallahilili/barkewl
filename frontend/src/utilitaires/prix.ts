/** Prix de vente suggéré à partir du prix d'achat de la boîte : +25 % si l'achat est inférieur à 200, +15 % sinon.
 * Règle commune à la fiche médicament et aux lignes d'achat ; la suggestion reste toujours modifiable. */
export const prixVenteSuggere = (achat: number) => Math.round(achat * (achat < 200 ? 1.25 : 1.15) * 100) / 100

/** Même règle pour une saisie de formulaire : texte vide tant que le prix d'achat n'est pas un nombre positif. */
export const prixVenteSuggereTexte = (achat: string) => (Number(achat) > 0 ? String(prixVenteSuggere(Number(achat))) : '')
