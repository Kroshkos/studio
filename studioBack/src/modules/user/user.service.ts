import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User, Prisma } from 'generated/prisma';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { UpdateUserDto } from '@/modules/user/dto/update-user.dto';
import { CreateUserDto } from '@/modules/user/dto/create-user.dto';
import { generateRandomCode } from '@/lib/random';

export const USER_NOT_FOUND = 'Пользователь не найден';
export const USER_ALREADY_EXIST = 'Пользователь уже существует';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async getUnique(userWhereUniqueInput: Prisma.UserWhereUniqueInput) {
    const user = await this.prisma.user.findUnique({
      where: userWhereUniqueInput,
      omit: {
        password: true,
      },
    });

    if (!user) throw new NotFoundException(USER_NOT_FOUND);

    return user;
  }

  async getUniqueWithPassword(
    userWhereUniqueInput: Prisma.UserWhereUniqueInput,
  ) {
    return this.prisma.user.findUnique({
      where: userWhereUniqueInput,
    });
  }

  findMany(userWhereInput: Prisma.UserWhereInput) {
    return this.prisma.user.findMany({
      where: userWhereInput,
      omit: {
        password: true,
      },
    });
  }

  async getAll(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.UserWhereUniqueInput;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }): Promise<User[]> {
    const { skip, take, cursor, where, orderBy } = params;
    return this.prisma.user.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
    });
  }

  async create(data: CreateUserDto): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: {
        email: data.email,
      },
    });

    if (user) throw new ConflictException(USER_ALREADY_EXIST);

    return this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        roleName: data.roleName,
        password: data.password,
      },
    });
  }

  async update(id: number, user: UpdateUserDto): Promise<User> {
    const userInDB = await this.prisma.user.findFirst({
      where: {
        id,
      },
    });

    if (!userInDB) throw new NotFoundException(USER_NOT_FOUND);

    return await this.prisma.user.update({
      data: user,
      where: {
        id,
      },
    });
  }

  async delete(id: number): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
      },
    });

    if (!user) throw new NotFoundException(USER_NOT_FOUND);

    return this.prisma.user.delete({
      where: {
        id,
      },
    });
  }

  async deleteWhere(where: Prisma.UserWhereUniqueInput): Promise<User> {
    return this.prisma.user.delete({
      where,
    });
  }

  async findOrCreate(data: {
    id: number;
    email: string;
    name: string;
    roleName: string | null;
    personId: number | null;
  }): Promise<User> {
    const pass = generateRandomCode();

    const user = await this.prisma.user.findFirst({
      where: {
        id: data.id,
      },
    });

    if (user) return user;

    return await this.prisma.user.create({
      data: {
        id: data.id,
        email: data.email,
        name: data.name,
        roleName: 'user',
        password: pass,
        personId: data.personId === -1 ? undefined : data.personId,
      },
    });
  }
}
