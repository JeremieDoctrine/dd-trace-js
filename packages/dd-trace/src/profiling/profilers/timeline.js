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

class TimelineProfiler {
  constructor (options = {}) {
    this.type = 'timeline'
    this._mapper = undefined
    this._pprof = undefined
    this._started = false
    this._timelineProfiler = undefined
    this._endpointCollection = options.endpointCollection

    // Bind to this so the same value can be used to unsubscribe later
    this._enter = this._enter.bind(this)
    this._exit = this._exit.bind(this)
  }

  _enter () {
    if (!this._timelineProfiler) return

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

    this._timelineProfiler.labels = labels
  }

  _exit () {
    if (!this._timelineProfiler) return
    this._timelineProfiler.labels = {}
  }

  start ({ mapper } = {}) {
    if (this._started) return
    this._started = true

    this._mapper = mapper
    if (!this._pprof) {
      this._pprof = require('@datadog/pprof')
      this._timelineProfiler = new this._pprof.TimelineProfiler()
    }

    this._timelineProfiler.start()

    this._enter()
    beforeCh.subscribe(this._enter)
    afterCh.subscribe(this._exit)
  }

  profile () {
    if (!this._started) return
    return this._timelineProfiler.profile()
  }

  encode (profile) {
    return this._pprof.encode(profile)
  }

  stop () {
    if (!this._started) return
    this._started = false

    this._timelineProfiler.stop()
    beforeCh.unsubscribe(this._enter)
    afterCh.unsubscribe(this._exit)
  }
}

module.exports = TimelineProfiler
