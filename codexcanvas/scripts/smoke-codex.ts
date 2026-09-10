import { CodexProcess } from '../src/server/codex/CodexProcess';
const codex = new CodexProcess();
try {
  await codex.start();
  const rpc = codex.rpc!;
  const [account, models, threads] = await Promise.all([
    rpc.request('account/read', {}), rpc.request('model/list', { limit: 100 }),
    rpc.request('thread/list', { cwd: process.cwd(), limit: 5, sortKey: 'updated_at' }),
  ]);
  console.log(JSON.stringify({ handshake: 'ok', accountType: account.account?.type ?? 'signed out', models: models.data.length, preferredModel: models.data.find((m: any) => m.model === 'gpt-6-astra')?.model ?? models.data.find((m: any) => m.isDefault)?.model, workspaceThreads: threads.data.length }, null, 2));
} finally { codex.stop(); }
