/** In-memory Ranger mode per chat. Lost across serverless isolates — /ranger re-enters. */
const rangerChats = new Map<number, number>();
const TTL_MS = 30 * 60 * 1000;

export function enterRanger(chatId: number): void {
  rangerChats.set(chatId, Date.now());
}

export function exitRanger(chatId: number): void {
  rangerChats.delete(chatId);
}

export function isRanger(chatId: number): boolean {
  const started = rangerChats.get(chatId);
  if (started == null) return false;
  if (Date.now() - started > TTL_MS) {
    rangerChats.delete(chatId);
    return false;
  }
  rangerChats.set(chatId, Date.now());
  return true;
}
