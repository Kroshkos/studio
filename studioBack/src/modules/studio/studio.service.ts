import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { createToken } from '@/lib/jwt';
import type { BookingStage } from '../../../generated/prisma';

export const STAGES: BookingStage[] = [
  'AWAITING_RECORD',
  'RECORDING',
  'PROCESSING',
  'SENT',
];

export const STAGE_RU: Record<BookingStage, string> = {
  AWAITING_RECORD: 'Ожидает записи',
  RECORDING: 'Запись видео',
  PROCESSING: 'Обработка видео',
  SENT: 'Видео отправлено',
};

interface StageChange {
  stage: BookingStage;
  at: string;
  by: string;
}

// Студийный конфиг с блокировками по промежуткам дат (результат getConfig)
type StudioConfigWithBlocks = {
  dayBlocks: {
    id: number;
    configId: number;
    audience: string;
    dateFrom: string;
    dateTo: string;
    timeFrom: string | null;
    timeTo: string | null;
    createdAt: Date;
  }[];
  timeOverrides: {
    id: number;
    configId: number;
    original: string;
    newTime: string | null;
    duration: number | null;
    deleted: boolean;
    createdAt: Date;
  }[];
} & {
  id: number;
  blockedDays: number[];
  msgTeacher: string;
  msgStudent: string;
  openTime: string;
  closeTime: string;
  slotDuration: number;
  updatedAt: Date;
};

