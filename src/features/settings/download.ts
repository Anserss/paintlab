/** 文件下载与 CSV 序列化（spec 3.8：导出文件名带日期） */

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
