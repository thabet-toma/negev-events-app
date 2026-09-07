'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { withAbsoluteMedia } = require('../utils/mediaUrl');
const adminScope = require('./adminScope.service');
const auth = require('./auth.service');

/**
 * Headline counters for the admin dashboard, scoped to `user`'s towns
 * (rule 1 of the admin-scoping spec — the restriction lives in the query,
 * not filtered afterward in JS). Every counter here is either about events
 * (scoped via `townScopeClause` on `events.town`) or about their children
 * (congratulations, scoped by joining back to `events`) — `totalUsers` is
 * the one exception: it counts the whole platform's users, a fact that has
 * nothing to do with any town, so it cannot be scoped by town at all. Per
 * the spec that makes it super_admin-only information (story 35); a scoped
 * admin gets `0` rather than the key disappearing, so callers never have to
 * special-case a missing field.
 */
async function stats(user) {
  const { clause, params } = await adminScope.townScopeClause(user, 'e');
  const isSuperAdmin = Boolean(user && user.role === 'super_admin');

  const [eventRow, congratsRow] = await Promise.all([
    db.queryOne(
      `SELECT
         COUNT(*) AS total,
         SUM(status = 'pending')  AS pending,
         SUM(status = 'approved') AS approved,
         SUM(status = 'rejected') AS rejected,
         COALESCE(SUM(views_count), 0) AS views
       FROM events e
       WHERE 1 = 1 ${clause}`,
      params
    ),
    db.queryOne(
      `SELECT COUNT(*) AS total
         FROM congratulations c
         JOIN events e ON e.id = c.event_id
        WHERE 1 = 1 ${clause}`,
      params
    )
  ]);

  const totalUsers = isSuperAdmin
    ? Number((await db.queryOne('SELECT COUNT(*) AS total FROM users')).total)
    : 0;

  return {
    totalEvents: Number(eventRow.total),
    pendingEvents: Number(eventRow.pending || 0),
    approvedEvents: Number(eventRow.approved || 0),
    rejectedEvents: Number(eventRow.rejected || 0),
    totalUsers,
    totalCongrats: Number(congratsRow.total),
    totalViews: Number(eventRow.views)
  };
}

/** The events queue, scoped to `user`'s towns the same way `stats` is. */
async function listEvents(status, user) {
  const { clause, params } = await adminScope.townScopeClause(user, 'e');
  const statusClause = status ? ' AND e.status = ?' : '';
  const queryParams = status ? [...params, status] : params;

  const rows = await db.query(
    `SELECT e.* FROM events e WHERE 1 = 1 ${clause}${statusClause} ORDER BY e.created_at DESC`,
    queryParams
  );
  return rows.map(withAbsoluteMedia);
}

/**
 * Publishes one public announcement for a critical date amendment that just
 * got approved (#20 step 7 — an announcement is never created for anything
 * else: no cosmetic edit, no town/location amendment, only event_date and
 * event_end_date). Turns off `is_current` on any prior live announcement for
 * the same event first — the newest replaces the old one in display, but
 * neither row is ever deleted. Then notifies whoever earned it: every
 * "ذكّرني" follower plus the event's owner, minus whoever made the edit
 * themself (nobody is notified of their own action). Everything here runs on
 * the same `connection` as the status update, so an announcement or
 * notification is never left half-written.
 */
