import { Bold, Eraser, Italic, Underline } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { htmlSur } from '../utilitaires/texteRiche'

const TAILLES = [10, 12, 14, 16, 18, 22, 28]
const POLICES = [
  { libelle: 'Police', valeur: '' },
  { libelle: 'Arial', valeur: 'Arial, sans-serif' },
  { libelle: 'Times', valeur: "'Times New Roman', serif" },
  { libelle: 'Courier', valeur: "'Courier New', monospace" },
  { libelle: 'Georgia', valeur: 'Georgia, serif' },
  { libelle: 'Verdana', valeur: 'Verdana, sans-serif' },
]

interface Props {
  valeur: string
  onChange: (html: string) => void
  minHeight?: number
}

/** Éditeur minimal : retours à la ligne respectés ; taille et police applicables à la
 * sélection (une ligne, un mot, une partie du paragraphe) ; gras / italique / souligné. */
export function EditeurTexteRiche({ valeur, onChange, minHeight = 70 }: Props) {
  const zone = useRef<HTMLDivElement>(null)
  const derniere = useRef<string | null>(null)

  // N'écrase le contenu que si la valeur vient de l'extérieur (évite de déplacer le curseur).
  useEffect(() => {
    if (zone.current && valeur !== derniere.current) {
      zone.current.innerHTML = htmlSur(valeur)
      derniere.current = valeur
    }
  }, [valeur])

  function emettre() {
    const html = zone.current?.innerHTML ?? ''
    derniere.current = html
    onChange(html)
  }

  function commande(nom: string, argument?: string) {
    zone.current?.focus()
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(nom, false, argument)
    emettre()
  }

  /** Applique une taille en pixels à la sélection (execCommand n'accepte que 7 niveaux : on convertit). */
  function appliquerTaille(px: number) {
    zone.current?.focus()
    document.execCommand('styleWithCSS', false, 'false')
    document.execCommand('fontSize', false, '7')
    zone.current?.querySelectorAll<HTMLElement>("font[size='7']").forEach((f) => {
      const span = document.createElement('span')
      span.style.fontSize = `${px}px`
      span.innerHTML = f.innerHTML
      f.replaceWith(span)
    })
    emettre()
  }

  const bouton = 'flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
  const liste = 'h-7 rounded border border-slate-300 bg-white px-1 text-xs text-slate-700'

  return (
    <div className="rounded-md border border-slate-300 bg-white">
      {/* onMouseDown + preventDefault : garde la sélection dans l'éditeur quand on clique la barre. */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 p-1.5"
        onMouseDown={(e) => { if ((e.target as HTMLElement).tagName !== 'SELECT') e.preventDefault() }}>
        <button type="button" className={bouton} title="Gras" onClick={() => commande('bold')}><Bold size={14} /></button>
        <button type="button" className={bouton} title="Italique" onClick={() => commande('italic')}><Italic size={14} /></button>
        <button type="button" className={bouton} title="Souligné" onClick={() => commande('underline')}><Underline size={14} /></button>
        <select defaultValue="" title="Taille du texte sélectionné" className={liste}
          onChange={(e) => { if (e.target.value) appliquerTaille(Number(e.target.value)); e.target.value = '' }}>
          <option value="">Taille</option>
          {TAILLES.map((t) => <option key={t} value={t}>{t} px</option>)}
        </select>
        <select defaultValue="" title="Police du texte sélectionné" className={liste}
          onChange={(e) => { if (e.target.value) commande('fontName', e.target.value); e.target.value = '' }}>
          {POLICES.map((p) => <option key={p.libelle} value={p.valeur}>{p.libelle}</option>)}
        </select>
        <button type="button" className={bouton} title="Effacer la mise en forme" onClick={() => commande('removeFormat')}><Eraser size={14} /></button>
      </div>
      <div ref={zone} contentEditable suppressContentEditableWarning onInput={emettre} onBlur={emettre}
        className="px-3 py-2 text-sm text-slate-900 outline-none" style={{ minHeight, whiteSpace: 'pre-wrap' }} />
    </div>
  )
}
