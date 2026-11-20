import { Logger } from '@nestjs/common';

process.env.NODE_ENV = 'test';
process.env.THROTTLE_DISABLED = 'true';
if (!process.env.DEBUG_TEST_LOGS) Logger.overrideLogger(false);
