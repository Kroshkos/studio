import React, { useEffect, useState } from 'react';
import type { Booking } from '../types';
import { getMyBookings } from '../api/studio';
import BookingCard from './BookingCard';

interface MyBookingsProps {
  refreshKey?: number;
}

// Раздел «Мои записи» подразделения: только его бронирования (через GET /studio/my/bookings)
const MyBookings: React.FC<MyBookingsProps> = ({ refreshKey }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getMyBookings();
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      setBookings(data.filter(b => b.date >= todayKey));
    } catch (err: any) {
      if (err?.response?.status === 401) setError('Сессия истекла, войдите заново');
      else setError('Не удалось загрузить записи');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [refreshKey]);

  if (loading) return <div className="empty-state">Загрузка…</div>;
  if (error) return <div className="status-msg show error">{error}</div>;
  if (bookings.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 24 }}>
        <div className="icon">📭</div>
        У вашего подразделения пока нет предстоящих записей
      </div>
    );
  }

  return (
    <div className="booking-cards-grid">
      {bookings.map(b => <BookingCard key={b.id} booking={b} />)}
    </div>
  );
};

export default MyBookings;
