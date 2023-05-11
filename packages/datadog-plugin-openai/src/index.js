'use strict'

const URL = require('url')
const TracingPlugin = require('../../dd-trace/src/plugins/tracing')

const MAX_TEXT_LEN = 128 // + '...' = 131 bytes

/*
const extractionStrategies = {
  cancelFineTune: extractBasic,
  createAnswer: extractBasic,
  createChatCompletion: extractCreation,
  createClassification: extractCreation,
  createCompletion: extractCreation,
  createEdit: extractBasic,
  createEmbedding: '/embeddings',
  createFile: '/files',
  createFineTune: '/fine-tunes',
  createImage: '/images/generations',
  createImageEdit: '/images/edits',
  createImageVariation: '/images/variations',
  createModeration: '/moderations',
  createSearch: '/engines/{engine_id}/search',
  createTranscription: '/audio/transcriptions',
  createTranslation: '/audio/translations',
  deleteFile: '/files/{file_id}',
  deleteModel: '/models/{model}',
  downloadFile: '/files/{file_id}/content',
  listEngines: '/engines',
  listFiles: '/files',
  listFineTuneEvents: '/fine-tunes/{fine_tune_id}/events',
  listFineTunes: '/fine-tunes',
  listModels: '/models',
  retrieveEngine: '/engines/{engine_id}',
  retrieveFile: '/files/{file_id}',
  retrieveFineTune: '/fine-tunes/{fine_tune_id}',
  retrieveModel: '/models/{model}'
}
*/

class OpenApiPlugin extends TracingPlugin {
  static get id () { return 'openai' }
  static get operation () { return 'request' }
  static get system () { return 'openai' }

  start ({ methodName, body, basePath, apiKey }) {
    body = body || {} // request body object is optional for some methods
    const resource = body.model ? `${methodName}/${body.model}` : methodName
    const span = this.startSpan('openai.request', {
      service: this.config.service,
      resource,
      type: 'openai',
      kind: 'client',
      meta: {
        'openai.user.api_key': truncateApiKey(apiKey),
        'openai.model': body.model, // the model the user thinks they're using
        // 'openai.operation': methodName, // proposed
        'openai.api_base': basePath,

        'openai.request.user': body.user,
        'openai.request.suffix': body.suffix,
        'openai.request.max_tokens': body.max_tokens,
        'openai.request.temperature': body.temperature,
        'openai.request.top_p': body.top_p,
        'openai.request.stream': body.stream,
        'openai.request.logprobs': body.logprobs,
        'openai.request.echo': body.echo,
        'openai.request.stop': body.stop,
        'openai.request.presence_penalty': body.presence_penalty,
        'openai.request.best_of': body.best_of,
      }
    })

    const tags = {}

    if ('messages' in body) {
      for (let i = 0; i < body.messages.length; i++) {
        const message = body.messages[i]
        tags[`openai.request.${i}.content`] = message.content // TODO truncate?
        tags[`openai.request.${i}.role`] = message.role
        // tags[`openai.request.${i}.name`] = message.name // TODO: present in API but not mentioned in spec
      }
    }

    // TODO: This handles String, [String], but not [Number], [[Number]]
    if ('prompt' in body) {
      const prompt = body.prompt
      if (Array.isArray(prompt)) {
        for (const i = 0; i < prompt.length; i++) {
          tags[`openai.request.prompt.${i}`] = prompt[i]
        }
      } else {
        tags[`openai.request.prompt`] = prompt
      }
    }

    if ('input' in body) {
      tags[`openai.request.input`] = Array.isArray(body.input) ? body.input.join(' ') : body.input // TODO: truncate? array serialization?
    }

    if ('logit_bias' in body) {
      for (const [tokenId, bias] of Object.entries(body.logit_bias)) {
        tags[`openai.request.logit_bias.${tokenId}`] = bias
      }
    }

    span.addTags(tags)
  }

  finish ({ headers, body }) {
    const span = this.activeSpan

    span.addTags({
      'openai.organization.name': headers['openai-organization'],
      'openai.model': headers['openai-model'] || body.model,
    })

    if ('usage' in body) {
      const usage = body.usage
      span.addTags({
        'openai.response.usage.prompt_tokens': usage.prompt_tokens,
        'openai.response.usage.completion_tokens': usage.completion_tokens,
        'openai.response.usage.total_tokens': usage.total_tokens,
      })
    }

    if ('choices' in body) {
      for (let i = 0; i < body.choices.length; i++) {
        const choice = body.choices[i]
        span.addTags({
          [`openai.response.choices.${i}.finish_reason`]: choice.finish_reason,
          [`openai.response.choices.${i}.logprobs`]: 'logprobs' in choice && 'returned',
          [`openai.response.choices.${i}.text`]: truncateText(choice.text) // TODO: truncate?
        })

        if ('message' in choice) {
          const message = choice.message
          span.addTags({
            [`openai.response.choices.${i}.message.role`]: message.role,
            [`openai.response.choices.${i}.message.content`]: truncateText(message.content) // TODO: truncate?
          })
        }
      }
    }

    // TOOD: response.data.num-embeddings
    // TOOD: response.data.embedding–length

    super.finish()
  }
}

function truncateApiKey (apiKey) {
  return `sk-...${apiKey.substr(apiKey.length - 4)}`
}

/**
 * for cleaning up prompt and response
 */
function truncateText (text) {
  if (!text) return

  text = text
    .replaceAll('\n', '\\n')
    .replaceAll('\t', '\\t')

  if (text.length > MAX_TEXT_LEN) {
    return text.substring(0, MAX_TEXT_LEN) + '...'
  }

  return text
}

function resourceName (endpoint, model) {
  endpoint = endpoint
    .substr(1) // remove leading /
    .replaceAll('/', '.') // replace / with .

  if (!model) {
    return endpoint
  }

  return `${endpoint}/${model}`
}

/**
 * Estimate the token count for a given string.
 * 
 * Works by estimating the count in three different ways then averaging them.
 */
function estimateTokenCount (str) {
  // 25% of overall character length
  let est1 = str.trim().length / 4

  // 125% of number of space-separated entries
  let est2 = str.split(' ').length  * 1.25

  // 75% of English word boundaries and punctuations
  let est3 = [...str.matchAll(/[\w']+|[.,!?;]/g)].length * 0.75

  return Math.floor((est1 + est2 + est3) / 3)
}

module.exports = OpenApiPlugin