'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const config = require('../config');
const settings = require('../services/settings.service');
const liveHub = require('../services/liveHub.service');
const realtime = require('../realtime');
const { authenticate, optionalAuthenticate, requireSuperAdmin } = require('../middleware/auth');
const { cleanString, parseId, requireDate } = require('../middleware/validate');

const router = express.Router();

const MIN_POLL_OPTIONS = 2;
const MAX_POLL_OPTIONS = 4;
const MAX_POLL_OPTION_LENGTH = 100;

/**
 * An integer index only — `1.5`, `"1"`-with-junk, `true` or `null` are all
 * refused here; the range against this episode's options is the service's
 * check, since only it knows how many options there are.
 */
function parseOptionIndex(raw) {
  if (typeof raw === 'number' && Number.isInteger(raw)) return raw;
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return Number(raw.trim());
  throw ApiError.badRequest('الخيار المختار غير صالح');
}

/**
 * `poll_question` and `poll_options` come as a pair: both set (2..4
 * non-empty, distinct options) is a poll, both empty is an episode without
 * one, and one without the other is refused rather than guessed at.
 */
function parsePoll(body) {
  const question = cleanString(body.poll_question, 255);
  const raw = body.poll_options;
  const noOptions = raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0);

  if (!question && noOptions) return { poll_question: null, poll_options: null };
  if (!question) throw ApiError.badRequest('اكتب سؤال الاستفتاء، أو امسح خياراته');
  if (noOptions) throw ApiError.badRequest('أضف خيارات الاستفتاء، أو امسح سؤاله');
  if (!Array.isArray(raw)) throw ApiError.badRequest('صيغة خيارات الاستفتاء غير صالحة');

  if (raw.length < MIN_POLL_OPTIONS || raw.length > MAX_POLL_OPTIONS) {
    throw ApiError.badRequest(`للاستفتاء من ${MIN_POLL_OPTIONS} إلى ${MAX_POLL_OPTIONS} خيارات`);
  }

  const options = raw.map(option => (typeof option === 'string' ? option.trim() : ''));
  if (options.some(option => !option)) throw ApiError.badRequest('كل خيار في الاستفتاء يجب أن يكون نصاً غير فارغ');
  if (options.some(option => option.length > MAX_POLL_OPTION_LENGTH)) {
    throw ApiError.badRequest(`خيار الاستفتاء أطول من ${MAX_POLL_OPTION_LENGTH} حرف`);
  }
  if (new Set(options).size !== options.length) throw ApiError.badRequest('خيارات الاستفتاء مكرّرة');

  return { poll_question: question, poll_options: options };
}

// Public; a signed-in caller additionally gets `my_vote` (and today's
// results once they have voted). The live half is the exact GET /api/live
// payload, so both surfaces can never disagree about whether a live is on.
router.get('/live/hub', optionalAuthenticate, asyncHandler(async (req, res) => {
  const userId = req.user ? req.user.id : null;
  const [channel, hub] = await Promise.all([settings.getLiveChannel(), liveHub.getHub(userId)]);

  res.json({
    success: true,
    ...channel,
    ...hub,
    share_url: `${config.publicUrl}/live`
  });
}));

router.post('/live/episodes/:id/vote', authenticate, asyncHandler(async (req, res) => {
  const episodeId = parseId(req.params.id, 'معرّف الحلقة');
  const optionIndex = parseOptionIndex((req.body || {}).option_index);

  const poll = await liveHub.vote(episodeId, req.user.id, optionIndex);
  // Results only, never `my_vote` — this goes to every connected socket;
  // each client keeps hiding them until its own user has voted (§3.6).
  realtime.emit(`live_poll_${episodeId}`, { results: poll.results, total_votes: poll.total_votes });
  res.json({ success: true, poll, message: 'تم تسجيل صوتك' });
}));

// Guarded on this router itself — admin.routes.js's `requireAdmin` does not
// protect these paths just because they share the `/admin` prefix (same
// warning as settings.routes.js and villages.routes.js).
router.use('/admin/live', requireSuperAdmin);

router.get('/admin/live/episodes', asyncHandler(async (req, res) => {
  res.json({ success: true, episodes: await liveHub.listEpisodesForAdmin() });
}));

router.put('/admin/live/episodes/:date', asyncHandler(async (req, res) => {
  const date = requireDate(req.params.date, 'تاريخ الحلقة');
  const body = req.body || {};

  const episode = await liveHub.saveEpisode(date, {
    topic: cleanString(body.topic, 200),
    episode_question: cleanString(body.episode_question, 255),
    ...parsePoll(body)
  }, req.user.id);

  res.json({ success: true, episode, message: 'تم حفظ الحلقة' });
}));

router.delete('/admin/live/episodes/:id', asyncHandler(async (req, res) => {
  await liveHub.deleteEpisode(parseId(req.params.id, 'معرّف الحلقة'));
  res.json({ success: true, message: 'تم حذف الحلقة' });
}));

module.exports = router;
