'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const admin = require('../services/admin.service');
const adminScope = require('../services/adminScope.service');
const broadcastsService = require('../services/broadcasts.service');
const events = require('../services/events.service');
const auth = require('../services/auth.service');
const realtime = require('../realtime');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const { cleanString, requireFields, parseId, optionalDateTime } = require('../middleware/validate');
const { EVENT_STATUSES, TOWNS } = require('../constants');

const router = express.Router();

router.post('/admin/login', asyncHandler(async (req, res) => {
  requireFields(req.body, ['pin_code']);

  const result = await auth.adminLogin({
    phone_number: cleanString(req.body.phone_number, 20),
    pin_code: cleanString(req.body.pin_code, 20)
  });

  res.json({ success: true, ...result });
}));

// Everything below requires an admin token.
router.use('/admin', requireAdmin);

/**
 * Who am I and what do I administer. The panel needs this to say «تدير: رهط ·
 * اللقية» and to offer a town picker holding exactly the caller's towns —
 * neither of which can be inferred from the scoped lists, because a town that
 * was assigned but has no events yet would simply be missing from them. That
 * inference would fail worst for a brand-new admin, who is exactly the person
 * an empty panel confuses (#36).
 */
router.get('/admin/me', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    role: req.user.role,
    towns: await adminScope.listTownsFor(req.user)
  });
}));

router.get('/admin/stats', asyncHandler(async (req, res) => {
  res.json({ success: true, stats: await admin.stats(req.user) });
}));

router.get('/admin/events', asyncHandler(async (req, res) => {
  const status = cleanString(req.query.status, 20);
  if (status && !EVENT_STATUSES.includes(status)) {
    throw ApiError.badRequest('حالة غير صالحة');
  }
  res.json({ success: true, events: await admin.listEvents(status, req.user) });
}));

router.patch('/admin/events/:id/status', asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const status = cleanString(req.body.status, 20);

  if (!EVENT_STATUSES.includes(status)) {
    throw ApiError.badRequest('حالة غير صالحة');
  }

  // 404s before touching anything else if this event doesn't exist or sits
  // outside req.user's towns — a 403 here would confirm to an out-of-scope
  // admin that the event exists at all (spec rule 3).
  await adminScope.assertEventInScope(req.user, eventId);

  // Only meaningful on a rejection (story 8) — an approval never needed one,
  // and cleanString on a field the body doesn't carry is already null.
  const reason = status === 'rejected' ? cleanString(req.body.reason, 500) : null;

  const { event, notifications } = await admin.updateEventStatus(eventId, status, {
    reason, actingUserId: req.user.id
  });
  if (status === 'approved') {
    realtime.emit('new_event_created', {
      id: event.id,
      title: event.title,
      groom_name: event.groom_name,
      town: event.town,
      event_date: event.event_date
    });
  }

  // A contentless signal per recipient, never the notification's own
  // title/body: realtime.emit has no rooms and reaches every connected
  // client (realtime/index.js), so any text here would leak to a socket that
  // never should have seen it. A connected client just re-fetches its own
  // GET /api/notifications — the same shape issue #85's town_broadcast uses.
  for (const notification of notifications) {
    realtime.emit(`new_notification_${notification.user_id}`, { id: notification.id });
  }

  const label = { approved: 'معتمدة ومنشورة', rejected: 'مرفوضة', pending: 'بانتظار المراجعة' }[status];
  res.json({ success: true, message: `تم تحديث حالة المناسبة إلى (${label})`, event });
}));

router.get('/admin/events/:id/amendments', asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  await adminScope.assertEventInScope(req.user, eventId);
  res.json({ success: true, amendments: await events.listAmendments(eventId) });
}));

router.delete('/admin/events/:id', asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  await adminScope.assertEventInScope(req.user, eventId);
  await admin.deleteEvent(eventId);
  res.json({ success: true, message: 'تم حذف المناسبة بالكامل' });
}));

router.patch('/admin/events/:id/owner', asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const newOwnerId = parseId(req.body.user_id, 'معرّف المستخدم الجديد');

  await adminScope.assertEventInScope(req.user, eventId);

  const event = await admin.transferEventOwnership(eventId, newOwnerId);
  res.json({ success: true, message: 'تم نقل ملكية المناسبة بنجاح', event });
}));

router.get('/admin/comments', asyncHandler(async (req, res) => {
  res.json({ success: true, comments: await admin.listComments(req.user) });
}));

// DELETE /admin/comments/:id is intentionally gone — it hard-deleted a row
// and bypassed the moderation system (`status='hidden'` + `moderated_by`)
// #20 step 5 already built. The replacement is a town-admin-aware widening
// of `PATCH /api/events/:id/congratulations/:cid`, owned by a sibling agent.

router.get('/admin/users', requireSuperAdmin, asyncHandler(async (req, res) => {
  res.json({ success: true, users: await admin.listUsers() });
}));

/**
 * The only path that changes `users.role` — promotes a user to `admin` or
 * demotes an `admin`/`super_admin` back to `user`. `super_admin` is never
 * grantable here (only `seed.js` creates one). Guarded on this router
 * itself, not via the shared `requireSuperAdmin` middleware: a non-super
 * `admin` caller (who already cleared the router's own `requireAdmin` above)
 * gets 404, not 403 — same reasoning as `adminScope.service.js`, this
 * project never confirms the existence of a capability the caller does not
 * own. `requireAdmin` is attached here too, redundant with line 29's
 * router-wide `router.use('/admin', requireAdmin)` today, but it means this
 * route still rejects cleanly instead of throwing on `req.user` being
 * undefined if that line ever moves or this route is ever relocated.
 */
