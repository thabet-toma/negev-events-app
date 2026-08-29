'use strict';

const ApiError = require('../utils/ApiError');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_PATTERN = /^0\d{8,9}$/;

/** Trims a value and enforces a maximum length; returns null when empty. */
function cleanString(value, maxLength = 255) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

/** Throws unless every listed field is present and non-empty. */
function requireFields(body, fields) {
  const missing = fields.filter(field => !cleanString(body[field]));
  if (missing.length) {
    throw ApiError.badRequest('يرجى تعبئة جميع الحقول المطلوبة', { missing });
  }
}

function isValidDate(value) {
  if (!DATE_PATTERN.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}

function requireDate(value, fieldLabel = 'التاريخ') {
  if (!isValidDate(value)) {
    throw ApiError.badRequest(`${fieldLabel} غير صالح — الصيغة المطلوبة YYYY-MM-DD`);
  }
  return value;
}

function optionalDate(value) {
  const cleaned = cleanString(value, 10);
  if (!cleaned) return null;
  return isValidDate(cleaned) ? cleaned : null;
}

function isValidPhone(value) {
  return PHONE_PATTERN.test(String(value || '').replace(/[\s-]/g, ''));
}

/** Parses a coordinate, returning null when absent or out of range. */
function parseCoordinate(value, max) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed) || Math.abs(parsed) > max) return null;
  return parsed;
}

/** Parses a positive integer id from a route parameter. */
function parseId(value, label = 'المعرّف') {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest(`${label} غير صالح`);
  }
  return id;
}

function parseAmount(value) {
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount) || amount < 0 || amount > 9999999999) {
    throw ApiError.badRequest('المبلغ غير صالح');
  }
  return Math.round(amount * 100) / 100;
}

module.exports = {
  cleanString,
  requireFields,
  isValidDate,
  requireDate,
  optionalDate,
  isValidPhone,
  parseCoordinate,
  parseId,
  parseAmount
};
