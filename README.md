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
- Les indicateurs hygrométriques sont indicatifs. La valeur « Debit » exportée par VMI+ est conservée et tracée en m³/h (unité confirmée).
- Les comparaisons de niveaux manuels utilisent exclusivement le champ d'annotation `Mode` (`vmiModeRaw`) (1/2/3). Le champ historique `vit` et le code `Vitesse` VMI+ restent des données brutes et ne sont jamais assimilés à un niveau manuel. Les exports CSV VMI+ ne fournissent pas, à eux seuls, cette annotation.
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

Les analyses des niveaux manuels sont descriptives et n'utilisent que la valeur du champ `Mode` (`vmiModeRaw`) de l'export VMI+, sans déduction à partir du champ `Vitesse`. Les champs `vit` et `vmiSpeedRaw` ne sont jamais utilisés pour identifier les niveaux 1/2/3. Les comparaisons horaires regroupent les relevés par tranches locales de six heures ; elles exigent au moins cinq relevés par niveau, deux jours distincts et au moins deux jours calendaires communs entre au moins deux niveaux dans la même tranche. Si le champ `Mode` est absent, l'analyse reste indisponible plutôt que de déduire les niveaux à partir de `Vitesse`. Même lorsque les critères d'effectif sont atteints, la comparaison ne contrôle pas la météo, l'occupation ni les apports d'humidité et ne désigne pas une vitesse optimale.
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

## Phase 10 — préparation de l'analyse énergétique

L'import CSV conserve désormais séparément les champs énergétiques ou de fonctionnement supplémentaires de VMI+ : `Cons Res`, `Cons HydroR`, `Cons TMax`, `Kmoteur`, `Jmoteur`, `Kreseau`, `Jreseau`, `Pression Moteur`, `Offset Press`, `% fonct`, `% fonct.1` et `Dcint`. Ils sont affichés dans l'inventaire avec leurs valeurs min/max et leur effectif, sans leur attribuer de signification ni d'unité non documentée. L'inventaire distingue aussi les zéros des valeurs absentes ou non numériques, pour éviter de confondre une valeur nulle avec une mesure manquante. Les deux colonnes exportées sous le même en-tête `% fonct` sont distinguées par leur occurrence dans l'en-tête, afin de ne pas confondre leurs valeurs.

Le régime moteur reste exprimé en tr/min et le débit en m³/h selon les confirmations disponibles. Les valeurs PWM, Cons DP et les autres champs ci-dessus restent bruts. Aucun calcul de watts, kWh, coût, consommation ou rendement n'est effectué tant qu'une mesure électrique et sa définition ne sont pas vérifiées. Des tests dédiés vérifient la conservation des champs et l'absence d'interprétation énergétique abusive.


### Examen de la capture Bluetooth et de l'export VMI+ (novembre 2026)

L'examen statique du fichier btsnoop fourni et de l'export CSV associé apporte les observations suivantes, sans modifier le protocole ni envoyer de commande à la VMI :

