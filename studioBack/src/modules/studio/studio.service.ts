import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // необходимо создать PrismaService
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateConfigDto } from './dto/update-config.dto';

@Injectable()
export class StudioService {
  constructor(private prisma: PrismaService) {}

  // --- Бронирования ---
  async createBooking(dto: CreateBookingDto) {
    const { date, slot } = dto;
    const existing = await this.prisma.booking.findFirst({ where: { date, slot } });
    if (existing) throw new ConflictException('Этот слот уже занят');

    return this.prisma.booking.create({
      data: {
        ...dto,
        dateLabel: new Date(date).toLocaleDateString('ru-RU'),
      },
    });
  }

  async getAllBookings() {
    return this.prisma.booking.findMany({ orderBy: [{ date: 'asc' }, { slot: 'asc' }] });
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
    const config = await this.getConfig();
    const bookings = await this.prisma.booking.findMany({ where: { date } });
    const occupiedSlots = bookings.map(b => b.slot);

    const dayOfWeek = new Date(date).getDay(); // 0=вс … 6=сб
    const isBlocked = config.blockedDays.includes(dayOfWeek);
    let blockedMessage: string | null = null;
    if (isBlocked) {
      blockedMessage = role === 'teacher' ? config.msgTeacher : config.msgStudent;
    }

    // Генерация слотов с 9 до 17
    const slots = Array.from({ length: 8 }, (_, i) => `${9 + i}:00`.padStart(5, '0'));
    const slotsWithStatus = slots.map(slot => ({
      slot,
      booked: occupiedSlots.includes(slot),
    }));

    return { date, blocked: isBlocked, blockedMessage, slots: slotsWithStatus };
  }

  // --- Конфигурация ---
  async getConfig() {
    let config = await this.prisma.studioConfig.findUnique({ where: { id: 1 } });
    if (!config) {
      // создаём конфиг по умолчанию
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
    // данные должны быть в переменных окружения
    const adminLogin = process.env.ADMIN_LOGIN || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'studio2024';
    return login === adminLogin && password === adminPass;
  }
}