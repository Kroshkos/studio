import React, { useState } from 'react';
import type { Department } from '../types';
import { createDepartment, updateDepartment } from '../api/studio';

interface DepartmentModalProps {
  department: Department | null; // null = создание
  onClose: () => void;
  onSaved: () => void;
}

const DepartmentModal: React.FC<DepartmentModalProps> = ({ department, onClose, onSaved }) => {
  const [name, setName] = useState(department?.name ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError('');
    if (!name.trim()) return setError('Укажите наименование подразделения');
    if (password.length < 6) return setError('Пароль должен быть не короче 6 символов');
    setSaving(true);
    try {
      if (department) await updateDepartment(department.id, name.trim(), password);
      else await createDepartment(name.trim(), password);
      onSaved();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'Не удалось сохранить подразделение');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-form">
      <h2>{department ? `Редактирование: ${department.name}` : 'Новое подразделение'}</h2>
      <p className="modal-note">Логин входа — наименование подразделения. Пароль задаёт администратор.</p>
      <div className="form-group">
        <label>Наименование подразделения *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Например: Кафедра госпитальной терапии" autoFocus />
      </div>
      <div className="form-group">
        <label>{department ? 'Новый пароль *' : 'Пароль *'}</label>
        <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="Минимум 6 символов" />
      </div>
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

export default DepartmentModal;
