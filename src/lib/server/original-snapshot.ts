import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PeriodType } from "@/lib/box-office";

const directory = path.join(process.cwd(), ".verification-snapshots");

function snapshotPath(type: PeriodType, date: string) {
  return path.join(directory, `${type}-${date}.json`);
}

// 검증용 로컬 파일이며 서버리스 배포에서는 영속 저장소가 아니다.
export async function saveOriginalSnapshot(type: PeriodType, date: string, original: unknown): Promise<boolean> {
  if (process.env.NODE_ENV === "production") return false;
  const target = snapshotPath(type, date);
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(temporary, JSON.stringify({ type, date, original }), { encoding: "utf8", flag: "wx" });
    await rename(temporary, target);
    return true;
  } catch {
    return false;
  }
}

export async function readOriginalSnapshot(type: PeriodType, date: string): Promise<unknown | null> {
  try {
    const value = JSON.parse(await readFile(snapshotPath(type, date), "utf8")) as {
      type?: unknown; date?: unknown; original?: unknown;
    };
    return value.type === type && value.date === date ? value.original ?? null : null;
  } catch {
    return null;
  }
}