- La capture btsnoop est structurellement lisible : 4 333 paquets HCI complets. Le flux contient 1 892 notifications ATT et 43 requêtes d'écriture ATT.
- La caractéristique de notification principale observée utilise le handle ATT `0x000E` (1 890 notifications). Le handle `0x0013` porte les écritures applicatives observées (39 requêtes) ; les handles `0x000F` et `0x0015` reçoivent les écritures d'activation des notifications. Ces handles sont propres à cette capture et ne remplacent pas les UUID GATT utilisés par l'application.
- 1 880 notifications contiennent une trame applicative de type `0x30`, correspondant dans le code V13 au transfert de lignes d'historique. Le flux reconstitué contient 370 relevés horodatés. La capture est donc principalement un transfert d'historique ; elle ne constitue pas une série longue de mesures en direct.
- Les trames de données directes de types `0x01`, `0x02` et `0x03` ne sont présentes qu'une fois chacune dans cette capture. Cela ne suffit pas à valider statistiquement toutes les positions d'octets ni toutes les transitions d'état.
- L'historique transféré comporte des dates récentes et des dates anciennes (jusqu'en 2018), tandis que le compteur de jours de fonctionnement évolue. Le mécanisme de correction d'horloge déjà présent dans V13 doit donc être conservé ; aucune correction nouvelle n'est déduite de cette seule capture.
- Dans le CSV associé (800 lignes), `Debit` prend 7 valeurs distinctes et `Cons Dp` leur correspond une à une dans cet échantillon (corrélation de rang de Spearman = 1). Cela établit une relation observée, pas la signification physique de `Cons Dp` ni son unité.
- Détail vérifié sur les 800 lignes : les couples observés sont exactement `Debit`/`Cons Dp` = 50/17, 74/39, 84/51, 121/112, 124/118, 151/180 et 193/303, sans autre couple dans cet export. `Cons Dp` ne fournit donc pas d'information numérique indépendante de `Debit` dans cet échantillon. Il reste interdit de l'interpréter comme une pression différentielle ou de lui attribuer une unité sans preuve supplémentaire.
- Le CSV fourni (800 lignes de données) est un export distinct de la capture btsnoop : les dates et périodes ne sont pas identiques. Les rapprochements entre les deux fichiers portent donc sur la structure et le format des données, pas sur une synchronisation point par point.
- `PWM (1/1000)` et `Tachy (rpm)` évoluent ensemble (Spearman = 0,88) ; `Pression Moteur` est également corrélée au régime (0,85). Ces corrélations peuvent décrire un état de fonctionnement commun, mais ne prouvent ni l'unité de pression, ni une mesure électrique, ni une relation causale.
- `Kmoteur`, `Jmoteur`, `Kreseau`, `Jreseau`, `Cons HydroR`, `Cons TMax`, `Offset Press`, `% fonct.1` et `Dcint` sont constants sur les 800 lignes. `Cons Res` vaut 4 sur 740 lignes et 12 sur 60. Ces observations ne permettent pas de savoir si les champs `Cons ...` désignent des consignes, des consommations ou autre chose.
- Conclusion : la capture confirme l'organisation générale du transport BLE et le format du flux d'historique, mais ne fournit pas de preuve suffisante pour convertir `Cons Dp`, `Pression Moteur`, `PWM` ou les compteurs en unités physiques. Aucun W, kWh, Pa ou rendement ne doit être calculé à partir de ces seuls champs.

Ces résultats sont documentaires et logiciels uniquement : aucun essai matériel, changement de vitesse, test de commande ou validation Bluetooth sur Android n'a été effectué.

### Analyse complémentaire des champs moteur et résistance (CSV VMI+ fourni)

Les statistiques ci-dessous ont été recalculées sur les 800 lignes de l'export fourni. Elles décrivent cet export précis et ne constituent pas une spécification constructeur.

- `Pression Moteur` varie de 0 à 31,3 et présente 89 valeurs distinctes. Elle évolue fortement avec `Tachy (rpm)` (corrélation de Pearson = 0,964 ; Spearman = 0,849) et avec `PWM (1/1000)` (Pearson = 0,943 ; Spearman = 0,736). Cela suggère que ces champs décrivent des aspects liés du fonctionnement moteur. Cela ne confirme ni que `Pression Moteur` est une pression physique, ni son unité, ni la position du capteur.
- `PWM (1/1000)` varie de 159 à 522 (139 valeurs distinctes) et `Tachy (rpm)` de 618 à 2 144 tr/min (250 valeurs distinctes). Leur corrélation est élevée (Pearson = 0,978 ; Spearman = 0,882). Le libellé PWM et l'échelle écrite dans l'en-tête sont conservés comme tels ; aucune conversion en pourcentage, tension ou puissance n'est faite.
- Par palier de débit, les médianes de `Pression Moteur`, PWM et régime augmentent globalement, mais les plages se chevauchent largement. Ces variables ne permettent donc pas, seules, de reconstruire un débit fiable ni d'identifier une consigne exacte.
- `Cons Res` est placé sous la rubrique `Resistance` dans l'en-tête VMI+ et prend les valeurs 4 (740 lignes) et 12 (60 lignes). La valeur 12 apparaît surtout avec le code brut `Vitesse` 3 (58 lignes) et 5 (2 lignes). Le nom et la rubrique rendent plausible une consigne liée à la résistance, mais cette interprétation n'est pas confirmée. Ce champ ne doit pas être traité comme une consommation électrique.
- `Kmoteur`, `Jmoteur`, `Kreseau` et `Jreseau` sont respectivement constants à 4225, 47, 1268 et 99 sur les 800 lignes. Comme ils ne varient pas dans cet export, il est impossible d'établir s'il s'agit de compteurs, de paramètres, d'identifiants ou de valeurs figées. Aucun calcul d'énergie ou de durée ne doit en être tiré.
- `Offset Press` vaut constamment 10,2. Il pourrait s'agir d'un paramètre de correction associé à une mesure de pression, mais le fichier seul ne permet pas de le confirmer ni de savoir s'il faut l'ajouter ou le soustraire.
- La première colonne `% fonct` vaut 0 dans 743 lignes et varie de 0 à 16 sur l'ensemble. La seconde colonne `% fonct` vaut toujours 0. La sémantique et l'échelle restent à confirmer ; les deux colonnes doivent rester séparées.

