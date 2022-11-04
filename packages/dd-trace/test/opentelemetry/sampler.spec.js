'use strict'

const Sampler = require('../../src/opentelemetry/sampler')

describe('OTel Sampler', () => {
  it('should sample', () => {
    const sampler = new Sampler()

    expect(sampler.shouldSample()).to.eql({
      decision: 2
    })
  })

  it('should stringify', () => {
    const sampler = new Sampler()
    expect(sampler.toString()).to.eq('DatadogSampler')
  })
})
