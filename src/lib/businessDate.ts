/**
 * Calculates current hotel business date in Bangkok Time (UTC+7).
 * Hotel day rolls over at 04:00 AM.
 */
export function businessDate(now = new Date()): string {
  // Convert current time to Bangkok timezone (UTC+7)
  const bangkokTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  
  // If before 04:00 AM, it still belongs to the previous calendar date
  if (bangkokTime.getHours() < 4) {
    bangkokTime.setDate(bangkokTime.getDate() - 1);
  }

  const year = bangkokTime.getFullYear();
  const month = String(bangkokTime.getMonth() + 1).padStart(2, '0');
  const day = String(bangkokTime.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function businessMonth(now = new Date()): string {
  return businessDate(now).slice(0, 7); // YYYY-MM
}

export function bangkokHour(date: Date): number {
  const bangkokTime = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  return bangkokTime.getHours();
}

export function formatBusinessDateDisplay(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}
