import React, { useEffect, useState } from 'react';
import { Booking, StudioConfig } from '../types';
import { getAllBookings, updateConfig, deleteBooking, deleteAllBookings, downloadReport } from '../api/studio';
import { WEEKDAYS_RU_SHORT } from '../constants';

interface AdminPanelProps {
  token: string;
  config: StudioConfig;
  onConfigUpdate: (newConfig: StudioConfig) => void;
  onBookingsChange: () => void;
  onClose: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ token, config, onConfigUpdate, onBookingsChange }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blockedDays, setBlockedDays] = useState<number[]>(config.blockedDays);
  const [msgTeacher, setMsgTeacher] = useState(config.msgTeacher);
  const [msgStudent, setMsgStudent] = useState(config.msgStudent);
  const [stats, setStats] = useState({ total: 0, upcoming: 0, teachers: 0, students: 0 });

  const loadBookings = async () => {
    const data = await getAllBookings();
    setBookings(data);
    const today = new Date(); today.setHours(0,0,0,0);
    setStats({
      total: data.length,
      upcoming: data.filter(b => new Date(b.date) >= today).length,
      teachers: data.filter(b => b.role === 'teacher').length,
      students: data.filter(b => b.role === 'student').length,
    });
  };

  useEffect(() => {
    loadBookings();
  }, []);

  const handleSaveConfig = async () => {
    const newConfig = await updateConfig({ blockedDays, msgTeacher, msgStudent });
    onConfigUpdate(newConfig);
    alert('Настройки сохранены');
  };

  const handleDeleteBooking = async (id: string) => {
    if (confirm('Удалить запись?')) {
      await deleteBooking(id);
      await loadBookings();
      onBookingsChange();
    }
  };

  const handleClearAll = async () => {
    if (confirm('Удалить ВСЕ записи? Это действие нельзя отменить.')) {
      await deleteAllBookings();
      await loadBookings();
      onBookingsChange();
    }
  };

  const handleDownload = async () => {
    const blob = await downloadReport(token);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studio_bookings_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="admin-panel" style={{ maxWidth: 900, width: '95%' }}>
      <h2 style={{ marginBottom: 6 }}>&#9881; Панель администратора</h2>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>Управление записями и настройками студии</p>

      <div className="admin-stats">
        <div className="stat-card"><div className="stat-num">{stats.total}</div><div className="stat-label">Всего записей</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: 'var(--success)' }}>{stats.upcoming}</div><div className="stat-label">Предстоящих</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: 'var(--accent-light)' }}>{stats.teachers} / {stats.students}</div><div className="stat-label">Преп. / Студ.</div></div>
      </div>

      <hr className="section-sep" />

      <div className="config-section">
        <h4>&#128683; Заблокированные дни недели</h4>
        <div className="days-grid">
          {WEEKDAYS_RU_SHORT.map((day, idx) => {
            const dow = idx + 1; // 1=Пн ... 5=Пт
            const isBlocked = blockedDays.includes(dow);
            return (
              <div key={dow} style={{ textAlign: 'center' }}>
                <div className={`day-toggle ${isBlocked ? 'active' : ''}`} onClick={() => setBlockedDays(prev => prev.includes(dow) ? prev.filter(d => d !== dow) : [...prev, dow])}>
                  {day}
                </div>
                <div className="day-toggle-label">{isBlocked ? '🚫 Закрыт' : '✅ Открыт'}</div>
              </div>
            );
          })}
        </div>
        <div className="blocked-msg-wrap"><label>Сообщение для преподавателей:</label><textarea rows={2} value={msgTeacher} onChange={e => setMsgTeacher(e.target.value)} /></div>
        <div className="blocked-msg-wrap"><label>Сообщение для студентов:</label><textarea rows={2} value={msgStudent} onChange={e => setMsgStudent(e.target.value)} /></div>
        <button className="btn-submit" style={{ marginTop: 14 }} onClick={handleSaveConfig}>Сохранить настройки</button>
      </div>

      <hr className="section-sep" />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ fontSize: 15 }}>Все записи</h3>
        <div className="admin-actions">
          <button className="btn-secondary" onClick={loadBookings}>&#8635; Обновить</button>
          <button className="btn-download" onClick={handleDownload}>&#11015; Скачать отчёт CSV</button>
          <button className="btn-danger" onClick={handleClearAll}>&#128465; Очистить все</button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="bookings-table">
          <thead><tr><th>#</th><th>Дата</th><th>Время</th><th>ФИО</th><th>Роль</th><th>Телефон</th><th>Email</th><th>Тема</th><th>Создано</th><th></th></tr></thead>
          <tbody>
            {bookings.map((b, i) => (
              <tr key={b.id}>
                <td>{i+1}</td><td>{b.dateLabel || b.date}</td><td>{b.slot}</td><td>{b.name}</td>
                <td><span className={`role-badge ${b.role}`}>{b.role === 'teacher' ? 'Преп.' : 'Студент'}</span></td>
                <td>{b.phone}</td><td>{b.email || '—'}</td><td>{b.purpose || '—'}</td>
                <td>{new Date(b.createdAt).toLocaleString()}</td>
                <td><button className="delete-btn" onClick={() => handleDeleteBooking(b.id)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminPanel;