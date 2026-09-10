interface BrowserStorageLike {
  readonly length: number;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
}

const VIEW_REQUEST_PREFIX = "deva_pending_view_request_";
const VIEW_REQUEST_USER_SCOPE = "deva_pending_view_user_scope";

export function viewRequestStorageKey(userId: string, evidenceId: string): string {
  return `${VIEW_REQUEST_PREFIX}${userId}_VIEW_${evidenceId}`;
}

export function synchronizeViewRequestUser(
  userId: string,
  storage: BrowserStorageLike | null = browserSessionStorage(),
): void {
  if (!storage) return;
  const previousUserId = storage.getItem(VIEW_REQUEST_USER_SCOPE);
  if (previousUserId && previousUserId !== userId) {
    // การเชื่อมต่อ Blockchain: UUID ของ VIEW ต้องไม่ข้าม authenticated user
    // เพราะ backend ใช้ UUID นี้เป็น idempotency identity ของ AccessLog
    clearPendingViewRequestIds(storage);
  }
  storage.setItem(VIEW_REQUEST_USER_SCOPE, userId);
}

export function clearPendingViewRequestIds(
  storage: BrowserStorageLike | null = browserSessionStorage(),
): void {
  if (!storage) return;
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(VIEW_REQUEST_PREFIX)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
  storage.removeItem(VIEW_REQUEST_USER_SCOPE);
}

function browserSessionStorage(): BrowserStorageLike | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}
