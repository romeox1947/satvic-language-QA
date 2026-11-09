export function normalizeSupabaseUrl(value: string) {
  return value.trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
}
