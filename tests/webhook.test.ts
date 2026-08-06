import { Chalk } from '../src/index';


const DISCORD_WEBHOOK_URL = 'YOUR_DISCORD_WEBHOOK_URL_HERE';
const chalk = new Chalk({
  logWebhook: DISCORD_WEBHOOK_URL,
  labels: {
    client: 'purple',
    system: 'sky'
  }
});

chalk.log('--- Executing Out-of-Band Webhook Test Loop ---\n');
chalk.info('Initializing network diagnostic broadcast...');
chalk.success('Hello from the webhook wrapper instance!');
chalk.warn('System telemetry pipeline testing warning thresholds.');
chalk.error('Catastrophic Event Simulation:', new Error('Webhook error trace transmission success'));
chalk.log('\nCheck your Discord channel! The success, warn, and error payloads should be visible inside clean gcode format blocks.');