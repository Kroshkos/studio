import { ChangeEvent } from 'react';

interface Props {
  role: 'teacher' | 'student';
  phone: string;
  email: string;
  purpose: string;
  onRoleChange: (r: 'teacher' | 'student') => void;
  onPhoneChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onPurposeChange: (v: string) => void;
}

/** Маска ввода телефона в формате +7 (___) ___-__-__ */
function maskPhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('8')) d = '7' + d.slice(1);
  if (!d.startsWith('7')) d = '7' + d;
  d = d.slice(0, 11);
  let out = '+7';
  if (d.length > 1) out += ' (' + d.slice(1, 4);
  if (d.length >= 5) out += ') ' + d.slice(4, 7);
  if (d.length >= 8) out += '-' + d.slice(7, 9);
  if (d.length >= 10) out += '-' + d.slice(9, 11);
  return out;
}

export default function BookingForm({
  role,
  phone,
  email,
  purpose,
  onRoleChange,
  onPhoneChange,
  onEmailChange,
  onPurposeChange,
}: Props) {
  const handlePhone = (e: ChangeEvent<HTMLInputElement>) => {
    onPhoneChange(maskPhone(e.target.value));
  };

  return (
    <div className="card">
      <div className="card-title">
        <span className="icon">👤</span> Контактные данные
      </div>

      <div className="form-group">
        <label>Кто вы</label>
        <div className="role-toggle">
          <button
            type="button"
            className={`role-btn ${role === 'teacher' ? 'active' : ''}`}
            onClick={() => onRoleChange('teacher')}
          >
            Преподаватель
          </button>
          <button
            type="button"
            className={`role-btn ${role === 'student' ? 'active' : ''}`}
            onClick={() => onRoleChange('student')}
          >
            Студент
          </button>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="bf-phone">Контактный телефон *</label>
        <input
          id="bf-phone"
          type="tel"
          inputMode="numeric"
          placeholder="+7 (___) ___-__-__"
          value={phone}
          onChange={handlePhone}
          autoComplete="tel"
        />
      </div>

      <div className="form-group">
        <label htmlFor="bf-email">Электронная почта для готового видео *</label>
        <input
          id="bf-email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          autoComplete="email"
        />
      </div>

      <div className="form-group">
        <label htmlFor="bf-purpose">Тема / назначение записи</label>
        <textarea
          id="bf-purpose"
          rows={3}
          placeholder="Например: запись лекции по анатомии"
          value={purpose}
          onChange={(e) => onPurposeChange(e.target.value)}
        />
      </div>
    </div>
  );
}
