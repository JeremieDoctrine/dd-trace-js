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
    if (typeof body !== 'object') {
      body = coerceRequestBody(body, methodName)
    }
    const span = this.startSpan('openai.request', {
      service: this.config.service,
      resource: methodName,
      type: 'openai',
      kind: 'client',
      meta: {
        'openai.user.api_key': truncateApiKey(apiKey),
        'openai.request.model': body.model, // the model the user thinks they're using
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
        'openai.request.n': body.n, // common field, how many responses to include

        'openai.request.size': body.size, // createImage, createImageEdit, createVariation
        'openai.request.response_format': body.response_format, // createImage, createImageEdit, createVariation
      }
    })

    const tags = {}

    // createChatCompletion
    if ('messages' in body) {
      for (let i = 0; i < body.messages.length; i++) {
        const message = body.messages[i]
        tags[`openai.request.${i}.content`] = message.content // TODO truncate?
        tags[`openai.request.${i}.role`] = message.role
        tags[`openai.request.${i}.name`] = message.name
        tags[`openai.request.${i}.finish_reason`] = message.finish_reason
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

    switch (methodName) {
      case 'createFineTune':
        createFineTuneRequestExtraction(tags, body)
        break
    }

    span.addTags(tags)
  }

  finish ({ headers, body, method, path }) {
    const span = this.activeSpan
    const methodName = span._spanContext._tags['resource.name']
    if (typeof body !== 'object') {
      body = coerceResponseBody(body, methodName)
    }
    const tags = {
      // technically we should know these ahead of time however we extract them after the request completes
      'openai.request.endpoint': path, // TODO: Should this be /v1/foo or /foo?
      'openai.request.method': method,

      'openai.organization.id': body.organization_id, // only available in fine-tunes endpoints
      'openai.organization.name': headers['openai-organization'],

      'openai.response.model': headers['openai-model'] || body.model, // often undefined
      'openai.response.create': body.created, // common creation value, numeric epoch
      'openai.response.id': body.id, // common creation value, numeric epoch
      'openai.response.deleted': body.deleted // common field in delete responses
    }


    if ('usage' in body) {
      const usage = body.usage
      tags['openai.response.usage.prompt_tokens'] = usage.prompt_tokens
      tags['openai.response.usage.completion_tokens'] = usage.completion_tokens
      tags['openai.response.usage.total_tokens'] = usage.total_tokens
    }

    switch (methodName) {
      case "createModeration":
        createModerationExtraction(tags, body)
        break

      case "createCompletion":
      case "createChatCompletion":
      case "createEdit":
        commonCreateExtraction(tags, body)
        break

      case 'listFiles':
      case 'listFineTunes':
      case 'listFineTuneEvents':
        commonListCountExtraction(tags, body)
        break

      case 'createEmbedding':
        createEmbeddingExtraction(tags, body)
        break

      case 'createFile':
      case 'retrieveFile':
        createRetrieveFileExtraction(tags, body)
        break

      case 'deleteFile':
        deleteFileExtraction(tags, body)
        break

      case 'downloadFile':
        downloadFileExtraction(tags, body)
        break

      case 'createFineTune':
      case 'retrieveFineTune':
      case 'cancelFineTune':
        commonFineTuneResponseExtraction(tags, body)
        break

      case 'createTranscription':
      case 'createTranslation':
        createAudioExtraction(tags, body)
    }

    span.addTags(tags)

    super.finish()
  }
}

// TODO: All of these .request. metrics should really come from the request not the response,
// otherwise we're going to lose that information from calls that error.

function createAudioExtraction(tags, body) {
  tags['openai.response.text'] = body.text
  tags['openai.response.language'] = body.language
  tags['openai.response.duration'] = body.duration
  tags['openai.response.segments_count'] = body.segments.length
}

function createFineTuneRequestExtraction(tags, body) {
  tags['openai.request.training_file'] = body.training_file
  tags['openai.request.validation_file'] = body.validation_file
  tags['openai.request.n_epochs'] = body.n_epochs
  tags['openai.request.batch_size'] = body.batch_size
  tags['openai.request.learning_rate_multiplier'] = body.learning_rate_multiplier
  tags['openai.request.prompt_loss_weight'] = body.prompt_loss_weight
  tags['openai.request.compute_classification_metrics'] = body.compute_classification_metrics
  tags['openai.request.classification_n_classes'] = body.classification_n_classes
  tags['openai.request.classification_positive_class'] = body.classification_positive_class
  // tags['openai.request.classification_betas'] = body.classification_betas // this is an array of... something.
  // tags['openai.request.suffix'] = body.suffix // redundant
  // tags['openai.request.model'] = body.model // redundant
}

