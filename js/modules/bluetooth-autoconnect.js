/**
 * Sélection prudente d'un périphérique Bluetooth déjà autorisé par le navigateur.
 * Ne choisit jamais arbitrairement entre plusieurs appareils.
 */
export function chooseAuthorizedDevice(devices, preferredId = '') {
  const available = Array.isArray(devices)
    ? devices.filter(device => device && device.id && device.gatt)
    : [];

  if (preferredId) {
    const preferred = available.find(device => device.id === preferredId);
    if (preferred) return preferred;
  }

  return available.length === 1 ? available[0] : null;
}
