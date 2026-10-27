import { Booking, STAGE_RU } from '../types';

interface Props {
  bookings: Booking[];
  onCancel?: (id: string) => void;
}

export default function MyBookings({ bookings, onCancel }: Props) {
  if (!bookings.length) {
    return (
      <div className="empty-state">
        <div className="icon">🗂</div>
        У вашего подразделения пока нет записей
      </div>
    );
  }

  const sorted = [...bookings].sort((a, b) =>
    `${a.date} ${a.slot}`.localeCompare(`${b.date} ${b.slot}`),
  );

  return (
    <div className="my-bookings">
      {sorted.map((b) => (
        <div key={b.id} className={`booking-item stage-${b.stage}`}>
          <div className="bi-main">
            <div className="bi-date">
              📅 {b.dateLabel || b.date}, {b.slot}
            </div>
            <div className="bi-meta">
              {b.role === 'teacher' ? 'Преподаватель' : 'Студент'}
              {b.purpose ? ` • ${b.purpose}` : ''}
            </div>
            <div className="bi-contacts">
              ☎ {b.phone} • ✉ {b.email}
            </div>
          </div>
          <div className="bi-side">
            <span className={`stage-badge badge-${b.stage}`}>{STAGE_RU[b.stage]}</span>
            {onCancel && b.stage === 'AWAITING_RECORD' && (
              <button className="btn-danger btn-sm" onClick={() => onCancel(b.id)}>
                Отменить
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
