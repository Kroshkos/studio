import { createHash } from 'node:crypto';

export function hashData(data: string) {
  const hash = createHash('sha256');
  return hash.update(data).digest('base64').toString();
}