function commonFineTuneResponseExtraction(tags, body) {
  tags['openai.response.created_at'] = body.created_at
  tags['openai.response.events_count'] = body.events.length
  tags['openai.response.fine_tuned_model'] = body.fine_tuned_model
  tags['openai.response.hyperparams.n_epochs'] = body.hyperparams.n_epochs
  tags['openai.response.hyperparams.batch_size'] = body.hyperparams.batch_size
  tags['openai.response.hyperparams.prompt_loss_weight'] = body.hyperparams.prompt_loss_weight
  tags['openai.response.hyperparams.learning_rate_multiplier'] = body.hyperparams.learning_rate_multiplier
  tags['openai.response.training_files_count'] = body.training_files.length
  tags['openai.response.result_files_count'] = body.result_files.length
  tags['openai.response.validation_files_count'] = body.validation_files.length
  tags['openai.response.updated_at'] = body.updated_at
  tags['openai.response.status'] = body.status
}

// the OpenAI package appears to stream the content download then provide it all as a singular string
function downloadFileExtraction(tags, body) {
  tags['openai.response.total_bytes'] = body.file.length
}

function deleteFileExtraction(tags, body) {
  tags['openai.response.id'] = body.id
}

function createRetrieveFileExtraction(tags, body) {
  tags['openai.request.purpose'] = body.purpose // extract from response for simplicity
  tags['openai.request.file'] = body.filename // extract from response for simplicity
  tags['openai.response.purpose'] = body.purpose
  tags['openai.response.bytes'] = body.bytes
  tags['openai.response.created_at'] = body.created_at
  tags['openai.response.status'] = body.status
  tags['openai.response.status_details'] = body.status_details
}

function createEmbeddingExtraction(tags, body) {
  tags['openai.response.embeddings_count'] = body.data[0].embedding.length
  // TODO: send every single embedding value via embeddings.<i>.embedding-length ?
}

function commonListCountExtraction(tags, body) {
  tags['openai.response.count'] = body.data.length
}

// TODO: Is there ever more than one entry in body.results?
function createModerationExtraction(tags, body) {
  tags['openai.response.id'] = body.id
  // tags[`openai.response.model`] = body.model // redundant, already extracted globally
  tags['openai.response.flagged'] = body.results[0].flagged

  for (const [category, match] of Object.entries(body.results[0].categories)) {
    tags[`openai.response.categories.${category}`] = match
  }

  for (const [category, score] of Object.entries(body.results[0].category_scores)) {
    tags[`openai.response.category_scores.${category}`] = score
  }
}

// createCompletion, createChatCompletion, createEdit
function commonCreateExtraction(tags, body) {
  for (let i = 0; i < body.choices.length; i++) {
    const choice = body.choices[i]
    tags[`openai.response.choices.${i}.finish_reason`] = choice.finish_reason
    tags[`openai.response.choices.${i}.logprobs`] = 'logprobs' in choice && 'returned'
    tags[`openai.response.choices.${i}.text`] = truncateText(choice.text) // TODO: truncate?

    // createChatCompletion
    if ('message' in choice) {
      const message = choice.message
      tags[`openai.response.choices.${i}.message.role`] = message.role
      tags[`openai.response.choices.${i}.message.content`] = truncateText(message.content) // TODO: truncate?
    }
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

// TODO: Remove
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
 * TODO: Remove
 * Estimate the token count for a given string.
 * Works by estimating the count in three different ways then averaging them.
 * This is needed for streaming responses however the Node.js library doesn't support streaming.
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

/**
 * Returns an object that makes sense for pulling metrics from
 * Most methods tage an object as an argument. Some take other types.
 */
function coerceRequestBody(arg, methodName) {
  if (methodName === 'retrieveModel') {
    return { model: arg }
  }

  return {}
}

function coerceResponseBody(body, methodName) {
  if (methodName === 'downloadFile') {
    return { file: body }
  } else if (methodName === 'createTranscription' || methodName === 'createTranslation') {
    return { text: body }
  }

  return {}
}

module.exports = OpenApiPlugin