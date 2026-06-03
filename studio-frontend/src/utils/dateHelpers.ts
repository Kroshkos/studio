import { MONTHS_RU, WEEKDAYS_RU } from '../constants'; // можно вынести константы

export const formatDateRu = (date: Date): string => {
  return `${date.getDate()} ${MONTHS_RU[date.getMonth()].toLowerCase()} ${date.getFullYear()} г.`;
};

export const dateKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const getMonthDays = (year: number, month: number): (Date | null)[] => {
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Пн = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const result: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) result.push(null);
  for (let d = 1; d <= daysInMonth; d++) result.push(new Date(year, month, d));
  return result;
};

export const isWeekend = (date: Date): boolean => {
  const dow = date.getDay();
  return dow === 0 || dow === 6;
};