async function publishDateAnnouncement(connection, eventId, amendment) {
  await connection.execute(
    "UPDATE event_announcements SET is_current = 0 WHERE event_id = ? AND is_current = 1",
    [eventId]
  );
  await connection.execute(
    `INSERT INTO event_announcements (event_id, amendment_id, old_value, new_value, is_current)
     VALUES (?, ?, ?, ?, 1)`,
    [eventId, amendment.id, amendment.old_value, amendment.new_value]
  );

  const [eventRows] = await connection.execute('SELECT id, title, created_by FROM events WHERE id = ?', [eventId]);
  const event = eventRows[0];

  const [recipientRows] = await connection.execute(
    `SELECT DISTINCT user_id FROM (
        SELECT user_id FROM event_reminders WHERE event_id = ?
        UNION
        SELECT created_by AS user_id FROM events WHERE id = ? AND created_by IS NOT NULL
     ) recipients`,
    [eventId, eventId]
  );

  const label = amendment.field === 'event_end_date' ? 'تاريخ انتهاء' : 'تاريخ';
  // One title serves both audiences — the followers and the owner. "تتابعها"
  // reads wrong to the owner, whose own occasion this is.
  const title = 'تغيّر موعد المناسبة';
  const body = `تغيّر ${label} "${event.title}" من ${amendment.old_value || 'غير محدَّد'} إلى ${amendment.new_value || 'غير محدَّد'}`;

  const notifications = [];
  for (const recipient of recipientRows) {
    // Nobody is notified of an edit they made themself.
    if (recipient.user_id === amendment.changed_by) continue;

    const [insertResult] = await connection.execute(
      `INSERT INTO notifications (user_id, event_id, type, title, body)
       VALUES (?, ?, 'event_date_changed', ?, ?)`,
      [recipient.user_id, eventId, title, body]
    );
    notifications.push({
      id: insertResult.insertId,
      user_id: recipient.user_id,
      event_id: eventId,
      type: 'event_date_changed',
      title,
      body,
      is_read: false
    });
  }

  return notifications;
}

/**
 * Approving or rejecting also settles this event's pending amendment rows —
 * otherwise the log keeps saying "بانتظار المراجعة" for a decision that was
 * already made, and the audit trail lies. An approval that resolves a
 * pending event_date/event_end_date amendment also publishes the public
 * announcement and notifies its audience — all writes share one transaction.
 */
async function updateEventStatus(eventId, status) {
  const { event, notifications } = await db.transaction(async connection => {
    const [result] = await connection.execute('UPDATE events SET status = ? WHERE id = ?', [status, eventId]);
    if (!result.affectedRows) throw ApiError.notFound('المناسبة غير موجودة');

    let notifications = [];

    if (status === 'approved' || status === 'rejected') {
      const [pendingRows] = await connection.execute(
        "SELECT * FROM event_amendments WHERE event_id = ? AND status = 'pending' ORDER BY created_at ASC, id ASC",
        [eventId]
      );

      await connection.execute(
        "UPDATE event_amendments SET status = ? WHERE event_id = ? AND status = 'pending'",
        [status, eventId]
      );

      if (status === 'approved') {
        const dateAmendments = pendingRows.filter(row => row.field === 'event_date' || row.field === 'event_end_date');
        for (const amendment of dateAmendments) {
          const published = await publishDateAnnouncement(connection, eventId, amendment);
          notifications = notifications.concat(published);
        }
      }
    }

    const [rows] = await connection.execute('SELECT * FROM events WHERE id = ?', [eventId]);
    return { event: rows[0], notifications };
  });

  return { event: withAbsoluteMedia(event), notifications };
}

/** Deleting an event cascades to its reactions and congratulations. */
async function deleteEvent(eventId) {
  const { affectedRows } = await db.execute('DELETE FROM events WHERE id = ?', [eventId]);
  if (!affectedRows) throw ApiError.notFound('المناسبة غير موجودة');
}

/**
 * Reassigns an orphaned or disputed event to another user. No automatic
 * kinship proof exists in this domain and none is attempted — this is
 * always a deliberate human decision by an admin, never inferred.
 */
async function transferEventOwnership(eventId, newOwnerId) {
  const owner = await db.queryOne('SELECT id FROM users WHERE id = ?', [newOwnerId]);
  if (!owner) throw ApiError.notFound('المستخدم غير موجود');

  const { affectedRows } = await db.execute('UPDATE events SET created_by = ? WHERE id = ?', [newOwnerId, eventId]);
  if (!affectedRows) throw ApiError.notFound('المناسبة غير موجودة');

  return withAbsoluteMedia(await db.queryOne('SELECT * FROM events WHERE id = ?', [eventId]));
}

