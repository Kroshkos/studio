import {
  Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Res, HttpCode, HttpStatus,
  UnauthorizedException, BadRequestException, ForbiddenException, Put,
} from '@nestjs/common';
import type { Response } from 'express';
import { StudioService } from './studio.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminGuard } from './guards/admin.guard';
import { createToken } from '@/lib/jwt';
import { Public } from '@/modules/auth/decorators/public.decorator';

@Controller('studio')
export class StudioController {
  constructor(private readonly studioService: StudioService) {}

  @Public() // === Публичные эндпоинты ===
  @Get('slots')
  async getSlots(@Query('date') date: string, @Query('role') role: 'teacher' | 'student') {
    return this.studioService.getSlotsForDate(date, role);
  }

  @Public()
  @Get('public/occupied')
  async getOccupiedSlots() {
    // Только дата+слот — без ФИО/телефона/email. Для календаря и публичного списка записей.
    return this.studioService.getOccupiedSlots();
  }

  @Public()
  @Post('bookings')
  async createBooking(@Body() dto: CreateBookingDto) {
    // Нельзя забронировать заблокированный день (с учётом схемы 1=Пн…7=Вс)
    const slotsInfo = await this.studioService.getSlotsForDate(dto.date, dto.role);
    if (slotsInfo.blocked) {
      throw new ForbiddenException(slotsInfo.blockedMessage ?? 'Запись в этот день закрыта');
    }

    // Нельзя забронировать прошедшую дату/освободившийся слот сегодня
    const now = new Date();
    const todayKey = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    if (dto.date < todayKey) {
      throw new BadRequestException('Нельзя забронировать прошедшую дату');
    }
    if (dto.date === todayKey) {
      const hour = parseInt(dto.slot.split(':')[0], 10);
      if (hour <= now.getHours()) {
        throw new BadRequestException('Этот слот уже начался или завершился');
      }
    }

    return this.studioService.createBooking(dto);
  }

  @Public()
  @Get('config')
  async getConfig() {
    return this.studioService.getConfig();
  }

  @Public()
  @Post('admin/login')
  async adminLogin(@Body() dto: AdminLoginDto) {
    const valid = this.studioService.validateAdmin(dto.login, dto.password);
    if (!valid) throw new UnauthorizedException('Неверные учётные данные');

    const token = createToken({ admin: true, login: dto.login }, 'admin-token');
    return { token };
  }

  // === Административные эндпоинты (требуют админ-JWT) ===
  // Список всех бронирований содержит персональные данные — доступен только админу
  @UseGuards(AdminGuard)
  @Get('bookings')
  async getAllBookings() {
    return this.studioService.getAllBookings();
  }

  @UseGuards(AdminGuard)
  @Delete('bookings/:id')
  async deleteBooking(@Param('id') id: string) {
    return this.studioService.deleteBooking(id);
  }

  @UseGuards(AdminGuard)
  @Delete('bookings')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAllBookings() {
    await this.studioService.deleteAllBookings();
  }

  @UseGuards(AdminGuard)
  @Get('report')
  async downloadReport(@Res() res: Response) {
    const { headers, rows } = await this.studioService.getReportCsv();
    const csv = this.convertToCsv(headers, rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="studio_report_${Date.now()}.csv"`);
    res.send(csv);
  }

  @UseGuards(AdminGuard)
  @Put('config')
  async updateConfig(@Body() dto: UpdateConfigDto) {
    return this.studioService.updateConfig(dto);
  }

  private convertToCsv(headers: string[], rows: any[][]): string {
    const escape = (cell: any) => `"${String(cell).replace(/"/g, '""')}"`;
    const headerLine = headers.map(escape).join(',');
    const dataLines = rows.map(row => row.map(escape).join(','));
    return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
  }
}