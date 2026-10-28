import React from 'react';
import { MONTHS_RU, WEEKDAYS_SHORT } from '../constants';
import { StudioConfig, Booking, BlockAudience, AUDIENCE_RU } from '../types';
import { dateKey, getMonthDays, isWeekend } from '../utils/dateHelpers';

interface CalendarProps {
  year: number;
  month: number;
  config: StudioConfig;
  role: 'teacher' | 'student';
  bookings: Booking[];
  selectedDate: Date | null;
  onSelectDate: (date: Date, isBlocked: boolean) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

const Calendar: React.FC<CalendarProps> = ({
  year, month, config, role, bookings, selectedDate, onSelectDate, onPrevMonth, onNextMonth,
}) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = getMonthDays(year, month);

  const dayBlockInfo = (date: Date): { blocked: boolean; audience?: BlockAudience } => {
    const dow = date.getDay() === 0 ? 7 : date.getDay();
    if (config.blockedDays.includes(dow) && !isWeekend(date)) return { blocked: true };
    const key = dateKey(date);
    const block = (config.dayBlocks || []).find((b) => b.dateFrom <= key && key <= b.dateTo);
    if (block) {
      if (block.audience === 'all' || block.audience === role) return { blocked: true, audience: block.audience };
      return { blocked: false, audience: block.audience };
    }
    return { blocked: false };
  };

  const handleDateClick = (date: Date | null) => {
    if (!date) return;
    if (date < today) return;
    onSelectDate(date, dayBlockInfo(date).blocked);
  };

  const isSelected = (date: Date) => selectedDate && dateKey(selectedDate) === dateKey(date);
  const hasBookings = (date: Date) => bookings.some(b => b.date === dateKey(date));

  return (
    <div className="calendar">
      <div className="calendar-nav">
        <button className="cal-nav-btn" onClick={onPrevMonth}>&#8249;</button>
        <span className="cal-month">{MONTHS_RU[month]} {year}</span>
        <button className="cal-nav-btn" onClick={onNextMonth}>&#8250;</button>
      </div>
      <div className="calendar-grid">
        {WEEKDAYS_SHORT.map(d => <div key={d} className="cal-dow">{d}</div>)}
        {days.map((date, idx) => {
          if (!date) return <div key={idx} className="cal-day empty" />;
          const isWeekendDay = isWeekend(date);
          const isPast = date < today;
          const { blocked: isBlocked, audience } = dayBlockInfo(date);
          const classes = ['cal-day'];
          if (isWeekendDay) classes.push('weekend');
          if (isPast) classes.push('past');
          if (isBlocked) classes.push('blocked-day');
          else if (audience) classes.push('partially-blocked');
          if (hasBookings(date)) classes.push('has-bookings');
          if (dateKey(date) === dateKey(today)) classes.push('today');
          if (isSelected(date)) classes.push('selected');
          const title = audience && !isBlocked
            ? `Частичная блокировка: недоступно для «${AUDIENCE_RU[audience]}»`
            : undefined;
          return (
            <div
              key={idx}
              className={classes.join(' ')}
              title={title}
              onClick={() => handleDateClick(date)}
            >
              {date.getDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Calendar;