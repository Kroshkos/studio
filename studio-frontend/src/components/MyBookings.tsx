import React from 'react';
import { OccupiedSlot } from '../types';

interface MyBookingsProps {
  occupied: OccupiedSlot[];
}

const MyBookings: React.FC<MyBookingsProps> = ({ occupied }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Группируем занятость по дате: дата -> список слотов
  const byDate = new Map<string, string[]>();
  for (const o of occupied) {
    if (o.date < todayKey) continue; // только предстоящие
    const list = byDate.get(o.date) ?? [];
    list.push(o.slot);
    byDate.set(o.date, list);
  }

  const upcoming = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 8);

  if (upcoming.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '20px' }}>
        <div className="icon">📭</div>Предстоящих записей нет
      </div>
    );
  }

  return (
    <>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
        Показаны предстоящие занятые слоты (без персональных данных)
      </div>
      {upcoming.map(([date, slots]) => (
        <div key={date} style={{ padding: '8px 10px', borderBottom: '1px solid rgba(10,74,122,0.2)', fontSize: '12px' }}>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{date} — занято</div>
          <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
            {slots.sort().join(', ')}
          </div>
        </div>
      ))}
    </>
  );
};

export default MyBookings;