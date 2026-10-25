import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Res, HttpCode,
  HttpStatus, UnauthorizedException, BadRequestException, ForbiddenException, Put, Request,
} from '@nestjs/common';
import type { Response } from 'express';
import { StudioService } from './studio.service';
import type { StageKey } from './studio.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { LoginDto } from './dto/login.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { AdminGuard } from './guards/admin.guard';
import { DepartmentGuard } from './guards/department.guard';
import { createToken } from '@/lib/jwt';
import { Public } from '@/modules/auth/decorators/public.decorator';

@Controller('studio')
export class StudioController {
  constructor(private readonly studioService: StudioService) {}

  // === Публичные эндпоинты ===
  @Public()
  @Get('slots')
  async getSlots(@Query('date') date: string, @Query('role') role: 'teacher' | 'student') {
    return this.studioService.getSlotsForDate(date, role);
  }

  @Public()
  @Get('public/occupied')
  async getOccupiedSlots() {
    // Только дата+слот — без телефона/email. Для календаря и публичного списка записей.
    return this.studioService.getOccupiedSlots();
  }

  @Public()
  @Post('bookings')
  async createBooking(@Body() dto: CreateBookingDto) {
    return this.createBookingChecked(dto);
  }

  @Public()
  @Get('config')
  async getConfig() {
    return this.studioService.getConfig();
  }

  // Единая точка входа: подразделение (логин = наименование подразделения) или администратор.
  @Public()
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    const login = dto.login.trim();

    // 1. Проверяем администратора (совпадение с ADMIN_LOGIN из переменных окружения)
    if (this.studioService.validateAdmin(login, dto.password)) {
      const token = createToken({ admin: true, login }, 'admin-token');
      return { role: 'admin', name: login, token };
    }

    // 2. Иначе ищем подразделение в БД
    const dept = await this.studioService.validateDepartment(login, dto.password);
    if (!dept) throw new UnauthorizedException('Неверный логин или пароль');

    const token = createToken(dept, 'department-token');
    return { role: 'department', name: dept.departmentName, departmentId: dept.departmentId, token };
  }

  // Общие проверки при создании брони (используются и гостем, и админом)
  private async createBookingChecked(dto: CreateBookingDto, opts?: { departmentId?: number; createdBy?: string }) {
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

    return this.studioService.createBooking(dto, opts);
  }

  // === Эндпоинты подразделения (требуют department-token) ===
  // В «Мои записи» отображаются только записи соответствующего подразделения
  @UseGuards(DepartmentGuard)
  @Get('my/bookings')
  async myBookings(@Request() req: any) {
    return this.studioService.getAllBookings(req.department.departmentId);
  }

  // Подразделение не может самостоятельно создавать/менять/удалять брони —
  // запись создаёт гость через публичный эндпоинт, все операции — через администратора.

  // === Административные эндпоинты (требуют admin-JWT) ===
  @UseGuards(AdminGuard)
  @Get('admin/dashboard')
  async getDashboard() {
    return this.studioService.getDashboard();
  }

  @UseGuards(AdminGuard)
  @Get('admin/stages')
  async getStages() {
    return this.studioService.listStages();
  }

  // Полный список бронирований содержит персональные данные — доступен только админу
  @UseGuards(AdminGuard)
  @Get('bookings')
  async getAllBookings() {
    return this.studioService.getAllBookings();
  }

  // Создание брони администратором (бронирование студии на нужный день/время от имени подразделения)
  @UseGuards(AdminGuard)
  @Post('admin/bookings')
  async adminCreateBooking(@Body() dto: CreateBookingDto, @Query('departmentId') departmentIdRaw?: string) {
    const departmentId = departmentIdRaw ? Number(departmentIdRaw) : undefined;
    if (departmentIdRaw && (!Number.isInteger(departmentId) || departmentId! <= 0)) {
      throw new BadRequestException('Некорректный departmentId');
    }
    return this.createBookingChecked(dto, {
      departmentId,
      createdBy: 'admin',
    });
  }

  // Перенос/редактирование брони (дата, время, контакты, подразделение)
  @UseGuards(AdminGuard)
  @Patch('admin/bookings/:id')
  async updateBooking(@Param('id') id: string, @Body() dto: UpdateBookingDto) {
    return this.studioService.updateBooking(id, dto);
  }

  // Отметка выполненных этапов
  @UseGuards(AdminGuard)
  @Patch('admin/bookings/:id/stage')
  async setStage(@Param('id') id: string, @Body('stageKey') stageKey: StageKey) {
    return this.studioService.setBookingStage(id, stageKey);
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

  // --- Подразделения ---
  @UseGuards(AdminGuard)
  @Get('admin/departments')
  async listDepartments() {
    return this.studioService.listDepartments();
  }

  @UseGuards(AdminGuard)
  @Post('admin/departments')
  async createDepartment(@Body() dto: CreateDepartmentDto) {
    return this.studioService.createDepartment(dto);
  }

  @UseGuards(AdminGuard)
  @Put('admin/departments/:id')
  async updateDepartment(@Param('id') id: string, @Body() dto: CreateDepartmentDto) {
    return this.studioService.updateDepartment(Number(id), dto);
  }

  @UseGuards(AdminGuard)
  @Delete('admin/departments/:id')
  async deleteDepartment(@Param('id') id: string) {
    return this.studioService.deleteDepartment(Number(id));
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
