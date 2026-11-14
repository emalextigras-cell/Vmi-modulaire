# VMI Purevent — version 13 modulaire

Copie de travail indépendante du dépôt source `emalextigras-cell/Vmi`. Le dépôt d'origine reste intact.

## Organisation des fichiers

- `index.html` : structure et composants de l'interface.
- `css/style.css` : styles, affichage mobile et thèmes.
- `js/app.js` : orchestration de l'application, connexion BLE, stockage, historique, import/export et événements.
- `js/modules/bluetooth-protocol.js` : UUID, CRC et construction des trames Bluetooth VMI.
- `js/modules/psychrometry.js` : humidité absolue, point de rosée et indicateurs hygrométriques.
- `js/modules/analysis.js` : tendances temporelles, comparaison descriptive des niveaux manuels et inventaire des champs énergétiques bruts.
- `buildHygrometricDiagnosis()` dans `analysis.js` : diagnostic hygrométrique explicable, avec un indicateur heuristique de couverture des données, des constats argumentés et des limites explicites.
- `js/modules/legacy-migration.js` : conversion des anciennes lignes historiques, sans modifier le schéma IndexedDB.
- `js/modules/date-utils.js` : dates, normalisation et constantes partagées.
- `js/modules/chart-renderer.js` : graphiques SVG, gestion des courbes et infobulles tactiles.
- `manifest.json` : configuration de l'application installable.
- `sw.js` : service worker et cache des ressources.

## Déploiement GitHub Pages

Dans **Settings → Pages**, sélectionner la branche `main` et le dossier `/(root)`. Ouvrir ensuite l'adresse HTTPS dans Chrome sur Android pour utiliser Web Bluetooth.

Fermer VMI+ avant de se connecter : la VMI n'accepte qu'une seule connexion simultanée.

## Sécurité et limites

- Les changements de vitesse, boost et mode vacances restent manuels.
- Les commandes sont envoyées séquentiellement et leur état est vérifié par retour de la VMI.
- Aucun pilotage automatique par IA n'est activé.
- Les données sont conservées localement dans IndexedDB.
- Les indicateurs hygrométriques sont indicatifs. La valeur « Debit » exportée par VMI+ est conservée et tracée comme valeur brute (unité non précisée).
- Les comparaisons de vitesses n'utilisent que les niveaux manuels explicitement enregistrés en direct ; aucun code brut VMI+ n'est converti en niveau 1/2/3.
- Le régime moteur est présenté en tr/min lorsqu'il est disponible. Les valeurs Débit, PWM et Cons DP restent brutes tant que leur signification/unité n'est pas confirmée.
- Sans mesure électrique fiable en W ou kWh et sans débit validé, l'application ne calcule ni consommation, ni rendement, ni optimum énergétique.

## Tests locaux

- Installer une version récente de Node.js.
- Lancer `npm test` pour exécuter les tests de conversion des exports VMI+.
- Les tests vérifient la lecture des colonnes `Vitesse` et `Debit` du CSV, conservent les valeurs brutes et isolent les calculs de comparaison des trois vitesses manuelles.

## Vérifications à effectuer sur la VMI réelle

1. Connexion et déconnexion Bluetooth.
2. Mesures en direct et état de la VMI.
3. Téléchargement de l'historique depuis la VMI.
4. Import d'un export CSV ou XLSX VMI+.
5. Graphiques et comparaison des vitesses.
6. Export CSV, sauvegarde JSON et restauration.

