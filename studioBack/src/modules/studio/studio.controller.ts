import {
  Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Res, HttpCode, HttpStatus
} from '@nestjs/common';
import type { Response } from 'express';
import { StudioService } from './studio.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminGuard } from './guards/admin.guard';
import { createToken } from '@/lib/jwt';
import { UnauthorizedException, Put } from '@nestjs/common';
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
  @Get('bookings')
  async getAllBookings() {
    return this.studioService.getAllBookings();
  }

  @Public()
  @Post('bookings')
  async createBooking(@Body() dto: CreateBookingDto) {
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

  // === Административные эндпоинты (требуют JWT) ===
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