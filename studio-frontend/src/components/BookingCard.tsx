import React from 'react';
import type { Booking, StageKey } from '../types';

export const STAGES: { key: StageKey; label: string; short: string }[] = [
  { key: 'waiting', label: 'Ожидает записи', short: 'Ожидание' },
  { key: 'recording', label: 'Запись видео', short: 'Запись' },
  { key: 'processing', label: 'Обработка видео', short: 'Обработка' },
  { key: 'sent', label: 'Видео отправлено', short: 'Отправлено' },
];

interface BookingCardProps {
  booking: Booking;
  onStageChange?: (id: string, stage: StageKey) => void;
  onDelete?: (id: string) => void;
  onEdit?: (booking: Booking) => void;
}

// Карточка брони: вся информация + чекбоксы выполненных этапов
const BookingCard: React.FC<BookingCardProps> = ({ booking, onStageChange, onDelete, onEdit }) => {
  const currentIdx = STAGES.findIndex(s => s.key === booking.stageKey);

  return (
    <div className="booking-card">
      <div className="booking-card-head">
        <div>
          <div className="booking-card-datetime">
            📅 {booking.dateLabel || booking.date} • 🕐 {booking.slot}
          </div>
          <div className="booking-card-sub">
            <span className={`role-badge ${booking.role}`}>
              {booking.role === 'teacher' ? 'Преподаватель' : 'Студент'}
            </span>
            <span className="dept-chip">
              {booking.department?.name ?? (booking.createdBy === 'guest' ? 'Гость' : booking.createdBy)}
            </span>
          </div>
        </div>
        <div className="booking-card-actions">
          {onEdit && <button className="icon-btn" title="Редактировать / перенести" onClick={() => onEdit(booking)}>✏️</button>}
          {onDelete && <button className="icon-btn danger" title="Удалить запись" onClick={() => onDelete(booking.id)}>🗑️</button>}
        </div>
      </div>

      <div className="booking-card-body">
        <div className="bc-row"><span className="bc-key">Телефон:</span><span className="bc-val">{booking.phone}</span></div>
        <div className="bc-row"><span className="bc-key">Email для видео:</span><span className="bc-val">{booking.email}</span></div>
        {booking.purpose && (
          <div className="bc-row"><span className="bc-key">Тема съёмки:</span><span className="bc-val">{booking.purpose}</span></div>
        )}
      </div>

      {onStageChange && (
        <div className="stage-track">
          {STAGES.map((s, idx) => {
            const done = idx <= currentIdx;
            return (
              <label
                key={s.key}
                className={`stage-step ${done ? 'done' : ''}`}
                title={s.label}
              >
                <input
                  type="checkbox"
                  checked={done}
                  onChange={(e) => {
                    // Отметка этапа: вперёд — на выбранный, назад — на предыдущий относительно выбранного
                    const target = e.target.checked ? s.key : STAGES[Math.max(0, idx - 1)].key;
                    onStageChange(booking.id, target);
                  }}
                />
                <span className="stage-dot">{idx + 1}</span>
                <span className="stage-label">{s.short}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BookingCard;