Les analyses par vitesse sont descriptives : nombre de relevés, jours couverts, jours communs avec les autres niveaux analysables, humidité relative et absolue médianes, écart d'humidité absolue salon − air entrant, part des relevés où l'air entrant est plus sec, durée couverte et régime moteur médian. Une seconde lecture regroupe les niveaux manuels par tranches horaires locales de six heures ; elle n'affiche une comparaison que si au moins deux niveaux ont chacun cinq relevés minimum et au moins deux dates communes dans la même tranche. Elle réduit certaines différences d'horaires, sans contrôler la météo, l'occupation ni les apports d'humidité. Les jours communs aident à repérer les comparaisons qui reposent sur des périodes différentes ; ils ne neutralisent pas les différences d'heure, de météo ou d'occupation. Elles ne désignent pas automatiquement une vitesse optimale.
7. Commandes manuelles, en vérifiant leur effet réel sur la VMI.

La version modulaire doit être validée sur l'appareil avant de remplacer l'application utilisée au quotidien.


## Organisation JavaScript (v13)

Le point d'entrée reste `js/app.js`. Les responsabilités sont réparties dans les modules :

- `core.js` : utilitaires communs et version de l'application.
- `analysis.js` : statistiques et médianes.
- `store.js` : persistance IndexedDB.
- `charts.js` : point d'entrée du rendu graphique.
- `ble.js` : protocole et trames Bluetooth (UUID, CRC, commandes).
- `sync.js` : temporisation du téléchargement de l'historique.
- `dataio.js` : lecture des dates et conversion des lignes CSV/tableur.
- `app.js` : orchestration de l'interface et coordination des modules.

Les modules historiques `date-utils.js`, `psychrometry.js`, `bluetooth-protocol.js` et `chart-renderer.js` sont conservés pour limiter les changements et préserver les calculs et le protocole de la v13.

## Diagnostic hygrométrique explicable

Le moteur croise les mesures simultanées du salon et de l'air entrant : humidité absolue, point de rosée calculé, périodes où l'air entrant est plus sec ou plus humide, tendances journalières et profils horaires. Il restitue des constats accompagnés de leurs mesures justificatives, de pistes d'action et d'un indicateur heuristique de couverture lié au volume, à la durée et à la répartition des données.

Le diagnostic dédoublonne les horodatages, écarte les mesures hors limites et ne prolonge pas les intervalles de plus de deux heures. Il affiche aussi l'intervalle médian entre relevés acceptés, le nombre de trous exclus et le plus grand trou, sans supposer une fréquence d'échantillonnage théorique. Il ne déduit pas le débit réel, la consommation électrique, une panne ou une vitesse optimale. Le point de rosée de l'air n'est pas une température de paroi et ne suffit pas à conclure à un risque de condensation.

Ce moteur est une première couche de diagnostic déterministe et explicable ; ce n'est pas encore un modèle d'apprentissage automatique ni un pilotage automatique.


## Précautions de déploiement et données locales

- Le cache du service worker utilise le préfixe `vmi-modulaire-` et son activation ne supprime que les caches portant ce préfixe. Elle ne doit donc pas effacer le cache de l'application historique `/Vmi/` hébergée sur le même domaine.
- La préversion conserve volontairement la base IndexedDB `VMI_PUREVENT_DB_TEST`. Elle ne lit pas et ne modifie pas la base de production `VMI_PUREVENT_DB`. La migration des données de la v13 vers une future version de production reste à concevoir et valider explicitement ; aucune migration automatique de la base de production n'est effectuée.
- Le CSV VMI+ est désormais lu par un parseur natif : l'import CSV fonctionne sans télécharger SheetJS. La bibliothèque SheetJS reste réservée aux fichiers XLS/XLSX.
- Les durées hygrométriques sont réparties au franchissement interpolé des seuils, en supposant une évolution linéaire entre deux mesures acceptées. Ce calcul reste une estimation et les intervalles supérieurs à deux heures sont exclus.
- Les comparaisons par tranche horaire exigent au moins deux jours calendaires communs entre au moins deux niveaux manuels. Cela ne corrige pas les différences de météo, d'occupation ou d'intensité des apports d'humidité.
- Les bornes d'une journée locale utilisent le calendrier local plutôt qu'une durée fixe de 24 heures, afin de respecter les journées de 23 ou 25 heures lors des changements d'heure.
