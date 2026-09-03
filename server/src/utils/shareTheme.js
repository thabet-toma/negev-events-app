'use strict';

const { OCCASION_TONES, SHARE_FALLBACK_POSTERS } = require('../constants');
const { absoluteMediaUrl } = require('./mediaUrl');

/**
 * Two palettes, chosen by the occasion type's own `tone` and never by its
 * name. A عزاء must not arrive dressed in wedding gold, and a super admin
 * renaming a type must not change how it looks. Shared between the share
 * page (server/src/routes/share.routes.js) and the generated OG card
 * (server/src/services/shareCard.service.js) — the two surfaces that draw an
 * event's tone on screen must never be free to drift into different colours
 * for the same tone, so this is the one place either is allowed to read them
 * from.
 */
const PALETTES = {
  festive: { bg: '#141821', card: '#1e232e', ink: '#f6f2ea', faint: '#a9b0bd', accent: '#d8ab5c', btnInk: '#141821' },
  solemn: { bg: '#14181a', card: '#1c2124', ink: '#eef1f0', faint: '#a3adaa', accent: '#8fa8a0', btnInk: '#14181a' }
};

function toneOf(event) {
  return OCCASION_TONES.includes(event.occasion_type_tone) ? event.occasion_type_tone : 'festive';
}

/**
 * A CSS colour from the database is still database content. On the HTML page
 * it lands in a style="" attribute with an open img-src, so a crafted value
 * could smuggle a request out — hence a strict hex allow-list rather than
 * escaping. The generated card never interpolates a raw string into markup
 * at all (it draws pixels onto a canvas), but the same allow-list still
 * guards it: an occasion type's `color` is still unvalidated input, and a
 * fillStyle a canvas cannot parse fails differently (silently, or by
 * throwing on some backends) rather than being escaped — better to never
 * hand it something outside the shape we expect.
 */
function safeHexColour(value, fallback) {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(value || '')) ? value : fallback;
}

/**
 * poster_url → occasion type's default_poster_url → platform fallback by
 * tone. The first two arrive already absolute from the service layer, where
 * media conversion belongs (ADR-0002); only the fallback constant is
 * converted here, because it never passed through a query at all.
 *
 * The single fallback chain for "what image represents this event" — the
 * share page's own <img> and og:image use it when the generated card cannot
 * be produced, and the card generator (shareCard.service.js) uses it to
 * choose what to paint as the card's blurred background. One chain, so the
 * two surfaces can never disagree about what an event's picture is.
 */
function resolvePosterUrl(event) {
  if (event.poster_url) return event.poster_url;
  if (event.occasion_type_poster_url) return event.occasion_type_poster_url;
  return absoluteMediaUrl(SHARE_FALLBACK_POSTERS[toneOf(event)]);
}

module.exports = { PALETTES, toneOf, safeHexColour, resolvePosterUrl };
