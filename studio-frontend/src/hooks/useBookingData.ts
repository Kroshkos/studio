import { useEffect, useState } from 'react';
import { getOccupiedSlots, getConfig } from '../api/studio';
import { OccupiedSlot, StudioConfig } from '../types';

export const useBookingData = () => {
  const [occupied, setOccupied] = useState<OccupiedSlot[]>([]);
  const [config, setConfig] = useState<StudioConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    // Публичные эндпоинты — не требуют админ-токена и не раскрывают ПДн
    const [o, c] = await Promise.all([getOccupiedSlots(), getConfig()]);
    setOccupied(o);
    setConfig(c);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  return { occupied, config, loading, refresh };
};