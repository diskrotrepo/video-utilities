(() => {
  'use strict';

  // Table of contents:
  // - Pure utilities (fps, time, segment math)
  // - Project state + segment helpers
  // - Timeline playback (composite video controller)
  // - UI wiring + handlers
  // - Initialization + exports

  // ======== Pure utilities ========

  const DEFAULT_FPS = 30;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeFps(value, fallback = DEFAULT_FPS) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function resolveBookmarkTime(bookmarks, bookmarkId) {
    if (!bookmarkId) return null;
    const match = (bookmarks || []).find(entry => entry.id === bookmarkId);
    if (!match) return null;
    return Number.isFinite(match.time) ? match.time : null;
  }

  function createBookmark(timeSeconds, fps, imageDataUrl) {
    const time = Math.max(0, Number(timeSeconds) || 0);
    const frame = timeToFrame(time, fps);
    return {
      id: `bm-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      time,
      frame,
      image: imageDataUrl || ''
    };
  }

  function getExportSettings(formatValue) {
    const fallback = 'video/webm';
    let mimeType = typeof formatValue === 'string' && formatValue ? formatValue : fallback;
    if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = fallback;
      }
    }
    const baseType = mimeType.split(';')[0] || fallback;
    return { mimeType, baseType, extension: 'webm' };
  }

  function getRecordingVideoSettings() {
    return { muted: false, volume: 0 };
  }

  function frameToTime(frameIndex, fps) {
    const safeFps = normalizeFps(fps);
    const frame = Math.max(0, Math.floor(Number(frameIndex) || 0));
    return frame / safeFps;
  }

  function timeToFrame(timeSeconds, fps) {
    const safeFps = normalizeFps(fps);
    const time = Math.max(0, Number(timeSeconds) || 0);
    return Math.floor(time * safeFps);
  }

  function computeSegmentDuration(segment) {
    if (!segment) return 0;
    const start = Number(segment.in) || 0;
    const end = Number(segment.out);
    const full = Number(segment.duration) || 0;
    if (Number.isFinite(end) && end > start) return end - start;
    return Math.max(0, full - start);
  }

  function computeTimeline(segments) {
    const ranges = [];
    let total = 0;
    (segments || []).forEach(segment => {
      const duration = computeSegmentDuration(segment);
      const start = total;
      total += duration;
      ranges.push({ start, end: total, duration, segment });
    });
    return { total, ranges };
  }

  function findSegmentAtTime(segments, timeSeconds) {
    const { total, ranges } = computeTimeline(segments);
    if (!ranges.length) {
      return { index: -1, segment: null, localTime: 0, offset: 0, time: 0, total: 0 };
    }
    const clamped = clamp(timeSeconds || 0, 0, total);
    for (let i = 0; i < ranges.length; i += 1) {
      const range = ranges[i];
      if (clamped <= range.end || i === ranges.length - 1) {
        const localTime = clamped - range.start;
        return {
          index: i,
          segment: range.segment,
          localTime,
          offset: range.start,
          time: clamped,
          total
        };
      }
    }
    return { index: -1, segment: null, localTime: 0, offset: 0, time: clamped, total };
  }

  function spliceSegments(segments, cutTime, newSegment) {
    const current = Array.isArray(segments) ? segments : [];
    if (!current.length) return newSegment ? [newSegment] : [];
    if (!newSegment) return current.slice();

    const { total } = computeTimeline(current);
    const normalizedCut = clamp(cutTime || 0, 0, total);
    if (normalizedCut <= 0) return [newSegment];

    const { index, segment, localTime } = findSegmentAtTime(current, normalizedCut);
    if (!segment || index < 0) return current.slice();

    const next = current.slice(0, index).map(seg => ({ ...seg }));
    const trimmedEnd = (Number(segment.in) || 0) + localTime;
    if (trimmedEnd > (Number(segment.in) || 0)) {
      next.push({ ...segment, out: trimmedEnd });
    }
    next.push(newSegment);
    return next;
  }

  // ======== Project state + segment helpers ========

  const state = {
    segments: [],
    fps: DEFAULT_FPS,
    bookmarks: [],
    currentTime: 0,
    activeIndex: 0,
    playing: false,
    recording: false
  };

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '0.000s';
    return `${seconds.toFixed(3)}s`;
  }

  function updateState(patch) {
    Object.assign(state, patch || {});
  }

  function createSegmentFromFile(file, metadata) {
    const url = URL.createObjectURL(file);
    const duration = Number(metadata?.duration) || 0;
    return {
      id: `seg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      file,
      url,
      duration,
      in: 0,
      out: duration,
      label: file.name || 'Clip'
    };
  }

  function revokeSegmentUrls(segments) {
    (segments || []).forEach(segment => {
      if (segment && segment.url) {
        URL.revokeObjectURL(segment.url);
      }
    });
  }

  function loadVideoMetadata(file) {
    return new Promise(resolve => {
      if (!file) return resolve(null);
      const temp = document.createElement('video');
      temp.preload = 'metadata';
      temp.src = URL.createObjectURL(file);
      temp.onloadedmetadata = () => {
        const duration = Number.isFinite(temp.duration) ? temp.duration : 0;
        const width = temp.videoWidth || 0;
        const height = temp.videoHeight || 0;
        URL.revokeObjectURL(temp.src);
        resolve({ duration, width, height });
      };
      temp.onerror = () => resolve(null);
    });
  }

  function getSegmentOffset(segments, index) {
    let offset = 0;
    for (let i = 0; i < index; i += 1) {
      offset += computeSegmentDuration(segments[i]);
    }
    return offset;
  }

  // ======== Timeline playback ========

  function loadSegmentIntoVideo(video, segment, localTime, autoplay) {
    return new Promise(resolve => {
      if (!segment) return resolve();
      const targetTime = (Number(segment.in) || 0) + (localTime || 0);
      const onReady = () => {
        video.currentTime = clamp(targetTime, 0, Number(segment.out) || segment.duration || 0);
        if (autoplay) {
          video.play().catch(() => {});
        }
        resolve();
      };
      if (video.src !== segment.url) {
        video.src = segment.url;
        video.load();
        video.addEventListener('loadedmetadata', onReady, { once: true });
      } else {
        onReady();
      }
    });
  }

  function createTimelineController(video, onTimeUpdate) {
    let activeIndex = 0;
    let segments = [];
    let playing = false;

    const sync = () => {
      if (!segments.length) return;
      const segment = segments[activeIndex];
      if (!segment) return;
      const localTime = Math.max(0, video.currentTime - (Number(segment.in) || 0));
      const offset = getSegmentOffset(segments, activeIndex);
      const compositeTime = offset + localTime;
      if (typeof onTimeUpdate === 'function') {
        onTimeUpdate({ compositeTime, segmentIndex: activeIndex, localTime });
      }
      const segmentEnd = Number(segment.out) || segment.duration || 0;
      if (video.currentTime >= segmentEnd - 0.02) {
        if (activeIndex < segments.length - 1) {
          activeIndex += 1;
          loadSegmentIntoVideo(video, segments[activeIndex], 0, playing);
        } else {
          playing = false;
          video.pause();
        }
      }
    };

    video.addEventListener('timeupdate', sync);

    const setSegments = nextSegments => {
      segments = Array.isArray(nextSegments) ? nextSegments : [];
      activeIndex = 0;
    };

    const play = () => {
      playing = true;
      video.play().catch(() => {});
    };

    const pause = () => {
      playing = false;
      video.pause();
    };

    const seek = async timeSeconds => {
      if (!segments.length) return;
      const { index, segment, localTime } = findSegmentAtTime(segments, timeSeconds);
      activeIndex = index;
      await loadSegmentIntoVideo(video, segment, localTime, false);
    };

    const getActiveIndex = () => activeIndex;

    return {
      setSegments,
      play,
      pause,
      seek,
      getActiveIndex
    };
  }

  async function playTimeline(video, segments) {
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      if (!segment) continue;
      await loadSegmentIntoVideo(video, segment, 0, false);
      await new Promise(resolve => {
        const end = Number(segment.out) || segment.duration || 0;
        const onTime = () => {
          if (video.currentTime >= end - 0.02) {
            video.pause();
            video.removeEventListener('timeupdate', onTime);
            resolve();
          }
        };
        video.addEventListener('timeupdate', onTime);
        video.play().catch(() => resolve());
      });
    }
  }

  // ======== UI wiring ========

  function initializeUI() {
    const baseInput = document.getElementById('base-video-input');
    const previewVideo = document.getElementById('preview-video');
    const timelineSlider = document.getElementById('timeline-slider');
    const currentTimeEl = document.getElementById('current-time');
    const totalTimeEl = document.getElementById('total-time');
    const baseDurationEl = document.getElementById('base-duration');
    const fpsDisplay = document.getElementById('fps-display');
    const fpsInput = document.getElementById('fps-input');
    const frameInput = document.getElementById('frame-input');
    const timeInput = document.getElementById('time-input');
    const captureBtn = document.getElementById('capture-frame');
    const frameCanvas = document.getElementById('frame-canvas');
    const timelineList = document.getElementById('timeline-list');
    const bookmarkList = document.getElementById('bookmark-list');
    const clearBookmarks = document.getElementById('clear-bookmarks');
    const exportBtn = document.getElementById('export-button');
    const exportFormat = document.getElementById('export-format');
    const exportStatus = document.getElementById('export-status');
    const projectStatus = document.getElementById('project-status');

    const controller = createTimelineController(previewVideo, info => {
      updateState({ currentTime: info.compositeTime, activeIndex: info.segmentIndex });
      timelineSlider.value = String(info.compositeTime);
      currentTimeEl.textContent = formatTime(info.compositeTime);
      timeInput.value = info.compositeTime.toFixed(3);
      frameInput.value = String(timeToFrame(info.compositeTime, state.fps));
    });

    const refreshTimelineUI = () => {
      const { total } = computeTimeline(state.segments);
      totalTimeEl.textContent = formatTime(total);
      timelineSlider.max = String(total || 0);
      timelineSlider.value = String(clamp(state.currentTime || 0, 0, total || 0));
      fpsDisplay.textContent = String(state.fps);
      projectStatus.textContent = state.segments.length
        ? `Loaded ${state.segments.length} clip(s)`
        : 'No video loaded.';
      timelineList.innerHTML = '';
      state.segments.forEach((segment, index) => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.innerHTML = `
          <div class="timeline-index">${index + 1}</div>
          <div>
            <div class="timeline-title">${segment.label || 'Clip'}</div>
            <div class="timeline-duration">Trim: ${(segment.in || 0).toFixed(2)}s → ${(segment.out || 0).toFixed(2)}s</div>
          </div>
          <div class="timeline-duration">${computeSegmentDuration(segment).toFixed(2)}s</div>
        `;
        timelineList.appendChild(item);
      });
      captureBtn.disabled = !state.segments.length;
      exportBtn.disabled = !state.segments.length || state.recording;
      if (clearBookmarks) clearBookmarks.disabled = !state.bookmarks.length;
    };

    // Bookmark list cards own upload + download actions (no separate cut selector).
    const renderBookmarks = () => {
      if (!bookmarkList) return;
      bookmarkList.innerHTML = '';
      if (!state.bookmarks.length) {
        bookmarkList.textContent = 'No bookmarks yet.';
        return;
      }
      state.bookmarks.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'bookmark-item';
        const thumb = entry.image ? `<img class="bookmark-thumb" src="${entry.image}" alt="Bookmark frame">` : '<div class="bookmark-thumb"></div>';
        item.innerHTML = `
          ${thumb}
          <div class="bookmark-meta">
            <div><strong>Time:</strong> ${formatTime(entry.time)}</div>
            <div><strong>Frame:</strong> ${entry.frame}</div>
          </div>
          <div class="bookmark-actions">
            <label class="bookmark-button bookmark-upload">
              Upload replacement
              <input class="bookmark-upload-input" type="file" accept="video/*" data-bookmark-id="${entry.id}">
            </label>
            <button class="bookmark-button" data-action="download" data-bookmark-id="${entry.id}">Download frame</button>
            <button class="bookmark-button" data-action="remove" data-bookmark-id="${entry.id}">Remove</button>
          </div>
        `;
        bookmarkList.appendChild(item);
      });
    };

    const setCurrentTime = async nextTime => {
      const { total } = computeTimeline(state.segments);
      const clamped = clamp(nextTime || 0, 0, total || 0);
      updateState({ currentTime: clamped });
      await controller.seek(clamped);
      timelineSlider.value = String(clamped);
      currentTimeEl.textContent = formatTime(clamped);
    };

    // Capture a bookmark frame; preview and downloads live in the bookmark list.
    const captureFrame = () => {
      if (!state.segments.length) return;
      const width = previewVideo.videoWidth || 0;
      const height = previewVideo.videoHeight || 0;
      if (!width || !height) return;
      frameCanvas.width = width;
      frameCanvas.height = height;
      const ctx = frameCanvas.getContext('2d');
      if (!ctx) return;
      // Hidden canvas snapshot keeps capture lightweight without a separate preview panel.
      ctx.drawImage(previewVideo, 0, 0, width, height);
      const dataUrl = frameCanvas.toDataURL('image/png');
      const bookmark = createBookmark(state.currentTime, state.fps, dataUrl);
      const nextBookmarks = state.bookmarks.concat(bookmark);
      updateState({ bookmarks: nextBookmarks });
      renderBookmarks();
      refreshTimelineUI();
    };

    const handleBaseVideo = async file => {
      if (!file) return;
      revokeSegmentUrls(state.segments);
      updateState({ bookmarks: [] });
      const meta = await loadVideoMetadata(file);
      const segment = createSegmentFromFile(file, meta || {});
      updateState({
        segments: [segment],
        currentTime: 0,
        activeIndex: 0
      });
      baseDurationEl.textContent = formatTime(segment.duration);
      controller.setSegments(state.segments);
      await loadSegmentIntoVideo(previewVideo, segment, 0, false);
      refreshTimelineUI();
      renderBookmarks();
    };

    const handleReplacementVideo = async (file, bookmarkId) => {
      const cutTime = resolveBookmarkTime(state.bookmarks, bookmarkId);
      if (!file || cutTime === null) return;
      const meta = await loadVideoMetadata(file);
      const segment = createSegmentFromFile(file, meta || {});
      const nextSegments = spliceSegments(state.segments, cutTime, segment);
      const removed = state.segments.filter(prev => !nextSegments.some(next => next.id === prev.id));
      revokeSegmentUrls(removed);
      updateState({
        segments: nextSegments,
        activeIndex: 0,
        currentTime: cutTime || 0,
        bookmarks: []
      });
      controller.setSegments(state.segments);
      await controller.seek(state.currentTime);
      refreshTimelineUI();
      renderBookmarks();
    };

    const exportProject = async () => {
      if (!state.segments.length) return;
      updateState({ recording: true });
      refreshTimelineUI();
      exportStatus.textContent = 'Exporting... this plays the timeline and records it.';

      const recordVideo = document.createElement('video');
      if (!recordVideo.captureStream || typeof MediaRecorder === 'undefined') {
        exportStatus.textContent = 'Export not supported in this browser.';
        updateState({ recording: false });
        refreshTimelineUI();
        return;
      }
      recordVideo.playsInline = true;
      const recordingSettings = getRecordingVideoSettings();
      recordVideo.muted = recordingSettings.muted;
      recordVideo.volume = recordingSettings.volume;
      recordVideo.style.position = 'fixed';
      recordVideo.style.left = '-9999px';
      document.body.appendChild(recordVideo);

      const stream = recordVideo.captureStream();
      const chunks = [];
      const exportSettings = getExportSettings(exportFormat.value);
      const recorder = new MediaRecorder(stream, { mimeType: exportSettings.mimeType });

      const stopPromise = new Promise(resolve => {
        recorder.onstop = resolve;
      });

      recorder.ondataavailable = event => {
        if (event.data && event.data.size) chunks.push(event.data);
      };

      recorder.start();
      await playTimeline(recordVideo, state.segments);
      recorder.stop();
      await stopPromise;

      const blob = new Blob(chunks, { type: exportSettings.baseType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `spliced-video.${exportSettings.extension}`;
      link.click();
      URL.revokeObjectURL(url);
      recordVideo.remove();

      exportStatus.textContent = 'Export complete.';
      updateState({ recording: false });
      refreshTimelineUI();
    };

    baseInput.addEventListener('change', event => {
      const file = event.target.files && event.target.files[0];
      handleBaseVideo(file);
      baseInput.value = '';
    });

    fpsInput.addEventListener('input', () => {
      const nextFps = normalizeFps(fpsInput.value);
      updateState({ fps: nextFps });
      fpsDisplay.textContent = String(nextFps);
      frameInput.value = String(timeToFrame(state.currentTime, nextFps));
    });

    frameInput.addEventListener('input', () => {
      const time = frameToTime(frameInput.value, state.fps);
      timeInput.value = time.toFixed(3);
      setCurrentTime(time);
    });

    timeInput.addEventListener('input', () => {
      const time = Number(timeInput.value) || 0;
      frameInput.value = String(timeToFrame(time, state.fps));
      setCurrentTime(time);
    });

    timelineSlider.addEventListener('input', () => {
      const time = Number(timelineSlider.value) || 0;
      timeInput.value = time.toFixed(3);
      frameInput.value = String(timeToFrame(time, state.fps));
      setCurrentTime(time);
    });

    captureBtn.addEventListener('click', captureFrame);

    if (bookmarkList) {
      bookmarkList.addEventListener('click', event => {
        const action = event.target.closest('[data-bookmark-id]');
        if (!action) return;
        const id = action.dataset.bookmarkId;
        if (!id) return;
        if (action.dataset.action === 'remove') {
          const filtered = state.bookmarks.filter(entry => entry.id !== id);
          updateState({ bookmarks: filtered });
          renderBookmarks();
          refreshTimelineUI();
          return;
        }
        if (action.dataset.action === 'download') {
          const entry = state.bookmarks.find(item => item.id === id);
          if (entry && entry.image) {
            const link = document.createElement('a');
            link.href = entry.image;
            link.download = `bookmark-${entry.frame || 0}.png`;
            link.click();
          }
        }
      });

      bookmarkList.addEventListener('change', event => {
        const input = event.target.closest('.bookmark-upload-input');
        if (!input) return;
        const file = input.files && input.files[0];
        const id = input.dataset.bookmarkId;
        if (file && id) {
          handleReplacementVideo(file, id);
        }
        input.value = '';
      });
    }

    if (clearBookmarks) {
      clearBookmarks.addEventListener('click', () => {
        updateState({ bookmarks: [] });
        renderBookmarks();
        refreshTimelineUI();
      });
    }

    exportBtn.addEventListener('click', exportProject);

    refreshTimelineUI();
    renderBookmarks();
  }

  // ======== Initialization + exports ========

  const api = {
    clamp,
    normalizeFps,
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
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (typeof window !== 'undefined') {
    window.VideoUtilities = api;
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeUI);
    } else {
      initializeUI();
    }
  }
})();
