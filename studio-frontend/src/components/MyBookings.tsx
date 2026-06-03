import React from 'react';
import { Booking } from '../types';

interface MyBookingsProps {
  bookings: Booking[];
}

const MyBookings: React.FC<MyBookingsProps> = ({ bookings }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = bookings
    .filter(b => new Date(b.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot))
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
        Показаны предстоящие записи (все пользователи)
      </div>
      {upcoming.map(b => (
        <div key={b.id} style={{ padding: '8px 10px', borderBottom: '1px solid rgba(10,74,122,0.2)', fontSize: '12px' }}>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{b.dateLabel || b.date} — {b.slot}</div>
          <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
            {b.name} • <span className={`role-badge ${b.role}`}>{b.role === 'teacher' ? 'Преподаватель' : 'Студент'}</span>
          </div>
        </div>
      ))}
    </>
  );
};

export default MyBookings;