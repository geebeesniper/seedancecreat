import Stripe from 'stripe';
import { settings } from '../core/settings.js';

let client: Stripe | undefined;

export function stripeConfigured(): boolean {
  return Boolean(settings.stripeSecretKey);
}

export function getStripe(): Stripe {
  if (!settings.stripeSecretKey) throw new Error('STRIPE_NOT_CONFIGURED');
  if (client === undefined) client = new Stripe(settings.stripeSecretKey);
  return client;
}

export function verifyStripeEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
  if (!settings.stripeWebhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET_NOT_CONFIGURED');
  return getStripe().webhooks.constructEvent(rawBody, signature, settings.stripeWebhookSecret);
}
