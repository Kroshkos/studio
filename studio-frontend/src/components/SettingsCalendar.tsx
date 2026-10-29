import { useEffect, useMemo, useRef, useState } from 'react';
import { getSlots, updateConfig } from '../api/studio';
import {
  AUDIENCE_RU,
  BlockAudience,
  DayBlock,
  StudioConfig,
  TimeOverride,
} from '../types';
import { dateKey, getMonthDays, isWeekend } from '../utils/dateHelpers';

/* ---------- helpers ---------- */
const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const toHHmm = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const DAY_NAMES_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS_RU_LOCAL = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const AUDIENCES: BlockAudience[] = ['all', 'teacher', 'student'];

interface BaseSlot { original: string; time: string; endTime: string; duration: number }

// Генерация базовых слотов по графику — как на бэкенде
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
  const effective = applyOverrides(base, overrides)
    .map((s) => ({ from: toMin(s.time), to: toMin(s.time) + s.duration, label: s.time }))
    .sort((a, b) => a.from - b.from);
  for (let i = 1; i < effective.length; i++) {
    if (effective[i].from < effective[i - 1].to) return `Слоты пересекаются: ${effective[i - 1].label} и ${effective[i].label}`;
  }
  return '';
}

const fmtRu = (dateStr: string) => new Date(dateStr + 'T00:00:00').toLocaleDateString('ru-RU');

const dowOf = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00').getDay(); // 0=вс
  return d === 0 ? 7 : d; // 1=пн ... 7=вс
};

/** Слоты, перекрытые блокировками данного дня (для отображения в сетке) */
function blockedTimesForDate(blocks: DayBlock[], dateStr: string): Record<BlockAudience, Set<string>> {
  const res: Record<BlockAudience, Set<string>> = { all: new Set(), teacher: new Set(), student: new Set() };
  blocks.forEach((b) => {
    if (!(b.dateFrom <= dateStr && dateStr <= b.dateTo)) return;
    if (!b.timeFrom || !b.timeTo) {
      res[b.audience].add('full');
      return;
    }
    const from = toMin(b.timeFrom);
    const to = toMin(b.timeTo);
    for (let t = Math.floor(from / 30) * 30; t < to; t += 30) res[b.audience].add(toHHmm(t));
  });
  return res;
}

interface Props {
  config: StudioConfig;
  onConfigUpdate: (c: StudioConfig) => void;
}

