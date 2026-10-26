import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from '@/modules/auth/decorators/public.decorator';

@Public()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getOk(): string {
    return this.appService.getOk();
  }

  // Healthcheck для платформ оркестрации (Amvera и др.)
  @Get('health')
  health() {
    return { status: 'ok', uptime: process.uptime() };
  }
}
