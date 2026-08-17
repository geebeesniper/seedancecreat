import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { sql } from 'kysely';
import { db } from '../db/database.js';
import type { RequestContext } from '../core/context.js';
import { settings } from '../core/settings.js';
import { getStripe, stripeConfigured } from '../integrations/stripe.js';

export type StripeCheckoutMethod = 'card' | 'alipay';

function now(): string { return new Date().toISOString(); }
function walletId(ctx: RequestContext, currency: string): string {
  return `wallet:${ctx.tenantId}:${ctx.userId}:${currency}`;
}
function asMinor(value: unknown): number {
  const n=Number(value);
  if (!Number.isSafeInteger(n)) throw new Error('INVALID_RECHARGE_AMOUNT');
  if (n < settings.stripeMinRechargeMinor || n > settings.stripeMaxRechargeMinor) {
    throw new Error(`RECHARGE_AMOUNT_OUT_OF_RANGE:${settings.stripeMinRechargeMinor}-${settings.stripeMaxRechargeMinor}`);
  }
  return n;
}
function normalizeMethod(value: unknown): StripeCheckoutMethod {
  if (value === 'card' || value === 'alipay') return value;
  throw new Error('UNSUPPORTED_STRIPE_PAYMENT_METHOD');
}
function cleanClientRequestId(value: unknown): string {
  const s=typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9_-]{8,120}$/.test(s) ? s : randomUUID();
}

export class PaymentService {
  async config(ctx: RequestContext) {
    const wallet=await this.getWallet(ctx);
    return {
      success: true,
      original_payment_preserved: true,
      stripe: {
        enabled: stripeConfigured(),
        webhook_configured: Boolean(settings.stripeWebhookSecret),
        currency: settings.stripeDefaultCurrency,
        min_recharge_minor: settings.stripeMinRechargeMinor,
        max_recharge_minor: settings.stripeMaxRechargeMinor,
        presets_minor: settings.stripeRechargePresetsMinor,
        methods: ['card','alipay'],
        alipay_note: 'Alipay must also be enabled and eligible on the Stripe account.',
      },
      local_wallet: wallet,
    };
  }

  async getWallet(ctx: RequestContext) {
    const currency=settings.stripeDefaultCurrency;
    const row=await db.selectFrom('local_wallets').selectAll()
      .where('id','=',walletId(ctx,currency)).executeTakeFirst();
    return {
      currency,
      balance_minor: row?.balanceMinor ?? 0,
      total_recharged_minor: row?.totalRechargedMinor ?? 0,
      total_consumed_minor: row?.totalConsumedMinor ?? 0,
      scope: 'local_saas_credits',
      upstream_wallet_unchanged: true,
    };
  }

  async listOrders(ctx: RequestContext, limit=30) {
    const safe=Math.max(1,Math.min(100,Math.trunc(limit)||30));
    const rows=await db.selectFrom('payment_orders').selectAll()
      .where('tenantId','=',ctx.tenantId).where('userId','=',ctx.userId)
      .orderBy('createdAt','desc').limit(safe).execute();
    return rows.map(r=>({
      id:r.id, provider:r.provider, method:r.method, amount_minor:r.amountMinor, currency:r.currency,
      status:r.status, provider_session_id:r.providerSessionId, created_at:r.createdAt, paid_at:r.paidAt,
    }));
  }

