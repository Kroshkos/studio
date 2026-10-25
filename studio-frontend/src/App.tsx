import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Calendar from './components/Calendar';
import TimeSlots from './components/TimeSlots';
import BookingForm from './components/BookingForm';
import AdminPanel from './components/AdminPanel';
import LoginPage from './components/LoginPage';
import MyBookings from './components/MyBookings';
import Modal from './components/Modal';
import { useSession } from './session';
import { useBookingData } from './hooks/useBookingData';
import { createBooking, getSlots } from './api/studio';
import type { LoginResponse, Slot, StudioConfig } from './types';
import { dateKey, formatDateRu } from './utils/dateHelpers';
import { isValidEmail, isValidPhone } from './utils/phone';
import './App.css';

type DeptSection = 'booking' | 'my';

const App: React.FC = () => {
  const { session, login: loginSession, logout } = useSession();
  const { occupied, config, loading, refresh } = useBookingData();

  // === Состояние формы записи (публичная часть) ===
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [role, setRole] = useState<'teacher' | 'student'>('teacher');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [purpose, setPurpose] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [dayBlocked, setDayBlocked] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Разделы подразделения
  const [deptSection, setDeptSection] = useState<DeptSection>('booking');
  const [myRefreshKey, setMyRefreshKey] = useState(0);

  // Админ-панель в модалке
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;
    getSlots(dateKey(selectedDate), role).then(res => {
      if (cancelled) return;
      setSlots(res.slots);
      setDayBlocked(res.blocked);
      setBlockedMessage(res.blockedMessage);
      if (res.blocked) setSelectedSlot(null);
    });
    return () => { cancelled = true; };
  }, [selectedDate, role]);

  const handlePrevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1);
  };
  const handleNextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1);
  };

  const handleSelectDate = (date: Date) => {
    setSelectedDate(date);
    setSelectedSlot(null);
    setStatusMsg(null);
  };

  const handleSubmit = async () => {
    if (!selectedDate || !selectedSlot) return setStatusMsg({ text: 'Выберите дату и время', type: 'error' });
    if (!isValidPhone(phone)) return setStatusMsg({ text: 'Введите телефон по маске +7 (999) 999-99-99', type: 'error' });
    if (!isValidEmail(email)) return setStatusMsg({ text: 'Укажите корректный email — на него придёт готовое видео', type: 'error' });

    setSubmitting(true);
    try {
      await createBooking({ phone, email, purpose: purpose.trim() || undefined, role, date: dateKey(selectedDate), slot: selectedSlot });
      setStatusMsg({ text: 'Запись создана! Готовое видео будет отправлено на указанный email.', type: 'success' });
      setSelectedSlot(null);
      setPhone(''); setEmail(''); setPurpose('');
      refresh();
      setMyRefreshKey(k => k + 1);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setStatusMsg({ text: typeof msg === 'string' ? msg : 'Не удалось создать запись', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogin = useCallback((res: LoginResponse) => {
    loginSession(res);
    if (res.role === 'admin') setShowAdmin(true);
    else setDeptSection('booking');
  }, [loginSession]);

  const handleLogout = () => {
    logout();
    setShowAdmin(false);
  };

  const bookingWizard = useMemo(() => (
    <div className="wizard">
      {/* Шаг 1 */}
      <div className="step">
        <div className="step-header"><span className="step-num">1</span><h3>Выберите дату</h3></div>
        {loading ? <div className="empty-state">Загрузка…</div> : (
          <Calendar
            year={year} month={month} config={config ?? { blockedDays: [], msgTeacher: '', msgStudent: '' }}
            occupied={occupied} selectedDate={selectedDate} onSelectDate={handleSelectDate}
            onPrevMonth={handlePrevMonth} onNextMonth={handleNextMonth}
          />
        )}
      </div>

      {/* Шаг 2 */}
      <div className={`step ${selectedDate ? 'active' : 'disabled'}`}>
        <div className="step-header"><span className="step-num">2</span><h3>Выберите время</h3></div>
        {!selectedDate ? <div className="empty-state">Сначала выберите дату</div> : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>{formatDateRu(selectedDate)}</p>
            <TimeSlots slots={slots} selectedSlot={selectedSlot} blocked={dayBlocked} blockedMessage={blockedMessage} onSelectSlot={setSelectedSlot} />
          </>
        )}
      </div>

      {/* Шаг 3 */}
      <div className={`step ${selectedSlot ? 'active' : 'disabled'}`}>
        <div className="step-header"><span className="step-num">3</span><h3>Контактные данные</h3></div>
        <BookingForm
          role={role} phone={phone} email={email} purpose={purpose}
          onRoleChange={setRole} onPhoneChange={setPhone} onEmailChange={setEmail} onPurposeChange={setPurpose}
        />
        {statusMsg && <div className={`status-msg show ${statusMsg.type}`}>{statusMsg.text}</div>}
        <button className="btn-submit" onClick={handleSubmit} disabled={!selectedSlot || submitting}>
          {submitting ? 'Отправка…' : '✅ Записаться в видеостудию'}
        </button>
      </div>
    </div>
  ), [loading, config, occupied, year, month, selectedDate, slots, selectedSlot, dayBlocked, blockedMessage,
      role, phone, email, purpose, statusMsg, submitting, refresh]);

  // === Экран входа ===
  if (!session) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // === Администратор ===
  if (session.role === 'admin') {
    return (
      <div className="app-shell">
        <header className="topbar">
          <div className="topbar-title"><span className="logo">🎬</span> Видеостудия — администрирование</div>
          <div className="topbar-user">
            <span className="user-chip admin">⚙️ {session.name}</span>
            <button className="btn-secondary btn-sm" onClick={() => setShowAdmin(true)}>Панель администратора</button>
            <button className="btn-secondary btn-sm" onClick={handleLogout}>Выйти</button>
          </div>
        </header>
        <main className="container narrow">
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ marginBottom: 8 }}>Добро пожаловать, администратор!</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
              Откройте панель, чтобы создавать подразделения, отслеживать этапы записей, переносить и удалять их,
              бронировать студию на нужный день и время.
            </p>
            <button className="btn-submit" style={{ marginTop: 0 }} onClick={() => setShowAdmin(true)}>Открыть панель администрирования</button>
          </div>
        </main>
        <Modal isOpen={showAdmin} onClose={() => setShowAdmin(false)} className="modal-admin">
          <AdminPanel
            token={session.token}
            config={config ?? { blockedDays: [], msgTeacher: '', msgStudent: '' }}
            onConfigUpdate={(c: StudioConfig) => refresh()}
            onDataChanged={() => refresh()}
          />
        </Modal>
      </div>
    );
  }

  // === Подразделение ===
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-title"><span className="logo">🎬</span> Видеостудия</div>
        <nav className="section-tabs">
          <button className={`section-tab ${deptSection === 'booking' ? 'active' : ''}`} onClick={() => setDeptSection('booking')}>✍️ Запись в студию</button>
          <button className={`section-tab ${deptSection === 'my' ? 'active' : ''}`} onClick={() => { setDeptSection('my'); setMyRefreshKey(k => k + 1); }}>📋 Мои записи</button>
        </nav>
        <div className="topbar-user">
          <span className="user-chip">{session.name}</span>
          <button className="btn-secondary btn-sm" onClick={handleLogout}>Выйти</button>
        </div>
      </header>

      <main className="container">
        {deptSection === 'booking' ? bookingWizard : (
          <div className="card" style={{ maxWidth: 760, margin: '0 auto' }}>
            <div className="card-title"><span className="icon">📋</span> Мои записи — {session.name}</div>
            <MyBookings refreshKey={myRefreshKey} />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
