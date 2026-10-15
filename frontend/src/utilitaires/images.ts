const TAILLE_MAX_LOGO = 220 // px : le logo est réduit avant enregistrement
const LARGEUR_MAX_ENTETE = 1400 // px : l'en-tête est réduit avant enregistrement

function chargerImage(fichier: File): Promise<{ img: HTMLImageElement; liberer: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier)
    const img = new Image()
    const liberer = () => URL.revokeObjectURL(url)
    img.onload = () => resolve({ img, liberer })
    img.onerror = () => { liberer(); reject(new Error('Image illisible.')) }
    img.src = url
  })
}

/** Réduit le logo choisi (PNG pour conserver la transparence) et le renvoie en data URL. */
export async function lireLogo(fichier: File): Promise<string> {
  const { img, liberer } = await chargerImage(fichier)
  const echelle = Math.min(1, TAILLE_MAX_LOGO / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * echelle)
  canvas.height = Math.round(img.height * echelle)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  liberer()
  return canvas.toDataURL('image/png')
}

/** Réduit une image d'en-tête à une largeur raisonnable (PNG/SVG conservés en PNG, le reste en JPEG). */
export async function lireEntete(fichier: File): Promise<string> {
  const { img, liberer } = await chargerImage(fichier)
  const echelle = Math.min(1, LARGEUR_MAX_ENTETE / img.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * echelle)
  canvas.height = Math.round(img.height * echelle)
  const ctx = canvas.getContext('2d')!
  const png = /png|svg/.test(fichier.type)
  if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  liberer()
  return png ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9)
}
