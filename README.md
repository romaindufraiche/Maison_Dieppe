# Maison Dieppe — site du restaurant

Site très simple pour un restaurant dont la carte change tous les jours :

- **Page publique** (`/`) : l'ardoise du jour (plats avec photo et prix), un bouton **Réserver**, un bouton **Appeler**, les horaires, l'adresse et les liens Facebook et Instagram.
- **Espace administrateur** (`/admin`), pensé pour le téléphone :
  - **Publier un plat en 10 secondes** : photo (prise avec le téléphone, redimensionnée automatiquement), Entrée / Plat / Dessert, nom, prix → « Publier sur le site ».
  - Case « Nouvelle journée » : retire les plats de la veille en publiant le premier plat du jour.
  - **Historique** : un plat qui revient se remet sur l'ardoise en un clic.
  - **Réservations** : liste des demandes avec le téléphone cliquable, boutons Confirmer / Annuler.
  - **Infos** : nom, slogan, téléphone, adresse, horaires, Facebook, Instagram, activer ou non la réservation en ligne.

Aucune base de données : tout est stocké dans `data/db.json` et les photos dans `data/uploads/`.

## Lancer en local

Il faut Node.js 18 ou plus récent.

```bash
npm install
ADMIN_PASSWORD="un-mot-de-passe-solide" npm start
```

Puis ouvrir http://localhost:3000 (site) et http://localhost:3000/admin (administration).

## Variables d'environnement

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Mot de passe de l'espace admin (**à définir obligatoirement**) | `changez-moi` |
| `PORT` | Port HTTP | `3000` |
| `DATA_DIR` | Dossier des données et des photos | `./data` |
| `SESSION_SECRET` | Clé de signature des sessions (facultatif) | dérivée du mot de passe |

## Mise en ligne

N'importe quel hébergeur Node.js convient (Render, Railway, Fly.io, un VPS…).
**Important** : le dossier `DATA_DIR` doit être sur un disque persistant, sinon les plats et les photos
sont perdus à chaque redéploiement (sur Render : ajouter un « Disk » et pointer `DATA_DIR` dessus).
