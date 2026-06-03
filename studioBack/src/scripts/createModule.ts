import fs from 'fs';
import { dirname } from 'path';
import startCase from 'lodash.startcase';

const PATH = '../modules';

let ENTITY_NAME = '';
let DASHED = '';
let CAMEL_CASE_ENTITY_NAME = '';
let UPPER_CASE_ENTITY_NAME = '';

function writeFile(filepath: string, content: string) {
  const path = PATH + filepath;

  fs.mkdir(dirname(path), { recursive: true }, function (err) {
    if (err) {
      console.log(err);
      return;
    }

    fs.writeFileSync(path, content);
  });
}

function writeEntityDTO() {
  writeFile(
    `/${DASHED}/dto/${DASHED}.dto.ts`,
    `
import { ApiProperty } from '@nestjs/swagger';

export class ${ENTITY_NAME}Dto {
  @ApiProperty({
    description: 'УИД',
  })
  id: number;

  @ApiProperty({
    description: 'Название',
  })
  name: string;
}`,
  );
}

function writeCreateEntityDTO() {
  writeFile(
    `/${DASHED}/dto/create-${DASHED}.dto.ts`,
    `
import { ApiProperty } from '@nestjs/swagger';

export class Create${ENTITY_NAME}Dto {
  @ApiProperty({
    description: 'Название',
  })
  name: string;
}
`,
  );
}

function writeUpdateEntityDTO() {
  writeFile(
    `/${DASHED}/dto/update-${DASHED}.dto.ts`,
    `
import { PartialType } from '@nestjs/swagger';
import { Create${ENTITY_NAME}Dto } from './create-${DASHED}.dto';

export class Update${ENTITY_NAME}Dto extends PartialType(Create${ENTITY_NAME}Dto) {}
`,
  );
}

function writeModuleFile() {
  writeFile(
    `/${DASHED}/${DASHED}.module.ts`,
    `
import { Module } from '@nestjs/common';
import { ${ENTITY_NAME}Service } from './${DASHED}.service';
import { ${ENTITY_NAME}Controller } from './${DASHED}.controller';

@Module({
  controllers: [${ENTITY_NAME}Controller],
  providers: [${ENTITY_NAME}Service],
})
export class ${ENTITY_NAME}Module {}
   `,
  );
}

function writeServiceFile() {
  writeFile(
    `/${DASHED}/${DASHED}.service.ts`,
    `
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Create${ENTITY_NAME}Dto } from './dto/create-${DASHED}.dto';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Update${ENTITY_NAME}Dto } from '@/modules/${DASHED}/dto/update-${DASHED}.dto';

export const ${UPPER_CASE_ENTITY_NAME}_ALREADY_EXIST = 'Запись уже существует';
export const ${UPPER_CASE_ENTITY_NAME}_NOT_FOUND = 'Запись не найдена';

@Injectable()
export class ${ENTITY_NAME}Service {
  constructor(readonly prisma: PrismaService) {}

  async create({ name }: Create${ENTITY_NAME}Dto) {
    const ${CAMEL_CASE_ENTITY_NAME} = await this.prisma.${CAMEL_CASE_ENTITY_NAME}.findFirst({
      where: {
        name,
      },
    });

    if (${CAMEL_CASE_ENTITY_NAME}) {
      throw new ConflictException(${UPPER_CASE_ENTITY_NAME}_ALREADY_EXIST);
    }

    const created = await this.prisma.${CAMEL_CASE_ENTITY_NAME}.create({
      data: {
        name,
      },
    });

    return created;
  }

  findAll() {
    return this.prisma.${CAMEL_CASE_ENTITY_NAME}.findMany();
  }

  async findOne(id: number) {
    const ${CAMEL_CASE_ENTITY_NAME} = await this.prisma.${CAMEL_CASE_ENTITY_NAME}.findUnique({
      where: {
        id,
      },
    });

    if (!${CAMEL_CASE_ENTITY_NAME}) {
      throw new NotFoundException(${UPPER_CASE_ENTITY_NAME}_NOT_FOUND);
    }

    return ${CAMEL_CASE_ENTITY_NAME};
  }

  async findOneByName(name: string) {
    const ${CAMEL_CASE_ENTITY_NAME} = await this.prisma.${CAMEL_CASE_ENTITY_NAME}.findFirst({
      where: {
        name,
      },
    });

    if (!${CAMEL_CASE_ENTITY_NAME}) {
      throw new NotFoundException(${UPPER_CASE_ENTITY_NAME}_NOT_FOUND);
    }

    return ${CAMEL_CASE_ENTITY_NAME};
  }

  async update(id: number, data: Update${ENTITY_NAME}Dto) {
    const ${CAMEL_CASE_ENTITY_NAME} = await this.prisma.${CAMEL_CASE_ENTITY_NAME}.findUnique({
      where: {
        id,
      },
    });

    if (!${CAMEL_CASE_ENTITY_NAME}) {
      throw new NotFoundException(${UPPER_CASE_ENTITY_NAME}_NOT_FOUND);
    }

    return this.prisma.${CAMEL_CASE_ENTITY_NAME}.update({
      where: {
        id,
      },
      data,
    });
  }

  async remove(id: number) {
    const ${CAMEL_CASE_ENTITY_NAME} = await this.prisma.${CAMEL_CASE_ENTITY_NAME}.findUnique({
      where: {
        id,
      },
    });

    if (!${CAMEL_CASE_ENTITY_NAME}) {
      throw new NotFoundException(${UPPER_CASE_ENTITY_NAME}_NOT_FOUND);
    }

    return this.prisma.${CAMEL_CASE_ENTITY_NAME}.delete({
      where: {
        id,
      },
    });
  }
}
   `,
  );
}

