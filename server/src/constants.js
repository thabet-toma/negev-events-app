'use strict';

/** Recognised Negev towns, in the order the UI presents them. */
const TOWNS = [
  'رهط',
  'حورة',
  'تل السبع',
  'كسيفة',
  'شقيب السلام',
  'اللقية',
  'عرعرة النقب',
  'القرى والتجمعات'
];

/**
 * Fallback map coordinates used when an event has no explicit location.
 * 'القرى والتجمعات' is deliberately absent: it is a catch-all bucket, not a
 * place, so no geocoder can resolve it — events filed under it get no pin
 * unless the publisher supplies explicit coordinates.
 */
const TOWN_COORDINATES = {
  'رهط': { lat: 31.393364, lng: 34.754678 },
  'حورة': { lat: 31.298567, lng: 34.926782 },
  'تل السبع': { lat: 31.245649, lng: 34.857768 },
  'كسيفة': { lat: 31.245249, lng: 35.095151 },
  'شقيب السلام': { lat: 31.194398, lng: 34.840581 },
  'اللقية': { lat: 31.324231, lng: 34.863202 },
  'عرعرة النقب': { lat: 31.157671, lng: 35.013021 }
};

const REACTION_TYPES = ['coffee', 'horse', 'fireworks', 'rose', 'hand'];

const EVENT_STATUSES = ['pending', 'approved', 'rejected'];

const DEFAULT_POSTER =
  'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop&q=80';

module.exports = { TOWNS, TOWN_COORDINATES, REACTION_TYPES, EVENT_STATUSES, DEFAULT_POSTER };
