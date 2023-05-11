// TODO: delete

function extractBasic() {
}

function extractCreation() {
}

module.exports = {
  cancelFineTune: {
    extractor: extractBasic,
    endpoint: '',
    method: '',
  },

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