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
  getConfig,
  getSlots,
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
  BlockAudience,
  DayBlock,
  AUDIENCE_RU,
  TimeOverride,
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

// --- helpers для графика работы ---
const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const toHHmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

interface BaseSlot { original: string; time: string; endTime: string; duration: number }

// Генерация базовых слотов по графику (без учёта overrides) — как на бэкенде
function genBaseSlots(open: string, close: string, step: number): BaseSlot[] {
  const res: BaseSlot[] = [];
  for (let t = toMin(open); t + step <= toMin(close); t += step) {
    res.push({ original: toHHmm(t), time: toHHmm(t), endTime: toHHmm(t + step), duration: step });
  }
  return res;
}

function applyOverrides(base: BaseSlot[], overrides: TimeOverride[]): BaseSlot[] {
  const map = new Map(overrides.map((o) => [o.original, o]));
  return base
    .filter((s) => !map.get(s.original)?.deleted)
    .map((s) => {
      const ov = map.get(s.original);
      if (!ov) return s;
      const time = ov.newTime ?? s.time;
      const duration = ov.duration ?? s.duration;
      return { ...s, time, duration, endTime: toHHmm(toMin(time) + duration) };
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

// Валидация графика на клиенте (зеркалит бэкенд)
function validateSchedule(open: string, close: string, step: number, overrides: TimeOverride[]): string {
  if (!open || !close) return 'Укажите время открытия и закрытия';
  if (toMin(open) >= toMin(close)) return 'Время закрытия должно быть позже времени открытия';
  const base = genBaseSlots(open, close, step);
  const originals = new Set(base.map((s) => s.original));
  for (const o of overrides) {
    if (!originals.has(o.original)) return `Слот ${o.original} не существует при выбранном графике`;
    if (o.deleted) continue;
    const time = o.newTime ?? o.original;
    const dur = o.duration ?? step;
    if (toMin(time) < toMin(open) || toMin(time) + dur > toMin(close)) {
      return `Слот ${time}${dur !== step ? ` (${dur} мин)` : ''} выходит за границы графика работы`;
    }
  }
  const effective = applyOverrides(base, overrides).map((s) => ({ from: toMin(s.time), to: toMin(s.time) + s.duration, label: s.time }));
  effective.sort((a, b) => a.from - b.from);
  for (let i = 1; i < effective.length; i++) {
    if (effective[i].from < effective[i - 1].to) return `Слоты пересекаются: ${effective[i - 1].label} и ${effective[i].label}`;
  }
  return '';
}

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
    // при открытии настроек всегда подтягиваем актуальный конфиг с сервера,
    // чтобы локальное состояние не разошлось с БД (иначе сохранение может затереть данные)
    if (section === 'settings') getConfig().then(onConfigUpdate).catch(() => {});
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

  // список доступных слотов берём с сервера — он учитывает график работы,
  // индивидуальные изменения слотов и блокировки (кроме текущего слота занятой записи)
  useEffect(() => {
    if (!date) return;
    let ignore = false;
    getSlots(date, booking.role)
      .then((data) => {
        if (ignore) return;
        const available = data.slots
          .filter((s) => !s.blocked && (!s.booked || s.slot === booking.slot))
          .map((s) => s.slot);
        setSlots(available.length ? available : [booking.slot]);
        if (!available.includes(slot)) setSlot(available[0] ?? booking.slot);
      })
      .catch(() => {
        if (!ignore) setSlots([booking.slot]);
      });
    return () => { ignore = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

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

const AUDIENCE_OPTIONS: { value: BlockAudience; label: string }[] = [
  { value: 'teacher', label: 'Преподаватель' },
  { value: 'student', label: 'Студент' },
  { value: 'all', label: 'Для всех' },
];

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtRu(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ru-RU');
}

function SettingsView({ config, onSave }: { config: StudioConfig; onSave: (c: StudioConfig) => Promise<void>; }) {
  const [blockedDays, setBlockedDays] = useState<number[]>(config.blockedDays);
  const [msgTeacher, setMsgTeacher] = useState(config.msgTeacher);
  const [msgStudent, setMsgStudent] = useState(config.msgStudent);
  const [dayBlocks, setDayBlocks] = useState<DayBlock[]>(config.dayBlocks || []);
  // синхронизируем локальное состояние с конфигом с сервера (например, после сохранения или загрузки)
  useEffect(() => {
    setBlockedDays(config.blockedDays);
    setMsgTeacher(config.msgTeacher);
    setMsgStudent(config.msgStudent);
    setDayBlocks(config.dayBlocks || []);
  }, [config]);
  // форма добавления блокировки: для кого + промежуток (даты и, опционально, время)
  const [audience, setAudience] = useState<BlockAudience>('all');
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [withTime, setWithTime] = useState(false);
  const [timeFrom, setTimeFrom] = useState('09:00');
  const [timeTo, setTimeTo] = useState('12:00');
  const [blockErr, setBlockErr] = useState('');
  const [saved, setSaved] = useState(false);

  // график работы и индивидуальные слоты (источник — конфиг с сервера)
  const openTime = config.openTime || '09:00';
  const closeTime = config.closeTime || '17:00';
  const slotDuration = config.slotDuration || 60;
  const [overrides, setOverrides] = useState<Record<string, TimeOverride>>(
    () => Object.fromEntries((config.timeOverrides || []).map((o) => [o.original, o])),
  );
  useEffect(() => {
    setOverrides(Object.fromEntries((config.timeOverrides || []).map((o) => [o.original, o])));
  }, [config.timeOverrides]);
  const [schedErr, setSchedErr] = useState('');

  const overrideList: TimeOverride[] = Object.values(overrides);
  const baseSlots = genBaseSlots(openTime, closeTime, slotDuration);
  const previewSlots = applyOverrides(baseSlots, overrideList);

  const toggleDay = (d: number) =>
    setBlockedDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const addBlock = () => {
    setBlockErr('');
    if (!dateFrom || !dateTo) {
      setBlockErr('Укажите начало и конец промежутка блокировки');
      return null;
    }
    if (dateFrom > dateTo) {
      setBlockErr('Дата окончания раньше даты начала');
      return null;
    }
    let tf: string | null = null;
    let tt: string | null = null;
    if (withTime) {
      if (!timeFrom || !timeTo) {
        setBlockErr('Укажите время начала и окончания блокировки');
        return null;
      }
      if (dateFrom === dateTo && timeFrom >= timeTo) {
        setBlockErr('Время окончания должно быть позже времени начала');
        return null;
      }
      tf = timeFrom;
      tt = timeTo;
    }
    const clash = dayBlocks.find(
      (b) => b.audience === audience && b.dateFrom <= dateTo && dateFrom <= b.dateTo && (b.timeFrom ?? '') === (tf ?? '') && (b.timeTo ?? '') === (tt ?? ''),
    );
    if (clash) {
      setBlockErr(`Уже есть блокировка (${AUDIENCE_RU[audience]}): ${fmtRu(clash.dateFrom)} — ${fmtRu(clash.dateTo)}`);
      return null;
    }
    const next = [
      ...dayBlocks,
      { audience, dateFrom, dateTo, timeFrom: tf, timeTo: tt },
    ].sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
    setDayBlocks(next);
    return next;
  };

  // добавить/снять блокировку и СРАЗУ сохранить на сервер — иначе после обновления страницы блокировка «пропадает»
  const addAndSave = async () => {
    const next = addBlock();
    if (!next) return;
    await saveList(next);
  };

  const removeAndSave = async (idx: number) => {
    const next = dayBlocks.filter((_, i) => i !== idx);
    setDayBlocks(next);
    await saveList(next);
  };

  const saveList = async (next: DayBlock[]) => {
    try {
      await onSave({ ...buildPayload(), dayBlocks: next });
      setBlockErr('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setBlockErr(msg(e));
    }
  };

  const blockLabel = (b: DayBlock) =>
    `${fmtRu(b.dateFrom)} — ${fmtRu(b.dateTo)}${b.timeFrom && b.timeTo ? `, ${b.timeFrom}–${b.timeTo}` : ', весь день'}`;

  const setOverride = (original: string, patch: Partial<TimeOverride> | null) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (patch === null) {
        delete next[original];
        return next;
      }
      const cur: TimeOverride = next[original] ?? { original };
      next[original] = { ...cur, ...patch };
      return next;
    });
  };

  // не передаём msgTeacher/msgStudent, если поля ещё не заполнены (например, конфиг не загрузился) —
  // иначе сервер сохранит пустые строки поверх реальных сообщений
  const buildPayload = (): StudioConfig => {
    const payload: StudioConfig = {
      blockedDays,
      msgTeacher: '',
      msgStudent: '',
      dayBlocks,
      openTime,
      closeTime,
      slotDuration,
      timeOverrides: overrideList,
    };
    if (msgTeacher.trim()) payload.msgTeacher = msgTeacher;
    if (msgStudent.trim()) payload.msgStudent = msgStudent;
    return payload;
  };

  const changeScheduleField = (field: 'open' | 'close' | 'step', value: string | number) => {
    const nextOpen = field === 'open' ? String(value) : openTime;
    const nextClose = field === 'close' ? String(value) : closeTime;
    const nextStep = field === 'step' ? Number(value) : slotDuration;
    // при изменении графика отбрасываем изменения слотов, которых больше не существует
    const validOriginals = new Set(genBaseSlots(nextOpen, nextClose, nextStep).map((s) => s.original));
    const keptOverrides = Object.values(overrides).filter((o) => validOriginals.has(o.original));
    setOverrides(Object.fromEntries(keptOverrides.map((o) => [o.original, o])));
    onSave({
      ...buildPayload(),
      openTime: nextOpen,
      closeTime: nextClose,
      slotDuration: nextStep,
      timeOverrides: keptOverrides,
    }).catch(() => {});
  };

  const save = async () => {
    const err = validateSchedule(openTime, closeTime, slotDuration, overrideList);
    if (err) {
      setSchedErr(err);
      return;
    }
    setSchedErr('');
    await onSave(buildPayload());
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
        <label>Блокировки на конкретный промежуток времени</label>
        <div className="block-form">
          <select value={audience} onChange={(e) => setAudience(e.target.value as BlockAudience)}>
            {AUDIENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>Кого блокировать: {o.label}</option>
            ))}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Начало блокировки" />
          <span className="date-sep">по</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Окончание блокировки" />
        </div>
        <div className="block-form">
          <label className="checkbox-row">
            <input type="checkbox" checked={withTime} onChange={(e) => setWithTime(e.target.checked)} />
            Блокировать не на весь день, а только на промежуток времени
          </label>
          {withTime && (
            <>
              <input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} step={300} title="С какого часа" />
              <span className="date-sep">—</span>
              <input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} step={300} title="До какого часа" />
            </>
          )}
          <button type="button" className="btn-submit btn-sm" onClick={addAndSave}>+ Заблокировать</button>
        </div>
        {blockErr && <div className="status-msg show error">{blockErr}</div>}
        {dayBlocks.length > 0 ? (
          <div className="block-list">
            {dayBlocks.map((b, i) => (
              <div key={`${b.audience}-${b.dateFrom}-${b.dateTo}-${b.timeFrom ?? ''}`} className="block-item">
                <span className={`badge-audience aud-${b.audience}`}>{AUDIENCE_RU[b.audience]}</span>
                <span>{blockLabel(b)}</span>
                <button type="button" className="btn-danger btn-sm" onClick={() => removeAndSave(i)}>Снять</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="hint">Дополнительных блокировок нет</div>
        )}
      </div>

      <div className="form-group">
        <label>График работы и слоты для записи</label>
        <div className="schedule-form">
          <label className="sched-field">
            Открытие
            <input type="time" value={openTime} onChange={(e) => changeScheduleField('open', e.target.value)} step={300} />
          </label>
          <label className="sched-field">
            Закрытие
            <input type="time" value={closeTime} onChange={(e) => changeScheduleField('close', e.target.value)} step={300} />
          </label>
          <label className="sched-field">
            Длительность слота
            <select value={slotDuration} onChange={(e) => changeScheduleField('step', Number(e.target.value))}>
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>{d} мин</option>
              ))}
            </select>
          </label>
        </div>
        <div className="hint">Слоты формируются автоматически по графику. Здесь можно перенести время слота, изменить его длительность или удалить конкретный слот.</div>
        {!baseSlots.length && <div className="status-msg show error">При таком графике слотов не получается — увеличьте рабочее время или уменьшите длительность слота</div>}
        {!!baseSlots.length && (
          <div className="slot-edit-list">
            {baseSlots.map((s) => {
              const ov = overrides[s.original];
              const deleted = !!ov?.deleted;
              const time = ov?.newTime ?? s.original;
              const dur = ov?.duration ?? slotDuration;
              const preview = previewSlots.find((p) => p.original === s.original);
              return (
                <div key={s.original} className={`slot-edit-row ${deleted ? 'deleted' : ''}`}>
                  <span className="ser-orig">{s.original}</span>
                  <label className="sched-field">
                    Время
                    <input
                      type="time"
                      value={time}
                      disabled={deleted}
                      step={300}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === s.original && dur === slotDuration) setOverride(s.original, null);
                        else setOverride(s.original, { newTime: v });
                      }}
                    />
                  </label>
                  <label className="sched-field">
                    Длительность
                    <select
                      value={dur}
                      disabled={deleted}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (v === slotDuration && time === s.original) setOverride(s.original, null);
                        else setOverride(s.original, { duration: v });
                      }}
                    >
                      {DURATION_OPTIONS.map((d) => (
                        <option key={d} value={d}>{d} мин</option>
                      ))}
                    </select>
                  </label>
                  {preview && !deleted && <span className="ser-preview">{preview.time}–{preview.endTime}</span>}
                  {deleted ? (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setOverride(s.original, null)}>Вернуть</button>
                  ) : (
                    <button type="button" className="btn-danger btn-sm" onClick={() => setOverride(s.original, { deleted: true })}>Удалить слот</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {schedErr && <div className="status-msg show error">{schedErr}</div>}
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
