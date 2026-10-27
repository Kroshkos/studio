import { useEffect, useState } from 'react';
import './App.css';
import {
  createBooking,
  deleteBooking,
  getConfig,
  getMyBookings,
  getSlots,
  saveSession,
  SessionState,
} from './api/studio';
import { Booking, LoginResponse, SlotsResponse, StudioConfig } from './types';
import Calendar from './components/Calendar';
import TimeSlots from './components/TimeSlots';
import BookingForm from './components/BookingForm';
import MyBookings from './components/MyBookings';
import Modal from './components/Modal';
import LoginPage from './components/LoginPage';
import AdminPanel from './components/AdminPanel';
import { formatDateRu, dateKey } from './utils/dateHelpers';

type View = 'book' | 'mine';

function App() {
  const [session, setSession] = useState<SessionState | null>(() => {
    // loadSession() в api/studio уже применил токен; восстанавливаем состояние
    try {
      const raw = sessionStorage.getItem('studio-session');
      return raw ? (JSON.parse(raw) as SessionState) : null;
    } catch {
      return null;
    }
  });

  const handleLoginSuccess = (res: LoginResponse) => {
    const s: SessionState = {
      token: res.token,
      kind: res.kind,
      department: res.department,
    };
    saveSession(s);
    setSession(s);
  };

  const logout = () => {
    saveSession(null);
    setSession(null);
  };

  if (!session) {
    return <LoginPage onSuccess={handleLoginSuccess} />;
  }

  if (session.kind === 'admin') {
    return <AdminArea onLogout={logout} />;
  }

  return <DepartmentPortal session={session} onLogout={logout} />;
}

/* ======================= Зона администратора ======================= */
function AdminArea({ onLogout }: { onLogout: () => void }) {
  const [config, setConfig] = useState<StudioConfig>({
    blockedDays: [],
    msgTeacher: '',
    msgStudent: '',
  });

  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
  }, []);

  return (
    <div className="app">
      <Header
        subtitle="Панель администратора"
        right={<button className="btn-secondary btn-sm" onClick={onLogout}>Выйти</button>}
      />
      <main className="admin-main">
        <AdminPanel config={config} onConfigUpdate={setConfig} onClose={onLogout} />
      </main>
      <footer>Видеостудия • Панель администрирования</footer>
    </div>
  );
}

