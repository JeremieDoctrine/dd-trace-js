'use strict'

const {
  channel,
  addHook
} = require('./helpers/instrument')
const shimmer = require('../../datadog-shimmer')

const startCh = channel('apm:openai:request:start')
const finishCh = channel('apm:openai:request:finish')
const errorCh = channel('apm:openai:request:error')

addHook({ name: 'openai', file: 'dist/api.js', versions: ['>=3.0.0'] }, exports => {
  const methodNames = Object.getOwnPropertyNames(exports.OpenAIApi.prototype)
  methodNames.shift() // remove leading 'constructor' method

  // TODO: shimmer.massWrap doesn't provide method name?
  for (const methodName of methodNames) {
    shimmer.wrap(exports.OpenAIApi.prototype, methodName, fn => async function () {
      if (!startCh.hasSubscribers) {
        return fn.apply(this, arguments)
      }

      startCh.publish({
        methodName,
        body: arguments[0],
        basePath: this.basePath,
        apiKey: this.configuration.apiKey,
      })

      try {
        const response = await fn.apply(this, arguments)
        // console.log('R', response)

        // const { model, orgName } = extractHeaders(response)
        finishCh.publish({
          headers: response.headers,
          body: response.data
        })

        return response
      } catch (err) {
        console.log('ERROR', err)
        errorCh.publish({ err })

        throw err
      }
    })
  }

  return exports
})

/*
function extractHeaders(response) {
  return {
    model: response.headers['openai-model'],
    orgName: response.headers['openai-organization'],
    timing: response.headers['openai-processing-ms'], // unused
    version: response.headers['openai-version'], // unused
  }
}
*/