/**
 * The comment moderation queue, scoped by its parent event's town. For a
 * `super_admin` (`townScopeClause` returns no restriction) this keeps the
 * original `LEFT JOIN` so a comment whose event row is somehow missing still
 * shows up, exactly as before. For a scoped `admin` the join becomes an
 * inner `JOIN`: a comment cannot be proven in-scope without a matching event
 * row, so a missing event must hide the comment rather than leak it — the
 * same "cannot happen" leak the LEFT JOIN would otherwise allow through with
 * `e.town` reading NULL, which `IN (...)` never matches but is safer to rule
 * out structurally than to rely on.
 */
async function listComments(user) {
  const { clause, params } = await adminScope.townScopeClause(user, 'e');
  const joinType = clause ? 'JOIN' : 'LEFT JOIN';

  return db.query(
    `SELECT c.*, e.title AS event_title
       FROM congratulations c
       ${joinType} events e ON e.id = c.event_id
      WHERE 1 = 1 ${clause}
      ORDER BY c.created_at DESC`,
    params
  );
}

async function listUsers() {
  return db.query(
    `SELECT id, phone_number, full_name, clan_town, role, created_at
       FROM users
      ORDER BY created_at DESC`
  );
}

/** Every `admin`-role user with the towns assigned to it, for the super_admin panel. */
async function listAdminsWithTowns() {
  const admins = await db.query(
    `SELECT id, phone_number, full_name, role, created_at
       FROM users
      WHERE role = 'admin'
      ORDER BY created_at DESC`
  );
  if (!admins.length) return [];

  const adminIds = admins.map(row => row.id);
  const placeholders = adminIds.map(() => '?').join(', ');
  const townRows = await db.query(
    `SELECT user_id, town FROM admin_towns WHERE user_id IN (${placeholders}) ORDER BY town ASC`,
    adminIds
  );

  const townsByUser = new Map();
  for (const row of townRows) {
    if (!townsByUser.has(row.user_id)) townsByUser.set(row.user_id, []);
    townsByUser.get(row.user_id).push(row.town);
  }

  return admins.map(row => ({ ...row, towns: townsByUser.get(row.id) || [] }));
}

/**
 * Replaces the full set of towns an `admin`-role user administers, inside a
 * transaction so a partial write never leaves a stale mix of old and new
 * rows. Every `town` value here already passed `TOWNS.includes(...)` in the
 * route layer, so nothing here is unvalidated — but nothing here is string
 * concatenation either, every value still travels through `?`.
 */
async function setAdminTowns(adminUserId, towns) {
  return db.transaction(async connection => {
    const [userRows] = await connection.execute(
      "SELECT id FROM users WHERE id = ? AND role = 'admin'",
      [adminUserId]
    );
    if (!userRows.length) throw ApiError.notFound('الأدمن غير موجود');

    await connection.execute('DELETE FROM admin_towns WHERE user_id = ?', [adminUserId]);

    for (const town of towns) {
      await connection.execute(
        'INSERT INTO admin_towns (user_id, town) VALUES (?, ?)',
        [adminUserId, town]
      );
    }

    return towns;
  });
}

/**
 * Promotes a plain `user` to `admin` — never any higher: `super_admin` is
 * refused explicitly, so one compromised super_admin account can never mint
 * another one through this path (it can only ever be created by `seed.js`).
 * The new admin owns no towns yet, so it sees and approves nothing until a
 * super_admin runs `setAdminTowns` — the route layer is responsible for
 * saying so to whoever just clicked promote. Read-then-write on the target
 * row happens under `FOR UPDATE` inside a transaction — the same shape as
 * `demoteToUser` below — so a concurrent promote/demote on the same user
 * cannot interleave between the role check and the write.
 */
