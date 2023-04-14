'use strict'

const { storage } = require('../../../../datadog-core')

const dc = require('diagnostics_channel')

const beforeCh = dc.channel('dd-trace:storage:before')
const afterCh = dc.channel('dd-trace:storage:after')

function getActiveSpan () {
  const store = storage.getStore()
  if (!store) return
  return store.span
}

function getStartedSpans (activeSpan) {
  const context = activeSpan.context()
  if (!context) return
  return context._trace.started
}

function getSpanContextTags (span) {
  return span.context()._tags
}

function isWebServerSpan (tags) {
  return tags['span.type'] === 'web'
}

function endpointNameFromTags (tags) {
  return tags['resource.name'] || [
    tags['http.method'],
    tags['http.route']
  ].filter(v => v).join(' ')
}

class NativeWallProfiler {
  constructor (options = {}) {
    this.type = 'wall'
    this._samplingInterval = options.samplingInterval || 1e6 / 99 // 99hz
    this._mapper = undefined
    this._pprof = undefined

    this._endpointCollection = options.endpointCollection

    // Bind to this so the same value can be used to unsubscribe later
    this._enter = this._enter.bind(this)
    this._exit = this._exit.bind(this)
  }

  _enter () {
    if (!this._stop) return
    const active = getActiveSpan()
    if (!active) return

    const activeCtx = active.context()
    if (!activeCtx) return

    const spans = getStartedSpans(active)
    if (!spans || !spans.length) return

    const firstCtx = spans[0].context()
    if (!firstCtx) return

    const labels = {
      'local root span id': firstCtx.toSpanId(),
      'span id': activeCtx.toSpanId()
    }

    if (this._endpointCollection) {
      const webServerTags = spans
        .map(getSpanContextTags)
        .filter(isWebServerSpan)[0]

      if (webServerTags) {
        labels['trace endpoint'] = endpointNameFromTags(webServerTags)
      }
    }

    this._setLabels(labels)
  }

  _exit () {
    if (!this._cpuProfiler) return
    this._setLabels({})
  }

  start ({ mapper } = {}) {
    this._mapper = mapper
    this._pprof = require('@datadog/pprof')

    // pprof otherwise crashes in worker threads
    if (!process._startProfilerIdleNotifier) {
      process._startProfilerIdleNotifier = () => {}
    }
    if (!process._stopProfilerIdleNotifier) {
      process._stopProfilerIdleNotifier = () => {}
    }

    this._record()
    this._enter()
    beforeCh.subscribe(this._enter)
    afterCh.subscribe(this._exit)
  }

  profile () {
    if (!this._stop) return
    return this._stop(true)
  }

  encode (profile) {
    return this._pprof.encode(profile)
  }

  stop () {
    if (!this._stop) return
    this._stop()
    this._stop = undefined
    this._setLabels = undefined

    beforeCh.unsubscribe(this._enter)
    afterCh.unsubscribe(this._exit)
  }

  _record () {
    const { stop, setLabels } = this._pprof.time.start(this._samplingInterval, null,
      this._mapper, false)
    this._stop = stop
    this._setLabels = setLabels
  }
}

module.exports = NativeWallProfiler
