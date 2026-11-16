# Maintenance sans changement fonctionnel

Ce document décrit les contrôles de maintenance qui peuvent être réalisés sans modifier le comportement de VMI Purevent.

## Périmètre autorisé

- Documentation (README.md et fichiers docs/).
- Tests automatisés qui lisent les fichiers sans les modifier.
- Vérification de cohérence des ressources déclarées dans index.html et sw.js.
- Vérification des identifiants HTML et des ancres internes.

## Périmètre à ne pas modifier dans une opération de maintenance documentaire

- Protocole Bluetooth, UUID, trames, CRC et séquence des commandes.
- Connexion/déconnexion Bluetooth et reconnexion automatique.
- Commandes de vitesse, boost et mode vacances.
- Schéma IndexedDB, migrations, import/export et sauvegardes.
- Formules hygrométriques, thermiques, énergétiques et diagnostics.
- Interface utilisateur et styles utilisés à l'exécution.

Toute évolution touchant ces éléments doit faire l'objet d'une demande et d'une validation distinctes, avec tests ciblés puis essai réel prudent.

## Contrôles automatiques

La commande npm test exécute les tests existants et les contrôles statiques de cohérence du dépôt :

1. les ressources locales référencées par index.html existent ;
2. les identifiants HTML sont uniques et les ancres internes ciblent un identifiant existant ;
3. chaque ressource listée dans le cache initial du service worker existe.

Ces contrôles ne simulent pas une connexion Bluetooth réelle et ne remplacent pas un essai sur l'appareil.

## Procédure recommandée

1. Travailler sur une branche distincte de main.
2. Limiter le diff aux fichiers de documentation et de tests.
3. Exécuter npm test.
4. Vérifier que les fichiers d'exécution de l'application n'ont pas été modifiés.
5. Présenter les changements dans une Pull Request.
6. Ne fusionner qu'après examen.
