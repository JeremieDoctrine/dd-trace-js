'use strict'

const InjectionAnalyzer = require('./injection-analyzer')
const { SQL_INJECTION } = require('../vulnerabilities')
const { getRanges } = require('../taint-tracking/operations')
const { storage } = require('../../../../../datadog-core')
const { getIastContext } = require('../iast-context')
const { createVulnerability, addVulnerability } = require('../vulnerability-reporter')

class SqlInjectionAnalyzer extends InjectionAnalyzer {
  constructor () {
    super(SQL_INJECTION)
  }

  _getEvidence (value, iastContext, dialect) {
    const ranges = getRanges(iastContext, value)
    return { value, ranges, dialect }
  }

  analyze (value, dialect) {
    const store = storage.getStore()
    const iastContext = getIastContext(store)
    if (this._isInvalidContext(store, iastContext)) return
    this._reportIfVulnerable(value, iastContext, dialect)
  }

  _reportIfVulnerable (value, context, dialect) {
    if (this._isVulnerable(value, context) && this._checkOCE(context)) {
      this._report(value, context, dialect)
      return true
    }
    return false
  }

  _report (value, context, dialect) {
    const evidence = this._getEvidence(value, context, dialect)
    const location = this._getLocation()
    if (!this._isExcluded(location)) {
      const spanId = context && context.rootSpan && context.rootSpan.context().toSpanId()
      const vulnerability = createVulnerability(this._type, evidence, spanId, location)
      addVulnerability(context, vulnerability)
    }
  }

  onConfigure () {
    this.addSub(
      { channelName: 'apm:mysql:query:start' },
      ({ sql }) => this.analyze(sql, 'MYSQL')
    )
    this.addSub(
      { channelName: 'apm:mysql2:query:start' },
      ({ sql }) => this.analyze(sql, 'MYSQL')
    )
    this.addSub(
      { channelName: 'apm:pg:query:start' },
      ({ query }) => this.analyze(query.text, 'POSTGRES')
    )
  }
}

module.exports = new SqlInjectionAnalyzer()