export default function SettingsCalendar({ config, onConfigUpdate }: Props) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-based
  const [selectedDates, setSelectedDates] = useState<string[]>([dateKey(now)]);
  const [dragAnchor, setDragAnchor] = useState<string | null>(null);

  const [audience, setAudience] = useState<BlockAudience>('all');
  const [withTime, setWithTime] = useState(false);
  const [timeFrom, setTimeFrom] = useState('09:00');
  const [timeTo, setTimeTo] = useState('18:00');

  const [openTime, setOpenTime] = useState(config.openTime || '09:00');
  const [closeTime, setCloseTime] = useState(config.closeTime || '17:00');
  const [slotDuration, setSlotDuration] = useState(config.slotDuration || 60);
  const [msgTeacher, setMsgTeacher] = useState(config.msgTeacher || '');
  const [msgStudent, setMsgStudent] = useState(config.msgStudent || '');
  const [overrides, setOverrides] = useState<Record<string, TimeOverride>>(
    () => Object.fromEntries((config.timeOverrides || []).map((o) => [o.original, o])),
  );

  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [bookingsInfo, setBookingsInfo] = useState<Record<string, number>>({});

  // синхронизация локальных полей формы с серверным конфигом.
  // ВАЖНО: зависим только от скалярных полей конфига, а не от объекта config целиком —
  // иначе любое обновление ссылки на config (например, фоновый fetch в AdminPanel)
  // сбрасывало бы несохранённый ввод и перерисовывало календарь.
  const cfgOpen = config.openTime || '09:00';
  const cfgClose = config.closeTime || '17:00';
  const cfgStep = config.slotDuration || 60;
  const cfgMsgT = config.msgTeacher || '';
  const cfgMsgS = config.msgStudent || '';
  const cfgOvKey = JSON.stringify(
    (config.timeOverrides || []).map((o) => [o.original, o.newTime ?? null, o.duration ?? null, !!o.deleted]),
  );

  useEffect(() => {
    setOpenTime(cfgOpen);
    setCloseTime(cfgClose);
    setSlotDuration(cfgStep);
    setMsgTeacher(cfgMsgT);
    setMsgStudent(cfgMsgS);
    setOverrides(Object.fromEntries((config.timeOverrides || []).map((o) => [o.original, o])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgOpen, cfgClose, cfgStep, cfgMsgT, cfgMsgS, cfgOvKey]);

  const dayBlocks = useMemo(() => config.dayBlocks || [], [config.dayBlocks]);

  // сколько записей на выбранных датах (подсказка для админа)
  useEffect(() => {
    let cancelled = false;
    selectedDates.slice(0, 10).forEach((d) => {
      if (bookingsInfo[d] !== undefined) return;
      getSlots(d, 'teacher')
        .then((r) => { if (!cancelled) setBookingsInfo((prev) => ({ ...prev, [d]: r.slots.filter((s) => s.booked).length })); })
        .catch(() => { if (!cancelled) setBookingsInfo((prev) => ({ ...prev, [d]: 0 })); });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDates]);

  /* ---------- выбор дат (клик + протягивание мышью) ---------- */
  const selectRange = (a: string, b: string) => {
    const [s, e] = a <= b ? [a, b] : [b, a];
    const dates: string[] = [];
    const cur = new Date(s + 'T00:00:00');
    const end = new Date(e + 'T00:00:00');
    let guard = 0;
    while (cur <= end && guard < 370) {
      dates.push(dateKey(cur));
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
    setSelectedDates(dates);
  };

  // Клик по дате просто выбирает её. Снятие выделения — только кнопкой «Снять выделение»,
  // иначе повторные клики «сбрасывали» выбор. Протягивание мышью выделяет промежуток;
  // после протяжки последующий click игнорируется (dragMoved), чтобы не сбивать диапазон.
  const dragMovedRef = useRef(false);

  const onDayMouseDown = (d: string) => {
    dragMovedRef.current = false;
    setDragAnchor(d);
    setSelectedDates([d]);
  };
  const onDayMouseEnter = (d: string) => {
    if (dragAnchor && d !== dragAnchor) {
      dragMovedRef.current = true;
      selectRange(dragAnchor, d);
    }
  };
  const stopDrag = () => setDragAnchor(null);
  useEffect(() => {
    window.addEventListener('mouseup', stopDrag);
    return () => window.removeEventListener('mouseup', stopDrag);
  }, []);

  const onDayClick = (_d: string) => {
    // ничего не делаем: выбор уже установлен в onMouseDown
  };

  /* ---------- сохранение ---------- */
  const buildPayload = (): StudioConfig => ({
    blockedDays: config.blockedDays,
    msgTeacher,
    msgStudent,
    dayBlocks,
    openTime,
    closeTime,
    slotDuration,
    timeOverrides: Object.values(overrides),
  });

  const save = async (patch: Partial<StudioConfig>, okText: string) => {
    const next: StudioConfig = { ...buildPayload(), ...patch };
    const err = validateSchedule(next.openTime!, next.closeTime!, next.slotDuration!, next.timeOverrides!);
    if (err) {
      setStatus({ kind: 'err', text: err });
      return;
    }
    setBusy(true);
    try {
      const saved = await updateConfig(next);
      onConfigUpdate(saved);
      setStatus({ kind: 'ok', text: okText });
      setTimeout(() => setStatus(null), 2500);
    } catch (e: any) {
      setStatus({ kind: 'err', text: e?.response?.data?.message || e?.message || 'Не удалось сохранить' });
    } finally {
      setBusy(false);
    }
  };

  /* ---------- действия над выбранными датами ---------- */
  const rangeOfSelection = () => {
    const sorted = [...selectedDates].sort();
    return { from: sorted[0], to: sorted[sorted.length - 1] };
  };

  const blockSelected = () => {
    if (!selectedDates.length) return;
    const { from, to } = rangeOfSelection();
    const tf = withTime ? timeFrom : null;
    const tt = withTime ? timeTo : null;
    if (withTime && (!tf || !tt || (from === to && toMin(tf) >= toMin(tt)))) {
      setStatus({ kind: 'err', text: 'Проверьте промежуток времени блокировки' });
      return;
    }
    const byAud = dayBlocks.filter((b) => b.audience === audience);
    const others = dayBlocks.filter((b) => b.audience !== audience);
    // объединяем блокировки той же аудитории: удаляем те, что полностью покрыты новым диапазоном,
    // а частично пересекающиеся — расширяем
    let nFrom = from, nTo = to, nTf = tf, nTt = tt;
    const keep: DayBlock[] = [];
    byAud.forEach((b) => {
      const sameTime = (b.timeFrom ?? null) === nTf && (b.timeTo ?? null) === nTt;
      const overlaps = b.dateFrom <= nTo && nFrom <= b.dateTo;
      if (sameTime && overlaps) {
        nFrom = nFrom < b.dateFrom ? nFrom : b.dateFrom;
        nTo = nTo > b.dateTo ? nTo : b.dateTo;
      } else keep.push(b);
    });
    const next: DayBlock[] = [...others, ...keep, { audience, dateFrom: nFrom, dateTo: nTo, timeFrom: nTf, timeTo: nTt }];
    save({ dayBlocks: next }, `Заблокировано: ${AUDIENCE_RU[audience]}${selectedDates.length > 1 ? ` (${selectedDates.length} дн.)` : ''}`);
  };

  const unblockSelected = () => {
    if (!selectedDates.length) return;
    const selSet = new Set(selectedDates);
    const affected = dayBlocks.filter((b) => selectedDates.some((d) => b.dateFrom <= d && d <= b.dateTo));
    if (!affected.length) {
      setStatus({ kind: 'err', text: 'На выбранные даты блокировок нет' });
      return;
    }
    const others = dayBlocks.filter((b) => !affected.includes(b));
    // разрезаем затронутые блокировки вокруг выбранных дат (учитывая непоследовательное выделение)
    const pieces: DayBlock[] = [];
    affected.forEach((b) => {
      let cur: string | null = b.dateFrom;
      const end = b.dateTo;
      let guard = 0;
      while (cur && cur <= end && guard < 400) {
        if (selSet.has(cur)) {
          const d = new Date(cur + 'T00:00:00');
          d.setDate(d.getDate() + 1);
          cur = dateKey(d);
          continue;
        }
        // начало куска — идём вперёд пока дата не попадёт в выделение
        const start = cur;
        const dd = new Date(cur + 'T00:00:00');
        let pieceEnd = cur;
        guard++;
        while (true) {
          dd.setDate(dd.getDate() + 1);
          const nxt = dateKey(dd);
          if (nxt > end || selSet.has(nxt)) break;
          pieceEnd = nxt;
          guard++;
        }
        pieces.push({ ...b, dateFrom: start, dateTo: pieceEnd });
        const after = new Date(pieceEnd + 'T00:00:00');
        after.setDate(after.getDate() + 1);
        cur = dateKey(after);
      }
    });
    const next = [...others, ...pieces].filter((p) => p.dateFrom <= p.dateTo);
    save({ dayBlocks: next }, 'Блокировки сняты');
  };

  const removeBlockExact = (b: DayBlock) => {
    const next = dayBlocks.filter((x) => !(x.audience === b.audience && x.dateFrom === b.dateFrom && x.dateTo === b.dateTo && (x.timeFrom ?? '') === (b.timeFrom ?? '') && (x.timeTo ?? '') === (b.timeTo ?? '')));
    save({ dayBlocks: next }, 'Блокировка снята');
  };

  const toggleWeeklyDay = () => {
    if (selectedDates.length !== 1) return;
    const dow = dowOf(selectedDates[0]); // 1..7
    if (dow === 6 || dow === 7) return; // выходные и так закрыты
    const cur = config.blockedDays || [];
    const next = cur.includes(dow) ? cur.filter((x) => x !== dow) : [...cur, dow];
    save({ blockedDays: next }, next.includes(dow) ? `Теперь всегда закрыто: ${DAY_NAMES_SHORT[dow - 1]}` : `День ${DAY_NAMES_SHORT[dow - 1]} снова открыт`);
  };

  const changeSchedule = (patch: { open?: string; close?: string; step?: number }) => {
    const nextOpen = patch.open ?? openTime;
    const nextClose = patch.close ?? closeTime;
    const nextStep = patch.step ?? slotDuration;
    const validOriginals = new Set(genBaseSlots(nextOpen, nextClose, nextStep).map((s) => s.original));
    const kept = Object.values(overrides).filter((o) => validOriginals.has(o.original));
    setOverrides(Object.fromEntries(kept.map((o) => [o.original, o])));
    if (patch.open !== undefined) setOpenTime(patch.open);
    if (patch.close !== undefined) setCloseTime(patch.close);
    if (patch.step !== undefined) setSlotDuration(patch.step);
    save(
      { openTime: nextOpen, closeTime: nextClose, slotDuration: nextStep, timeOverrides: kept },
      'График обновлён',
    );
  };

  const setOverride = (original: string, patch: Partial<TimeOverride> | null, autoSave: boolean) => {
    const nextMap = { ...overrides };
    if (patch === null) delete nextMap[original];
    else nextMap[original] = { ...(nextMap[original] ?? { original }), ...patch };
    const list = Object.values(nextMap);
    setOverrides(nextMap);
    if (autoSave) save({ timeOverrides: list }, 'Слот обновлён');
  };

  const saveMessages = () => save({}, 'Сообщения сохранены');

  /* ---------- данные для рендера ---------- */
  const days = getMonthDays(viewYear, viewMonth);
  const selectedSet = new Set(selectedDates);
  const firstSel = selectedDates[0];
  const lastSel = selectedDates[selectedDates.length - 1];
  const singleDate = selectedDates.length === 1 ? selectedDates[0] : null;
  const singleDow = singleDate ? dowOf(singleDate) : 0;
  const weeklyBlocked = singleDow >= 1 && singleDow <= 5 && (config.blockedDays || []).includes(singleDow);

  const selBlocks = dayBlocks.filter((b) => selectedDates.some((d) => b.dateFrom <= d && d <= b.dateTo));
  const blockedTimes = singleDate ? blockedTimesForDate(dayBlocks, singleDate) : null;

  const baseSlots = genBaseSlots(openTime, closeTime, slotDuration);
  const previewSlots = applyOverrides(baseSlots, Object.values(overrides));
  const overrideList = Object.values(overrides);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); } else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); } else setViewMonth((m) => m + 1);
  };

  const markToday = () => {
    const t = dateKey(new Date());
    const d = new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDates([t]);
  };

  return (
    <div className="settings-calendar">
      <div className="sc-layout">
        {/* ------- Календарь ------- */}
        <div className="card sc-cal-card sc-block">
          <div className="sc-cal-head">
            <button className="btn-secondary btn-sm" onClick={prevMonth}>←</button>
            <div className="sc-cal-title">{MONTHS_RU_LOCAL[viewMonth]} {viewYear}</div>
            <button className="btn-secondary btn-sm" onClick={nextMonth}>→</button>
          </div>
          <div className="sc-weekdays">
            {DAY_NAMES_SHORT.map((d) => <div key={d} className={`sc-wd ${d === 'Сб' || d === 'Вс' ? 'weekend' : ''}`}>{d}</div>)}
          </div>
          <div className="sc-grid" onMouseLeave={() => setDragAnchor(null)}>
            {days.map((day, i) => {
              if (!day) return <div key={`e${i}`} className="sc-cell empty" />;
              const dk = dateKey(day);
              const dow = (day.getDay() + 6) % 7; // 0=пн
              const weekend = isWeekend(day);
              const weekly = !weekend && (config.blockedDays || []).includes(dow + 1);
              const blocks = dayBlocks.filter((b) => b.dateFrom <= dk && dk <= b.dateTo);
              const fullAll = blocks.some((b) => b.audience === 'all' && !b.timeFrom);
              const fullT = blocks.some((b) => (b.audience === 'teacher' || b.audience === 'all') && !b.timeFrom);
              const fullS = blocks.some((b) => (b.audience === 'student' || b.audience === 'all') && !b.timeFrom);
              const partial = blocks.some((b) => !!b.timeFrom);
              const isSel = selectedSet.has(dk);
              const inRange = selectedDates.length > 1 && dk >= firstSel && dk <= lastSel;
              const cls = [
                'sc-cell',
                weekend ? 'weekend' : '',
                fullAll || weekly ? 'blocked-all' : fullT && fullS ? 'blocked-all' : fullT ? 'blocked-t' : fullS ? 'blocked-s' : '',
                partial && !fullAll ? 'partial' : '',
                isSel ? 'selected' : inRange ? 'in-range' : '',
                dk === dateKey(new Date()) ? 'today' : '',
              ].filter(Boolean).join(' ');
              return (
                <div
                  key={dk}
                  className={cls}
                  onMouseDown={() => onDayMouseDown(dk)}
                  onMouseEnter={() => onDayMouseEnter(dk)}
                  onClick={() => onDayClick(dk)}
                  title={
                    fullAll ? 'Закрыто для всех' :
                    weekly ? 'Выходной студии (на весь день)' :
                    `${fmtRu(dk)}${blocks.length ? ' • ' + blocks.map((b) => AUDIENCE_RU[b.audience]).join(', ') : ''}`
                  }
                >
                  <span className="sc-day-num">{day.getDate()}</span>
                  {(fullAll || weekly || (fullT && fullS)) && <span className="sc-mark">✕</span>}
                  {(!((fullAll || (fullT && fullS)) || weekly)) && (fullT || fullS) && (
                    <span className="sc-mark small">{fullT ? 'Пр' : 'Ст'}</span>
                  )}
                  {!((fullAll || (fullT && fullS)) || weekly) && !fullT && !fullS && partial && <span className="sc-mark small">◔</span>}
                  {bookingsInfo[dk] ? <span className="sc-booked">{bookingsInfo[dk]}</span> : null}
                </div>
              );
            })}
          </div>
          <div className="sc-legend">
            <span><i className="lg lg-blocked" /> закрыто для всех</span>
            <span><i className="lg lg-t" /> только преподавателю</span>
            <span><i className="lg lg-s" /> только студенту</span>
            <span><i className="lg lg-partial" /> часть дня</span>
            <span><i className="lg lg-booked" /> есть записи</span>
          </div>
          <div className="hint sc-hint">Кликните по дате или протяните мышью по нескольким датам, чтобы выбрать промежуток.</div>
        </div>

        {/* ------- Панель выбранного дня / промежутка ------- */}
        <div className="sc-side">
          {status && (
            <div className={`status-msg show ${status.kind === 'ok' ? 'success' : 'error'}`}>{status.text}</div>
          )}

          <div className="card sc-panel">
            <div className="card-title">
              <span className="icon">📅</span>
              {selectedDates.length === 0
                ? 'Дата не выбрана'
                : selectedDates.length === 1
                  ? fmtRu(selectedDates[0])
                  : `${fmtRu(firstSel)} — ${fmtRu(lastSel)} (${selectedDates.length} дн.)`}
            </div>

            {/* Блокировки выбранных дат */}
            {selBlocks.length > 0 && (
              <div className="form-group">
                <label>Действующие блокировки на выбранные даты</label>
                {selBlocks.map((b, i) => (
                  <div key={`${b.audience}-${b.dateFrom}-${b.dateTo}-${b.timeFrom ?? ''}-${i}`} className="block-item">
                    <span className={`badge-audience aud-${b.audience}`}>{AUDIENCE_RU[b.audience]}</span>
                    <span>
                      {b.dateFrom === b.dateTo ? fmtRu(b.dateFrom) : `${fmtRu(b.dateFrom)} — ${fmtRu(b.dateTo)}`}
                      {b.timeFrom && b.timeTo ? `, ${b.timeFrom}–${b.timeTo}` : ', весь день'}
                    </span>
                    <button type="button" className="btn-danger btn-sm" disabled={busy} onClick={() => removeBlockExact(b)}>Снять</button>
                  </div>
                ))}
              </div>
            )}

            {/* Заблокировать / разблокировать */}
            {selectedDates.length > 0 && (
              <div className="form-group">
                <label>Что сделать с выбранными датами</label>
                <div className="sc-aud-row">
                  {AUDIENCES.map((a) => (
                    <button
                      key={a}
                      type="button"
                      className={`chip ${audience === a ? 'active' : ''}`}
                      onClick={() => setAudience(a)}
                    >
                      {AUDIENCE_RU[a]}
                    </button>
                  ))}
                </div>
                <label className="checkbox-row">
                  <input type="checkbox" checked={withTime} onChange={(e) => setWithTime(e.target.checked)} />
                  Только промежуток времени (иначе — весь день)
                </label>
                {withTime && (
                  <div className="block-form">
                    <input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} step={300} />
                    <span className="date-sep">—</span>
                    <input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} step={300} />
                  </div>
                )}
                <div className="sc-actions">
                  <button type="button" className="btn-submit btn-sm" disabled={busy} onClick={blockSelected}>
                    🔒 Заблокировать
                  </button>
                  <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={unblockSelected}>
                    🔓 Разблокировать
                  </button>
                  {singleDate && singleDow >= 1 && singleDow <= 5 && (
                    <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={toggleWeeklyDay}>
                      {weeklyBlocked
                        ? `${DAY_NAMES_SHORT[singleDow - 1]}: снимать блокировку каждую неделю`
                        : `${DAY_NAMES_SHORT[singleDow - 1]}: закрывать этот день каждую неделю`}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Слоты выбранного дня */}
          {singleDate && (
            <div className="card sc-panel">
              <div className="card-title"><span className="icon">🕐</span> Слоты этого дня</div>
              {!baseSlots.length ? (
                <div className="hint">При текущем графике слотов нет — измените часы работы ниже.</div>
              ) : (
                <div className="sc-slots-grid">
                  {baseSlots.map((s) => {
                    const ov = overrides[s.original];
                    const deleted = !!ov?.deleted;
                    const time = ov?.newTime ?? s.original;
                    const dur = ov?.duration ?? slotDuration;
                    const btAll = !!blockedTimes && (blockedTimes.all.has('full') || blockedTimes.all.has(time));
                    const btT = !btAll && !!blockedTimes && (blockedTimes.teacher.has('full') || blockedTimes.teacher.has(time));
                    const btS = !btAll && !!blockedTimes && (blockedTimes.student.has('full') || blockedTimes.student.has(time));
                    // сохраняем сразу с актуальной map (setOverrides асинхронный)
                    const commitOverride = (original: string, patch: Partial<TimeOverride> | null) => {
                      const nextMap = { ...overrides };
                      if (patch === null) delete nextMap[original];
                      else nextMap[original] = { ...(nextMap[original] ?? { original }), ...patch };
                      setOverrides(nextMap);
                      save({ timeOverrides: Object.values(nextMap) }, 'Слот обновлён');
                    };
                    return (
                      <div key={s.original} className={`sc-slot ${deleted ? 'deleted' : ''} ${btAll ? 'blocked' : ''}`}>
                        <div className="sc-slot-head">
                          <b>{deleted ? <s>{s.original}</s> : `${time}–${toHHmm(toMin(time) + dur)}`}</b>
                          {btAll && <span className="sc-slot-tag" title="закрыто для всех">🔒 все</span>}
                          {(btT || btS) && (
                            <span className="sc-slot-tag" title={btT ? 'закрыто преподавателю' : 'закрыто студенту'}>
                              {btT ? 'Пр 🔒' : 'Ст 🔒'}
                            </span>
                          )}
                        </div>
                        {!deleted && (
                          <div className="sc-slot-controls">
                            <input
                              type="time"
                              value={time}
                              step={300}
                              disabled={busy}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === s.original && dur === slotDuration) setOverride(s.original, null, false);
                                else setOverride(s.original, { newTime: v }, false);
                              }}
                              onBlur={(e) => {
                                const v = e.target.value;
                                if (!v) return;
                                if (v === s.original && dur === slotDuration) commitOverride(s.original, null);
                                else commitOverride(s.original, { newTime: v });
                              }}
                            />
                            <select
                              value={dur}
                              disabled={busy}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                if (v === slotDuration && time === s.original) commitOverride(s.original, null);
                                else commitOverride(s.original, { duration: v });
                              }}
                            >
                              {DURATION_OPTIONS.map((d) => <option key={d} value={d}>{d}м</option>)}
                            </select>
                            <button type="button" className="btn-danger btn-sm" disabled={busy} onClick={() => setOverride(s.original, { deleted: true }, true)}>✕</button>
                          </div>
                        )}
                        {deleted && (
                          <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => setOverride(s.original, null, true)}>Вернуть слот</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* График работы */}
          <div className="card sc-panel">
            <div className="card-title"><span className="icon">🏢</span> График работы студии</div>
            <div className="schedule-form">
              <label className="sched-field">
                Открытие
                <input type="time" value={openTime} step={300} disabled={busy} onChange={(e) => setOpenTime(e.target.value)} onBlur={(e) => e.target.value !== closeTime && toMin(e.target.value) < toMin(closeTime) && changeSchedule({ open: e.target.value })} />
              </label>
              <label className="sched-field">
                Закрытие
                <input type="time" value={closeTime} step={300} disabled={busy} onChange={(e) => setCloseTime(e.target.value)} onBlur={(e) => toMin(openTime) < toMin(e.target.value) && changeSchedule({ close: e.target.value })} />
              </label>
              <label className="sched-field">
                Длительность слота
                <select value={slotDuration} disabled={busy} onChange={(e) => changeSchedule({ step: Number(e.target.value) })}>
                  {DURATION_OPTIONS.map((d) => <option key={d} value={d}>{d} мин</option>)}
                </select>
              </label>
            </div>
            <div className="hint">
              Сейчас: {openTime}–{closeTime}, слот {slotDuration} мин → {previewSlots.length} шт.
              {overrideList.length > 0 && ` (изменено/удалено: ${overrideList.length})`}
            </div>
          </div>

          {/* Сообщения */}
          <div className="card sc-panel">
            <div className="card-title"><span className="icon">💬</span> Сообщения при блокировке</div>
            <div className="form-group">
              <label>Преподавателю</label>
              <textarea rows={2} value={msgTeacher} onChange={(e) => setMsgTeacher(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Студенту</label>
              <textarea rows={2} value={msgStudent} onChange={(e) => setMsgStudent(e.target.value)} />
            </div>
            <button type="button" className="btn-submit btn-sm" disabled={busy} onClick={saveMessages}>Сохранить сообщения</button>
          </div>

          <div className="sc-toolbar">
            <button type="button" className="btn-secondary btn-sm" onClick={markToday}>Сегодня</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setSelectedDates([])}>Снять выделение</button>
          </div>
        </div>
      </div>
    </div>
  );
}
