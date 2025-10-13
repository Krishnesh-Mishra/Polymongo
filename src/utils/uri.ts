// src/utils/uri.ts
export function buildURI(baseURI: string, dbName: string): string {
  const parts = baseURI.split('?');
  let hostPart = parts[0];
  const queryPart = parts[1] ? `?${parts[1]}` : '';
  if (!hostPart.endsWith('/')) {
    hostPart += '/';
  }
  return `${hostPart}${dbName}${queryPart}`;
}