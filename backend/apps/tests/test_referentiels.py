"""Référentiels (formes et dosages) : liste lue par tous, modifiée par l'administrateur, préremplie par la migration."""
import importlib

from django.apps import apps as registre
from rest_framework.test import APIClient

from apps.commun.models import JournalAudit
from apps.medicaments.models import Dosage, Forme, Medicament

from .test_flux import BaseTest


class TestReferentiels(BaseTest):
    def client_pour(self, utilisateur):
        c = APIClient()
        c.force_authenticate(utilisateur)
        return c

    def test_formes_et_dosages_crees_modifies_et_journalises_par_l_admin(self):
        for point, modele in (("formes", Forme), ("dosages", Dosage)):
            admin = self.client_pour(self.admin)
            r = admin.post(f"/api/{point}/", {"nom": "  Sirop  " if point == "formes" else " 500 mg "}, format="json")
            self.assertEqual(r.status_code, 201, r.data)
            element = modele.objects.get(pk=r.data["id"])
            self.assertEqual(element.nom, "Sirop" if point == "formes" else "500 mg")  # espaces retirés
            self.assertTrue(element.actif)
            r = admin.patch(f"/api/{point}/{element.pk}/", {"actif": False}, format="json")
            self.assertEqual(r.status_code, 200, r.data)
            element.refresh_from_db()
            self.assertFalse(element.actif)
        self.assertTrue(JournalAudit.objects.filter(entite="Forme", action="CREATION").exists())
        self.assertTrue(JournalAudit.objects.filter(entite="Dosage", action="MODIFICATION").exists())

    def test_doublon_refuse(self):
        Forme.objects.create(nom="Gélule")
        r = self.client_pour(self.admin).post("/api/formes/", {"nom": "Gélule"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_lecture_pour_tous_ecriture_reservee_a_l_admin(self):
        Forme.objects.create(nom="Comprimé")
        Dosage.objects.create(nom="1 g")
        for utilisateur in (self.caissier, self.magasinier):
            client = self.client_pour(utilisateur)
            self.assertEqual(client.get("/api/formes/").status_code, 200)
            self.assertEqual(client.get("/api/dosages/").status_code, 200)
            self.assertEqual(client.post("/api/formes/", {"nom": "Spray"}, format="json").status_code, 403)
            self.assertEqual(client.post("/api/dosages/", {"nom": "2 g"}, format="json").status_code, 403)

    def test_filtre_par_etat_et_recherche(self):
        Forme.objects.create(nom="Comprimé")
        Forme.objects.create(nom="Sirop", actif=False)
        client = self.client_pour(self.caissier)
        actifs = client.get("/api/formes/", {"actif": 1}).data["resultats"]
        self.assertEqual([f["nom"] for f in actifs], ["Comprimé"])
        trouves = client.get("/api/formes/", {"recherche": "sir"}).data["resultats"]
        self.assertEqual([f["nom"] for f in trouves], ["Sirop"])

    def test_la_migration_reprend_les_valeurs_deja_saisies_sans_doublon(self):
        Medicament.objects.create(nom="A", forme="Comprimé", dosage="500 mg")
        Medicament.objects.create(nom="B", forme="Comprimé", dosage="500 mg")
        Medicament.objects.create(nom="C", forme="Comprime", dosage="")  # même forme sans accent : un seul enregistrement
        Medicament.objects.create(nom="D", forme="Gélule", dosage=" 1 g ")
        migration = importlib.import_module("apps.medicaments.migrations.0005_formes_dosages")
        Forme.objects.all().delete()
        Dosage.objects.all().delete()
        migration.remplir_referentiels(registre, None)
        self.assertEqual(sorted(Forme.objects.values_list("nom", flat=True)), ["Comprimé", "Gélule"])
        self.assertEqual(sorted(Dosage.objects.values_list("nom", flat=True)), ["1 g", "500 mg"])
