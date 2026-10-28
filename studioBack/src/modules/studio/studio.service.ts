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
  async getSlotsForDate(date: string, role: 'teacher' | 'student') {
    const config = await this.getConfig();
    const bookings = await this.prisma.booking.findMany({ where: { date } });
    const occupiedSlots = bookings.map((b) => b.slot);

    const jsDay = new Date(date + 'T00:00:00').getDay(); // 0=вс … 6=сб
    const dayOfWeek = jsDay === 0 ? 7 : jsDay; // ISO: 1=Пн … 7=Вс
    const isBlocked = config.blockedDays.includes(dayOfWeek);
    let blockedMessage: string | null = null;
    if (isBlocked) {
      blockedMessage = role === 'teacher' ? config.msgTeacher : config.msgStudent;
    }

    const slots = Array.from({ length: 8 }, (_, i) => `${9 + i}:00`.padStart(5, '0'));
    const slotsWithStatus = slots.map((slot) => ({
      slot,
      booked: occupiedSlots.includes(slot),
    }));

    return { date, blocked: isBlocked, blockedMessage, slots: slotsWithStatus };
  }

  async getConfig() {
    let config = await this.prisma.studioConfig.findUnique({ where: { id: 1 } });
    if (!config) {
      config = await this.prisma.studioConfig.create({
        data: {
          id: 1,
          blockedDays: [],
          msgTeacher: 'В этот день преподаватели не могут записаться. Студия работает в особом режиме.',
          msgStudent: 'В этот день студия работает только для преподавателей. Студенты не могут записаться.',
        },
      });
    }
    return config;
  }

  async updateConfig(dto: UpdateConfigDto) {
    return this.prisma.studioConfig.update({
      where: { id: 1 },
      data: {
        blockedDays: dto.blockedDays !== undefined ? dto.blockedDays : undefined,
        msgTeacher: dto.msgTeacher,
        msgStudent: dto.msgStudent,
      },
    });
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
