import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserService } from '@/modules/user/user.service';
import { LoginByEmailDto } from './dto/login-by-email.dto';
import { LoginByNameDto } from './dto/login-by-name.dto';
import { RegisterDto } from '@/modules/auth/dto/register.dto';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { createToken, JWTPayload } from '@/lib/jwt';
import { ResetPasswordDto } from '@/modules/auth/dto/reset-password.dto';
import bcrypt from 'bcrypt';
import axios, { isAxiosError } from 'axios';
import { appEnv } from '@/lib/env';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly prisma: PrismaService,
  ) {}

  async loginByEmail(input: LoginByEmailDto) {
    const user = await this.userService.getUniqueWithPassword({
      email: input.email,
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    await this.validatePasswordWithException(input.password, user.password);

    const token = createToken(user);

    return { ...user, token, password: undefined };
  }

  async loginByName(input: LoginByNameDto) {
    const user = await this.userService.getUniqueWithPassword({
      name: input.name,
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    await this.validatePasswordWithException(input.password, user.password);

    const token = createToken(user);

    return { ...user, token, password: undefined };
  }

  async createSession(input?: JWTPayload) {
    if (!input) throw new NotFoundException('Сессия не найдена');

    const { name, email } = input.user;

    const user = await this.userService.getUnique({
      name,
      email,
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    const { accessToken, refreshToken } = input;

    const token = createToken({
      user,
      accessToken,
      refreshToken,
    });

    return { ...user, token };
  }

  async register(input: RegisterDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: input.email },
    });

    if (user)
      throw new ConflictException(
        'Пользователь с таким email уже зарегестрирован',
      );

    const passwordHash = await this.encriptPassword(input.password);

    const newUser = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        roleName: 'user',
        password: passwordHash,
      },
    });

    const token = createToken(newUser);

    return { ...newUser, token, password: undefined };
  }

  resetPassword(data: ResetPasswordDto) {
    return { ok: true };
  }

  async logout(token: string) {
    try {
      await axios.post(`${appEnv.authServiceBackUrl}/internal/auth/logout`, {
        token,
      });
    } catch (e) {
      if (isAxiosError(e)) console.log(`Не удалось выйти: ${e.message}`);
    }
  }

  private async validatePasswordWithException(
    password: string,
    passwordEncripted: string,
  ): Promise<boolean> {
    const isValid = await this.validatePassword(password, passwordEncripted);

    if (!isValid) throw new BadRequestException('Пароль не совпадает');

    return isValid;
  }

  private async validatePassword(
    password: string,
    passwordEncripted: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, passwordEncripted);
  }

  private async encriptPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(11);
    const hash = await bcrypt.hash(password, salt);
    return hash;
  }
}
