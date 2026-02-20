import { Chalk } from '../src/chalk';

const logger = new Chalk({
  webhook: 'WEBHOOK_URL_HERE',
  prefix: 'WEBHOOK',
});

logger.info(['client'], 'Hello from webhook logger!');
logger.error(['client'], new Error('Webhook error test'));