router.patch('/admin/users/:id/role', requireAdmin, asyncHandler(async (req, res) => {
  if (req.user.role !== 'super_admin') {
    throw ApiError.notFound('المستخدم غير موجود');
  }

  const targetUserId = parseId(req.params.id, 'معرّف المستخدم');
  const role = cleanString(req.body.role, 20);

  if (!['admin', 'user'].includes(role)) {
    throw ApiError.badRequest('رتبة غير صالحة');
  }

  if (role === 'admin') {
    const user = await admin.promoteToAdmin(targetUserId, req.user.id);
    return res.json({
      success: true,
      user,
      message: 'تمت ترقية المستخدم إلى أدمن — أدمن جديد لا يملك أي بلدة هنا، فلن يرى ولا يعتمد شيئاً حتى تُسنِد له بلدة واحدة على الأقل'
    });
  }

  const user = await admin.demoteToUser(targetUserId, req.user.id);
  res.json({ success: true, user, message: 'تم إلغاء صلاحيات الإدارة عن هذا المستخدم' });
}));

/** `duration` (one of broadcastsService.BROADCAST_DURATIONS) wins over a raw `expires_at` when both are sent; neither given means a quiet broadcast (`expires_at = NULL`, story 26). */
function resolveBroadcastExpiry(body) {
  const duration = cleanString(body.duration, 20);
  if (duration) return broadcastsService.durationToExpiresAt(duration);
  if (body.expires_at !== undefined) {
    return broadcastsService.validateExpiresAt(optionalDateTime(body.expires_at, 'موعد انتهاء الشريط'));
  }
  return null;
}

/**
 * Broadcasts a general announcement — no longer super_admin-only (story 23):
 * the guard here is the router-wide `requireAdmin` from line 29, and the
 * AUDIENCE, not the router, decides who reaches whom. A super_admin always
 * writes one row with `scope_town = NULL` (story 22 — everyone). A town
 * admin names one or more of its OWN towns, resolved entirely by
 * `adminScope.resolveBroadcastTowns` (never here) — a town outside that
 * scope is 404, never 403; naming none defaults to all of the admin's towns;
 * an admin holding zero towns is refused outright, zero rows written, never
 * a silent success (story 24).
 */
router.post('/admin/broadcast', asyncHandler(async (req, res) => {
  requireFields(req.body, ['message']);

  const title = cleanString(req.body.title, 200) || '📢 تنبيه عام من إدارة أعراسنا (مناسبات النقب)';
  const message = cleanString(req.body.message, 2000);

  const tone = cleanString(req.body.tone, 20) || 'info';
  if (!broadcastsService.BROADCAST_TONES.includes(tone)) {
    throw ApiError.badRequest('نغمة التعميم غير صالحة — الخيارات: عادي، عاجل، وقور');
  }

  const expiresAt = resolveBroadcastExpiry(req.body);

  let scopeTowns;
  if (req.user.role === 'super_admin') {
    scopeTowns = [null];
  } else {
    let requestedTowns = [];
    if (req.body.towns !== undefined) {
      if (!Array.isArray(req.body.towns)) {
        throw ApiError.badRequest('قائمة البلدات غير صالحة');
      }
      requestedTowns = [...new Set(req.body.towns.map(town => cleanString(town, 100)).filter(Boolean))];
    }

    // Which towns this admin may actually reach — resolved entirely inside
    // adminScope.service.js, never here (CLAUDE.md: "نطاق الأدمن المحلي داخل
    // الاستعلام لا في الراوتر"). This route only shapes the raw request body.
    scopeTowns = await adminScope.resolveBroadcastTowns(req.user, requestedTowns);
  }

  const rows = await broadcastsService.sendBroadcast({
    title, message, sentBy: req.user.id, expiresAt, tone, scopeTowns
  });

  const isGlobal = scopeTowns.length === 1 && scopeTowns[0] === null;
  if (isGlobal) {
    realtime.emit('system_broadcast', {
      title,
      message,
      time: new Date().toLocaleTimeString('ar-EG'),
      created_at: new Date().toISOString()
    });
  } else {
    // realtime.emit has no rooms — it reaches EVERY connected client
    // (realtime/index.js) — so a town-scoped broadcast's text must never
    // travel through it. This channel carries only what a client needs to
    // decide to re-fetch GET /api/broadcasts/live, which is scoped
    // server-side to the towns/user it actually applies to.
    for (const row of rows) {
      realtime.emit('town_broadcast', {
        id: row.id,
        scope_town: row.scope_town,
        tone: row.tone,
        expires_at: row.expires_at
      });
    }
  }

  res.json({ success: true, message: 'تم بث التعميم بنجاح', broadcasts: rows });
}));

// --- Admin ↔ town assignment — super_admin only, guarded on this router too
// so a weaker guard (like this file's own `requireAdmin` above) can never end
// up protecting these paths instead (same reasoning as occasionTypes.routes.js). --
router.use('/admin/admins', requireSuperAdmin);

router.get('/admin/admins', asyncHandler(async (req, res) => {
  res.json({ success: true, admins: await admin.listAdminsWithTowns() });
}));

router.put('/admin/admins/:id/towns', asyncHandler(async (req, res) => {
  const adminId = parseId(req.params.id, 'معرّف الأدمن');

  if (!Array.isArray(req.body.towns)) {
    throw ApiError.badRequest('قائمة البلدات غير صالحة');
  }

  const towns = [...new Set(req.body.towns.map(town => cleanString(town, 100)))];
  for (const town of towns) {
    if (!town || !TOWNS.includes(town)) {
      throw ApiError.badRequest(`بلدة غير معروفة: ${town || ''}`);
    }
  }

  const savedTowns = await admin.setAdminTowns(adminId, towns);
  res.json({ success: true, towns: savedTowns, message: 'تم تحديث بلدات الأدمن بنجاح' });
}));

module.exports = router;
