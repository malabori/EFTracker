// Refreshes the offline quest snapshots in data/ from tarkov.dev.
// The site only downloads these when the live API is unreachable and the
// visitor has no cached copy, so run this occasionally (e.g. after a wipe):
//
//   npm run snapshot
import { writeFile } from 'node:fs/promises';
import { gql } from '../src/shared/api.js';
import { QUEST_QUERY } from '../src/quests/data.js';

for (const mode of ['regular', 'pve']) {
  const { data, errors } = await gql(QUEST_QUERY, { mode }, { timeoutMs: 60000 });
  const tasks = (data.tasks || []).filter(Boolean);
  if (!tasks.length) throw new Error(`tarkov.dev returned no ${mode} quests`);
  const file = new URL(`../data/snapshot-${mode}.json`, import.meta.url);
  const body = {
    generatedAt: new Date().toISOString(),
    mode,
    source: 'https://tarkov.dev',
    tasks
  };
  await writeFile(file, JSON.stringify(body) + '\n');
  console.log(
    `${mode}: ${tasks.length} quests${errors.length ? ` (${errors.length} partial errors)` : ''}`
  );
}
