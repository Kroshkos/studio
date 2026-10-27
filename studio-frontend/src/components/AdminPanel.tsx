import { useEffect, useState } from 'react';
import {
  adminDeleteBooking,
  adminListBookings,
  adminMoveBooking,
  adminUpdateBooking,
  createDepartment,
  deleteDepartment,
  downloadReport,
  getDashboard,
  listDepartments,
  setBookingStage,
  updateConfig,
  updateDepartment,
} from '../api/studio';
import {
  Booking,
  BookingFilters,
  BookingStage,
  DashboardData,
  DepartmentAdmin,
  STAGES,
  STAGE_RU,
  StudioConfig,
} from '../types';
import Modal from './Modal';

interface Props {
  config: StudioConfig;
  onConfigUpdate: (c: StudioConfig) => void;
  onClose: () => void;
}

type Section = 'dashboard' | 'bookings' | 'departments' | 'settings';

const SECTION_TITLES: Record<Section, string> = {
  dashboard: 'Дашборд',
  bookings: 'Записи',
  departments: 'Подразделения',
  settings: 'Настройки студии',
};

const emptyFilters: BookingFilters = {
  q: '',
  stage: 'ALL',
  role: 'ALL',
  departmentId: '',
  dateFrom: '',
  dateTo: '',
  sort: 'date_asc',
};