  async createStripeCheckout(ctx: RequestContext, input: Record<string, unknown>, baseUrl: string) {
    if (!stripeConfigured()) return { success:false, code:'STRIPE_NOT_CONFIGURED' };
    const amountMinor=asMinor(input.amount_minor);
    const method=normalizeMethod(input.method);
    const clientRequestId=cleanClientRequestId(input.client_request_id);
    const idempotencyKey=`stripe:${ctx.tenantId}:${ctx.userId}:${clientRequestId}`;
    const existing=await db.selectFrom('payment_orders').selectAll().where('idempotencyKey','=',idempotencyKey).executeTakeFirst();
    const currency=settings.stripeDefaultCurrency;
    if (existing && (existing.amountMinor !== amountMinor || existing.method !== method || existing.currency !== currency)) {
      throw new Error('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYMENT');
    }
    if (existing?.checkoutUrl) {
      return { success:true, reused:true, order_id:existing.id, checkout_url:existing.checkoutUrl, session_id:existing.providerSessionId };
    }

    const id=existing?.id || randomUUID();
    const createdAt=existing?.createdAt || now();
    if (!existing) {
      await db.insertInto('payment_orders').values({
        id, tenantId:ctx.tenantId, userId:ctx.userId, provider:'stripe', method, amountMinor, currency,
        status:'creating', idempotencyKey, providerSessionId:null, providerPaymentIntentId:null, checkoutUrl:null,
        metadata:'{}', createdAt, updatedAt:createdAt, paidAt:null,
      }).execute();
    }

    const stripe=getStripe();
    const metadata={
      orderId:id, tenantId:ctx.tenantId, userId:ctx.userId,
      amountMinor:String(amountMinor), currency, kind:'gs_one_saas_credit_recharge',
    };
    const params: Stripe.Checkout.SessionCreateParams = {
      mode:'payment',
      payment_method_types:[method],
      client_reference_id:id,
      line_items:[{
        quantity:1,
        price_data:{
          currency,
          unit_amount:amountMinor,
          product_data:{name:'GS-One SaaS Credits',description:'Prepaid credits for GS-One SaaS services'},
        },
      }],
      metadata,
      payment_intent_data:{metadata},
      success_url:`${baseUrl}/payments.html?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${baseUrl}/payments.html?status=cancelled`,
    };

    try {
      const session=await stripe.checkout.sessions.create(params,{idempotencyKey:`gsone-checkout:${id}`});
      await db.updateTable('payment_orders').set({
        status:'pending', providerSessionId:session.id,
        providerPaymentIntentId:typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
        checkoutUrl:session.url ?? null, metadata:JSON.stringify(metadata), updatedAt:now(),
      }).where('id','=',id).execute();
      return { success:true, order_id:id, checkout_url:session.url, session_id:session.id, method, amount_minor:amountMinor, currency };
    } catch (error) {
      const message=error instanceof Error ? error.message : String(error);
      await db.updateTable('payment_orders').set({status:'failed',metadata:JSON.stringify({...metadata,error:message}),updatedAt:now()}).where('id','=',id).execute();
      return { success:false, code:'STRIPE_CHECKOUT_CREATE_FAILED', error:message };
    }
  }