// ISO-нумерация дней недели: 1=Пн … 7=Вс
function isoDayOfWeek(date: string): number {
  const jsDay = new Date(date + 'T00:00:00').getDay(); // 0=вс … 6=сб
  return jsDay === 0 ? 7 : jsDay;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function toHHmm(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

@Injectable()
export class StudioService {
  constructor(private prisma: PrismaService) {}

  // --- Аутентификация ---
  validateAdmin(login: string, password: string): boolean {
    const adminLogin = process.env.ADMIN_LOGIN || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'studio2024';
    return login.toLowerCase() === adminLogin.toLowerCase() && password === adminPass;
  }

  adminToken(login: string) {
    return createToken(
      { session: { kind: 'admin', login } },
      'studio-session-token',
    );
  }

  async loginDepartment(name: string, password: string) {
    // Логин нечувствителен к регистру: ищем подразделение без учёта регистра
    const dept =
      (await this.prisma.department.findUnique({ where: { name } })) ??
      (await this.prisma.department.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      }));
    if (!dept || !dept.isActive) {
      throw new UnauthorizedException('Неверное подразделение или пароль');
    }
    const ok = await bcrypt.compare(password, dept.passwordHash);
    if (!ok) throw new UnauthorizedException('Неверное подразделение или пароль');

    const token = createToken(
      { session: { kind: 'department', id: dept.id, name: dept.name } },
      'studio-session-token',
    );
    return { token, department: { id: dept.id, name: dept.name } };
  }

  // --- Подразделения (админ) ---
  async createDepartment(name: string, password: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Укажите наименование подразделения');
    const exists = await this.prisma.department.findUnique({ where: { name: trimmed } });
    if (exists) throw new ConflictException('Подразделение с таким названием уже существует');
    const passwordHash = await bcrypt.hash(password, 10);
    const dept = await this.prisma.department.create({
      data: { name: trimmed, passwordHash },
    });
    return this.publicDepartment(dept);
  }

  async listDepartments() {
    const depts = await this.prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { bookings: true } } },
    });
    return depts.map((d) => ({
      id: d.id,
      name: d.name,
      isActive: d.isActive,
      createdAt: d.createdAt,
      bookingsCount: d._count.bookings,
    }));
  }

  private publicDepartment(d: { id: string; name: string; isActive: boolean; createdAt: Date }) {
    return { id: d.id, name: d.name, isActive: d.isActive, createdAt: d.createdAt };
  }

  async updateDepartment(id: string, data: { name?: string; password?: string; isActive?: boolean }) {
    const dept = await this.prisma.department.findUnique({ where: { id } });
    if (!dept) throw new NotFoundException('Подразделение не найдено');

    const update: any = {};
    if (data.name !== undefined) {
      const trimmed = data.name.trim();
      if (!trimmed) throw new BadRequestException('Укажите наименование подразделения');
      const clash = await this.prisma.department.findUnique({ where: { name: trimmed } });
      if (clash && clash.id !== id) throw new ConflictException('Такое название уже занято');
      update.name = trimmed;
    }
    if (data.password) update.passwordHash = await bcrypt.hash(data.password, 10);
    if (data.isActive !== undefined) update.isActive = data.isActive;

    const updated = await this.prisma.department.update({ where: { id }, data: update });
    return this.publicDepartment(updated);
  }

  async deleteDepartment(id: string) {
    const dept = await this.prisma.department.findUnique({ where: { id } });
    if (!dept) throw new NotFoundException('Подразделение не найдено');
    await this.prisma.department.delete({ where: { id } });
    return { deleted: true };
  }

  // --- Бронирования ---
  private assertCanAccessDept(session: any, departmentId: string) {
    if (session.kind !== 'admin' && session.id !== departmentId) {
      throw new UnauthorizedException('Нет доступа к этому подразделению');
    }
  }

  async createBooking(dto: CreateBookingDto, session: any) {
    this.assertCanAccessDept(session, dto.departmentId);

    const dept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
    if (!dept || !dept.isActive) throw new NotFoundException('Подразделение не найдено');

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(dto.date)) throw new BadRequestException('Некорректная дата');
    if (dto.date < this.todayKey()) throw new BadRequestException('Нельзя записаться в прошлое');

    const existing = await this.prisma.booking.findFirst({
      where: { date: dto.date, slot: dto.slot },
    });
    if (existing) throw new ConflictException('Этот слот уже занят');

    return this.prisma.booking.create({
      data: {
        departmentId: dto.departmentId,
        phone: dto.phone,
        email: dto.email,
        purpose: dto.purpose,
        role: dto.role,
        date: dto.date,
        slot: dto.slot,
        dateLabel: new Date(dto.date + 'T00:00:00').toLocaleDateString('ru-RU'),
        stage: 'AWAITING_RECORD',
        stageHistory: [
          {
            stage: 'AWAITING_RECORD',
            at: new Date().toISOString(),
            by: session.kind === 'admin' ? `Администратор (${session.login})` : dept.name,
          },
        ],
      },
      include: { department: { select: { id: true, name: true } } },
    });
  }

  private todayKey(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // Список для подразделения (или все — для админа)
  async getMyBookings(session: any) {
    const where = session.kind === 'admin' ? {} : { departmentId: session.id };
    return this.prisma.booking.findMany({
      where,
      orderBy: [{ date: 'asc' }, { slot: 'asc' }],
      include: { department: { select: { id: true, name: true } } },
    });
  }

  // Админский список с поиском/фильтрами/сортировкой
  async adminListBookings(params: {
    q?: string;
    stage?: BookingStage | 'ALL';
    role?: 'teacher' | 'student' | 'ALL';
    departmentId?: string;
    dateFrom?: string;
    dateTo?: string;
    sort?: string; // 'date'|'-date'|'createdAt'|'-createdAt'|'stage'|'department'
  }) {
    const where: any = {};
    if (params.stage && params.stage !== 'ALL') where.stage = params.stage;
    if (params.role && params.role !== 'ALL') where.role = params.role;
    if (params.departmentId && params.departmentId !== 'ALL') where.departmentId = params.departmentId;
    if (params.dateFrom || params.dateTo) {
      where.date = {};
      if (params.dateFrom) where.date.gte = params.dateFrom;
      if (params.dateTo) where.date.lte = params.dateTo;
    }
    if (params.q && params.q.trim()) {
      const q = params.q.trim();
      where.OR = [
        { phone: { contains: q } },
        { email: { contains: q, mode: 'insensitive' } },
        { purpose: { contains: q, mode: 'insensitive' } },
        { date: { contains: q } },
        { department: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    let orderBy: any = [{ date: 'asc' }, { slot: 'asc' }];
    switch (params.sort) {
      case '-date': orderBy = [{ date: 'desc' }, { slot: 'desc' }]; break;
      case 'createdAt': orderBy = [{ createdAt: 'asc' }]; break;
      case '-createdAt': orderBy = [{ createdAt: 'desc' }]; break;
      case 'stage': orderBy = [{ stage: 'asc' }, { date: 'asc' }]; break;
      case 'department': orderBy = [{ department: { name: 'asc' } }, { date: 'asc' }]; break;
      default: break;
    }

    return this.prisma.booking.findMany({
      where,
      orderBy,
      include: { department: { select: { id: true, name: true } } },
    });
  }

  async updateBookingStage(id: string, stage: BookingStage, session: any) {
    if (!STAGES.includes(stage)) throw new BadRequestException('Неизвестный этап');
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Бронирование не найдено');
    this.assertCanAccessDept(session, booking.departmentId);

    const history = (booking.stageHistory as unknown as StageChange[]) || [];
    const next = [...history, { stage, at: new Date().toISOString(), by: this.sessionName(session) }];

    return this.prisma.booking.update({
      where: { id },
      data: { stage, stageUpdatedAt: new Date(), stageHistory: next as any },
      include: { department: { select: { id: true, name: true } } },
    });
  }

  private sessionName(session: any): string {
    return session.kind === 'admin' ? `Администратор (${session.login})` : session.name;
  }

  // Перенос записи (новая дата/слот) — только админ
  async moveBooking(id: string, date: string, slot: string, session: any) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Бронирование не найдено');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Некорректная дата');

    const clash = await this.prisma.booking.findFirst({
      where: { date, slot, NOT: { id } },
    });
    if (clash) throw new ConflictException('Новый слот уже занят');

    const history = (booking.stageHistory as unknown as StageChange[]) || [];
    const note = `Перенос: ${booking.date} ${booking.slot} → ${date} ${slot} (${this.sessionName(session)})`;
    const next = [...history, { stage: booking.stage, at: new Date().toISOString(), by: note }];

    return this.prisma.booking.update({
      where: { id },
      data: {
        date,
        slot,
        dateLabel: new Date(date + 'T00:00:00').toLocaleDateString('ru-RU'),
        stageHistory: next as any,
      },
      include: { department: { select: { id: true, name: true } } },
    });
  }

  async updateBooking(id: string, dto: UpdateBookingDto, session: any) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Бронирование не найдено');
    this.assertCanAccessDept(session, booking.departmentId);

    const data: any = { ...dto };
    if (dto.date || dto.slot) {
      const date = dto.date ?? booking.date;
      const slot = dto.slot ?? booking.slot;
      const clash = await this.prisma.booking.findFirst({
        where: { date, slot, NOT: { id } },
      });
      if (clash) throw new ConflictException('Этот слот уже занят');
      data.date = date;
      data.slot = slot;
      data.dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('ru-RU');
    }

    return this.prisma.booking.update({
      where: { id },
      data,
      include: { department: { select: { id: true, name: true } } },
    });
  }

  async deleteBooking(id: string, session: any) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Бронирование не найдено');
    // подразделение может удалить свою запись только пока она на этапе ожидания
    if (session.kind !== 'admin' && booking.stage !== 'AWAITING_RECORD') {
      throw new BadRequestException('Запись уже в работе — удаление только через администратора');
    }
    return this.prisma.booking.delete({ where: { id } });
  }

  async deleteAllBookings() {
    return this.prisma.booking.deleteMany();
  }

  // --- Дашборд ---
  async getDashboard(session: any) {
    const where = session.kind === 'admin' ? {} : { departmentId: session.id };

    const [
      total,
      teachers,
      students,
      awaiting,
      recording,
      processing,
      sent,
      groupByDept,
    ] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.count({ where: { ...where, role: 'teacher' } }),
      this.prisma.booking.count({ where: { ...where, role: 'student' } }),
      this.prisma.booking.count({ where: { ...where, stage: 'AWAITING_RECORD' } }),
      this.prisma.booking.count({ where: { ...where, stage: 'RECORDING' } }),
      this.prisma.booking.count({ where: { ...where, stage: 'PROCESSING' } }),
      this.prisma.booking.count({ where: { ...where, stage: 'SENT' } }),
      session.kind === 'admin'
        ? this.prisma.booking.groupBy({ by: ['departmentId'], _count: { _all: true } })
        : Promise.resolve([]),
    ]);

    const departments = session.kind === 'admin'
      ? await this.prisma.department.findMany({ select: { id: true, name: true } })
      : [];
    const deptMap = new Map(departments.map((d) => [d.id, d.name]));

    return {
      totalBookings: total,
      recordedVideos: total - awaiting, // начато запись и далее
      processedSentVideos: sent,
      teachers,
      students,
      stages: {
        AWAITING_RECORD: awaiting,
        RECORDING: recording,
        PROCESSING: processing,
        SENT: sent,
      },
      byDepartment: groupByDept.map((g) => ({
        departmentId: g.departmentId,
        departmentName: deptMap.get(g.departmentId) ?? '—',
        count: g._count._all,
      })),
    };
  }

  // --- Слоты / конфиг ---
  // Генерация слотов по графику работы + индивидуальные изменения (перенос/длительность/удаление)
  private generateSlots(config: StudioConfigWithBlocks): {
    original: string;
    time: string;
    endTime: string;
    duration: number;
    deleted: boolean;
  }[] {
    const open = toMinutes(config.openTime || '09:00');
    const close = toMinutes(config.closeTime || '17:00');
    const step = config.slotDuration || 60;

    const base: { original: string; time: string; endTime: string; duration: number; deleted: boolean }[] = [];
    for (let t = open; t + step <= close; t += step) {
      base.push({
        original: toHHmm(t),
        time: toHHmm(t),
        endTime: toHHmm(t + step),
        duration: step,
        deleted: false,
      });
    }

    // Применяем индивидуальные изменения к «базовым» слотам
    for (const ov of config.timeOverrides || []) {
      const slot = base.find((s) => s.original === ov.original);
      if (!slot) continue;
      if (ov.deleted) {
        slot.deleted = true;
        continue;
      }
      if (ov.newTime) slot.time = ov.newTime;
      if (ov.duration) {
        slot.duration = ov.duration;
        slot.endTime = toHHmm(toMinutes(slot.time) + ov.duration);
      } else if (ov.newTime) {
        slot.endTime = toHHmm(toMinutes(ov.newTime) + slot.duration);
      }
    }

    return base.filter((s) => !s.deleted).sort((a, b) => a.time.localeCompare(b.time));
  }

  async getSlotsForDate(date: string, role: 'teacher' | 'student') {
    const config = await this.getConfig();
    const bookings = await this.prisma.booking.findMany({ where: { date } });
    const occupiedSlots = bookings.map((b) => b.slot);

    const dayOfWeek = isoDayOfWeek(date);
    const isBlocked = config.blockedDays.includes(dayOfWeek);

    // Блокировки по конкретному промежутку дат и аудитории
    const blocks = (config.dayBlocks || []).filter((b) => b.dateFrom <= date && date <= b.dateTo);
    const blockAudiences = new Set(blocks.map((b) => b.audience));
    const blockedForRole = blockAudiences.has('all') || blockAudiences.has(role);

    let blockedMessage: string | null = null;
    if (blockedForRole) {
      blockedMessage = role === 'teacher' ? config.msgTeacher : config.msgStudent;
    } else if (isBlocked) {
      blockedMessage = role === 'teacher' ? config.msgTeacher : config.msgStudent;
    }

    // Частичные блокировки по времени для текущей роли (внутри рабочих часов)
    const timeIntervals = blocks
      .filter((b) => (b.audience === 'all' || b.audience === role) && b.timeFrom && b.timeTo)
      .map((b) => ({ from: toMinutes(b.timeFrom as string), to: toMinutes(b.timeTo as string) }));

    const slots = this.generateSlots(config);
    const slotsWithStatus = slots.map((s) => {
      const start = toMinutes(s.time);
      const end = toMinutes(s.endTime);
      const blockedByTime = timeIntervals.some((iv) => start < iv.to && end > iv.from);
      return {
        slot: s.time,
        original: s.original,
        endTime: s.endTime,
        duration: s.duration,
        booked: occupiedSlots.includes(s.time),
        blocked: blockedByTime,
      };
    });

    // Если все доступные слоты дня перекрыты временной блокировкой — считаем день заблокированным
    const allTimeBlocked =
      !isBlocked && !blockedForRole && slotsWithStatus.length > 0 && slotsWithStatus.every((s) => s.blocked);

    return {
      date,
      blocked: isBlocked || blockedForRole || allTimeBlocked,
      blockedMessage,
      schedule: {
        openTime: config.openTime,
        closeTime: config.closeTime,
        slotDuration: config.slotDuration,
      },
      slots: slotsWithStatus,
    };
  }

  async getConfig(): Promise<StudioConfigWithBlocks> {
    const config = await this.prisma.studioConfig.findUnique({
      where: { id: 1 },
      include: {
        dayBlocks: { orderBy: [{ dateFrom: 'asc' }, { dateTo: 'asc' }] },
        timeOverrides: { orderBy: { original: 'asc' } },
      },
    });
    if (config) return config;

    const created = await this.prisma.studioConfig.create({
      data: {
        id: 1,
        blockedDays: [],
        msgTeacher: 'В этот день преподаватели не могут записаться. Студия работает в особом режиме.',
        msgStudent: 'В этот день студия работает только для преподавателей. Студенты не могут записаться.',
      },
    });
    return { ...created, dayBlocks: [], timeOverrides: [] };
  }

  async updateConfig(dto: UpdateConfigDto) {
    if (dto.dayBlocks !== undefined) {
      for (const b of dto.dayBlocks) {
        if (b.dateFrom > b.dateTo) {
          throw new BadRequestException('Дата окончания блокировки раньше даты начала');
        }
        if (b.dateFrom === b.dateTo && b.timeFrom && b.timeTo && b.timeFrom >= b.timeTo) {
          throw new BadRequestException('Время окончания блокировки должно быть позже времени начала');
        }
      }
      await this.prisma.dayBlock.deleteMany({ where: { configId: 1 } });
      if (dto.dayBlocks.length) {
        await this.prisma.dayBlock.createMany({
          data: dto.dayBlocks.map((b) => ({
            configId: 1,
            audience: b.audience,
            dateFrom: b.dateFrom,
            dateTo: b.dateTo,
            timeFrom: b.timeFrom || null,
            timeTo: b.timeTo || null,
          })),
        });
      }
    }

    if (dto.schedule !== undefined) {
      const { openTime, closeTime, slotDuration, overrides } = dto.schedule;
      if (toMinutes(openTime) >= toMinutes(closeTime)) {
        throw new BadRequestException('Время закрытия должно быть позже времени открытия');
      }

      // Проверки индивидуальных изменений слотов
      const gen = this.generateSlots({
        ...(await this.getConfig()),
        openTime,
        closeTime,
        slotDuration,
        timeOverrides: [],
      });
      const originals = new Set(gen.map((s) => s.original));
      const list = overrides || [];
      const seenOrig = new Set<string>();
      for (const ov of list) {
        if (!originals.has(ov.original)) {
          throw new BadRequestException(`Слот ${ov.original} не существует при выбранном графике`);
        }
        if (seenOrig.has(ov.original)) {
          throw new BadRequestException(`Дублирующееся изменение слота ${ov.original}`);
        }
        seenOrig.add(ov.original);
        if (ov.deleted) continue;
        const time = ov.newTime ?? ov.original;
        const dur = ov.duration ?? slotDuration;
        if (toMinutes(time) < toMinutes(openTime) || toMinutes(time) + dur > toMinutes(closeTime)) {
          throw new BadRequestException(
            `Слот ${time}${dur !== slotDuration ? ` (${dur} мин)` : ''} выходит за границы графика работы`,
          );
        }
      }
      // Пересечения изменённых слотов между собой
      const effective = list
        .filter((o) => !o.deleted)
        .map((o) => ({
          from: toMinutes(o.newTime ?? o.original),
          to: toMinutes(o.newTime ?? o.original) + (o.duration ?? slotDuration),
          label: o.newTime ?? o.original,
        }));
      // и незатронутые базовые слоты
      const changedOriginals = new Set(list.map((o) => o.original));
      for (const s of gen) {
        if (!changedOriginals.has(s.original)) {
          effective.push({ from: toMinutes(s.time), to: toMinutes(s.time) + s.duration, label: s.time });
        }
      }
      effective.sort((a, b) => a.from - b.from);
      for (let i = 1; i < effective.length; i++) {
        if (effective[i].from < effective[i - 1].to) {
          throw new BadRequestException(
            `Слоты пересекаются: ${effective[i - 1].label} и ${effective[i].label}`,
          );
        }
      }

      await this.prisma.timeOverride.deleteMany({ where: { configId: 1 } });
      if (list.length) {
        await this.prisma.timeOverride.createMany({
          data: list.map((o) => ({
            configId: 1,
            original: o.original,
            newTime: o.newTime ?? null,
            duration: o.duration ?? null,
            deleted: o.deleted ?? false,
          })),
        });
      }

      await this.prisma.studioConfig.update({
        where: { id: 1 },
        data: { openTime, closeTime, slotDuration },
      });
    }

    // Если прислан только schedule или только dayBlocks — не затираем сообщения пустыми значениями
    const hasMsgs = dto.msgTeacher !== undefined || dto.msgStudent !== undefined;
    if (dto.blockedDays !== undefined || hasMsgs) {
      await this.prisma.studioConfig.update({
        where: { id: 1 },
        data: {
          blockedDays: dto.blockedDays !== undefined ? dto.blockedDays : undefined,
          ...(hasMsgs ? { msgTeacher: dto.msgTeacher, msgStudent: dto.msgStudent } : {}),
        },
      });
    }

    return this.getConfig();
  }

  // --- Отчёт ---
  async getReportCsv() {
    const bookings = await this.prisma.booking.findMany({
      orderBy: [{ date: 'asc' }, { slot: 'asc' }],
      include: { department: { select: { name: true } } },
    });
    const headers = ['№', 'Дата', 'Время', 'Подразделение', 'Роль', 'Телефон', 'Email', 'Тема', 'Этап', 'Дата создания'];
    const rows = bookings.map((b, i) => [
      i + 1,
      b.dateLabel || b.date,
      b.slot,
      b.department.name,
      b.role === 'teacher' ? 'Преподаватель' : 'Студент',
      b.phone,
      b.email || '',
      b.purpose || '',
      STAGE_RU[b.stage],
      new Date(b.createdAt).toLocaleString('ru-RU'),
    ]);
    return { headers, rows };
  }
}
