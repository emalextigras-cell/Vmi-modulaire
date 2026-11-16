/** Exécute une séquence BLE uniquement dans la session qui l'a démarrée. */
export async function runBleSessionSequence({ token, getToken, isActive, steps }) {
  for (const step of steps) {
    if (getToken() !== token || !isActive()) return false;
    const succeeded = await step();
    if (!succeeded || getToken() !== token || !isActive()) return false;
  }
  return true;
}
