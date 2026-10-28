import React from 'react';
import { Slot } from '../types';

interface TimeSlotsProps {
  slots: Slot[];
  selectedSlot: string | null;
  blocked: boolean;
  blockedMessage: string | null;
  onSelectSlot: (slot: string) => void;
}

const TimeSlots: React.FC<TimeSlotsProps> = ({ slots, selectedSlot, blocked, blockedMessage, onSelectSlot }) => {
  if (blocked) {
    return (
      <div className="notice" style={{ display: 'block' }}>
        {blockedMessage || 'В этот день студия закрыта.'}
      </div>
    );
  }

  const visible = slots.filter((s) => !s.blocked);
  if (!visible.length) {
    return (
      <div className="notice" style={{ display: 'block' }}>
        {blockedMessage || 'На выбранный день нет доступного времени.'}
      </div>
    );
  }

  return (
    <div className="slots-container">
      {visible.map(s => (
        <div
          key={s.slot}
          className={`time-slot ${s.booked ? 'booked' : ''} ${selectedSlot === s.slot ? 'selected' : ''}`}
          title={s.duration && s.duration !== 60 ? `Длительность: ${s.duration} мин` : undefined}
          onClick={() => !s.booked && onSelectSlot(s.slot)}
        >
          {s.slot}{s.endTime ? `–${s.endTime}` : ''}
        </div>
      ))}
    </div>
  );
};

export default TimeSlots;