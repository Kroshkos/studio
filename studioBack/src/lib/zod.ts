import * as zod from 'zod';
import { ru } from 'zod/locales';

zod.config(ru());

const { z } = zod;

export { z };
