import {
  Controller,
  Body,
  Post,
  Get,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { LoginByEmailDto } from './dto/login-by-email.dto';
import { ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginByNameDto } from './dto/login-by-name.dto';
import { RegisterDto } from '@/modules/auth/dto/register.dto';
import { RegisterResultDto } from '@/modules/auth/dto/register-result.dto';
import { AuthDto } from '@/modules/auth/dto/auth.dto';
import { ResetPasswordDto } from '@/modules/auth/dto/reset-password.dto';
import { Public } from '@/modules/auth/decorators/public.decorator';
import type { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { appEnv } from '@/lib/env';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { JWTPayload } from '@/lib/jwt';
import { SkipCasbin } from '@/modules/auth/decorators/skip-casbin.decorator';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @SkipCasbin()
  @Public(false)
  @ApiResponse({
    status: 200,
    description: 'Пользователь авторизован',
    type: AuthDto,
  })
  @ApiResponse({ status: 404, description: 'Пользователь не найден' })
  @Post('logout')
  async logout(
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: JWTPayload,
  ) {
    await this.authService.logout(user.accessToken);
    res.clearCookie('jwt');
  }

  @ApiResponse({
    status: 200,
    description: 'Пользователь авторизован',
    type: AuthDto,
  })
  @ApiResponse({ status: 404, description: 'Пользователь не найден' })
  @Post('login/by-email')
  async loginByEmail(@Body() input: LoginByEmailDto) {
    return this.authService.loginByEmail(input);
  }

  @ApiResponse({
    status: 200,
    description: 'Пользователь авторизован',
    type: AuthDto,
  })
  @ApiResponse({ status: 404, description: 'Пользователь не найден' })
  @Post('login/by-name')
  async loginByName(@Body() input: LoginByNameDto) {
    return this.authService.loginByName(input);
  }

  @ApiResponse({
    status: 200,
    description: 'Пользователь зарегистрирован',
    type: RegisterResultDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Пользователь с таким email уже существует',
  })
  @Post('register')
  async register(@Body() input: RegisterDto) {
    return this.authService.register(input);
  }

  @ApiResponse({
    status: 200,
    description: 'Пользователь зарегистрирован',
    type: AuthDto,
  })
  @Post('reset-password')
  resetPassword(@Body() input: ResetPasswordDto) {
    return this.authService.resetPassword(input);
  }

  @Get('oauth')
  @UseGuards(AuthGuard('OAuth2'))
  login() {}

  @Get('callback')
  @UseGuards(AuthGuard('OAuth2'))
  async callback(@Req() req: Request, @Res() res: Response) {
    const auth = await this.authService.createSession(req.user);
    res.cookie('jwt', auth.token, { secure: true, httpOnly: true });

    return res.redirect(appEnv.frontUrl + '/lk');
  }
}
