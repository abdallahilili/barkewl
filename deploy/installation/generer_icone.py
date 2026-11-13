"""
Génère raqeem.ico (icône du raccourci « RAQEEM PHARMA » sur le bureau) à partir du logo de l'interface
(frontend/public/favicon.svg), sans bibliothèque externe : le logo n'est fait que de rectangles arrondis.
Tailles 16 à 256 px, lissées (suréchantillonnage 4×4), images PNG dans le fichier .ico (Windows Vista+).

    python generer_icone.py          (à relancer seulement si le logo change)
"""
import re
import struct
import zlib
from pathlib import Path

ICI = Path(__file__).resolve().parent
SVG = ICI.parent.parent / "frontend" / "public" / "favicon.svg"
TAILLES = (16, 24, 32, 48, 64, 128, 256)
ECHANTILLONS = 4


def lire_rectangles(texte):
    largeur = float(re.search(r'viewBox="0 0 ([\d.]+)', texte).group(1))
    rectangles = []
    for attributs in re.findall(r"<rect ([^>]*)/>", texte):
        a = dict(re.findall(r'([\w-]+)="([^"]*)"', attributs))
        couleur = a["fill"].lstrip("#")
        rectangles.append((
            float(a.get("x", 0)), float(a.get("y", 0)), float(a["width"]), float(a["height"]), float(a.get("rx", 0)),
            tuple(int(couleur[i:i + 2], 16) for i in (0, 2, 4)),
        ))
    return largeur, rectangles


def dans_rectangle(px, py, x, y, l, h, r):
    if px < x or py < y or px > x + l or py > y + h:
        return False
    cx = min(max(px, x + r), x + l - r)
    cy = min(max(py, y + r), y + h - r)
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r


def dessiner(taille, largeur, rectangles):
    echelle = largeur / taille
    pas = 1 / ECHANTILLONS
    lignes = bytearray()
    for j in range(taille):
        lignes.append(0)  # filtre PNG « aucun »
        for i in range(taille):
            r = g = b = a = 0.0
            for sj in range(ECHANTILLONS):
                for si in range(ECHANTILLONS):
                    px, py = (i + (si + 0.5) * pas) * echelle, (j + (sj + 0.5) * pas) * echelle
                    for x, y, l, h, rx, couleur in reversed(rectangles):  # le dernier dessiné est au-dessus
                        if dans_rectangle(px, py, x, y, l, h, rx):
                            r, g, b, a = r + couleur[0], g + couleur[1], b + couleur[2], a + 1
                            break
            n = ECHANTILLONS * ECHANTILLONS
            if a:
                lignes += bytes((round(r / a), round(g / a), round(b / a), round(255 * a / n)))
            else:
                lignes += b"\0\0\0\0"
    return png(taille, bytes(lignes))


def png(taille, donnees):
    def bloc(type_, contenu):
        return struct.pack(">I", len(contenu)) + type_ + contenu + struct.pack(">I", zlib.crc32(type_ + contenu))
    entete = struct.pack(">IIBBBBB", taille, taille, 8, 6, 0, 0, 0)  # 8 bits, RGBA
    return b"\x89PNG\r\n\x1a\n" + bloc(b"IHDR", entete) + bloc(b"IDAT", zlib.compress(donnees, 9)) + bloc(b"IEND", b"")


def main():
    largeur, rectangles = lire_rectangles(SVG.read_text(encoding="utf-8"))
    images = [dessiner(t, largeur, rectangles) for t in TAILLES]
    entete = struct.pack("<HHH", 0, 1, len(images))
    position = 6 + 16 * len(images)
    repertoire = b""
    for taille, image in zip(TAILLES, images):
        cote = 0 if taille == 256 else taille  # 0 signifie 256 dans le format .ico
        repertoire += struct.pack("<BBBBHHII", cote, cote, 0, 0, 1, 32, len(image), position)
        position += len(image)
    sortie = ICI / "raqeem.ico"
    sortie.write_bytes(entete + repertoire + b"".join(images))
    print(f"{sortie.name} : {len(TAILLES)} tailles, {sortie.stat().st_size // 1024} Ko")


if __name__ == "__main__":
    main()
