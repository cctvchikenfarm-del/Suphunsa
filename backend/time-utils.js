'use strict';

const THAILAND_TIME_ZONE = 'Asia/Bangkok';

function thailandParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: THAILAND_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function thailandDate(date = new Date()) {
  const { year, month, day } = thailandParts(date);
  return `${year}-${month}-${day}`;
}

function thailandMonth(date = new Date()) {
  return thailandDate(date).slice(0, 7);
}

module.exports = { THAILAND_TIME_ZONE, thailandDate, thailandMonth };
