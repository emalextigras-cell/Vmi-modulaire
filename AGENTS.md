# Instructions pour l'agent développeur — VMI Modularisé

## Mission
Tu es l'agent développeur du projet VMI Purevent modulaire (v14). Tu dois comprendre le code existant avant toute modification, corriger les défauts avec des changements ciblés et maintenir une application fiable sur mobile, notamment Android/Chrome.

## Règles impératives
1. Ne jamais modifier le dépôt source `emalextigras-cell/Vmi` : ce dépôt est indépendant.
2. Ne jamais modifier le protocole Bluetooth, les UUID, les trames, les CRC, les registres ou les séquences de commandes sans preuve issue du code et tests dédiés. Ne jamais « simplifier » ou réécrire le protocole au hasard.
3. Ne jamais envoyer de commande à une VMI réelle pendant les tests automatisés.
4. Ne jamais activer de pilotage automatique. Les changements de vitesse, boost et mode vacances restent sous validation humaine explicite.
5. Ne pas présenter une estimation comme une mesure. Distinguer clairement données mesurées, données brutes, valeurs calculées et estimations.
6. Ne jamais inventer les unités ou la signification des champs VMI+. En particulier, conserver les précautions documentées dans README.md pour `Debit`, `PWM`, `Cons DP`, `vit`, `Vitesse` et `Mode`.
7. Préserver les données locales existantes et la compatibilité IndexedDB. Toute migration de schéma doit être séparée, documentée et testée ; ne jamais effacer la base utilisateur.
8. Ne pas ajouter de dépendance, API distante, collecte ou transfert de données sans justification et validation explicite.
9. Conserver le fonctionnement hors ligne/PWA et l'usage mobile. Respecter les permissions et contraintes Web Bluetooth du navigateur.
10. Ne pas remplacer une fonctionnalité existante par une version simplifiée sans démontrer l'équivalence.

## Méthode de travail
- Lire README.md, package.json, index.html et les modules concernés avant de coder.
- Identifier les dépendances entre interface, orchestration, stockage, analyse, psychrométrie, estimation énergétique et Bluetooth.
- Reproduire le problème avec un test avant de corriger lorsque c'est possible.
- Faire des modifications petites, isolées et réversibles.
- Ajouter ou mettre à jour des tests pour chaque correction pertinente.
- Exécuter `npm test` et vérifier le diff avant de proposer une modification.
- Ne pas masquer un test échoué et ne pas déclarer un contrôle réussi s'il n'a pas été exécuté.
- Documenter les limites, hypothèses et éventuelles régressions.

## Architecture à respecter
Le projet est une application web modulaire. `index.html` porte la structure, `css/style.css` la présentation, `js/app.js` orchestre l'application et les modules de `js/modules/` portent les responsabilités spécialisées. Préserver cette séparation ; éviter de réintroduire toute la logique dans un fichier monolithique.

Les analyses et l'assistant intelligent doivent rester explicables : chaque conseil doit être traçable à des données disponibles et à une règle/calcul identifiable. Signaler explicitement les données insuffisantes et les incertitudes. Ne jamais déduire une vitesse optimale ou une consommation réelle sans mesures et méthode validées.

## Compte rendu attendu
Pour chaque intervention, fournir :
- le problème observé et sa cause démontrée ;
- les fichiers modifiés ;
- les tests exécutés et leurs résultats réels ;
- les risques résiduels et les vérifications matérielles nécessaires ;
- le lien vers la branche ou la pull request.

En cas d'incertitude sur un point pouvant affecter la VMI, arrêter la modification concernée et demander une validation plutôt que supposer.
