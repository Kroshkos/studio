import { Module } from '@nestjs/common';
import { StudioController } from './studio.controller';
import { StudioService } from './studio.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [StudioController],
  providers: [StudioService, PrismaService],
})
export class StudioModule {}