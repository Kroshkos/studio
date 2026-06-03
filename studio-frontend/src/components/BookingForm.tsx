import React from 'react';

interface BookingFormProps {
  role: 'teacher' | 'student';
  name: string;
  phone: string;
  email: string;
  purpose: string;
  onRoleChange: (role: 'teacher' | 'student') => void;
  onNameChange: (val: string) => void;
  onPhoneChange: (val: string) => void;
  onEmailChange: (val: string) => void;
  onPurposeChange: (val: string) => void;
}

const BookingForm: React.FC<BookingFormProps> = ({
  role, name, phone, email, purpose, onRoleChange, onNameChange, onPhoneChange, onEmailChange, onPurposeChange,
}) => {
  return (
    <div className="card" style={{ marginBottom: '28px' }}>
      <div className="card-title"><span className="icon">👤</span> Данные пользователя</div>
      <div className="form-group">
        <label>Ваша роль</label>
        <div className="role-toggle">
          <button className={`role-btn ${role === 'teacher' ? 'active' : ''}`} onClick={() => onRoleChange('teacher')}>Преподаватель</button>
          <button className={`role-btn ${role === 'student' ? 'active' : ''}`} onClick={() => onRoleChange('student')}>Студент</button>
        </div>
      </div>
      <div className="form-group">
        <label>Фамилия Имя Отчество *</label>
        <input type="text" value={name} onChange={e => onNameChange(e.target.value)} placeholder="Иванов Иван Иванович" />
      </div>
      <div className="form-group">
        <label>Контактный телефон *</label>
        <input type="tel" value={phone} onChange={e => onPhoneChange(e.target.value)} placeholder="+7 (___) ___-__-__" />
      </div>
      <div className="form-group">
        <label>Email</label>
        <input type="email" value={email} onChange={e => onEmailChange(e.target.value)} placeholder="example@email.com" />
      </div>
      <div className="form-group">
        <label>Тема / цель съёмки</label>
        <textarea value={purpose} onChange={e => onPurposeChange(e.target.value)} placeholder="Опишите кратко цель записи..."></textarea>
      </div>
    </div>
  );
};

export default BookingForm;