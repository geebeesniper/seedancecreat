import { allowCors, context, ensureDatabase, json, queryValue, type VercelReq, type VercelRes } from '../src/apiUtils.js';
import { db } from '../src/db/database.js';

function view(x: any) {
  let params: unknown = {};
  try { params = x.params ? JSON.parse(x.params) : {}; } catch { params = {}; }
  return {
    id: x.id,
    project_id: x.projectId,
    episode_id: x.episodeId,
    segment_id: x.segmentId,
    shot_seq: x.shotSeq,
    feature_point_key: x.featurePointKey,
    model_name: x.modelName,
    prompt: x.prompt,
    params,
    status: x.status,
    rh_task_id: x.rhTaskId,
    result_url: x.resultUrl,
    video_url: x.videoUrl,
    error: x.error,
    is_featured: Boolean(x.isFeatured),
    created_at: x.createdAt,
    updated_at: x.updatedAt,
  };
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (allowCors(req, res)) return;
  if (!(await ensureDatabase(res))) return;
  const ctx = context(req);
  const method = (req.method || 'GET').toUpperCase();

  if (method === 'GET') {
    const projectId = queryValue(req, 'project_id');
    let q = db.selectFrom('video_generations').selectAll()
      .where('tenantId', '=', ctx.tenantId)
      .where('userId', '=', ctx.userId);
    if (projectId) q = q.where('projectId', '=', projectId);
    const rows = await q.orderBy('createdAt', 'desc').execute();
    return json(res, 200, { success: true, items: rows.map(view) });
  }

  if (method === 'DELETE') {
    const id = queryValue(req, 'id');
    if (!id) return json(res, 400, { success: false, error: 'ID_REQUIRED' });
    const row = await db.selectFrom('video_generations').select(['id'])
      .where('id', '=', id)
      .where('tenantId', '=', ctx.tenantId)
      .where('userId', '=', ctx.userId)
      .executeTakeFirst();
    if (!row) return json(res, 404, { success: false, error: 'QUEUE_RECORD_NOT_FOUND' });
    await db.deleteFrom('video_generations')
      .where('id', '=', id)
      .where('tenantId', '=', ctx.tenantId)
      .where('userId', '=', ctx.userId)
      .execute();
    // Deliberately does not touch the user's local filesystem.
    return json(res, 200, { success: true, removed_from_queue: true, local_video_deleted: false, id });
  }

  return json(res, 405, { success: false, error: 'METHOD_NOT_ALLOWED' });
}
