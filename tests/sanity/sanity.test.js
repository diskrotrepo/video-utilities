const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  frameToTime,
  timeToFrame,
  spliceSegments,
  findSegmentAtTime,
  computeTimeline,
  getExportSettings,
  getRecordingVideoSettings,
  createBookmark,
  resolveBookmarkTime
} = require('../../src/script');

const INPUT_PATH = path.join(__dirname, 'video_sanity_input.json');
const EXPECTED_PATH = path.join(__dirname, 'video_sanity_expected.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runCase(testCase) {
  switch (testCase.type) {
    case 'frame_time': {
      const time = frameToTime(testCase.frame, testCase.fps);
      const frame = timeToFrame(time, testCase.fps);
      return { id: testCase.id, time, frame };
    }
    case 'splice': {
      const segments = spliceSegments(testCase.segments, testCase.cutTime, testCase.newSegment);
      return {
        id: testCase.id,
        segments: segments.map(segment => ({ id: segment.id, out: segment.out }))
      };
    }
    case 'find_segment': {
      const result = findSegmentAtTime(testCase.segments, testCase.time);
      return {
        id: testCase.id,
        index: result.index,
        localTime: result.localTime,
        offset: result.offset
      };
    }
    case 'timeline': {
      const timeline = computeTimeline(testCase.segments);
      return { id: testCase.id, total: timeline.total };
    }
    case 'export_settings': {
      const settings = getExportSettings(testCase.format);
      return {
        id: testCase.id,
        mimeType: settings.mimeType,
        baseType: settings.baseType,
        extension: settings.extension
      };
    }
    case 'recording_settings': {
      const settings = getRecordingVideoSettings();
      return {
        id: testCase.id,
        muted: settings.muted,
        volume: settings.volume
      };
    }
    case 'bookmark_create': {
      const bookmark = createBookmark(testCase.time, testCase.fps, testCase.image);
      return {
        id: testCase.id,
        time: bookmark.time,
        frame: bookmark.frame,
        image: bookmark.image
      };
    }
    case 'bookmark_resolve': {
      const time = resolveBookmarkTime(testCase.bookmarks, testCase.bookmarkId);
      return {
        id: testCase.id,
        time
      };
    }
    default:
      return { id: testCase.id };
  }
}

test('sanity fixtures match expected outputs', () => {
  const input = readJson(INPUT_PATH);
  const expected = readJson(EXPECTED_PATH);
  const expectedMap = new Map((expected.cases || []).map(entry => [entry.id, entry]));

  (input.cases || []).forEach(testCase => {
    const actual = runCase(testCase);
    const target = expectedMap.get(testCase.id);
    if (!target) {
      throw new Error(`Missing expected case for ${testCase.id}`);
    }
    Object.keys(target).forEach(key => {
      if (key === 'id') return;
      assert.deepEqual(actual[key], target[key]);
    });
  });
});
