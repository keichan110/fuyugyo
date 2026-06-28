import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind のクラス名を条件付きで結合し、競合を解決する（shadcn/ui 標準ユーティリティ）。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
