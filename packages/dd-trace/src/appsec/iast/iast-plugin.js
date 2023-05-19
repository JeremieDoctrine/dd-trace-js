'use strict'

const { channel } = require('../../../../diagnostics_channel')

const log = require('../../log')
const Plugin = require('../../plugins/plugin')
const appsecTelemetry = require('../telemetry')
const { getInstrumentedMetric, getExecutedMetric, MetricTag } = require('./iast-metric')
const { storage } = require('../../../../datadog-core')
const { getIastContext } = require('./iast-context')
const instrumentations = require('../../../../datadog-instrumentations/src/helpers/instrumentations')

/**
 * Used by vulnerability sources and sinks to subscribe diagnostic channel events
 * and indicate what kind of metrics the subscription provides
 * - moduleName is used identify when a module is loaded and
 *    to increment the INSTRUMENTED_[SINK|SOURCE] metric when it occurs
 * - channelName is the channel used by the hook to publish execution events
 * - tag indicates the name of the metric: taint-tracking/source-types for Sources and analyzers type for Sinks
 * - metricTag can be only SOURCE_TYPE (Source) or VULNERABILITY_TYPE (Sink)
 */
class IastPluginSubscription {
  constructor (moduleName, channelName, tag, metricTag = MetricTag.VULNERABILITY_TYPE) {
    this.moduleName = moduleName
    this.channelName = channelName
    this.tag = tag
    this.metricTag = metricTag
    this.executedMetric = getExecutedMetric(this.metricTag)
    this.instrumentedMetric = getInstrumentedMetric(this.metricTag)
  }

  increaseInstrumented () {
    this.instrumentedMetric.increase(this.tag)
  }

  increaseExecuted (iastContext) {
    this.executedMetric.increase(this.tag, iastContext)
  }
}

class IastPlugin extends Plugin {
  constructor () {
    super()
    this.configured = false
    this.pluginSubs = []
  }

  _wrapHandler (handler) {
    return (message, name) => {
      try {
        handler(message, name)
      } catch (e) {
        log.error(e)
      }
    }
  }

  _getTelemetryHandler (iastSub) {
    return () => {
      try {
        const iastContext = getIastContext(storage.getStore())
        iastSub.increaseExecuted(iastContext)
      } catch (e) {
        log.error(e)
      }
    }
  }

  addSub (iastSub, handler) {
    if (typeof iastSub === 'string') {
      super.addSub(iastSub, this._wrapHandler(handler))
    } else {
      iastSub = this._getAndRegisterSubscription(iastSub)
      if (iastSub) {
        super.addSub(iastSub.channelName, this._wrapHandler(handler))

        if (appsecTelemetry.isEnabled()) {
          super.addSub(iastSub.channelName, this._getTelemetryHandler(iastSub))
        }
      }
    }
  }

  onConfigure () {}

  configure (config) {
    if (!this.configured) {
      this.onConfigure()
      this.configured = true
    }

    if (appsecTelemetry.isEnabled()) {
      if (config) {
        this.enableTelemetry()
      } else {
        this.disableTelemetry()
      }
    }

    super.configure(config)
  }

  _getAndRegisterSubscription ({ moduleName, channelName, tag, metricTag }) {
    if (!channelName) return

    if (!moduleName) {
      const firstSep = channelName.indexOf(':')
      if (firstSep === -1) {
        moduleName = channelName
      } else {
        const lastSep = channelName.indexOf(':', firstSep + 1)
        moduleName = channelName.substring(firstSep + 1, lastSep !== -1 ? lastSep : channelName.length)
      }
    }

    const iastSub = new IastPluginSubscription(moduleName, channelName, tag, metricTag)
    this.pluginSubs.push(iastSub)
    return iastSub
  }

  enableTelemetry () {
    if (this.onInstrumentationLoadedListener) return

    this.onInstrumentationLoadedListener = ({ name }) => this._onInstrumentationLoaded(name)
    const loadChannel = channel('dd-trace:instrumentation:load')
    loadChannel.subscribe(this.onInstrumentationLoadedListener)

    // check for already instrumented modules
    for (const name in instrumentations) {
      this._onInstrumentationLoaded(name)
    }
  }

  disableTelemetry () {
    if (!this.onInstrumentationLoadedListener) return

    const loadChannel = channel('dd-trace:instrumentation:load')
    if (loadChannel.hasSubscribers) {
      loadChannel.unsubscribe(this.onInstrumentationLoadedListener)
    }
    this.onInstrumentationLoadedListener = null
  }

  _onInstrumentationLoaded (name) {
    this.pluginSubs
      .filter(sub => sub.moduleName.includes(name))
      .forEach(sub => sub.increaseInstrumented())
  }
}

class SourceIastPlugin extends IastPlugin {
  addSub (iastPluginSub, handler) {
    return super.addSub({ metricTag: MetricTag.SOURCE_TYPE, ...iastPluginSub }, handler)
  }
}

class SinkIastPlugin extends IastPlugin {
  addSub (iastPluginSub, handler) {
    return super.addSub({ metricTag: MetricTag.VULNERABILITY_TYPE, ...iastPluginSub }, handler)
  }
}

module.exports = {
  SourceIastPlugin,
  SinkIastPlugin,
  IastPlugin
}
