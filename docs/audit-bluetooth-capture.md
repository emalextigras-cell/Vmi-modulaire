# Audit Bluetooth — capture HCI VMI+

## Périmètre et méthode

Analyse statique du fichier `btsnoop_hci.log` transmis avec le projet, recoupée avec :
- `js/modules/bluetooth-protocol.js` ;
- `js/modules/ble.js` ;
- les fonctions de connexion, d'interrogation, de téléchargement et de commande de `js/app.js`.

La capture est un fichier BTSnoop v1, transport HCI UART (H4), contenant 4 333 enregistrements HCI. Les observations ci-dessous décrivent uniquement cette session. Elles ne constituent pas une spécification constructeur complète.

## Éléments confirmés par la capture

### Découverte GATT

Les réponses de découverte GATT contiennent les UUID suivants, qui correspondent exactement aux constantes du code :

| Élément | UUID | Handle observé |
|---|---|---:|
| Service capteurs | `0003cab5-0000-1000-8000-00805f9b0131` | plage 0x000C–0x0010 |
| Caractéristique capteurs | `0003caa2-0000-1000-8000-00805f9b0131` | valeur 0x000E |
| Service commandes | `0003cbbb-0000-1000-8000-00805f9b0131` | plage 0x0011–0x0015 |
| Caractéristique commandes | `0003cbb1-0000-1000-8000-00805f9b0131` | valeur 0x0013 |

La séparation des deux canaux utilisée par l'application est donc étayée par cette capture.

### Échanges ATT observés

- 1 890 notifications ATT sur le handle 0x000E.
- 2 notifications ATT sur le handle 0x0013.
- 39 requêtes ATT Write Request transportent une trame applicative vers le handle 0x0013.
- Les trames applicatives émises dans cette capture correspondent au format et au calcul CRC de `frame()` / `timeFrame()` : les 39 CRC de trames sortantes sont conformes au calcul implémenté.

Parmi les notifications du canal capteurs qui commencent par l'en-tête `A5 B6`, la capture contient :
- 1 trame de type 0x01 ;
- 1 trame de type 0x02 ;
- 1 trame de type 0x03 ;
- 1 trame de type 0x04 ;
- 1 trame de type 0x23 ;
- 1 trame de type 0x50 ;
- 1 880 trames de type 0x30.

Quatre autres notifications du canal capteurs ne commencent pas par `A5 B6`. Les deux notifications observées sur le canal commandes sont de type 0x10.

Le flux de type 0x30 est cohérent avec le téléchargement d'historique traité par l'application. La capture confirme la présence des types 0x01, 0x02 et 0x03 que le code traite comme états et mesures capteurs. Elle ne suffit toutefois pas, à elle seule, à certifier la signification physique de chaque octet ni l'exactitude des sondes.

### Trames sortantes observées

Sur le handle 0x0013, les 39 trames sortantes se répartissent ainsi :

| Trame / registre | Occurrences |
|---|---:|
| `frame(0x03, 0)` | 12 |
| `frame(0x06, 0)` | 12 |
| `frame(0x07, 0)` | 11 |
| `timeFrame(...)` | 1 |
| `frame(0x2C, 0)` | 1 |
| `frame(0x20, 0)` | 1 |
| `frame(0x22, 0)` | 1 |

Cela correspond aux séquences d'interrogation périodique, de mise à l'heure et de lancement du téléchargement présentes dans le code. La capture ne démontre pas la sémantique exacte de chaque registre : les registres 0x03, 0x06, 0x07, 0x2C, 0x20 et 0x22 ne doivent donc pas être renommés ou réinterprétés sans preuve supplémentaire.

## Points de vigilance

1. **L'application n'est pas strictement passive lors d'une connexion.** Après connexion, elle lance automatiquement le téléchargement d'historique. Cette séquence appelle d'abord `setClock()`, qui envoie l'heure du téléphone à la VMI, puis envoie les trames 0x2C, 0x20 et 0x22. La mise à l'heure modifie donc bien l'horloge de la VMI ; ce n'est pas une simple lecture.
2. **L'interrogation périodique écrit sur le canal commandes.** Le code envoie les registres 0x03, 0x06 et 0x07 toutes les 12 secondes. La capture confirme ces écritures, mais ne suffit pas à prouver formellement leur caractère sans effet ou leur sémantique de lecture.
3. **Les commandes manuelles ne sont pas validées par cette capture.** Le code associe les registres décimaux 24, 25 et 26 aux commandes de vitesse, boost et vacances. Aucune trame correspondante (0x18, 0x19 ou 0x1A) n'apparaît dans cette session. Leur effet réel et leur séquence de confirmation restent donc non vérifiés par le fichier analysé.
4. **Les notifications de type 0x10 du canal commandes ne sont pas interprétées par le décodeur actuel.** Leur rôle reste inconnu.
5. La présence d'une trame, d'un CRC conforme ou d'une réponse Bluetooth ne prouve pas qu'une commande produit l'effet attendu sur la ventilation.

## Décision de sécurité

Aucun code Bluetooth, UUID, CRC, registre, octet, temporisation ou commande n'a été modifié dans cet audit.

Avant toute évolution du pilotage manuel, il faudra une capture dédiée et corrélée de l'application officielle VMI+ lors d'une action à la fois, afin de distinguer les commandes réellement émises, les réponses et l'état effectivement appliqué. En attendant, les registres non vérifiés doivent rester inchangés et ne pas être utilisés pour automatiser le pilotage.

## Conclusion

La capture valide la découverte des deux services/caractéristiques, le canal de notifications principal, le format CRC des trames sortantes observées et plusieurs séquences déjà utilisées par l'application. Elle ne valide pas les commandes manuelles de vitesse, boost et vacances, ni la sémantique détaillée des registres. Toute automatisation de ces commandes serait prématurée.