### Ce que le code V13 reçoit et conserve

Dans le fichier V13 fourni, les trames directes de type 1, 2 et 3 sont décodées à des positions d'octets explicites. Le traitement de la trame de type 1 conserve notamment l'état filtre, les jours, le volume, la température maximale, le code de vitesse brut, le boost et le mode vacances. Les trames de type 2 et 3 portent les mesures de température et d'humidité des capteurs. Le code V13 fourni ne décode pas depuis ces trames directes les champs `Pression Moteur`, PWM ou `Cons Res`.

Le téléchargement d'historique, lui, transporte des lignes textuelles séparées par des points-virgules. Le parseur historique du fichier V13 fourni ne conservait qu'un sous-ensemble des colonnes pour les graphiques et l'historique. Le module `js/modules/dataio.js` du dépôt modulaire conserve désormais séparément les champs bruts identifiés, dont pression moteur, PWM, Cons Res, compteurs, offset et pourcentages. Cela évite de perdre ces valeurs lors de l'import ; cela ne leur attribue pas pour autant une signification physique.

**Décision pour la suite :** conserver `Pression Moteur`, PWM, `Cons Res`, les compteurs et les pourcentages comme variables brutes de diagnostic. Les utiliser éventuellement pour repérer des changements de comportement ou des anomalies relatives à une référence propre à la VMI, après validation de la qualité et de la stabilité des données. Ne pas les convertir en Pa, W, kWh, coût ou rendement et ne pas déclencher de commande sur leur base.



### Référence descriptive du fonctionnement par mode VMI+

L'interface construit désormais, à partir de l'historique affiché, un profil par valeur du champ `Mode`: effectifs, jours couverts, médianes et plages observées du débit confirmé, du régime moteur et des champs bruts PWM, Pression moteur et Cons DP. Le code `Vitesse` reste strictement séparé et n'est jamais utilisé comme substitut du mode. Cette référence décrit uniquement les données importées ; elle ne qualifie pas un état de normal ou anormal et ne détecte pas encore de panne. Une comparaison entre plusieurs périodes nécessitera plusieurs exports distincts et comparables. Deux tests vérifient la séparation Mode/Vitesse et l'absence de conversion des champs bruts.


## Comparaison de l'évolution du fonctionnement
- Une nouvelle lecture compare deux périodes calendaires successives de 7 jours, en conservant le même champ `Mode` (`vmiModeRaw`) et la même tranche horaire locale de 6 heures.
- Chaque période doit contenir au moins 12 relevés répartis sur au moins 3 jours distincts pour le même Mode et la même tranche horaire.
- Les médianes de débit (m³/h confirmé) et de régime moteur (tr/min confirmé) sont comparées. PWM et Pression moteur sont présentés uniquement comme valeurs brutes, avec unité non confirmée.
- Les écarts absolus et relatifs sont descriptifs. Aucun seuil ne déclenche un diagnostic automatique de filtre encrassé ou de panne.
- Les comparaisons ne neutralisent pas les changements de météo, d'occupation, de réglage, d'entretien ou d'installation. Elles servent à repérer une évolution à examiner, pas à en établir la cause.
- Les données sans champ `Mode` exploitable, ou sans couverture suffisante sur les deux périodes, ne sont pas comparées. Les champs `Vitesse`, `vit` et `vmiSpeedRaw` ne servent jamais à identifier un niveau manuel.
