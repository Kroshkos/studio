import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query,
  UseGuards, Res, HttpCode, HttpStatus, Req, UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { StudioService } from './studio.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { LoginDto } from './dto/login.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { StudioAuthGuard } from './guards/auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { DepartmentGuard } from './guards/department.guard';
import { Public } from '@/modules/auth/decorators/public.decorator';
import type { BookingStage } from '../../../generated/prisma';

@Controller('studio')
export class StudioController {
  constructor(private readonly studioService: StudioService) {}

  private session(req: Request): any {
    return (req as any).session;
  }

  // === Публичные эндпоинты ===
  @Public()
  @Get('slots')
  async getSlots(@Query('date') date: string, @Query('role') role: 'teacher' | 'student') {
    return this.studioService.getSlotsForDate(date, role);
  }

  @Public()
  @Get('config')
  async getConfig() {
    return this.studioService.getConfig();
  }

  // Единая точка входа: администратор или подразделение
  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const adminLogin = process.env.ADMIN_LOGIN || 'admin';
    if (dto.login.toLowerCase() === adminLogin.toLowerCase()) {
      const valid = this.studioService.validateAdmin(dto.login, dto.password);
      if (!valid) throw new UnauthorizedException('Неверные учётные данные');
      return { kind: 'admin', token: this.studioService.adminToken(dto.login) };
    }
    const res = await this.studioService.loginDepartment(dto.login, dto.password);
    return { kind: 'department', token: res.token, department: res.department };
  }

  // === Эндпоинты после авторизации (админ или подразделение) ===
  @UseGuards(StudioAuthGuard, DepartmentGuard)
  @Get('bookings/mine')
  async myBookings(@Req() req: Request) {
    return this.studioService.getMyBookings(this.session(req));
  }

  @UseGuards(StudioAuthGuard, DepartmentGuard)
  @Post('bookings')
  async createBooking(@Body() dto: CreateBookingDto, @Req() req: Request) {
    return this.studioService.createBooking(dto, this.session(req));
  }

  @UseGuards(StudioAuthGuard, DepartmentGuard)
  @Delete('bookings/:id')
  async deleteBooking(@Param('id') id: string, @Req() req: Request) {
    return this.studioService.deleteBooking(id, this.session(req));
  }

  @UseGuards(StudioAuthGuard, DepartmentGuard)
  @Patch('bookings/:id/stage')
  async setStage(
    @Param('id') id: string,
    @Body('stage') stage: BookingStage,
    @Req() req: Request,
  ) {
    return this.studioService.updateBookingStage(id, stage, this.session(req));
  }

  @UseGuards(StudioAuthGuard, DepartmentGuard)
  @Get('dashboard')
  async dashboard(@Req() req: Request) {
    return this.studioService.getDashboard(this.session(req));
  }

  // === Только администратор ===
  @UseGuards(StudioAuthGuard, AdminGuard)
  @Get('admin/bookings')
  async adminBookings(
    @Query('q') q?: string,
    @Query('stage') stage?: BookingStage | 'ALL',
    @Query('role') role?: 'teacher' | 'student' | 'ALL',
    @Query('departmentId') departmentId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sort') sort?: string,
  ) {
    return this.studioService.adminListBookings({ q, stage, role, departmentId, dateFrom, dateTo, sort });
  }

  @UseGuards(StudioAuthGuard, AdminGuard)
  @Patch('admin/bookings/:id')
  async adminUpdateBooking(@Param('id') id: string, @Body() dto: UpdateBookingDto, @Req() req: Request) {
    return this.studioService.updateBooking(id, dto, this.session(req));
  }

  @UseGuards(StudioAuthGuard, AdminGuard)
  @Post('admin/bookings/:id/move')
  async adminMoveBooking(
    @Param('id') id: string,
    @Body() body: { date: string; slot: string },
    @Req() req: Request,
  ) {
    return this.studioService.moveBooking(id, body.date, body.slot, this.session(req));
  }

  @UseGuards(StudioAuthGuard, AdminGuard)
  @Delete('admin/bookings/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async adminDeleteBooking(@Param('id') id: string) {
    await this.studioService.deleteBooking(id, { kind: "admin" });
  }

  @UseGuards(StudioAuthGuard, AdminGuard)
  @Delete('admin/bookings')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAllBookings() {
    await this.studioService.deleteAllBookings();
  }

  @UseGuards(StudioAuthGuard, AdminGuard)
  @Get('admin/departments')
  async listDepartments() {
    return this.studioService.listDepartments();
  }

  @UseGuards(StudioAuthGuard, AdminGuard)
  @Post('admin/departments')
  async createDepartment(@Body() dto: CreateDepartmentDto) {
    return this.studioService.createDepartment(dto.name, dto.password);
  }

  @UseGuards(StudioAuthGuard, AdminGuard)
  @Patch('admin/departments/:id')
  async updateDepartment(
    @Param('id') id: string,
    @Body() body: { name?: string; password?: string; isActive?: boolean },
  ) {
    return this.studioService.updateDepartment(id, body);
  }

  @UseGuards(StudioAuthGuard, AdminGuard)
  @Delete('admin/departments/:id')
  async deleteDepartment(@Param('id') id: string) {
    return this.studioService.deleteDepartment(id);
  }

  @UseGuards(StudioAuthGuard, AdminGuard)
  @Put('admin/config')
  async updateConfig(@Body() dto: UpdateConfigDto) {
    return this.studioService.updateConfig(dto);
  }

  @UseGuards(StudioAuthGuard, AdminGuard)
  @Get('admin/report')
  async downloadReport(@Res() res: Response) {
    const { headers, rows } = await this.studioService.getReportCsv();
    const csv = this.convertToCsv(headers, rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="studio_report_${Date.now()}.csv"`);
    res.send(csv);
  }

  private convertToCsv(headers: string[], rows: any[][]): string {
    const escape = (cell: any) => `"${String(cell).replace(/"/g, '""')}"`;
    const headerLine = headers.map(escape).join(',');
    const dataLines = rows.map((row) => row.map(escape).join(','));
    return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
  }
}