async function promoteToAdmin(userId, promotedBy) {
  const user = await db.transaction(async connection => {
    const [userRows] = await connection.execute('SELECT id, role FROM users WHERE id = ? FOR UPDATE', [userId]);
    const row = userRows[0];
    if (!row) throw ApiError.notFound('المستخدم غير موجود');
    if (row.role === 'super_admin') throw ApiError.badRequest('لا يمكن تعديل صلاحيات المدير العام');
    if (row.role === 'admin') throw ApiError.conflict('هذا المستخدم أدمن بالفعل');

    await connection.execute("UPDATE users SET role = 'admin' WHERE id = ?", [userId]);

    const [rows] = await connection.execute(
      'SELECT id, phone_number, full_name, clan_town, role, analytics_opt_out FROM users WHERE id = ?',
      [userId]
    );
    return rows[0];
  });

  // Logged only after the transaction actually commits — a log written
  // inside the transaction would still say "promoted" even if the commit
  // itself later failed.
  logger.info('admin.promote', { userId, promotedBy });
  return auth.publicUser(user);
}

/**
 * Demotes an `admin` or `super_admin` back to a plain `user`, clearing its
 * `admin_towns` rows in the same transaction — a dangling row would silently
 * come back to life with authority nobody intended the moment anyone
 * re-promotes that same user. Refuses self-demotion and refuses to demote
 * the last remaining `super_admin`, either of which would leave the panel
 * without an owner.
 *
 * The last-remaining-super_admin guard locks the whole `super_admin` SET
 * (`SELECT id ... WHERE role = 'super_admin' FOR UPDATE`) before locking the
 * target row, not a plain `COUNT(*)` — a `COUNT(*)` is a non-locking
 * snapshot read, so two super_admins demoting each other at the same moment
 * would each lock a different single row, each read "2 remain" from their
 * own snapshot, and both would commit, leaving zero. Because every call
 * takes this identical `FOR UPDATE` query first, the second transaction
 * to reach it blocks until the first commits or rolls back, then re-reads
 * the now-current (locked) row set and refuses if only one is left.
 */
async function demoteToUser(userId, actingUserId) {
  if (userId === actingUserId) throw ApiError.badRequest('لا يمكنك إلغاء صلاحياتك عن نفسك');

  const { user, priorRole } = await db.transaction(async connection => {
    const [superAdminRows] = await connection.execute("SELECT id FROM users WHERE role = 'super_admin' FOR UPDATE");

    const [userRows] = await connection.execute('SELECT id, role FROM users WHERE id = ? FOR UPDATE', [userId]);
    const targetUser = userRows[0];
    if (!targetUser) throw ApiError.notFound('المستخدم غير موجود');
    if (targetUser.role === 'user') throw ApiError.conflict('هذا المستخدم ليس إدارياً أصلاً');

    if (targetUser.role === 'super_admin' && superAdminRows.length <= 1) {
      throw ApiError.badRequest('لا يمكن إلغاء صلاحيات آخر مدير عام في المنصة');
    }

    await connection.execute("UPDATE users SET role = 'user' WHERE id = ?", [userId]);
    await connection.execute('DELETE FROM admin_towns WHERE user_id = ?', [userId]);

    const [rows] = await connection.execute(
      'SELECT id, phone_number, full_name, clan_town, role, analytics_opt_out FROM users WHERE id = ?',
      [userId]
    );
    return { user: rows[0], priorRole: targetUser.role };
  });

  // Logged only after the transaction actually commits — see promoteToAdmin.
  logger.info('admin.demote', { userId, demotedBy: actingUserId, priorRole });
  return auth.publicUser(user);
}

module.exports = {
  stats,
  listEvents,
  updateEventStatus,
  deleteEvent,
  transferEventOwnership,
  listComments,
  listUsers,
  listAdminsWithTowns,
  setAdminTowns,
  promoteToAdmin,
  demoteToUser
};
