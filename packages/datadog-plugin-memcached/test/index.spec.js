'use strict'

const agent = require('../../dd-trace/test/plugins/agent')
const proxyquire = require('proxyquire').noPreserveCache()
const { ERROR_MESSAGE, ERROR_TYPE, ERROR_STACK } = require('../../dd-trace/src/constants')

const namingSchema = require('./naming')

describe('Plugin', () => {
  let Memcached
  let memcached
  let tracer

  describe('memcached', () => {
    withVersions('memcached', 'memcached', version => {
      afterEach(() => {
        memcached.end()
        agent.close({ ritmReset: false })
      })

      describe('without configuration', () => {
        beforeEach(async () => {
          await agent.load('memcached')
          tracer = require('../../dd-trace')
          Memcached = proxyquire(`../../../versions/memcached@${version}/node_modules/memcached`, {})
        })

        it('should do automatic instrumentation when using callbacks', done => {
          memcached = new Memcached('localhost:11211', { retries: 0 })

          agent
            .use(traces => {
              expect(traces[0][0]).to.have.property('name', namingSchema.outbound.opName)
              expect(traces[0][0]).to.have.property('service', namingSchema.outbound.serviceName)
              expect(traces[0][0]).to.have.property('resource', 'get')
              expect(traces[0][0]).to.have.property('type', 'memcached')
              expect(traces[0][0].meta).to.have.property('span.kind', 'client')
              expect(traces[0][0].meta).to.have.property('out.host', 'localhost')
              expect(traces[0][0].meta).to.have.property('network.destination.port', '11211')
              expect(traces[0][0].meta).to.have.property('memcached.command', 'get test')
              expect(traces[0][0].meta).to.have.property('component', 'memcached')
            })
            .then(done)
            .catch(done)

          memcached.get('test', err => err && done(err))
        })

        it('should run the callback in the parent context', done => {
          memcached = new Memcached('localhost:11211', { retries: 0 })

          const span = tracer.startSpan('web.request')

          tracer.scope().activate(span, () => {
            memcached.get('test', err => {
              if (err) return done(err)
              try {
                expect(tracer.scope().active()).to.equal(span)
                done()
              } catch (e) {
                done(e)
              }
            })
          })
        })

        it('should handle errors', done => {
          memcached = new Memcached('localhost:11211', { retries: 0 })

          let error

          agent
            .use(traces => {
              expect(traces[0][0]).to.have.property('error', 1)
              expect(traces[0][0].meta).to.have.property(ERROR_TYPE, error.name)
              expect(traces[0][0].meta).to.have.property(ERROR_MESSAGE, error.message)
              expect(traces[0][0].meta).to.have.property(ERROR_STACK, error.stack)
              expect(traces[0][0].meta).to.have.property('component', 'memcached')
            })
            .then(done)
            .catch(done)

          memcached.touch('test', 'invalid', err => {
            error = err
          })
        })

        it('should support an array of servers', done => {
          memcached = new Memcached(['localhost:11211'], { retries: 0 })

          agent
            .use(traces => {
              expect(traces[0][0].meta).to.have.property('out.host', 'localhost')
              expect(traces[0][0].meta).to.have.property('network.destination.port', '11211')
              expect(traces[0][0].meta).to.have.property('component', 'memcached')
            })
            .then(done)
            .catch(done)

          memcached.get('test', err => err && done(err))
        })

        it('should support an object of servers with weights', done => {
          memcached = new Memcached({
            'localhost:11211': 1,
            'other:11211': 1
          }, { retries: 0 })

          agent
            .use(traces => {
              expect(traces[0][0].meta).to.have.property('out.host', 'localhost')
              expect(traces[0][0].meta).to.have.property('network.destination.port', '11211')
              expect(traces[0][0].meta).to.have.property('component', 'memcached')
            })
            .then(done)
            .catch(done)

          memcached.get('test', err => err && done(err))
        })

        it('should support redundancy', done => {
          memcached = new Memcached({
            'localhost:11211': 1,
            'other:11211': 1
          }, {
            retries: 0,
            redundancy: 1
          })

          try {
            memcached.del('test', err => err && done(err))

            agent
              .use(traces => {
                expect(traces[0][0].meta).to.have.property('out.host', 'localhost')
                expect(traces[0][0].meta).to.have.property('network.destination.port', '11211')
                expect(traces[0][0].meta).to.have.property('component', 'memcached')
              })
              .then(done)
              .catch(done)
          } catch (e) {
            // Bug in memcached will throw. Skip test when this happens.
            done()
          }
        })

        withNamingSchema(
          done => memcached.get('test', err => err && done(err)),
          () => namingSchema.outbound.opName,
          () => namingSchema.outbound.serviceName
        )
      })

      describe('with configuration', () => {
        beforeEach(async () => {
          await agent.load('memcached', { service: 'custom' })
          tracer = require('../../dd-trace')
          Memcached = proxyquire(`../../../versions/memcached@${version}/node_modules/memcached`, {})
          memcached = new Memcached('localhost:11211', { retries: 0 })
        })

        it('should be configured with the correct values', done => {
          agent
            .use(traces => {
              expect(traces[0][0]).to.have.property('service', 'custom')
            })
            .then(done)
            .catch(done)

          memcached.version(err => err && done(err))
        })
      })
    })
  })
})
