import { MemoryType, type MemoryTypeValue } from "../memory.js";

export const MEMORY_TYPES = Object.values(MemoryType);
export const CHARACTER_LIMIT = 50_000;
export const SHORT_ID_LENGTH = 8;

export const TYPE_ORDER: MemoryTypeValue[] = ["correction", "decision", "pattern", "preference", "topology", "fact"];

export function shortId(id: string): string {
  return id.slice(0, SHORT_ID_LENGTH);
}

export function formatAge(timestamp: number): string {
  const ms = Date.now() - timestamp;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