function writeControllerFile() {
  writeFile(
    `/${DASHED}/${DASHED}.controller.ts`,
    `
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { 
  ${UPPER_CASE_ENTITY_NAME}_ALREADY_EXIST,
  ${UPPER_CASE_ENTITY_NAME}_NOT_FOUND,
  ${ENTITY_NAME}Service } from './${DASHED}.service';
import { ${ENTITY_NAME}Dto } from './dto/${DASHED}.dto';
import { Create${ENTITY_NAME}Dto } from './dto/create-${DASHED}.dto';
import { Update${ENTITY_NAME}Dto } from './dto/update-${DASHED}.dto';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';

@ApiBearerAuth()
@Controller('${DASHED}')
export class ${ENTITY_NAME}Controller {
  constructor(private readonly ${CAMEL_CASE_ENTITY_NAME}Service: ${ENTITY_NAME}Service) {}

  @ApiResponse({
    status: 200,
    description: 'Запись успешно cоздана',
    type: Create${ENTITY_NAME}Dto,
  })
  @ApiResponse({
    status: 409,
    description: ${UPPER_CASE_ENTITY_NAME}_ALREADY_EXIST,
  })
  @Post()
  create(@Body() create${ENTITY_NAME}Dto: Create${ENTITY_NAME}Dto) {
    return this.${CAMEL_CASE_ENTITY_NAME}Service.create(create${ENTITY_NAME}Dto);
  }

  @ApiResponse({
    status: 200,
    description: 'Список записей успешно получен',
    type: ${ENTITY_NAME}Dto,
    isArray: true,
  })
  @Get()
  findAll() {
    return this.${CAMEL_CASE_ENTITY_NAME}Service.findAll();
  }

  @ApiResponse({
    status: 200,
    description: 'Запись успешно получена',
    type: ${ENTITY_NAME}Dto,
  })
  @ApiResponse({
    status: 404,
    description: ${UPPER_CASE_ENTITY_NAME}_NOT_FOUND,
  })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.${CAMEL_CASE_ENTITY_NAME}Service.findOne(+id);
  }

  @ApiResponse({
    status: 200,
    description: 'Запись успешно обновлена',
    type: Update${ENTITY_NAME}Dto,
  })
  @ApiResponse({
    status: 404,
    description: ${UPPER_CASE_ENTITY_NAME}_NOT_FOUND,
  })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() update${ENTITY_NAME}Dto: Update${ENTITY_NAME}Dto,
  ) {
    return this.${CAMEL_CASE_ENTITY_NAME}Service.update(+id, update${ENTITY_NAME}Dto);
  }

  @ApiResponse({
    status: 200,
    description: 'Запись успешно удалена',
    type: Update${ENTITY_NAME}Dto,
  })
  @ApiResponse({
    status: 404,
    description: ${UPPER_CASE_ENTITY_NAME}_NOT_FOUND,
  })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.${CAMEL_CASE_ENTITY_NAME}Service.remove(+id);
  }
}
   `,
  );
}

function setDashed(name: string) {
  DASHED = startCase(name)
    .split(' ')
    .map((e) => e.toLowerCase())
    .join('-');
}

function setCamelCase(name: string) {
  let firstChar = name[0];
  firstChar = firstChar.toLowerCase();
  CAMEL_CASE_ENTITY_NAME = firstChar + name.slice(1);
}

function setUpperCase() {
  UPPER_CASE_ENTITY_NAME = DASHED.replaceAll('-', '_').toUpperCase();
}

function checkArgs(args: string[]) {
  if (args.length < 3) {
    console.log('Не указано название модуля');
    return false;
  }

  if (args[2][0] !== args[2][0].toUpperCase()) {
    console.log('Модуль должена называться в PascalCase стиле');
    return false;
  }

  return true;
}

function checkExists(path: string) {
  return fs.existsSync(path);
}

function createModule() {
  const args = process.argv;

  if (!checkArgs(args)) {
    return;
  }

  ENTITY_NAME = args[2];

  setDashed(ENTITY_NAME);
  setCamelCase(ENTITY_NAME);
  setUpperCase();

  if (checkExists(PATH + '/' + DASHED)) {
    console.log('Модуль уже существует');
    return;
  }

  writeEntityDTO();
  writeCreateEntityDTO();
  writeUpdateEntityDTO();
  writeModuleFile();
  writeServiceFile();
  writeControllerFile();

  console.log('Модуль создан');
}

createModule();
