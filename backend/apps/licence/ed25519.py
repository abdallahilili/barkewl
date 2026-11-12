"""
Signature Ed25519 en Python pur (implémentation de référence de la RFC 8032, section 6).

Pourquoi pas une bibliothèque ? Les bibliothèques courantes (cryptography, PyNaCl) contiennent des DLL,
que certains Windows bloquent (Smart App Control). Celle-ci n'a aucune dépendance.
Seule la VÉRIFICATION sert dans le produit ; la signature n'est utilisée que par l'outil de l'éditeur.
"""
import hashlib

p = 2**255 - 19
q = 2**252 + 27742317777372353535851937790883648493


def _sha512(s):
    return hashlib.sha512(s).digest()


def _inv(x):
    return pow(x, p - 2, p)


d = -121665 * _inv(121666) % p
_racine_moins_un = pow(2, (p - 1) // 4, p)


def _ajouter(P, Q):
    A, B = (P[1] - P[0]) * (Q[1] - Q[0]) % p, (P[1] + P[0]) * (Q[1] + Q[0]) % p
    C, D = 2 * P[3] * Q[3] * d % p, 2 * P[2] * Q[2] % p
    E, F, G, H = B - A, D - C, D + C, B + A
    return (E * F, G * H, F * G, E * H)


def _multiplier(s, P):
    Q = (0, 1, 1, 0)
    while s > 0:
        if s & 1:
            Q = _ajouter(Q, P)
        P = _ajouter(P, P)
        s >>= 1
    return Q


def _egaux(P, Q):
    return (P[0] * Q[2] - Q[0] * P[2]) % p == 0 and (P[1] * Q[2] - Q[1] * P[2]) % p == 0


def _retrouver_x(y, signe):
    if y >= p:
        return None
    x2 = (y * y - 1) * _inv(d * y * y + 1)
    if x2 == 0:
        return None if signe else 0
    x = pow(x2, (p + 3) // 8, p)
    if (x * x - x2) % p != 0:
        x = x * _racine_moins_un % p
    if (x * x - x2) % p != 0:
        return None
    if (x & 1) != signe:
        x = p - x
    return x


_g_y = 4 * _inv(5) % p
_g_x = _retrouver_x(_g_y, 0)
G = (_g_x, _g_y, 1, _g_x * _g_y % p)


def _compresser(P):
    zinv = _inv(P[2])
    x, y = P[0] * zinv % p, P[1] * zinv % p
    return int.to_bytes(y | ((x & 1) << 255), 32, "little")


def _decompresser(s):
    if len(s) != 32:
        return None
    y = int.from_bytes(s, "little")
    signe = y >> 255
    y &= (1 << 255) - 1
    x = _retrouver_x(y, signe)
    return None if x is None else (x, y, 1, x * y % p)


def _developper_secret(secret):
    if len(secret) != 32:
        raise ValueError("La clé privée doit faire 32 octets.")
    h = _sha512(secret)
    a = int.from_bytes(h[:32], "little")
    a &= (1 << 254) - 8
    a |= 1 << 254
    return a, h[32:]


def _sha512_modq(s):
    return int.from_bytes(_sha512(s), "little") % q


def cle_publique(secret):
    a, _ = _developper_secret(secret)
    return _compresser(_multiplier(a, G))


def signer(secret, message):
    a, prefixe = _developper_secret(secret)
    A = _compresser(_multiplier(a, G))
    r = _sha512_modq(prefixe + message)
    Rs = _compresser(_multiplier(r, G))
    h = _sha512_modq(Rs + A + message)
    s = (r + h * a) % q
    return Rs + int.to_bytes(s, 32, "little")


def verifier(publique, message, signature):
    """Vrai seulement si la signature a été produite avec la clé privée correspondant à `publique`."""
    if len(publique) != 32 or len(signature) != 64:
        return False
    A = _decompresser(publique)
    R = _decompresser(signature[:32])
    if A is None or R is None:
        return False
    s = int.from_bytes(signature[32:], "little")
    if s >= q:
        return False
    h = _sha512_modq(signature[:32] + publique + message)
    return _egaux(_multiplier(s, G), _ajouter(R, _multiplier(h, A)))
