import React, { useEffect, useState } from 'react';
import type { Booking, Department } from '../types';
import { updateBooking } from '../api/studio';
import { WORK_START, WORK_END } from '../constants';
import { formatPhone, isValidPhone } from '../utils/phone';

interface BookingEditModalProps {
  booking: Booking;
  departments: Department[];
  onClose: () => void;
  onSaved: () => void;
}

// Перенос и редактирование брони: дата, время, контакты, роль, подразделение
const BookingEditModal: React.FC<BookingEditModalProps> = ({ booking, departments, onClose, onSaved }) => {
  const [date, setDate] = useState(booking.date);
  const [slot, setSlot] = useState(booking.slot);
  const [phone, setPhone] = useState(booking.phone);
  const [email, setEmail] = useState(booking.email);
  const [role, setRole] = useState<'teacher' | 'student'>(booking.role);
  const [departmentId, setDepartmentId] = useState<string>(booking.departmentId ? String(booking.departmentId) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const slots: string[] = [];
  for (let h = WORK_START; h < WORK_END; h++) slots.push(`${String(h).padStart(2, '0')}:00`);

  useEffect(() => { setError(''); }, [date, slot]);

  const handleSave = async () => {
    setError('');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Некорректная дата');
    if (!isValidPhone(phone)) return setError('Телефон должен быть в формате +7 (999) 999-99-99');
    if (!email.trim()) return setError('Укажите email для отправки видео');
    setSaving(true);
    try {
      await updateBooking(booking.id, {
        date, slot, phone, email, role,
        departmentId: departmentId ? Number(departmentId) : undefined,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-form">
      <h2>Перенос / редактирование записи</h2>
      <div className="form-row-2">
        <div className="form-group">
          <label>Дата</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Время</label>
          <select value={slot} onChange={e => setSlot(e.target.value)}>
            {slots.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label>Телефон</label>
        <input type="tel" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="+7 (999) 999-99-99" />
      </div>
      <div className="form-group">
        <label>Email для готового видео</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <div className="form-row-2">
        <div className="form-group">
          <label>Роль</label>
          <select value={role} onChange={e => setRole(e.target.value as 'teacher' | 'student')}>
            <option value="teacher">Преподаватель</option>
            <option value="student">Студент</option>
          </select>
        </div>
        <div className="form-group">
          <label>Подразделение</label>
          <select value={departmentId} onChange={e => setDepartmentId(e.target.value)}>
            <option value="">— не указано —</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>
      {booking.purpose && <div className="modal-note">Тема съёмки: {booking.purpose}</div>}
      {error && <div className="status-msg show error">{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Отмена</button>
        <button className="btn-submit" style={{ flex: 2, marginTop: 0 }} onClick={handleSave} disabled={saving}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
};

export default BookingEditModal;
