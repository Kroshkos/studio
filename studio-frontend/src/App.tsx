import { useEffect, useState } from 'react';
import './App.css';
import { getSlots, getOccupiedSlots, getConfig, createBooking, setAdminToken as applyAdminToken, adminLogin } from './api/studio';
import { OccupiedSlot, SlotsResponse, StudioConfig } from './types';
import Calendar from './components/Calendar';
import TimeSlots from './components/TimeSlots';
import BookingForm from './components/BookingForm';
import MyBookings from './components/MyBookings';
import Modal from './components/Modal';
import AdminPanel from './components/AdminPanel';
import { formatDateRu, dateKey } from './utils/dateHelpers';

function App() {
  const [role, setRole] = useState<'teacher' | 'student'>('teacher');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [purpose, setPurpose] = useState('');

  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slotsData, setSlotsData] = useState<SlotsResponse | null>(null);
  // Публичная занятость (дата+слот, без ПДн) — для календаря и списка предстоящих записей
  const [occupied, setOccupied] = useState<OccupiedSlot[]>([]);
  const [config, setConfig] = useState<StudioConfig>({ blockedDays: [], msgTeacher: '', msgStudent: '' });
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });

  // Admin state
  const [adminToken, setAdminToken] = useState<string | null>(sessionStorage.getItem('adminToken'));
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Modal for confirm & success
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [blockedModalOpen, setBlockedModalOpen] = useState(false);
  const [blockedModalData, setBlockedModalData] = useState({ title: '', body: '' });

  useEffect(() => {
    if (adminToken) {
      applyAdminToken(adminToken); // прокидываем Bearer-токен в axios для админ-запросов
      sessionStorage.setItem('adminToken', adminToken);
    } else {
      applyAdminToken(null);
      sessionStorage.removeItem('adminToken');
    }
  }, [adminToken]);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [cfg, occupiedSlots] = await Promise.all([getConfig(), getOccupiedSlots()]);
        setConfig(cfg);
        setOccupied(occupiedSlots);
      } catch (err) {
        console.error('Не удалось загрузить начальные данные:', err);
      }
    };
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedDate && role) {
      setLoading(true);
      getSlots(dateKey(selectedDate), role)
        .then(data => setSlotsData(data))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
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

  const handleSelectSlot = (slot: string) => setSelectedSlot(slot);

  const handleSubmit = () => {
    if (!name.trim()) return setStatusMsg({ text: 'Введите ФИО', type: 'error' });
    if (!phone.trim()) return setStatusMsg({ text: 'Введите телефон', type: 'error' });
    if (!selectedDate || !selectedSlot) return setStatusMsg({ text: 'Выберите дату и время', type: 'error' });
    // открыть confirm модалку
    setConfirmModalOpen(true);
  };

  const confirmBooking = async () => {
    if (!selectedDate || !selectedSlot) return;
    const dateStr = dateKey(selectedDate);
    try {
      await createBooking({
        name, phone, email, purpose, role,
        date: dateStr,
        slot: selectedSlot,
      });
      setConfirmModalOpen(false);
      setSuccessModalOpen(true);
      // Сброс
      setSelectedDate(null);
      setSelectedSlot(null);
      setName('');
      setPhone('');
      setEmail('');
      setPurpose('');
      // Обновить данные (публичные эндпоинты — без ПДн)
      const [newOccupied, newConfig] = await Promise.all([getOccupiedSlots(), getConfig()]);
      setOccupied(newOccupied);
      setConfig(newConfig);
    } catch (err: any) {
      setStatusMsg({ text: err.response?.data?.message || 'Ошибка бронирования', type: 'error' });
      setConfirmModalOpen(false);
    }
  };

  const handleAdminLogin = async () => {
    try {
      const res = await adminLogin(login, password);
      setAdminToken(res.token); // useEffect применит токен в axios и sessionStorage
      setIsLoginModalOpen(false);
      setIsAdminModalOpen(true);
      setLogin('');
      setPassword('');
      setLoginError('');
    } catch (err) {
      setLoginError('Неверный логин или пароль');
    }
  };

  const openAdmin = () => {
    if (adminToken) {
      setIsAdminModalOpen(true);
    } else {
      setIsLoginModalOpen(true);
    }
  };

  const handleConfigUpdate = (newConfig: StudioConfig) => setConfig(newConfig);
  const handleBookingsChange = async () => {
    // Админ удалил/изменил бронирования — обновляем публичную занятость
    const newOccupied = await getOccupiedSlots();
    setOccupied(newOccupied);
  };

  const isSubmitDisabled = !selectedDate || !selectedSlot;

  return (
    <div className="app">
      <header>
        <div className="header-left">
          <div className="logo-wrap"><img src="logo.png" alt="Логотип" onError={(e) => { const img = e.currentTarget; img.style.display = 'none'; const placeholder = img.nextElementSibling as HTMLElement | null; if (placeholder) placeholder.style.display = 'flex'; }} /><div className="logo-placeholder" style={{ display: 'none' }}>Название</div></div>
          <div className="header-title"><h1 className="glow-accent">ВОЕННО-МЕДИЦИНСКАЯ АКАДЕМИЯ</h1><p>Запись в лабораторию видеолекций</p></div>
        </div>
        <div className="header-right">
          <div className="support-info"><div className="label">Техническая поддержка и бронирование</div><a href="mailto:liot_public@mail.ru">liot_public@mail.ru</a></div>
          <button className="btn-admin-header" onClick={openAdmin}>&#9881; Администратор</button>
        </div>
      </header>

      <main>
        <div>
          <BookingForm
            role={role}
            name={name}
            phone={phone}
            email={email}
            purpose={purpose}
            onRoleChange={setRole}
            onNameChange={setName}
            onPhoneChange={setPhone}
            onEmailChange={setEmail}
            onPurposeChange={setPurpose}
          />
          <div className="card">
            <div className="card-title"><span className="icon">📅</span> Выбор даты</div>
            <div className="info-box"><strong>Режим работы студии:</strong> Понедельник–Пятница, 9:00–17:00<br /><strong>Поддержка:</strong> <a href="mailto:liot_public@mail.ru" style={{ color: 'var(--accent-light)' }}>liot_public@mail.ru</a></div>
            <Calendar
              year={year}
              month={month}
              config={config}
              occupied={occupied}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              onPrevMonth={() => setMonth(m => m === 0 ? (setYear(y => y-1), 11) : m-1)}
              onNextMonth={() => setMonth(m => m === 11 ? (setYear(y => y+1), 0) : m+1)}
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
            {!selectedDate && <div className="empty-state"><div className="icon">📅</div>Выберите дату в календаре</div>}
            {selectedDate && loading && <div className="empty-state">Загрузка слотов…</div>}
            {selectedDate && !loading && (
              <TimeSlots
                slots={slotsData?.slots || []}
                selectedSlot={selectedSlot}
                blocked={slotsData?.blocked || false}
                blockedMessage={slotsData?.blockedMessage || null}
                onSelectSlot={handleSelectSlot}
              />
            )}
          </div>

          <div className={`selected-summary ${selectedDate || selectedSlot ? 'show' : ''}`}>
            <div className="sel-row"><span className="sel-key">Дата:</span><span className="sel-val">{selectedDate ? formatDateRu(selectedDate) : '—'}</span></div>
            <div className="sel-row"><span className="sel-key">Время:</span><span className="sel-val">{selectedSlot || '—'}</span></div>
            <div className="sel-row"><span className="sel-key">Роль:</span><span className="sel-val">{role === 'teacher' ? 'Преподаватель' : 'Студент'}</span></div>
          </div>

          <div className="card">
            <div className="card-title"><span className="icon">✅</span> Подтверждение записи</div>
            <div className="info-box">После записи ваш слот будет <strong>заблокирован</strong> для других пользователей.<br />По вопросам отмены обращайтесь: <strong>liot_public@mail.ru</strong></div>
            <button className="btn-submit" disabled={isSubmitDisabled} onClick={handleSubmit}>Записаться в студию</button>
            {statusMsg.text && <div className={`status-msg show ${statusMsg.type}`}>{statusMsg.text}</div>}
          </div>

          <div className="card" style={{ marginTop: 28 }}>
            <div className="card-title"><span className="icon">📋</span> Предстоящие записи</div>
            <MyBookings occupied={occupied} />
          </div>
        </div>
      </main>

      <footer>Видеостудия • Режим работы: Пн–Пт, 9:00–17:00 • Поддержка: liot_public@mail.ru</footer>

      <Modal isOpen={confirmModalOpen} onClose={() => setConfirmModalOpen(false)} title="Подтвердить запись?">
        <div className="booking-summary">
          <div className="row"><span className="key">ФИО:</span><span className="val">{name}</span></div>
          <div className="row"><span className="key">Телефон:</span><span className="val">{phone}</span></div>
          <div className="row"><span className="key">Email:</span><span className="val">{email || '—'}</span></div>
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
          <strong>{name}</strong>, вы записаны в студию<br />
          📅 {selectedDate && formatDateRu(selectedDate)}, 🕐 {selectedSlot}<br /><br />
          По вопросам: <a href="mailto:liot_public@mail.ru" style={{ color: 'var(--accent-light)' }}>liot_public@mail.ru</a>
        </p>
        <button className="btn-submit" onClick={() => setSuccessModalOpen(false)}>Отлично!</button>
      </Modal>

      <Modal isOpen={blockedModalOpen} onClose={() => setBlockedModalOpen(false)} title={blockedModalData.title}>
        <div className="modal-warning" dangerouslySetInnerHTML={{ __html: blockedModalData.body }}></div>
        <button className="btn-submit" onClick={() => setBlockedModalOpen(false)}>Понятно</button>
      </Modal>

      <Modal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} title="Вход для администратора" className="admin-login">
        <p>Доступ ограничен. Введите учётные данные.</p>
        <div className="form-group"><label>Логин</label><input type="text" value={login} onChange={e => setLogin(e.target.value)} autoComplete="off" /></div>
        <div className="form-group"><label>Пароль</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} /></div>
        {loginError && <div className="status-msg show error">{loginError}</div>}
        <button className="btn-submit" onClick={handleAdminLogin}>Войти</button>
      </Modal>

      <Modal isOpen={isAdminModalOpen} onClose={() => setIsAdminModalOpen(false)}>
        <AdminPanel
          token={adminToken!}
          config={config}
          onConfigUpdate={handleConfigUpdate}
          onBookingsChange={handleBookingsChange}
          onClose={() => setIsAdminModalOpen(false)}
        />
      </Modal>
    </div>
  );
}

export default App;