  private async settlePaidSession(session: Stripe.Checkout.Session, eventId: string, eventType: string) {
    const orderId=session.metadata?.orderId || session.client_reference_id || '';
    if (!orderId) throw new Error('STRIPE_SESSION_MISSING_ORDER_ID');
    const order=await db.selectFrom('payment_orders').selectAll().where('id','=',orderId).executeTakeFirst();
    if (!order) throw new Error('PAYMENT_ORDER_NOT_FOUND');
    if (order.provider !== 'stripe') throw new Error('PAYMENT_PROVIDER_MISMATCH');
    if (order.providerSessionId && order.providerSessionId !== session.id) throw new Error('STRIPE_SESSION_MISMATCH');
    if (session.payment_status !== 'paid') return {credited:false,reason:'not_paid'};
    if (session.amount_total !== order.amountMinor || (session.currency || '').toLowerCase() !== order.currency.toLowerCase()) {
      await db.updateTable('payment_orders').set({status:'review',updatedAt:now()}).where('id','=',order.id).execute();
      throw new Error('STRIPE_AMOUNT_OR_CURRENCY_MISMATCH');
    }

    return db.transaction().execute(async trx=>{
      const eventInserted=await trx.insertInto('payment_events').values({
        id:eventId, provider:'stripe', eventType, payload:JSON.stringify({id:eventId,type:eventType,session_id:session.id}), processedAt:now(),
      }).onConflict(oc=>oc.column('id').doNothing()).returning('id').executeTakeFirst();
      if (!eventInserted) return {credited:false,duplicate_event:true};

      const ledgerId=`stripe_checkout:${session.id}`;
      const ledgerInserted=await trx.insertInto('credit_ledger').values({
        id:ledgerId, tenantId:order.tenantId, userId:order.userId, currency:order.currency, deltaMinor:order.amountMinor,
        source:'stripe_checkout', sourceId:session.id, description:`Stripe ${order.method} recharge`, createdAt:now(),
      }).onConflict(oc=>oc.column('id').doNothing()).returning('id').executeTakeFirst();

      if (ledgerInserted) {
        const wid=`wallet:${order.tenantId}:${order.userId}:${order.currency}`;
        const t=now();
        await trx.insertInto('local_wallets').values({
          id:wid,tenantId:order.tenantId,userId:order.userId,currency:order.currency,balanceMinor:0,totalRechargedMinor:0,totalConsumedMinor:0,createdAt:t,updatedAt:t,
        }).onConflict(oc=>oc.column('id').doNothing()).execute();
        await trx.updateTable('local_wallets').set({
          balanceMinor:sql<number>`${sql.ref('balanceMinor')} + ${order.amountMinor}`,
          totalRechargedMinor:sql<number>`${sql.ref('totalRechargedMinor')} + ${order.amountMinor}`,
          updatedAt:t,
        }).where('id','=',wid).execute();
      }

      await trx.updateTable('payment_orders').set({
        status:'paid', paidAt:order.paidAt || now(), updatedAt:now(), providerSessionId:session.id,
        providerPaymentIntentId:typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? order.providerPaymentIntentId,
      }).where('id','=',order.id).execute();
      return {credited:Boolean(ledgerInserted),duplicate_credit:!ledgerInserted,order_id:order.id};
    });
  }

  async handleStripeEvent(event: Stripe.Event) {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const result=await this.settlePaidSession(event.data.object as Stripe.Checkout.Session,event.id,event.type);
      return {received:true,event:event.type,...result};
    }
    if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      const session=event.data.object as Stripe.Checkout.Session;
      const orderId=session.metadata?.orderId || session.client_reference_id || '';
      if (orderId) await db.updateTable('payment_orders').set({status:event.type.endsWith('expired')?'expired':'failed',updatedAt:now()}).where('id','=',orderId).where('status','!=','paid').execute();
      await db.insertInto('payment_events').values({id:event.id,provider:'stripe',eventType:event.type,payload:JSON.stringify({id:event.id,type:event.type,session_id:session.id}),processedAt:now()})
        .onConflict(oc=>oc.column('id').doNothing()).execute();
      return {received:true,event:event.type};
    }
    await db.insertInto('payment_events').values({id:event.id,provider:'stripe',eventType:event.type,payload:JSON.stringify({id:event.id,type:event.type}),processedAt:now()})
      .onConflict(oc=>oc.column('id').doNothing()).execute();
    return {received:true,event:event.type,ignored:true};
  }

  async syncStripeSession(ctx: RequestContext, sessionId: string) {
    if (!stripeConfigured()) return {success:false,code:'STRIPE_NOT_CONFIGURED'};
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return {success:false,code:'INVALID_SESSION_ID'};
    const stripe=getStripe();
    const session=await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.tenantId !== ctx.tenantId || session.metadata?.userId !== ctx.userId) return {success:false,code:'SESSION_OWNER_MISMATCH'};
    if (session.payment_status === 'paid') await this.settlePaidSession(session,`sync:${session.id}`,'checkout.session.synced');
    const order=await db.selectFrom('payment_orders').selectAll().where('providerSessionId','=',session.id).where('tenantId','=',ctx.tenantId).where('userId','=',ctx.userId).executeTakeFirst();
    return {success:true,session_id:session.id,payment_status:session.payment_status,order_status:order?.status??'unknown',amount_minor:session.amount_total,currency:session.currency};
  }
}

export const paymentService=new PaymentService();
