'use strict'

const { storage } = require('../../../../datadog-core')

const dc = require('diagnostics_channel')

const beforeCh = dc.channel('dd-trace:storage:before')
const afterCh = dc.channel('dd-trace:storage:after')
const incomingHttpRequestStart = dc.channel('dd-trace:incomingHttpRequestStart')
const incomingHttpRequestEnd = dc.channel('dd-trace:incomingHttpRequestEnd')

function getActiveSpan () {
  const store = storage.getStore()
  if (!store) return
  return store.span
}

class NativeWallProfiler {
  constructor (options = {}) {
    this.type = 'wall'
    this._samplingInterval = options.samplingInterval || 1e6 / 99 // 99hz
    this._flushInterval = options.flushInterval || 60 * 1000 // 60 seconds
    this._mapper = undefined
    this._pprof = undefined
    this._endpointCollection = options.endpointCollection

    // Bind to this so the same value can be used to unsubscribe later
    this._enter = this._enter.bind(this)
    this._exit = this._exit.bind(this)

    this._spanStack = []
    this._labelStack = []
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
    incomingHttpRequestStart.subscribe(this._enter)
    incomingHttpRequestEnd.subscribe(this._exit)
  }

  markAsSampled (span) {
    // NOTE: there's no guarantee these tags will be applied to the span as it
    // is possible it'll be sent to the agent by the time we get to execute
    // this code.
    if (this._labelsCaptured() && span) {
      span.setTag('sampled', 'yes')
      span.setTag('manual.keep', true)
    }
  }

  _enter () {
    if (!this._setLabels) return

    const spanCount = this._spanStack.length
    if (spanCount > 0) {
      // Before we set labels of the new span, mark
      // the current span (if any) if it was sampled.
      this.markAsSampled(this._spanStack[spanCount - 1])
    }

    const active = getActiveSpan() || null

    const activeCtx = active ? active.context() : null

    const labels = activeCtx ? {
      'span id': activeCtx.toSpanId()
    } : null

    this._labelStack.push(labels)
    this._spanStack.push(active)
    if (labels) {
      this._setLabels(labels)
    } else {
      this._unsetLabels()
    }
  }

  _exit () {
    if (!this._labelsCaptured) return

    this.markAsSampled(this._spanStack.pop())

    this._labelStack.pop()
    const stackLen = this._labelStack.length
    const prevLabels = stackLen > 0 ? this._labelStack[stackLen - 1] : null
    if (prevLabels) {
      this._setLabels(prevLabels)
    } else {
      this._unsetLabels()
    }
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
    beforeCh.unsubscribe(this._enter)
    afterCh.unsubscribe(this._exit)
    this._setLabels = undefined
    this._unsetLabels = undefined
  }

  _record () {
    const { stop, setLabels, unsetLabels, labelsCaptured } = this._pprof.time.start(
      this._samplingInterval, this._flushInterval, null, this._mapper, false)
    this._stop = stop
    this._setLabels = setLabels
    this._unsetLabels = unsetLabels
    this._labelsCaptured = labelsCaptured
  }
}

module.exports = NativeWallProfiler