/* ======================= Портал подразделения ======================= */
function DepartmentPortal({
  session,
  onLogout,
}: {
  session: SessionState;
  onLogout: () => void;
}) {
  const dept = session.department!;

  const [view, setView] = useState<View>('book');
  const [role, setRole] = useState<'teacher' | 'student'>('teacher');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [purpose, setPurpose] = useState('');

  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slotsData, setSlotsData] = useState<SlotsResponse | null>(null);

  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [config, setConfig] = useState<StudioConfig>({
    blockedDays: [],
    msgTeacher: '',
    msgStudent: '',
  });

  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [blockedModalOpen, setBlockedModalOpen] = useState(false);
  const [blockedModalData, setBlockedModalData] = useState({ title: '', body: '' });

  const refreshMine = () => getMyBookings().then(setMyBookings).catch(() => {});

  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
    refreshMine();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      getSlots(dateKey(selectedDate), role)
        .then((data) => setSlotsData(data))
        .catch(() => setSlotsData(null));
    } else {
      setSlotsData(null);
    }
    setSelectedSlot(null);
  }, [selectedDate, role]);

  const handleSelectDate = (date: Date, isBlocked: boolean) => {
    if (isBlocked) {
      const msg = role === 'teacher' ? config.msgTeacher : config.msgStudent;
      setBlockedModalData({
        title: `День недоступен — ${date.toLocaleDateString('ru-RU', { weekday: 'long' })}`,
        body: `<strong>Вы не можете записаться в этот день.</strong><br><br>${msg}`,
      });
      setBlockedModalOpen(true);
      return;
    }
    setSelectedDate(date);
    setSelectedSlot(null);
  };

  const handleSubmit = () => {
    if (phone.replace(/\D/g, '').length < 11)
      return setStatusMsg({ text: 'Введите телефон полностью', type: 'error' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return setStatusMsg({ text: 'Введите корректную почту', type: 'error' });
    if (!selectedDate || !selectedSlot)
      return setStatusMsg({ text: 'Выберите дату и время', type: 'error' });
    setStatusMsg({ text: '', type: '' });
    setConfirmModalOpen(true);
  };

  const confirmBooking = async () => {
    if (!selectedDate || !selectedSlot || !dept) return;
    try {
      await createBooking({
        departmentId: dept.id,
        phone,
        email,
        purpose,
        role,
        date: dateKey(selectedDate),
        slot: selectedSlot,
      });
      setConfirmModalOpen(false);
      setSuccessModalOpen(true);
      setSelectedDate(null);
      setSelectedSlot(null);
      setPhone('');
      setEmail('');
      setPurpose('');
      refreshMine();
    } catch (err: any) {
      setStatusMsg({
        text: err.response?.data?.message || 'Ошибка бронирования',
        type: 'error',
      });
      setConfirmModalOpen(false);
    }
  };

  const cancelBooking = async (id: string) => {
    if (!confirm('Отменить эту запись?')) return;
    try {
      await deleteBooking(id);
      refreshMine();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Не удалось отменить запись');
    }
  };

  const isSubmitDisabled = !selectedDate || !selectedSlot;

  return (
    <div className="app">
      <Header
        subtitle={`Подразделение: ${dept.name}`}
        right={
          <>
            <span className="user-chip">🏢 {dept.name}</span>
            <button className="btn-secondary btn-sm" onClick={onLogout}>Выйти</button>
          </>
        }
      />

      <nav className="portal-tabs">
        <button className={`portal-tab ${view === 'book' ? 'active' : ''}`} onClick={() => setView('book')}>
          📅 Запись в студию
        </button>
        <button className={`portal-tab ${view === 'mine' ? 'active' : ''}`} onClick={() => { setView('mine'); refreshMine(); }}>
          📋 Мои записи {myBookings.length ? `(${myBookings.length})` : ''}
        </button>
      </nav>

      {view === 'book' && (
        <main>
          <div>
            <BookingForm
              role={role}
              phone={phone}
              email={email}
              purpose={purpose}
              onRoleChange={setRole}
              onPhoneChange={setPhone}
              onEmailChange={setEmail}
              onPurposeChange={setPurpose}
            />
            <div className="card">
              <div className="card-title"><span className="icon">📅</span> Выбор даты</div>
              <div className="info-box">
                <strong>Режим работы студии:</strong> Понедельник–Пятница, 9:00–17:00<br />
                <strong>Поддержка:</strong>{' '}
                <a href="mailto:liot_public@mail.ru" style={{ color: 'var(--accent-light)' }}>
                  liot_public@mail.ru
                </a>
              </div>
              <Calendar
                year={year}
                month={month}
                config={config}
                bookings={myBookings}
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
                onPrevMonth={() => setMonth((m) => (m === 0 ? (setYear((y) => y - 1), 11) : m - 1))}
                onNextMonth={() => setMonth((m) => (m === 11 ? (setYear((y) => y + 1), 0) : m + 1))}
              />
              <div className="legend">
                <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--primary)', border: '1px solid var(--accent)' }}></div> Выбрано</div>
                <div className="legend-item"><div className="legend-dot" style={{ border: '1px solid var(--accent)' }}></div> Сегодня</div>
                <div className="legend-item"><div className="legend-dot" style={{ background: 'rgba(60,10,10,0.6)', border: '1px solid rgba(200,50,50,0.3)' }}></div> Занято</div>
                <div className="legend-item"><div className="legend-dot" style={{ background: 'rgba(240,165,0,0.2)', border: '1px solid rgba(240,165,0,0.3)' }}></div> Ограничен</div>
              </div>
            </div>
          </div>

          <div>
            <div className="card" style={{ marginBottom: 28 }}>
              <div className="card-title"><span className="icon">🕐</span> Выбор времени</div>
              {!selectedDate && (
                <div className="empty-state"><div className="icon">📅</div>Выберите дату в календаре</div>
              )}
              {selectedDate && (
                <TimeSlots
                  slots={slotsData?.slots || []}
                  selectedSlot={selectedSlot}
                  blocked={slotsData?.blocked || false}
                  blockedMessage={slotsData?.blockedMessage || null}
                  onSelectSlot={setSelectedSlot}
                />
              )}
            </div>

            <div className={`selected-summary ${selectedDate || selectedSlot ? 'show' : ''}`}>
              <div className="sel-row"><span className="sel-key">Дата:</span><span className="sel-val">{selectedDate ? formatDateRu(selectedDate) : '—'}</span></div>
              <div className="sel-row"><span className="sel-key">Время:</span><span className="sel-val">{selectedSlot || '—'}</span></div>
              <div className="sel-row"><span className="sel-key">Роль:</span><span className="sel-val">{role === 'teacher' ? 'Преподаватель' : 'Студент'}</span></div>
              <div className="sel-row"><span className="sel-key">Подразделение:</span><span className="sel-val">{dept.name}</span></div>
            </div>

            <div className="card">
              <div className="card-title"><span className="icon">✅</span> Подтверждение записи</div>
              <div className="info-box">
                После записи ваш слот будет <strong>заблокирован</strong> для других пользователей.<br />
                Готовое видео администратор вышлет на указанную почту.
              </div>
              <button className="btn-submit" disabled={isSubmitDisabled} onClick={handleSubmit}>
                Записаться в студию
              </button>
              {statusMsg.text && (
                <div className={`status-msg show ${statusMsg.type}`}>{statusMsg.text}</div>
              )}
            </div>
          </div>
        </main>
      )}

      {view === 'mine' && (
        <main className="single-col">
          <div className="card">
            <div className="card-title"><span className="icon">📋</span> Мои записи — {dept.name}</div>
            <MyBookings bookings={myBookings} onCancel={cancelBooking} />
          </div>
        </main>
      )}

      <footer>Видеостудия • Режим работы: Пн–Пт, 9:00–17:00 • Поддержка: liot_public@mail.ru</footer>

      <Modal isOpen={confirmModalOpen} onClose={() => setConfirmModalOpen(false)} title="Подтвердить запись?">
        <div className="booking-summary">
          <div className="row"><span className="key">Подразделение:</span><span className="val">{dept.name}</span></div>
          <div className="row"><span className="key">Телефон:</span><span className="val">{phone}</span></div>
          <div className="row"><span className="key">Почта для видео:</span><span className="val">{email}</span></div>
          <div className="row"><span className="key">Роль:</span><span className="val">{role === 'teacher' ? 'Преподаватель' : 'Студент'}</span></div>
          <div className="row"><span className="key">Дата:</span><span className="val">{selectedDate ? formatDateRu(selectedDate) : '—'}</span></div>
          <div className="row"><span className="key">Время:</span><span className="val">{selectedSlot || '—'}</span></div>
          <div className="row"><span className="key">Тема:</span><span className="val">{purpose || '—'}</span></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmModalOpen(false)}>Отмена</button>
          <button className="btn-submit" style={{ flex: 2, marginTop: 0 }} onClick={confirmBooking}>Подтвердить</button>
        </div>
      </Modal>

      <Modal isOpen={successModalOpen} onClose={() => setSuccessModalOpen(false)} title="Запись подтверждена!">
        <p style={{ textAlign: 'center' }}>
          Вы записаны в студию<br />
          📅 {selectedDate && formatDateRu(selectedDate)}, 🕐 {selectedSlot}<br /><br />
          Готовое видео будет отправлено на <strong>{email}</strong>.<br />
          Статус записи — во вкладке «Мои записи».
        </p>
        <button className="btn-submit" onClick={() => setSuccessModalOpen(false)}>Отлично!</button>
      </Modal>

      <Modal isOpen={blockedModalOpen} onClose={() => setBlockedModalOpen(false)} title={blockedModalData.title}>
        <div className="modal-warning" dangerouslySetInnerHTML={{ __html: blockedModalData.body }}></div>
        <button className="btn-submit" onClick={() => setBlockedModalOpen(false)}>Понятно</button>
      </Modal>
    </div>
  );
}

/* ======================= Шапка ======================= */
function Header({ subtitle, right }: { subtitle: string; right: React.ReactNode }) {
  return (
    <header>
      <div className="header-left">
        <div className="logo-wrap">
          <img
            src="logo.png"
            alt="Логотип"
            onError={(e) => {
              const el = e.currentTarget;
              el.style.display = 'none';
              const next = el.nextElementSibling as HTMLElement | null;
              if (next) next.style.display = 'flex';
            }}
          />
          <div className="logo-placeholder" style={{ display: 'none' }}>ВМА</div>
        </div>
        <div className="header-title">
          <h1 className="glow-accent">ВОЕННО-МЕДИЦИНСКАЯ АКАДЕМИЯ</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="header-right">
        <div className="support-info">
          <div className="label">Техническая поддержка</div>
          <a href="mailto:liot_public@mail.ru">liot_public@mail.ru</a>
        </div>
        <div className="header-actions">{right}</div>
      </div>
    </header>
  );
}

export default App;
