export function buildHistoryFreshnessView({ estimate, lastSync, fmtShort }) {
  if (!estimate) {
    return {
      className: 'advice',
      text: 'Aucun historique mémorisé. Connecte la VMI pour le télécharger : elle ne garde que ses 800 derniers relevés (environ 4 semaines).'
    };
  }

  const { newest, ageDays: age, capacityDays: cap, daysRemaining: left, deadline } = estimate;
  let className = 'advice good';
  let text = `Historique à jour jusqu’au ${fmtShort(newest)} (il y a ${age < 1 ? Math.max(0, Math.round(age * 24)) + ' h' : age.toFixed(1) + ' j'}). La VMI garde environ ${Math.round(cap)} jours de relevés : télécharge avant le ${fmtShort(deadline)}.`;

  if (left <= 1) {
    className = 'advice warn';
    text += ' ⚠ Des relevés ont peut-être déjà été écrasés : connecte-toi maintenant.';
  } else if (age >= 14 || left < 7) {
    className = 'advice warn';
    text += ' Pense à te connecter bientôt.';
  }

  if (lastSync) text += ` Dernière synchronisation : ${fmtShort(lastSync)}.`;
  return { className, text };
}
