import { SetMetadata } from '@nestjs/common';

export const SKIP_CASBIN_KEY = 'SKIP_CASBIN';
/**
 * Помечает контроллер/метод, на котором проверка Casbin НЕ будет выполняться.
 * Применяется совместно с глобальным CasbinGuard.
 */
export const SkipCasbin = () => SetMetadata(SKIP_CASBIN_KEY, true);
