import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Booking, DashboardData, Department, StageKey, StudioConfig } from '../types';
import {
  adminCreateBooking, deleteAllBookings, deleteBooking,
  deleteDepartment, downloadReport, getAllBookings, getDashboard, listDepartments,
  setBookingStage, updateConfig,
} from '../api/studio';
import { STAGES } from './BookingCard';
import BookingCard from './BookingCard';
import BookingEditModal from './BookingEditModal';
import DepartmentModal from './DepartmentModal';
import Modal from './Modal';
import { WORK_START, WORK_END } from '../constants';
import { isValidEmail, isValidPhone } from '../utils/phone';

interface AdminPanelProps {
  token: string;
  config: StudioConfig;
  onConfigUpdate: (newConfig: StudioConfig) => void;
  onBookingsChange?: () => void;
}

type Tab = 'dashboard' | 'bookings' | 'departments' | 'settings';

const TABS: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: '📊 Дашборд' },
  { key: 'bookings', label: '📋 Записи' },
  { key: 'departments', label: '🏛 Подразделения' },
  { key: 'settings', label: '⚙️ Настройки' },
];

// Полноценная панель администрирования сервиса видеостудии
const AdminPanel: React.FC<AdminPanelProps> = ({ token, config, onConfigUpdate, onBookingsChange }) => {
  const [tab, setTab] = useState<Tab>('dashboard');

  // Данные
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Фильтры / поиск / сортировка списка записей
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<StageKey | 'all'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'teacher' | 'student'>('all');
  const [deptFilter, setDeptFilter] = useState<number | 'all' | 'guest'>('all');
  const [sortBy, setSortBy] = useState<'dateAsc' | 'dateDesc' | 'createdDesc'>('dateAsc');

  // Модальные окна
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [deptModal, setDeptModal] = useState<{ open: boolean; dept: Department | null }>({ open: false, dept: null });

  // Быстрое бронирование администратором
  const todayKey = new Date().toISOString().slice(0, 10);
  const [bkDate, setBkDate] = useState(todayKey);
  const [bkSlot, setBkSlot] = useState(`${String(WORK_START).padStart(2, '0')}:00`);
  const [bkDeptId, setBkDeptId] = useState<string>('');
  const [bkPhone, setBkPhone] = useState('');
  const [bkEmail, setBkEmail] = useState('');
  const [bkMsg, setBkMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Настройки
  const [blockedDays, setBlockedDays] = useState<number[]>(config.blockedDays);
  const [msgTeacher, setMsgTeacher] = useState(config.msgTeacher);
  const [msgStudent, setMsgStudent] = useState(config.msgStudent);
  useEffect(() => {
    setBlockedDays(config.blockedDays);
    setMsgTeacher(config.msgTeacher);
    setMsgStudent(config.msgStudent);
  }, [config]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [b, d, dash] = await Promise.all([getAllBookings(), listDepartments(), getDashboard()]);
      setBookings(b);
      setDepartments(d);
      setDashboard(dash);
    } catch (err: any) {
      if (err?.response?.status === 401) setError('Сессия истекла — войдите заново');
      else setError('Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const afterMutation = () => {
    loadAll();
    onBookingsChange?.();
  };

  // === Действия ===
  const handleStageChange = async (id: string, stage: StageKey) => {
    try {
      await setBookingStage(id, stage);
      afterMutation();
    } catch { setError('Не удалось обновить этап'); }
  };

  const handleDeleteBooking = async (id: string) => {
    if (!confirm('Удалить запись? Это действие нельзя отменить.')) return;
    await deleteBooking(id);
    afterMutation();
  };

  const handleClearAll = async () => {
    if (!confirm('Удалить ВСЕ записи? Это действие нельзя отменить.')) return;
    await deleteAllBookings();
    afterMutation();
  };

  const handleDownload = async () => {
    const blob = await downloadReport(token);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studio_bookings_${todayKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleQuickBooking = async () => {
    setBkMsg(null);
    if (!isValidPhone(bkPhone)) return setBkMsg({ text: 'Телефон в формате +7 (999) 999-99-99', ok: false });
    if (!isValidEmail(bkEmail)) return setBkMsg({ text: 'Укажите корректный email', ok: false });
    try {
      await adminCreateBooking({
        date: bkDate, slot: bkSlot, phone: bkPhone, email: bkEmail,
        role: 'teacher', purpose: 'Бронь администратора',
        departmentId: bkDeptId ? Number(bkDeptId) : undefined,
      });
      setBkMsg({ text: 'Студия забронирована ✅', ok: true });
      setBkPhone(''); setBkEmail('');
      afterMutation();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setBkMsg({ text: typeof msg === 'string' ? msg : 'Не удалось забронировать', ok: false });
    }
  };

  const handleSaveConfig = async () => {
    const newConfig = await updateConfig({ blockedDays, msgTeacher, msgStudent });
    onConfigUpdate(newConfig);
    alert('Настройки сохранены');
  };

  const handleDeleteDept = async (d: Department) => {
    if (!confirm(`Удалить подразделение «${d.name}»? Его записи останутся, но станут гостевыми.`)) return;
    await deleteDepartment(d.id);
    afterMutation();
  };

  // === Фильтрация и сортировка записей ===
  const filteredBookings = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = bookings.filter(b => {
      if (stageFilter !== 'all' && b.stageKey !== stageFilter) return false;
      if (roleFilter !== 'all' && b.role !== roleFilter) return false;
      if (deptFilter === 'guest' && b.departmentId) return false;
      if (typeof deptFilter === 'number' && b.departmentId !== deptFilter) return false;
      if (q) {
        const hay = [b.phone, b.email, b.purpose ?? '', b.date, b.slot, b.department?.name ?? b.createdBy]
          .join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sortBy === 'createdDesc') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      const ka = `${a.date} ${a.slot}`, kb = `${b.date} ${b.slot}`;
      return sortBy === 'dateAsc' ? ka.localeCompare(kb) : kb.localeCompare(ka);
    });
    return list;
  }, [bookings, search, stageFilter, roleFilter, deptFilter, sortBy]);

  const slotsList: string[] = [];
  for (let h = WORK_START; h < WORK_END; h++) slotsList.push(`${String(h).padStart(2, '0')}:00`);

  const WEEK_DAYS = [
    { n: 1, l: 'Пн' }, { n: 2, l: 'Вт' }, { n: 3, l: 'Ср' }, { n: 4, l: 'Чт' },
    { n: 5, l: 'Пт' }, { n: 6, l: 'Сб' }, { n: 7, l: 'Вс' },
  ];

  return (
    <div className="admin-panel">
      <div className="admin-head">
        <h2>⚙️ Панель администрирования</h2>
        <div className="admin-actions">
          <button className="btn-secondary" onClick={loadAll}>↻ Обновить</button>
          <button className="btn-download" onClick={handleDownload}>⬇ Отчёт CSV</button>
        </div>
      </div>

      {error && <div className="status-msg show error">{error}</div>}
      {loading && <div className="empty-state">Загрузка…</div>}

      <nav className="admin-tabs">
        {TABS.map(t => (
          <button key={t.key} className={`admin-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>

      {/* === ДАШБОРД === */}
      {tab === 'dashboard' && dashboard && (
        <div className="admin-section">
          <div className="admin-stats">
            <div className="stat-card">
              <div className="stat-num">{dashboard.total}</div>
              <div className="stat-label">Всего записалось</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{dashboard.teachers}</div>
              <div className="stat-label">Преподавателей</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{dashboard.students}</div>
              <div className="stat-label">Студентов</div>
            </div>
          </div>

          <h4 style={{ margin: '18px 0 10px' }}>Этапы обработки видео</h4>
          <div className="stage-stats">
            {STAGES.map((s, idx) => {
              const count = dashboard.stages.find(st => st.key === s.key)?.count ?? 0;
              const pct = dashboard.total ? Math.round((count / dashboard.total) * 100) : 0;
              return (
                <div key={s.key} className={`stage-stat-card stage-${s.key}`}>
                  <div className="stage-stat-head">
                    <span className="stage-dot">{idx + 1}</span>
                    <span className="stage-stat-label">{s.label}</span>
                  </div>
                  <div className="stage-stat-num">{count}</div>
                  <div className="stage-progress"><div className="stage-progress-fill" style={{ width: `${pct}%` }} /></div>
                  <div className="stage-stat-pct">{pct}% всех записей</div>
                </div>
              );
            })}
          </div>

          <h4 style={{ margin: '18px 0 10px' }}>Быстрое бронирование студии</h4>
          <div className="quick-booking card-in-panel">
            <div className="form-row-2">
              <div className="form-group">
                <label>Дата</label>
                <input type="date" value={bkDate} min={todayKey} onChange={e => setBkDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Время</label>
                <select value={bkSlot} onChange={e => setBkSlot(e.target.value)}>
                  {slotsList.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label>Подразделение</label>
                <select value={bkDeptId} onChange={e => setBkDeptId(e.target.value)}>
                  <option value="">— не указано —</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Телефон контакта</label>
                <input type="tel" value={bkPhone} onChange={e => setBkPhone(e.target.value)} placeholder="+7 (999) 999-99-99" />
              </div>
            </div>
            <div className="form-group">
              <label>Email для готового видео</label>
              <input type="email" value={bkEmail} onChange={e => setBkEmail(e.target.value)} placeholder="video@university.ru" />
            </div>
            {bkMsg && <div className={`status-msg show ${bkMsg.ok ? 'success' : 'error'}`}>{bkMsg.text}</div>}
            <button className="btn-submit" style={{ marginTop: 6 }} onClick={handleQuickBooking}>📌 Забронировать студию</button>
          </div>
        </div>
      )}

      {/* === ЗАПИСИ === */}
      {tab === 'bookings' && (
        <div className="admin-section">
          <div className="filters-bar">
            <input
              className="filter-search" type="text" placeholder="🔍 Поиск: телефон, email, тема, дата…"
              value={search} onChange={e => setSearch(e.target.value)}
            />
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value as StageKey | 'all')}>
              <option value="all">Все этапы</option>
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value as 'all' | 'teacher' | 'student')}>
              <option value="all">Все роли</option>
              <option value="teacher">Преподаватели</option>
              <option value="student">Студенты</option>
            </select>
            <select value={String(deptFilter)} onChange={e => setDeptFilter(e.target.value === 'all' ? 'all' : e.target.value === 'guest' ? 'guest' : Number(e.target.value))}>
              <option value="all">Все подразделения</option>
              <option value="guest">Гости / без подразделения</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
              <option value="dateAsc">Дата ↑ (ближайшие)</option>
              <option value="dateDesc">Дата ↓ (поздние)</option>
              <option value="createdDesc">Сначала новые</option>
            </select>
            <button className="btn-danger" onClick={handleClearAll}>🗑 Очистить все</button>
          </div>

          <div className="results-count">
            Показано {filteredBookings.length} из {bookings.length}
          </div>

          {filteredBookings.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>Записи не найдены</div>
          ) : (
            <div className="booking-cards-grid">
              {filteredBookings.map(b => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  onStageChange={handleStageChange}
                  onEdit={setEditBooking}
                  onDelete={handleDeleteBooking}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* === ПОДРАЗДЕЛЕНИЯ === */}
      {tab === 'departments' && (
        <div className="admin-section">
          <div className="admin-head">
            <h3 style={{ fontSize: 15 }}>Подразделения ({departments.length})</h3>
            <button className="btn-submit" style={{ margin: 0 }} onClick={() => setDeptModal({ open: true, dept: null })}>
              ➕ Создать подразделение
            </button>
          </div>
          <p className="modal-note">Логин входа подразделения — его наименование. Пароль задаёт администратор.</p>
          <div className="table-wrap">
            <table className="bookings-table">
              <thead><tr><th>#</th><th>Наименование (логин)</th><th>Записей</th><th>Создано</th><th></th></tr></thead>
              <tbody>
                {departments.map((d, i) => (
                  <tr key={d.id}>
                    <td>{i + 1}</td>
                    <td>{d.name}</td>
                    <td>{d._count?.bookings ?? '—'}</td>
                    <td>{new Date(d.createdAt).toLocaleDateString()}</td>
                    <td className="row-actions">
                      <button className="icon-btn" title="Изменить имя / пароль" onClick={() => setDeptModal({ open: true, dept: d })}>✏️</button>
                      <button className="icon-btn danger" title="Удалить" onClick={() => handleDeleteDept(d)}>🗑️</button>
                    </td>
                  </tr>
                ))}
                {departments.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16 }}>
                    Подразделений пока нет — создайте первое
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === НАСТРОЙКИ === */}
      {tab === 'settings' && (
        <div className="admin-section config-section">
          <h4>🛑 Заблокированные дни недели</h4>
          <div className="days-grid">
            {WEEK_DAYS.map(({ n, l }) => {
              const isBlocked = blockedDays.includes(n);
              return (
                <div key={n} style={{ textAlign: 'center' }}>
                  <div
                    className={`day-toggle ${isBlocked ? 'active' : ''}`}
                    onClick={() => setBlockedDays(prev => prev.includes(n) ? prev.filter(d => d !== n) : [...prev, n])}
                  >
                    {l}
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
      )}

      {/* Модалка редактирования записи */}
      {editBooking && (
        <Modal isOpen onClose={() => setEditBooking(null)} className="modal-form-wrap">
          <BookingEditModal
            booking={editBooking}
            departments={departments}
            onClose={() => setEditBooking(null)}
            onSaved={afterMutation}
          />
        </Modal>
      )}

      {/* Модалка подразделения */}
      {deptModal.open && (
        <Modal isOpen onClose={() => setDeptModal({ open: false, dept: null })} className="modal-form-wrap">
          <DepartmentModal
            department={deptModal.dept}
            onClose={() => setDeptModal({ open: false, dept: null })}
            onSaved={afterMutation}
          />
        </Modal>
      )}
    </div>
  );
};

export default AdminPanel;
