import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma } from 'generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateConfigDto } from './dto/update-config.dto';

// Рабочие часы студии: слоты 09:00 … 16:00 (последний старт — STUDIO_LAST_HOUR - 1)
export const STUDIO_FIRST_HOUR = 9;
export const STUDIO_LAST_HOUR = 17;

// Схема дней недели в конфиге: 1=Пн … 7=Вс
export type StudioConfigView = {
  id: number;
  blockedDays: number[];
  msgTeacher: string;
  msgStudent: string;
  updatedAt: Date;
};

@Injectable()
export class StudioService {
  constructor(private prisma: PrismaService) {}

  // --- Бронирования ---
  async createBooking(dto: CreateBookingDto) {
    const { date, slot } = dto;

    // Валидация формата даты и диапазона слотов до обращения к БД
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Некорректный формат даты. Ожидается YYYY-MM-DD');
    }
    const validSlots = Array.from({ length: STUDIO_LAST_HOUR - STUDIO_FIRST_HOUR }, (_, i) =>
      `${STUDIO_FIRST_HOUR + i}:00`.padStart(5, '0'),
    );
    if (!validSlots.includes(slot)) {
      throw new BadRequestException(`Некорректный слот. Доступны: ${validSlots.join(', ')}`);
    }

    try {
      // Атомарное создание: уникальный индекс @@unique([date, slot]) защищает от гонок
      return await this.prisma.booking.create({
        data: {
          ...dto,
          dateLabel: new Date(date).toLocaleDateString('ru-RU'),
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Этот слот уже занят');
      }
      throw e;
    }
  }

  async getAllBookings() {
    return this.prisma.booking.findMany({ orderBy: [{ date: 'asc' }, { slot: 'asc' }] });
  }

  // Публичная занятость: только дата и слот, без персональных данных
  async getOccupiedSlots() {
    const bookings = await this.prisma.booking.findMany({
      select: { date: true, slot: true },
      orderBy: [{ date: 'asc' }, { slot: 'asc' }],
    });
    return bookings;
  }

  async deleteBooking(id: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Бронирование не найдено');
    return this.prisma.booking.delete({ where: { id } });
  }

  async deleteAllBookings() {
    return this.prisma.booking.deleteMany();
  }

  async getSlotsForDate(date: string, role: 'teacher' | 'student') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Некорректный формат даты. Ожидается YYYY-MM-DD');
    }

    const config = await this.getConfig();
    // Публичный ответ: только статусы слотов и флаг блокировки дня — без персональных данных
    const bookings = await this.prisma.booking.findMany({
      where: { date },
      select: { slot: true },
    });
    const occupiedSlots = bookings.map(b => b.slot);

    const isWeekend = this.isWeekendDate(date);
    // Дни недели нормализованы к схеме конфига: 1=Пн … 7=Вс
    // (getDay() возвращает 0=Вс … 6=Сб)
    const dayOfWeek = this.getLocalDayOfWeek(date);
    const blockedByConfig = config.blockedDays.includes(dayOfWeek);
    const isBlocked = blockedByConfig || isWeekend;
    let blockedMessage: string | null = null;
    if (blockedByConfig) {
      blockedMessage = role === 'teacher' ? config.msgTeacher : config.msgStudent;
    } else if (isWeekend) {
      blockedMessage = 'Студия работает по будням (Пн–Пт).';
    }

    // Генерация слотов в рамках рабочих часов студии
    const slots = Array.from(
      { length: STUDIO_LAST_HOUR - STUDIO_FIRST_HOUR },
      (_, i) => `${STUDIO_FIRST_HOUR + i}:00`.padStart(5, '0'),
    );
    const slotsWithStatus = slots.map(slot => ({
      slot,
      booked: occupiedSlots.includes(slot),
    }));

    return { date, blocked: isBlocked, blockedMessage, slots: slotsWithStatus };
  }

  // 1=Пн … 7=Вс из строки YYYY-MM-DD (без смещения часовых поясов)
  private getLocalDayOfWeek(date: string): number {
    const [y, m, d] = date.split('-').map(Number);
    const jsDay = new Date(y, m - 1, d).getDay(); // 0=Вс … 6=Сб
    return jsDay === 0 ? 7 : jsDay;
  }

  private isWeekendDate(date: string): boolean {
    const dow = this.getLocalDayOfWeek(date);
    return dow === 6 || dow === 7; // Сб, Вс
  }

  // --- Конфигурация ---
  async getConfig(): Promise<StudioConfigView> {
    let config = await this.prisma.studioConfig.findUnique({ where: { id: 1 } });
    if (!config) {
      try {
        // создаём конфиг по умолчанию (upsert-подобное поведение через create)
        config = await this.prisma.studioConfig.create({
          data: {
            id: 1,
            blockedDays: [],
            msgTeacher: 'В этот день преподаватели не могут записаться. Студия работает в особом режиме.',
            msgStudent: 'В этот день студия работает только для преподавателей. Студенты не могут записаться.',
          },
        });
      } catch (e) {
        // гонка при параллельном создании — записью владел другой процесс, читаем её
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          config = await this.prisma.studioConfig.findUniqueOrThrow({ where: { id: 1 } });
        } else {
          throw e;
        }
      }
    }

    // Приводим к единой схеме дней недели: 1=Пн … 7=Вс
    // (в старых данных могло быть сохранено значение 0=Вс из-за рассинхрона с getDay())
    const normalizedBlockedDays = Array.from(
      new Set((config.blockedDays ?? []).map(d => (d === 0 ? 7 : d))),
    ).sort((a, b) => a - b);

    return { ...config, blockedDays: normalizedBlockedDays };
  }

  async updateConfig(dto: UpdateConfigDto): Promise<StudioConfigView> {
    await this.getConfig(); // гарантируем существование записи с id=1

    const blockedDays =
      dto.blockedDays !== undefined
        ? Array.from(new Set(dto.blockedDays.map(d => (d === 0 ? 7 : d)))).sort((a, b) => a - b)
        : undefined;

    const updated = await this.prisma.studioConfig.update({
      where: { id: 1 },
      data: {
        blockedDays,
        msgTeacher: dto.msgTeacher,
        msgStudent: dto.msgStudent,
      },
    });

    return updated;
  }

  // --- Отчёт ---
  async getReportCsv() {
    const bookings = await this.getAllBookings();
    // преобразование в формат CSV
    const headers = ['№','Дата','Время','ФИО','Роль','Телефон','Email','Тема','Дата создания'];
    const rows = bookings.map((b, i) => [
      i+1, b.dateLabel || b.date, b.slot, b.name,
      b.role === 'teacher' ? 'Преподаватель' : 'Студент',
      b.phone, b.email || '', b.purpose || '',
      new Date(b.createdAt).toLocaleString('ru-RU'),
    ]);
    return { headers, rows };
  }

  // --- Аутентификация администратора (вспомогательная) ---
  validateAdmin(login: string, password: string): boolean {
    const adminLogin = process.env.ADMIN_LOGIN;
    const adminPass = process.env.ADMIN_PASSWORD;

    // Секретов по умолчанию быть не должно: если переменные не заданы — доступ запрещён
    if (!adminLogin || !adminPass) {
      console.error(
        'ADMIN_LOGIN/ADMIN_PASSWORD не заданы в переменных окружения — вход администратора отключён',
      );
      return false;
    }

    // Сравнение через timingSafeEqual, чтобы не светить длину/байты пароля через время ответа
    const a = Buffer.from(password);
    const b = Buffer.from(adminPass);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b) && login === adminLogin;
  }
}