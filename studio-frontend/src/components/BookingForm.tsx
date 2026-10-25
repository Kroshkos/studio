import React from 'react';
import { formatPhone, isValidPhone } from '../utils/phone';

interface BookingFormProps {
  role: 'teacher' | 'student';
  phone: string;
  email: string;
  purpose: string;
  onRoleChange: (role: 'teacher' | 'student') => void;
  onPhoneChange: (val: string) => void;
  onEmailChange: (val: string) => void;
  onPurposeChange: (val: string) => void;
}

// Данные пользователя: роль + телефон по маске + email для отправки готового видео.
// ФИО не запрашивается.
const BookingForm: React.FC<BookingFormProps> = ({
  role, phone, email, purpose, onRoleChange, onPhoneChange, onEmailChange, onPurposeChange,
}) => {
  return (
    <div className="card" style={{ marginBottom: '28px' }}>
      <div className="card-title"><span className="icon">👤</span> Контактные данные</div>
      <div className="form-group">
        <label>Кто записывается *</label>
        <div className="role-toggle">
          <button className={`role-btn ${role === 'teacher' ? 'active' : ''}`} onClick={() => onRoleChange('teacher')}>Преподаватель</button>
          <button className={`role-btn ${role === 'student' ? 'active' : ''}`} onClick={() => onRoleChange('student')}>Студент</button>
        </div>
      </div>
      <div className="form-group">
        <label>Контактный телефон *</label>
        <input
          type="tel"
          value={phone}
          onChange={e => onPhoneChange(formatPhone(e.target.value))}
          placeholder="+7 (999) 999-99-99"
          inputMode="tel"
        />
        {phone.length > 2 && !isValidPhone(phone) && (
          <div className="field-hint warn">Введите номер полностью: +7 (999) 999-99-99</div>
        )}
      </div>
      <div className="form-group">
        <label>Email для получения готового видео *</label>
        <input type="email" value={email} onChange={e => onEmailChange(e.target.value)} placeholder="example@email.com" autoComplete="email" />
        <div className="field-hint">На этот адрес администратор видеостудии вышлет готовое видео</div>
      </div>
      <div className="form-group">
        <label>Тема / цель съёмки</label>
        <textarea value={purpose} onChange={e => onPurposeChange(e.target.value)} placeholder="Опишите кратко цель записи..."></textarea>
      </div>
    </div>
  );
};

export default BookingForm;
