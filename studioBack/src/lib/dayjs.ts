import dayjs from 'dayjs';
import customParseFormatPlugin from 'dayjs/plugin/customParseFormat';
import utc from 'dayjs/plugin/utc';
import 'dayjs/locale/ru';

dayjs.extend(utc);
dayjs.extend(customParseFormatPlugin);
dayjs.locale('ru');

const instance = dayjs;

export { instance as dayjs };
