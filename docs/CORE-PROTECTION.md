# Protection du cœur VMI

## Objectif

Faire évoluer l'application sans dégrader les fonctions qui assurent la communication avec la VMI, la conservation des données et la fiabilité des analyses.

Cette politique s'applique aux branches de développement. La branche `main` reste la référence stable.

## Zones sensibles

Les fichiers et fonctions ci-dessous sont considérés comme protégés :

- **Bluetooth et commandes** : `js/app.js`, `js/ble.js`, `js/modules/bluetooth-protocol.js` et tout code qui construit, envoie ou interprète les trames.
- **Synchronisation et historique** : `js/modules/sync.js`, `js/modules/history.js` et les mécanismes de fusion/dédoublonnage.
- **Import et export** : `js/modules/dataio.js`, les imports CSV/XLSX et les sauvegardes/restaurations.
- **Stockage et migrations** : `js/modules/store.js`, IndexedDB et les migrations de données.
- **Calculs de référence** : psychrométrie, humidité absolue, comparaisons de vitesses, diagnostics et contexte climatique.

La liste doit être mise à jour si l'architecture ou les chemins évoluent.

## Règles de modification

1. Ne pas modifier directement `main` : travailler sur une branche et proposer une pull request.
2. Toute modification d'une zone sensible doit inclure un test de non-régression ciblé.
3. Un test doit vérifier le comportement observable (entrée, sortie, état ou effet), pas seulement la présence d'un nom de fonction ou d'une chaîne de caractères.
4. Pour les calculs, conserver des jeux d'essai déterministes avec résultats attendus et unités explicites.
5. Pour les imports, couvrir les formats, dates limites, valeurs manquantes et données invalides.
6. Pour le Bluetooth, ne jamais assimiler une écriture GATT réussie à une commande exécutée par la VMI. Distinguer envoi, accusé/notification et état confirmé.
7. Ne pas changer UUID, trames, CRC, registres, temporisations ou commandes de vitesse/Boost/Vacances sans preuve et validation explicite.
8. Les fonctions de diagnostic et d'aide IA restent consultatives : elles ne pilotent pas directement la VMI.

## Validation avant fusion

- Le workflow **Tests JavaScript** doit réussir sur la pull request.
- Les tests ciblés par les fichiers modifiés doivent réussir.
- Vérifier le diff et confirmer qu'aucune commande VMI, constante de protocole ou migration non prévue n'a changé.
- Les tests automatisés ne remplacent pas un essai Bluetooth sur le matériel réel.
- Après fusion seulement, vérifier l'application déployée et conserver la possibilité de revenir au commit stable.

## Ce que cette protection garantit — et ne garantit pas

Les tests détectent les régressions couvertes. Le workflow CI donne un résultat reproductible avant fusion. En revanche, un fichier n'est pas techniquement « intouchable » par la seule présence de tests.

Pour rendre les contrôles bloquants, configurer dans GitHub une règle de protection de `main` qui :
- impose une pull request ;
- exige le contrôle **Tests JavaScript / node-tests** ;
- interdit les contournements si l'option est disponible ;
- exige une revue avant fusion si une deuxième personne peut assurer cette revue.

La configuration de cette règle dépend des droits d'administration GitHub et n'est pas modifiée par ce dépôt.
