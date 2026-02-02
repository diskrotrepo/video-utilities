const test = require('node:test');
const assert = require('node:assert/strict');

const {
  frameToTime,
  timeToFrame,
  getExportSettings,
  getRecordingVideoSettings,
  resolveBookmarkTime,
  createBookmark,
  computeSegmentDuration,
  computeTimeline,
  findSegmentAtTime,
  spliceSegments
} = require('../src/script');

test('frame/time conversion uses fps', () => {
  assert.equal(frameToTime(90, 30), 3);
  assert.equal(timeToFrame(3, 30), 90);
});

test('export settings normalize mime types', () => {
  const settings = getExportSettings('video/webm;codecs=vp9');
  assert.equal(settings.mimeType, 'video/webm;codecs=vp9');
  assert.equal(settings.baseType, 'video/webm');
  assert.equal(settings.extension, 'webm');
});

test('recording settings keep audio but silence playback', () => {
  const settings = getRecordingVideoSettings();
  assert.equal(settings.muted, false);
  assert.equal(settings.volume, 0);
});

test('createBookmark stores time and frame index', () => {
  const bookmark = createBookmark(2.5, 20, 'data:image/png;base64,abc');
  assert.equal(bookmark.time, 2.5);
  assert.equal(bookmark.frame, 50);
  assert.equal(bookmark.image, 'data:image/png;base64,abc');
});

test('resolveBookmarkTime returns selected bookmark time', () => {
  const bookmarks = [
    { id: 'a', time: 1.2 },
    { id: 'b', time: 3.4 }
  ];
  assert.equal(resolveBookmarkTime(bookmarks, 'b'), 3.4);
  assert.equal(resolveBookmarkTime(bookmarks, 'missing'), null);
});

test('computeSegmentDuration respects in/out bounds', () => {
  assert.equal(computeSegmentDuration({ duration: 10, in: 2, out: 6 }), 4);
  assert.equal(computeSegmentDuration({ duration: 10, in: 2 }), 8);
});

test('computeTimeline totals segment durations', () => {
  const segments = [
    { duration: 5, in: 0, out: 5 },
    { duration: 4, in: 0, out: 4 }
  ];
  const timeline = computeTimeline(segments);
  assert.equal(timeline.total, 9);
  assert.equal(timeline.ranges.length, 2);
});

test('findSegmentAtTime resolves composite offsets', () => {
  const segments = [
    { id: 'a', duration: 4, in: 0, out: 4 },
    { id: 'b', duration: 3, in: 0, out: 3 }
  ];
  const result = findSegmentAtTime(segments, 5);
  assert.equal(result.index, 1);
  assert.equal(result.segment.id, 'b');
  assert.equal(result.localTime, 1);
  assert.equal(result.offset, 4);
});

test('spliceSegments replaces the tail after cut', () => {
  const base = [{ id: 'base', duration: 10, in: 0, out: 10 }];
  const next = { id: 'new', duration: 6, in: 0, out: 6 };
  const result = spliceSegments(base, 4, next);
  assert.equal(result.length, 2);
  assert.equal(result[0].out, 4);
  assert.equal(result[1].id, 'new');
});

test('spliceSegments at start drops original', () => {
  const base = [{ id: 'base', duration: 5, in: 0, out: 5 }];
  const next = { id: 'new', duration: 2, in: 0, out: 2 };
  const result = spliceSegments(base, 0, next);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'new');
});

test('spliceSegments at end appends new clip', () => {
  const base = [{ id: 'base', duration: 5, in: 0, out: 5 }];
  const next = { id: 'new', duration: 2, in: 0, out: 2 };
  const result = spliceSegments(base, 5, next);
  assert.equal(result.length, 2);
  assert.equal(result[0].out, 5);
  assert.equal(result[1].id, 'new');
});
