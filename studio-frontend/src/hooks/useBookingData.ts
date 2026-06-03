import { useEffect, useState } from 'react';
import { getAllBookings, getConfig } from '../api/studio';
import { Booking, StudioConfig } from '../types';

export const useBookingData = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [config, setConfig] = useState<StudioConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const [b, c] = await Promise.all([getAllBookings(), getConfig()]);
    setBookings(b);
    setConfig(c);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  return { bookings, config, loading, refresh };
};