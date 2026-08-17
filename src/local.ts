process.env.GS_ONE_LOCAL_SERVER = '1';

const [{ app }, { initDb, db }, { settings }] = await Promise.all([
  import('./server.js'),
  import('./db/database.js'),
  import('./core/settings.js'),
]);

async function main() {
  await initDb();
  await app.listen({ port: settings.port, host: settings.host });
}

main().catch((error) => {
  app.log.error(error);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  await app.close();
  await db.destroy();
  process.exit(0);
});
