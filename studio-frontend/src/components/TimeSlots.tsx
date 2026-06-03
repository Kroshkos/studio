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
        {blockedMessage}
      </div>
    );
  }

  return (
    <div className="slots-container">
      {slots.map(s => (
        <div
          key={s.slot}
          className={`time-slot ${s.booked ? 'booked' : ''} ${selectedSlot === s.slot ? 'selected' : ''}`}
          onClick={() => !s.booked && onSelectSlot(s.slot)}
        >
          {s.slot}
        </div>
      ))}
    </div>
  );
};

export default TimeSlots;