'use strict'

const api = require('@opentelemetry/api')

const {
  getTimeOrigin,
  otperformance,
  timeInputToHrTime
} = require('@opentelemetry/core')

const tracer = require('../../')
const DatadogSpan = require('../opentracing/span')
const { ERROR_MESSAGE, ERROR_TYPE, ERROR_STACK } = require('../constants')

const SpanContext = require('./span_context')

// The one built into OTel rounds so we lose sub-millisecond precision.
function hrTimeToMilliseconds (time) {
  return time[0] * 1e3 + time[1] / 1e6
}

function toDDTime (timeInput) {
  const hr = timeInputToHrTime(timeInput || (otperformance.now() + getTimeOrigin()))
  const millis = hrTimeToMilliseconds(hr) - getTimeOrigin()
  return millis
}

function adjustTime (ts, { startTime = Date.now(), ticks = 0 } = {}) {
  return startTime + ts - ticks
}

class Span {
  constructor (
    parentTracer,
    context,
    spanName,
    spanContext,
    kind,
    links = [],
    startTime
  ) {
    const { _tracer } = tracer

    const hrStartTime = timeInputToHrTime(startTime || (otperformance.now() + getTimeOrigin()))
    const millis = hrTimeToMilliseconds(hrStartTime)

    this._ddSpan = new DatadogSpan(_tracer, _tracer._processor, _tracer._prioritySampler, {
      operationName: spanName,
      context: spanContext._ddContext,
      startTime: adjustTime(millis, spanContext._ddContext._trace),
      hostname: _tracer._hostname,
      tags: {
        'service.name': _tracer._service
      }
    }, _tracer._debug)

    this._parentTracer = parentTracer
    this._context = context

    // NOTE: Need to grab the value before setting it on the span because the
    // math for computing opentracing timestamps is apparently lossy...
    this.startTime = hrStartTime
    this.kind = kind
    this.links = links
    this._spanProcessor.onStart(this, context)
  }

  get parentSpanId () {
    const { _parentId } = this._ddSpan.context()
    return _parentId && _parentId.toString(16)
  }

  // Expected by OTel
  get resource () {
    return this._parentTracer.resource
  }
  get instrumentationLibrary () {
    return this._parentTracer.instrumentationLibrary
  }
  get _spanProcessor () {
    return this._parentTracer.getActiveSpanProcessor()
  }

  get name () {
    return this._ddSpan.context()._name
  }

  spanContext () {
    return new SpanContext(this._ddSpan.context())
  }

  setAttribute (key, value) {
    this._ddSpan.setTag(key, value)
    return this
  }

  setAttributes (attributes) {
    this._ddSpan.addTags(attributes)
    return this
  }

  addEvent (name, attributesOrStartTime, startTime) {
    api.diag.warn('Events not supported')
    return this
  }

  setStatus ({ code, message }) {
    if (!this.ended && code === 2) {
      this._ddSpan.addTags({
        [ERROR_MESSAGE]: message
      })
    }
    return this
  }

  updateName (name) {
    if (!this.ended) {
      this._ddSpan.setOperationName(name)
    }
    return this
  }

  end (endTime) {
    if (this.ended) {
      api.diag.error('You can only call end() on a span once.')
      return
    }

    const ddEndTime = adjustTime(toDDTime(endTime), this._ddSpan.context()._trace)
    this._ddSpan.finish(ddEndTime)
    this._spanProcessor.onEnd(this)
  }

  isRecording () {
    return this.ended === false
  }

  recordException (exception) {
    this._ddSpan.addTags({
      [ERROR_TYPE]: exception.name,
      [ERROR_MESSAGE]: exception.message,
      [ERROR_STACK]: exception.stack
    })
  }

  get duration () {
    return this._ddSpan._duration
  }

  get ended () {
    return typeof this.duration !== 'undefined'
  }
}

module.exports = Span
