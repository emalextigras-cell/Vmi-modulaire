# Référence matérielle — VMI Purevent Vision'R

## Source

Devis d'installation transmis par l'utilisateur. Le document indique « Caisson VMI Purevent Vision'R », marque « VMI » et modèle « purevent ».

## Caractéristiques explicitement indiquées au devis

| Caractéristique | Valeur |
|---|---:|
| Débit maximum | 350 m³/h |
| Puissance de chauffage électrique maximale | 1 800 W |
| Puissance du moteur maximale | 169 W |
| Alimentation | 230 V – 50 Hz monophasé |
| Installation | Prise d'air en toiture, insufflation en 2 bouches |

Le devis indique également une surface maximale ventilée de 400 m² au niveau de ventilation 1. Cette donnée est reproduite comme information du devis, sans en déduire un volume ni un débit de fonctionnement.

## Règles d'interprétation dans l'application

- 350 m³/h est une limite maximale annoncée au devis, pas le débit permanent et pas une valeur à attribuer automatiquement au mode 3.
- 169 W est la puissance maximale du moteur annoncée au devis ; ce n'est ni une consommation mesurée ni une puissance moyenne.
- 1 800 W est la puissance maximale de chauffage électrique annoncée ; aucune consommation de chauffage ne peut être calculée à partir de cette seule valeur.
- Le module energy-estimate.js conserve une courbe de référence PUREVENT issue de la notice liée dans l'interface, avec un point à 350 m³/h / 99 W pour 195 Pa. La relation exacte entre cette courbe et la puissance maximale moteur de 169 W annoncée au devis n'est pas établie par les éléments disponibles. Ne pas fusionner ces références ni présenter la courbe comme une mesure de la Vision'R installée.
- Le volume du logement de 337 m³ reste une donnée de configuration distincte du débit maximal constructeur.

## Débit VMI+

Le dépôt traite le champ Debit comme un débit en m³/h confirmé dans les notes et calculs existants. L'interface doit utiliser ce libellé cohérent. Les valeurs exportées restent des relevés VMI+ ; elles ne démontrent pas à elles seules le débit réellement distribué dans chaque pièce.
