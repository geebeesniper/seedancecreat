import type { FastifyInstance, FastifyRequest } from 'fastify';
import { buildContext } from '../core/context.js';
import { settings } from '../core/settings.js';
import { paymentService } from '../services/paymentService.js';
import { verifyStripeEvent } from '../integrations/stripe.js';

type RawBodyRequest = FastifyRequest & { rawBody?: Buffer };

function publicBaseUrl(req: FastifyRequest): string {
  if (settings.publicBaseUrl) return settings.publicBaseUrl;
  const vercel=process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  if (process.env.NODE_ENV === 'production') throw new Error('PUBLIC_BASE_URL_REQUIRED_FOR_STRIPE');
  const forwardedProto=req.headers['x-forwarded-proto'];
  const proto=Array.isArray(forwardedProto)?forwardedProto[0]:(forwardedProto||'http');
  const forwardedHost=req.headers['x-forwarded-host'];
  const host=Array.isArray(forwardedHost)?forwardedHost[0]:(forwardedHost||req.headers.host||'127.0.0.1:8000');
  return `${proto}://${host}`;
}

export async function paymentRoutes(app: FastifyInstance) {
  app.get('/api/payments/config', async req=>paymentService.config(buildContext(req)));
  app.get('/api/payments/wallet', async req=>({success:true,wallet:await paymentService.getWallet(buildContext(req))}));
  app.get<{Querystring:{limit?:string}}>('/api/payments/orders', async req=>({success:true,orders:await paymentService.listOrders(buildContext(req),Number(req.query.limit||30))}));

  app.post<{Body:{amount_minor?:unknown;method?:unknown;client_request_id?:unknown}}>('/api/payments/stripe/checkout', async (req,reply)=>{
    try {
      const body=(req.body&&typeof req.body==='object'?req.body:{}) as Record<string,unknown>;
      const result=await paymentService.createStripeCheckout(buildContext(req),body,publicBaseUrl(req));
      if ((result as {success?:boolean}).success === false) return reply.code(400).send(result);
      return result;
    } catch (error) {
      return reply.code(400).send({success:false,error:error instanceof Error?error.message:String(error)});
    }
  });

  app.get<{Params:{sessionId:string}}>('/api/payments/stripe/session/:sessionId', async (req,reply)=>{
    try { return await paymentService.syncStripeSession(buildContext(req),req.params.sessionId); }
    catch(error){ return reply.code(400).send({success:false,error:error instanceof Error?error.message:String(error)}); }
  });

  app.post('/api/payments/stripe/webhook', {config:{rawBody:true}}, async (req,reply)=>{
    try {
      const signatureValue=req.headers['stripe-signature'];
      const signature=Array.isArray(signatureValue)?signatureValue[0]:signatureValue;
      const rawBody=(req as RawBodyRequest).rawBody;
      if (!signature || !rawBody) return reply.code(400).send({error:'MISSING_STRIPE_SIGNATURE_OR_RAW_BODY'});
      const event=verifyStripeEvent(rawBody,signature);
      const result=await paymentService.handleStripeEvent(event);
      return reply.code(200).send(result);
    } catch(error) {
      req.log.warn({err:error},'Stripe webhook rejected');
      return reply.code(400).send({error:error instanceof Error?error.message:String(error)});
    }
  });
}