export default function AdminPanel({ config, onConfigUpdate, onClose }: Props) {
  const [section, setSection] = useState<Section>('dashboard');
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [departments, setDepartments] = useState<DepartmentAdmin[]>([]);
  const [filters, setFilters] = useState<BookingFilters>(emptyFilters);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // модалки
  const [editB, setEditB] = useState<Booking | null>(null);
  const [moveB, setMoveB] = useState<Booking | null>(null);
  const [newDepOpen, setNewDepOpen] = useState(false);
  const [editDep, setEditDep] = useState<DepartmentAdmin | null>(null);

  const refreshDash = () => getDashboard().then(setDash).catch((e) => setError(msg(e)));
  const refreshBookings = (f: BookingFilters = filters) =>
    adminListBookings(f).then(setBookings).catch((e) => setError(msg(e)));
  const refreshDeps = () => listDepartments().then(setDepartments).catch((e) => setError(msg(e)));

  useEffect(() => {
    refreshDash();
    refreshBookings();
    refreshDeps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (section === 'bookings') refreshBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const applyFilters = (next: BookingFilters) => {
    setFilters(next);
    refreshBookings(next);
  };

  const changeStage = async (b: Booking, stage: BookingStage) => {
    setBusy(true);
    try {
      const updated = await setBookingStage(b.id, stage);
      setBookings((prev) => prev.map((x) => (x.id === b.id ? updated : x)));
      refreshDash();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const removeBooking = async (b: Booking) => {
    if (!confirm(`Удалить запись ${b.date} ${b.slot} (${b.phone})?`)) return;
    try {
      await adminDeleteBooking(b.id);
      setBookings((prev) => prev.filter((x) => x.id !== b.id));
      refreshDash();
    } catch (e) {
      setError(msg(e));
    }
  };

  const exportReport = async () => {
    try {
      const blob = await downloadReport();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(msg(e));
    }
  };

  return (
    <div className="admin">
      <div className="admin-head">
        <h2>Администрирование видеостудии</h2>
        <button className="btn-secondary btn-sm" onClick={onClose}>Выйти из админки</button>
      </div>

      {error && (
        <div className="status-msg show error" onClick={() => setError('')}>
          {error} ✕
        </div>
      )}

      <nav className="admin-nav">
        {(Object.keys(SECTION_TITLES) as Section[]).map((s) => (
          <button
            key={s}
            className={`admin-tab ${section === s ? 'active' : ''}`}
            onClick={() => setSection(s)}
          >
            {SECTION_TITLES[s]}
          </button>
        ))}
      </nav>

      {section === 'dashboard' && dash && <DashboardView dash={dash} />}
      {section === 'dashboard' && !dash && <div className="empty-state">Загрузка…</div>}

      {section === 'bookings' && (
        <BookingsView
          bookings={bookings}
          departments={departments}
          filters={filters}
          busy={busy}
          onFilters={applyFilters}
          onStage={changeStage}
          onDelete={removeBooking}
          onEdit={setEditB}
          onMove={setMoveB}
          onExport={exportReport}
        />
      )}

      {section === 'departments' && (
        <DepartmentsView
          departments={departments}
          onCreate={() => setNewDepOpen(true)}
          onEdit={setEditDep}
          onDelete={async (d) => {
            if (!confirm(`Удалить подразделение «${d.name}» и все его записи (${d.bookingsCount})?`)) return;
            try {
              await deleteDepartment(d.id);
              refreshDeps();
              refreshDash();
            } catch (e) {
              setError(msg(e));
            }
          }}
        />
      )}

      {section === 'settings' && (
        <SettingsView
          config={config}
          onSave={async (c) => {
            try {
              const saved = await updateConfig(c);
              onConfigUpdate(saved);
              setError('');
            } catch (e) {
              setError(msg(e));
            }
          }}
        />
      )}

      {/* Модалка редактирования записи */}
      {editB && (
        <EditBookingModal
          booking={editB}
          onClose={() => setEditB(null)}
          onSaved={(b) => {
            setBookings((prev) => prev.map((x) => (x.id === b.id ? b : x)));
            setEditB(null);
            refreshDash();
          }}
        />
      )}

      {/* Модалка переноса записи */}
      {moveB && (
        <MoveBookingModal
          booking={moveB}
          onClose={() => setMoveB(null)}
          onMoved={(b) => {
            setBookings((prev) => prev.map((x) => (x.id === b.id ? b : x)));
            setMoveB(null);
          }}
        />
      )}

      {/* Создание подразделения */}
      {newDepOpen && (
        <DepartmentFormModal
          title="Новое подразделение"
          onClose={() => setNewDepOpen(false)}
          onSubmit={async (name, password) => {
            await createDepartment(name, password);
            setNewDepOpen(false);
            refreshDeps();
          }}
        />
      )}

      {/* Редактирование подразделения */}
      {editDep && (
        <DepartmentFormModal
          title={`Подразделение «${editDep.name}»`}
          editPasswordOptional
          initialName={editDep.name}
          initialActive={editDep.isActive}
          onClose={() => setEditDep(null)}
          onSubmit={async (name, password, isActive) => {
            await updateDepartment(editDep.id, {
              name,
              ...(password ? { password } : {}),
              isActive,
            });
            setEditDep(null);
            refreshDeps();
          }}
        />
      )}
    </div>
  );
}

/* ---------------- Дашборд ---------------- */
function DashboardView({ dash }: { dash: DashboardData }) {
  const cards = [
    { label: 'Всего записей', value: dash.totalBookings, icon: '📝' },
    { label: 'Видео записано', value: dash.recordedVideos, icon: '🎥' },
    { label: 'Обработано и отправлено', value: dash.processedSentVideos, icon: '✅' },
    { label: 'Преподавателей', value: dash.teachers, icon: '🧑‍🏫' },
    { label: 'Студентов', value: dash.students, icon: '🎓' },
  ];
  const maxStage = Math.max(1, ...STAGES.map((s) => dash.stages[s] || 0));

  return (
    <div>
      <div className="dash-cards">
        {cards.map((c) => (
          <div key={c.label} className="dash-card">
            <div className="dc-icon">{c.icon}</div>
            <div className="dc-value">{c.value}</div>
            <div className="dc-label">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title"><span className="icon">📊</span> Этапы записей</div>
        {STAGES.map((s) => (
          <div key={s} className="stage-bar-row">
            <span className="sbr-label">{STAGE_RU[s]}</span>
            <div className="sbr-track">
              <div
                className={`sbr-fill fill-${s}`}
                style={{ width: `${((dash.stages[s] || 0) / maxStage) * 100}%` }}
              />
            </div>
            <span className="sbr-count">{dash.stages[s] || 0}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title"><span className="icon">🏢</span> Записи по подразделениям</div>
        {!dash.byDepartment.length && <div className="empty-state">Нет данных</div>}
        {dash.byDepartment.map((d) => (
          <div key={d.departmentId} className="dep-row">
            <span>{d.departmentName}</span>
            <span className="dep-count">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Записи: поиск/фильтры/сортировка + карточки ---------------- */
interface BookingsViewProps {
  bookings: Booking[];
  departments: DepartmentAdmin[];
  filters: BookingFilters;
  busy: boolean;
  onFilters: (f: BookingFilters) => void;
  onStage: (b: Booking, s: BookingStage) => void;
  onDelete: (b: Booking) => void;
  onEdit: (b: Booking) => void;
  onMove: (b: Booking) => void;
  onExport: () => void;
}

function BookingsView(p: BookingsViewProps) {
  const set = (patch: Partial<BookingFilters>) => p.onFilters({ ...p.filters, ...patch });

  return (
    <div>
      <div className="card filters-card">
        <div className="card-title"><span className="icon">🔎</span> Поиск и фильтры</div>
        <div className="filters-grid">
          <input
            className="f-search"
            placeholder="Поиск: телефон, почта, тема…"
            value={p.filters.q || ''}
            onChange={(e) => set({ q: e.target.value })}
          />
          <select value={p.filters.stage || 'ALL'} onChange={(e) => set({ stage: e.target.value as BookingFilters['stage'] })}>
            <option value="ALL">Все этапы</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>{STAGE_RU[s]}</option>
            ))}
          </select>
          <select value={p.filters.role || 'ALL'} onChange={(e) => set({ role: e.target.value as BookingFilters['role'] })}>
            <option value="ALL">Все роли</option>
            <option value="teacher">Преподаватели</option>
            <option value="student">Студенты</option>
          </select>
          <select value={p.filters.departmentId || ''} onChange={(e) => set({ departmentId: e.target.value })}>
            <option value="">Все подразделения</option>
            {p.departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <label className="f-date">с <input type="date" value={p.filters.dateFrom || ''} onChange={(e) => set({ dateFrom: e.target.value })} /></label>
          <label className="f-date">по <input type="date" value={p.filters.dateTo || ''} onChange={(e) => set({ dateTo: e.target.value })} /></label>
          <select value={p.filters.sort || 'date_asc'} onChange={(e) => set({ sort: e.target.value })}>
            <option value="date_asc">Сначала ближайшие</option>
            <option value="date_desc">Сначала дальние</option>
            <option value="created_desc">По дате создания</option>
            <option value="department">По подразделению</option>
            <option value="stage">По этапу</option>
          </select>
          <button className="btn-secondary btn-sm" onClick={() => p.onFilters({ ...emptyFilters })}>Сбросить</button>
          <button className="btn-submit btn-sm" onClick={p.onExport}>Выгрузить CSV</button>
        </div>
      </div>

      {!p.bookings.length && <div className="empty-state card">Записи не найдены</div>}

      <div className="booking-cards">
        {p.bookings.map((b) => (
          <div key={b.id} className={`booking-card stage-${b.stage}`}>
            <div className="bc-head">
              <div>
                <div className="bc-dept">🏢 {b.department?.name ?? '—'}</div>
                <div className="bc-when">📅 {b.dateLabel || b.date} • 🕐 {b.slot}</div>
              </div>
              <span className={`stage-badge badge-${b.stage}`}>{STAGE_RU[b.stage]}</span>
            </div>

            <div className="bc-body">
              <div><b>{b.role === 'teacher' ? 'Преподаватель' : 'Студент'}</b></div>
              <div>☎ {b.phone}</div>
              <div>✉ {b.email}</div>
              {b.purpose && <div>📌 {b.purpose}</div>}
            </div>

            <div className="bc-stages">
              {STAGES.map((s, i) => {
                const cur = STAGES.indexOf(b.stage);
                const done = i <= cur;
                return (
                  <button
                    key={s}
                    disabled={p.busy}
                    className={`stage-chip ${done ? 'done' : ''}`}
                    title={done ? `Этап выполнен` : `Отметить: ${STAGE_RU[s]}`}
                    onClick={() => p.onStage(b, s)}
                  >
                    {done ? '✓' : '○'} {STAGE_RU[s]}
                  </button>
                );
              })}
            </div>

            <div className="bc-actions">
              <button className="btn-secondary btn-sm" onClick={() => p.onEdit(b)}>Изменить</button>
              <button className="btn-secondary btn-sm" onClick={() => p.onMove(b)}>Перенести</button>
              <button className="btn-danger btn-sm" onClick={() => p.onDelete(b)}>Удалить</button>
            </div>

            {!!b.stageHistory?.length && (
              <details className="bc-history">
                <summary>История этапов</summary>
                {b.stageHistory.map((h, i) => (
                  <div key={i} className="hist-row">
                    {new Date(h.at).toLocaleString('ru-RU')} — {STAGE_RU[h.stage]} ({h.by})
                  </div>
                ))}
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Редактирование записи ---------------- */
function EditBookingModal({ booking, onClose, onSaved }: {
  booking: Booking;
  onClose: () => void;
  onSaved: (b: Booking) => void;
}) {
  const [phone, setPhone] = useState(booking.phone);
  const [email, setEmail] = useState(booking.email);
  const [purpose, setPurpose] = useState(booking.purpose || '');
  const [role, setRole] = useState<'teacher' | 'student'>(booking.role);
  const [err, setErr] = useState('');

  const save = async () => {
    try {
      const b = await adminUpdateBooking(booking.id, { phone, email, purpose, role });
      onSaved(b);
    } catch (e) {
      setErr(msg(e));
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Редактирование записи">
      <div className="form-group">
        <label>Телефон</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="form-group">
        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="form-group">
        <label>Роль</label>
        <select value={role} onChange={(e) => setRole(e.target.value as any)}>
          <option value="teacher">Преподаватель</option>
          <option value="student">Студент</option>
        </select>
      </div>
      <div className="form-group">
        <label>Тема</label>
        <textarea rows={3} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </div>
      {err && <div className="status-msg show error">{err}</div>}
      <button className="btn-submit" onClick={save}>Сохранить</button>
    </Modal>
  );
}

/* ---------------- Перенос записи ---------------- */
function MoveBookingModal({ booking, onClose, onMoved }: {
  booking: Booking;
  onClose: () => void;
  onMoved: (b: Booking) => void;
}) {
  const [date, setDate] = useState(booking.date);
  const [slot, setSlot] = useState(booking.slot);
  const [slots, setSlots] = useState<string[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    const list: string[] = [];
    for (let h = 9; h < 17; h++) list.push(`${String(h).padStart(2, '0')}:00`);
    setSlots(list);
  }, []);

  const doMove = async () => {
    try {
      onMoved(await adminMoveBooking(booking.id, date, slot));
    } catch (e) {
      setErr(msg(e));
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Перенос записи">
      <p>Текущее время: {booking.dateLabel || booking.date}, {booking.slot}</p>
      <div className="form-group">
        <label>Новая дата</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="form-group">
        <label>Новое время</label>
        <select value={slot} onChange={(e) => setSlot(e.target.value)}>
          {slots.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      {err && <div className="status-msg show error">{err}</div>}
      <button className="btn-submit" onClick={doMove}>Перенести</button>
    </Modal>
  );
}

/* ---------------- Подразделения ---------------- */
function DepartmentsView({ departments, onCreate, onEdit, onDelete }: {
  departments: DepartmentAdmin[];
  onCreate: () => void;
  onEdit: (d: DepartmentAdmin) => void;
  onDelete: (d: DepartmentAdmin) => void;
}) {
  return (
    <div>
      <div className="card">
        <div className="card-title"><span className="icon">🏢</span> Подразделения</div>
        <button className="btn-submit btn-sm" onClick={onCreate}>+ Создать подразделение</button>
      </div>
      {!departments.length && <div className="empty-state card">Пока нет подразделений</div>}
      <div className="dep-list">
        {departments.map((d) => (
          <div key={d.id} className={`dep-card ${d.isActive ? '' : 'inactive'}`}>
            <div>
              <div className="dep-name">{d.name}</div>
              <div className="dep-meta">
                Записей: {d.bookingsCount} • создан {new Date(d.createdAt).toLocaleDateString('ru-RU')}
              </div>
            </div>
            <div className="dep-actions">
              <span className={`stage-badge ${d.isActive ? 'badge-SENT' : 'badge-AWAITING_RECORD'}`}>
                {d.isActive ? 'Активно' : 'Отключено'}
              </span>
              <button className="btn-secondary btn-sm" onClick={() => onEdit(d)}>Изменить</button>
              <button className="btn-danger btn-sm" onClick={() => onDelete(d)}>Удалить</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DepartmentFormModal({ title, initialName = '', initialActive = true, editPasswordOptional = false, onClose, onSubmit }: {
  title: string;
  initialName?: string;
  initialActive?: boolean;
  editPasswordOptional?: boolean;
  onClose: () => void;
  onSubmit: (name: string, password: string, isActive: boolean) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(initialActive);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!name.trim()) return setErr('Укажите наименование подразделения');
    if (!editPasswordOptional && password.length < 4) return setErr('Пароль должен быть не короче 4 символов');
    try {
      await onSubmit(name.trim(), password, isActive);
    } catch (e) {
      setErr(msg(e));
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={title}>
      <div className="form-group">
        <label>Наименование подразделения (это же — логин)</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Кафедра анатомии" />
      </div>
      <div className="form-group">
        <label>{editPasswordOptional ? 'Новый пароль (оставьте пустым, чтобы не менять)' : 'Пароль для входа'}</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {editPasswordOptional && (
        <label className="checkbox-row">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Подразделение активно
        </label>
      )}
      {err && <div className="status-msg show error">{err}</div>}
      <button className="btn-submit" onClick={submit}>Сохранить</button>
    </Modal>
  );
}

/* ---------------- Настройки ---------------- */
const DAY_NAMES: Record<number, string> = { 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт' };

function SettingsView({ config, onSave }: { config: StudioConfig; onSave: (c: StudioConfig) => Promise<void>; }) {
  const [blockedDays, setBlockedDays] = useState<number[]>(config.blockedDays);
  const [msgTeacher, setMsgTeacher] = useState(config.msgTeacher);
  const [msgStudent, setMsgStudent] = useState(config.msgStudent);
  const [saved, setSaved] = useState(false);

  const toggleDay = (d: number) =>
    setBlockedDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const save = async () => {
    await onSave({ blockedDays, msgTeacher, msgStudent });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="card">
      <div className="card-title"><span className="icon">⚙️</span> Доступность дней и сообщения</div>
      <div className="form-group">
        <label>Незаписные дни недели</label>
        <div className="days-toggle">
          {[1, 2, 3, 4, 5].map((d) => (
            <button
              key={d}
              className={`day-btn ${blockedDays.includes(d) ? 'blocked' : ''}`}
              onClick={() => toggleDay(d)}
            >
              {DAY_NAMES[d]}
            </button>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label>Сообщение преподавателю при блокировке дня</label>
        <textarea rows={3} value={msgTeacher} onChange={(e) => setMsgTeacher(e.target.value)} />
      </div>
      <div className="form-group">
        <label>Сообщение студенту при блокировке дня</label>
        <textarea rows={3} value={msgStudent} onChange={(e) => setMsgStudent(e.target.value)} />
      </div>
      {saved && <div className="status-msg show success">Настройки сохранены</div>}
      <button className="btn-submit" onClick={save}>Сохранить настройки</button>
    </div>
  );
}

function msg(e: any): string {
  return e?.response?.data?.message || e?.message || 'Ошибка запроса';
}
