/** 文件下载与 CSV 序列化（spec 3.8：导出文件名带日期） */
import { platform } from '@/platform';

export function dateStamp(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return String(date.getFullYear()) + pad(date.getMonth() + 1) + pad(date.getDate());
}

export function pigmentExportName(date = new Date()): string {
  return 'pigment-depot-' + dateStamp(date) + '.pigment.json';
}

export function inventoryCsvName(date = new Date()): string {
  return 'pigment-depot-inventory-' + dateStamp(date) + '.csv';
}

/** CSV 转义：逗号 / 引号 / 换行；加 BOM 便于 Excel 正确识别 UTF-8 */
export function toCsv(rows: string[][]): string {
  const escape = (cell: string): string =>
    /[",\r\n]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell;
  const body = rows.map((row) => row.map(escape).join(',')).join('\r\n');
  return '\uFEFF' + body;
}

/** Blob 下载；无 DOM / 无 createObjectURL 环境返回 false（不抛异常） */
export function saveBlob(blob: Blob, filename: string): boolean {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return false;
  const canCreateUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
  const url = canCreateUrl ? URL.createObjectURL(blob) : '';
  const anchor = document.createElement('a');
  anchor.href = url || '#';
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
  return true;
}

/**
 * 保存文本文件：桌面壳走原生保存框（取消不报错），浏览器退回 a[download]。
 * 返回 'saved' | 'canceled' | 'failed'。
 */
export async function saveTextFile(
  filename: string,
  text: string,
  mime: string,
): Promise<'saved' | 'canceled' | 'failed'> {
  const bridge = platform();
  if (bridge) {
    return bridge.saveFile({ name: filename, mime, data: new TextEncoder().encode(text) });
  }
  return saveBlob(new Blob([text], { type: mime }), filename) ? 'saved' : 'failed';
}

/** 读取导入文件：桌面壳走原生打开框；浏览器返回 null（由 <input type=file> 兜底） */
export async function pickTextFile(accept: string[]): Promise<{ name: string; text: string } | null> {
  const bridge = platform();
  if (!bridge) return null;
  return bridge.openFile({ accept });
}
