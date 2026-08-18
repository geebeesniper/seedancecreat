export default function handler(req: any, res: any) {
  res.status(200).json({
    ok: true,
    route: "/api/ping",
    step: 1,
    time: new Date().toISOString(),
    node: process.version,
    vercel: Boolean(process.env.VERCEL)
  });
}
