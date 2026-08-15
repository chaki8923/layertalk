import { createAdminClient } from "@/lib/server/supabase-admin";

type AdminClient = ReturnType<typeof createAdminClient>;

async function listBucketPaths(admin: AdminClient, bucket: string) {
  const storage = admin.storage.from(bucket);
  const { data: root } = await storage.list("", { limit: 1000 });
  const paths: string[] = [];
  for (const entry of root ?? []) {
    if (entry.id) {
      paths.push(entry.name);
      continue;
    }
    const { data: children } = await storage.list(entry.name, { limit: 1000 });
    for (const child of children ?? []) if (child.id) paths.push(`${entry.name}/${child.name}`);
  }
  return paths;
}

async function removeOrphanedStorage(admin: AdminClient) {
  const [stampPaths, brandingPaths] = await Promise.all([
    listBucketPaths(admin, "room-stamps"),
    listBucketPaths(admin, "room-branding"),
  ]);
  const [{ data: stampRows }, { data: brandingRows }] = await Promise.all([
    stampPaths.length ? admin.from("room_stamps").select("path").in("path", stampPaths) : Promise.resolve({ data: [] }),
    brandingPaths.length ? admin.from("room_branding").select("logo_path").in("logo_path", brandingPaths) : Promise.resolve({ data: [] }),
  ]);
  const referencedStamps = new Set((stampRows ?? []).map((row) => row.path));
  const referencedBranding = new Set((brandingRows ?? []).map((row) => row.logo_path).filter(Boolean));
  const orphanedStamps = stampPaths.filter((path) => !referencedStamps.has(path));
  const orphanedBranding = brandingPaths.filter((path) => !referencedBranding.has(path));
  await Promise.all([
    orphanedStamps.length ? admin.storage.from("room-stamps").remove(orphanedStamps) : Promise.resolve(),
    orphanedBranding.length ? admin.storage.from("room-branding").remove(orphanedBranding) : Promise.resolve(),
  ]);
  return orphanedStamps.length + orphanedBranding.length;
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  const freeCutoff = new Date(Date.now() - 7 * 86400_000).toISOString();
  const paidCutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data: paidRooms } = await admin.from("entitlements").select("room_id");
  const paidIds = [...new Set((paidRooms ?? []).map((row) => row.room_id))];

  let deletedComments = 0;
  const freeQuery = admin.from("comments").delete({ count: "exact" }).lt("created_at", freeCutoff);
  const freeResult = paidIds.length > 0 ? await freeQuery.not("room_id", "in", `(${paidIds.join(",")})`) : await freeQuery;
  deletedComments += freeResult.count ?? 0;
  if (paidIds.length > 0) {
    const paidResult = await admin.from("comments").delete({ count: "exact" }).lt("created_at", paidCutoff).in("room_id", paidIds);
    deletedComments += paidResult.count ?? 0;
    await admin.from("stamp_events").delete().lt("created_at", paidCutoff).in("room_id", paidIds);
  }
  await admin.from("stamp_events").delete().lt("created_at", freeCutoff)
    .not("room_id", "in", paidIds.length > 0 ? `(${paidIds.join(",")})` : "(00000000-0000-0000-0000-000000000000)");

  const stampCutoff = paidCutoff;
  const { data: oldStamps } = await admin.from("room_stamps").select("id,path").lt("created_at", stampCutoff).limit(500);
  const paths = (oldStamps ?? []).map((stamp) => stamp.path);
  if (paths.length > 0) {
    await admin.storage.from("room-stamps").remove(paths);
    await admin.from("room_stamps").delete().in("id", (oldStamps ?? []).map((stamp) => stamp.id));
  }
  const deletedOrphanedFiles = await removeOrphanedStorage(admin);

  let removedAnonymousUsers = 0;
  const anonymousCutoff = Date.now() - 30 * 86400_000;
  const { data: usersPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const user of usersPage.users) {
    if (user.is_anonymous && new Date(user.created_at).getTime() < anonymousCutoff) {
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (!error) removedAnonymousUsers += 1;
    }
  }
  return Response.json({ deletedComments, deletedStampFiles: paths.length, deletedOrphanedFiles, removedAnonymousUsers });
}
