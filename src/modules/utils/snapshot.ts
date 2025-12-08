import fs from 'fs/promises';
import path from 'path';
import { ENV } from '../../../env';
import { ParsedWingsSchedules } from '../types/schedules.type';

const SNAPSHOT_PATH = path.join(ENV.SNAPSHOT_DIR, 'snapshot.json');

export const saveSnapshot = async (snapshotMap: ParsedWingsSchedules) => {
  const obj = Object.fromEntries(snapshotMap);
  await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(obj));
};

export const loadSnapshot = async (): Promise<ParsedWingsSchedules> => {
  const loadFile = await fs.readFile(SNAPSHOT_PATH, 'utf-8');
  return new Map(Object.entries(JSON.parse(loadFile)));
};
