# Maison Dieppe — Charcutier & Traiteur à Enghien-les-Bains

Site de la boutique **Maison Dieppe** (3 place de Verdun, 95880 Enghien-les-Bains), aux couleurs de la maison
(bleu marine et framboise du logo « MD », façade « charcuterie-traiteur ») et avec les textes de leur Instagram.

## Ce que voit le client (`/`)

1. **Réserver un plat, tout de suite** : en arrivant, le plat du jour, le menu de la semaine et la vitrine,
   chacun avec un bouton **Réserver**. Une petite fenêtre demande le nombre de parts, le jour et l'heure de retrait,
   le nom et le téléphone (mémorisés pour la fois suivante), et c'est fini. Paiement en boutique.
2. **Les avis clients** (« Ce sont vos mots… »), repris des publications Instagram.
3. **Champion de France de la meilleure choucroute 2026.**
4. **La vie de la Maison** : une sélection de publications Instagram (photos et textes d'origine), dans `public/posts.json`.
5. Adresse, horaires, téléphone, Instagram et Facebook.

## Ce que fait l'équipe (`/admin`), depuis le téléphone

- **Plats** : choisir le jour (« Vitrine » ou un jour précis), prendre une photo, taper le nom et le prix → **Publier**.
  Après chaque publication, le jour passe automatiquement au suivant : le menu de la semaine se saisit en 2 minutes.
  Les plats du jour disparaissent tout seuls le lendemain. « Republier » reprend un ancien plat avec sa photo.
- **Commandes** : regroupées par jour de retrait, avec le **récapitulatif cuisine** (« 4 × Filet de bar… »),
  le téléphone du client cliquable, et les boutons Retirée / Annuler.
- **Infos** : téléphone, adresse, horaires, créneaux de retrait, liens, activer ou couper la réservation en ligne.

Au premier lancement, le site est prérempli avec le menu de la semaine et quelques produits de la vitrine tirés de
leur Instagram (sans prix : à compléter dans l'admin).

## Lancer en local

Il faut Node.js 18 ou plus récent.

```bash
npm install
ADMIN_PASSWORD="un-mot-de-passe-solide" npm start
```

Site : http://localhost:3000 — administration : http://localhost:3000/admin

## Variables d'environnement

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Mot de passe de l'espace admin (**à définir obligatoirement**) | `changez-moi` |
| `PORT` | Port HTTP | `3000` |
| `DATA_DIR` | Dossier des données (plats, commandes) et des photos | `./data` |
| `SESSION_SECRET` | Clé de signature des sessions (facultatif) | dérivée du mot de passe |

## Mise en ligne

N'importe quel hébergeur Node.js convient (Render, Railway, Fly.io, un VPS…).
**Important** : `DATA_DIR` doit être sur un disque persistant, sinon plats, commandes et photos sont perdus à chaque
redéploiement (sur Render : ajouter un « Disk » et pointer `DATA_DIR` dessus).
