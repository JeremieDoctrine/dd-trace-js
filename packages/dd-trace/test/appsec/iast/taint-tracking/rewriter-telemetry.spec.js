'use strict'
const { expect } = require('chai')
const proxyquire = require('proxyquire')

const { INSTRUMENTED_PROPAGATION } = require('../../../../src/appsec/iast/iast-metric')
const { Verbosity } = require('../../../../src/appsec/telemetry/verbosity')

describe('rewriter telemetry', () => {
  let appsecTelemetry, rewriter, getRewriteFunction
  let instrumentedPropagationAdd

  beforeEach(() => {
    appsecTelemetry = {
      add: sinon.spy()
    }
    const rewriterTelemetry = proxyquire('../../../../src/appsec/iast/taint-tracking/rewriter-telemetry', {
      '../../telemetry': appsecTelemetry
    })
    getRewriteFunction = rewriterTelemetry.getRewriteFunction
    rewriter = {
      rewrite: (content) => {
        return {
          content: content + 'rewritten',
          metrics: {
            instrumentedPropagation: 2
          }
        }
      }
    }
    instrumentedPropagationAdd = sinon.stub(INSTRUMENTED_PROPAGATION, 'add')
  })

  afterEach(sinon.restore)

  it('should not increase any metrics with OFF verbosity', () => {
    appsecTelemetry.verbosity = Verbosity.OFF

    const rewriteFn = getRewriteFunction(rewriter)
    rewriteFn('const a = b + c', 'test.js')

    expect(instrumentedPropagationAdd).to.not.be.called
  })

  it('should increase information metrics with MANDATORY verbosity', () => {
    appsecTelemetry.verbosity = Verbosity.MANDATORY

    const rewriteFn = getRewriteFunction(rewriter)
    const result = rewriteFn('const a = b + c', 'test.js')

    expect(instrumentedPropagationAdd).to.be.calledOnceWith(result.metrics.instrumentedPropagation)
  })

  it('should increase information metrics with INFORMATION verbosity', () => {
    appsecTelemetry.verbosity = Verbosity.INFORMATION

    const rewriteFn = getRewriteFunction(rewriter)
    const result = rewriteFn('const a = b + c', 'test.js')

    expect(instrumentedPropagationAdd).to.be.calledOnceWith(result.metrics.instrumentedPropagation)
  })

  it('should increase debug metrics with DEBUG verbosity', () => {
    appsecTelemetry.verbosity = Verbosity.DEBUG

    const rewriteFn = getRewriteFunction(rewriter)
    const result = rewriteFn('const a = b + c', 'test.js')

    expect(instrumentedPropagationAdd).to.be.calledOnceWith(result.metrics.instrumentedPropagation)
  })
})
