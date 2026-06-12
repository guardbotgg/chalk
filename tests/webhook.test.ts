import { Chalk } from '../src/index';


const DISCORD_WEBHOOK_URL = 'YOUR_DISCORD_WEBHOOK_URL_HERE';
const logger = new Chalk({
  webhook: DISCORD_WEBHOOK_URL,
  labels: {
    client: 'purple',
    system: 'sky'
  }
});

console.log('--- Executing Out-of-Band Webhook Test Loop ---\n');
logger.info('Initializing network diagnostic broadcast...');
logger.success('Hello from the webhook wrapper instance!');
logger.warn('System telemetry pipeline testing warning thresholds.');
logger.error('Catastrophic Event Simulation:', new Error('Webhook error trace transmission success'));
console.log('\nCheck your Discord channel! The success, warn, and error payloads should be visible inside clean gcode format blocks.');